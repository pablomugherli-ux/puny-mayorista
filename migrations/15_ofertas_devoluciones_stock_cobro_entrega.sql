-- ============================================================================
-- Migracion 15 -- Ofertas vigentes, devolucion (rechazo parcial/total con
-- restitucion de stock y ajuste de cuenta corriente), cobro contra-entrega
-- y notificaciones internas.
--
-- Verificado contra el esquema real antes de aplicar (list_tables,
-- pg_proc, pg_policies): mi_alcance(tenant_id) devuelve boolean (se usa
-- directo, no comparado con "="), mi_perfil() devuelve la fila completa de
-- profiles (se usa auth.uid() para comparar contra columnas uuid, que es
-- el patron ya usado en todas las policies existentes). El trigger de
-- cuenta corriente replica exactamente el patron de fn_cobro_movimiento
-- (saldo_resultante = suma corrida de debe/haber).
-- ============================================================================

-- Nuevo estado de pedido usado por la app de Entrega en una entrega parcial.
alter type pedido_estado add value if not exists 'entregado_parcial';

-- ---------------------------------------------------------------------------
-- FIX de un problema preexistente (no introducido por esta migracion):
-- cuenta_corriente_movimientos tiene RLS activado con SOLO una policy de
-- SELECT (ccm_select). Los triggers fn_cobro_movimiento y
-- fn_comprobante_movimiento NO son SECURITY DEFINER (corren con los
-- permisos del usuario real que hace la accion), asi que hoy, en un flujo
-- real de un cobrador/vendedor real, el INSERT que hace el trigger fallaria
-- por falta de policy de insert. Solo "funcionaba" en la carga de datos demo
-- porque esa carga se hizo con permisos elevados (bypass de RLS). Se agrega
-- la policy que falta, en el mismo espiritu permisivo que notif_write.
-- ---------------------------------------------------------------------------
create policy ccm_insert on cuenta_corriente_movimientos for insert
  with check (mi_alcance(tenant_id));

-- ---------------------------------------------------------------------------
-- 14 (REAPLICAR -- fallo por corte de permisos): stock automatico
-- ---------------------------------------------------------------------------
create or replace function fn_descontar_stock()
returns trigger language plpgsql as $$
declare
  v_stock numeric;
begin
  select stock into v_stock from productos where id = new.producto_id for update;
  if v_stock is null then return new; end if;
  if v_stock < new.cantidad then
    raise exception 'Stock insuficiente para %: disponible %, solicitado %',
      (select nombre from productos where id = new.producto_id), v_stock, new.cantidad;
  end if;
  update productos set stock = stock - new.cantidad where id = new.producto_id;
  return new;
end;
$$;

drop trigger if exists trg_descontar_stock on pedido_items;
create trigger trg_descontar_stock after insert on pedido_items
  for each row execute function fn_descontar_stock();

create or replace function fn_restituir_stock_si_cancela()
returns trigger language plpgsql as $$
begin
  if new.estado in ('rechazado','cancelado') and old.estado not in ('rechazado','cancelado') then
    update productos p set stock = p.stock + pi.cantidad
    from pedido_items pi where pi.pedido_id = new.id and pi.producto_id = p.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_restituir_stock on pedidos;
create trigger trg_restituir_stock after update of estado on pedidos
  for each row execute function fn_restituir_stock_si_cancela();

-- ---------------------------------------------------------------------------
-- 15.1 Ofertas vigentes
-- ---------------------------------------------------------------------------
create table if not exists ofertas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  producto_id uuid references productos(id),
  titulo text not null,
  descripcion text,
  descuento_pct numeric,
  precio_oferta numeric,
  fecha_desde date not null default current_date,
  fecha_hasta date,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

alter table ofertas enable row level security;

create policy ofertas_select on ofertas for select
  using (mi_alcance(tenant_id));

create policy ofertas_write on ofertas for all
  using (mi_alcance(tenant_id) and (mi_rol() = 'dueno' or es_master()))
  with check (mi_alcance(tenant_id) and (mi_rol() = 'dueno' or es_master()));

create or replace view ofertas_vigentes as
select * from ofertas
where activa
  and fecha_desde <= current_date
  and (fecha_hasta is null or fecha_hasta >= current_date);

-- ---------------------------------------------------------------------------
-- 15.2 Devolucion: rechazo a nivel de item (entrega parcial/total)
-- ---------------------------------------------------------------------------
create table if not exists entrega_item_rechazos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  entrega_id uuid not null references entregas(id),
  pedido_item_id uuid not null references pedido_items(id),
  producto_id uuid not null references productos(id),
  cantidad_rechazada numeric not null check (cantidad_rechazada > 0),
  motivo_rechazo_id uuid references motivos_rechazo(id),
  created_at timestamptz not null default now()
);

alter table entrega_item_rechazos enable row level security;

create policy eir_select on entrega_item_rechazos for select
  using (mi_alcance(tenant_id));

create policy eir_insert on entrega_item_rechazos for insert
  with check (
    tenant_id = mi_tenant()
    and mi_rol() in ('entrega', 'dueno')
    and exists (select 1 from entregas e where e.id = entrega_id and e.repartidor_id = auth.uid())
  );

create or replace function fn_restituir_stock_devolucion()
returns trigger language plpgsql as $$
begin
  update productos set stock = stock + new.cantidad_rechazada where id = new.producto_id;
  return new;
end;
$$;

drop trigger if exists trg_restituir_stock_devolucion on entrega_item_rechazos;
create trigger trg_restituir_stock_devolucion after insert on entrega_item_rechazos
  for each row execute function fn_restituir_stock_devolucion();

-- Acredita la cuenta corriente del cliente por el valor de lo rechazado,
-- replicando exactamente el patron de fn_cobro_movimiento (saldo corrido
-- de debe/haber) y ajustando el comprobante vinculado si existe.
create or replace function fn_ajustar_cuenta_corriente_devolucion()
returns trigger language plpgsql as $$
declare
  v_item pedido_items;
  v_pedido pedidos;
  v_monto numeric;
  v_saldo numeric;
  v_comprobante_id uuid;
begin
  select * into v_item from pedido_items where id = new.pedido_item_id;
  select p.* into v_pedido from entregas e join pedidos p on p.id = e.pedido_id where e.id = new.entrega_id;

  v_monto := new.cantidad_rechazada * v_item.precio_unitario;

  select id into v_comprobante_id from comprobantes where pedido_id = v_pedido.id limit 1;

  select coalesce(sum(case when tipo='debe' then monto else -monto end),0) into v_saldo
    from cuenta_corriente_movimientos where cliente_id = v_pedido.cliente_id and lista = v_pedido.lista;
  v_saldo := v_saldo - v_monto;

  insert into cuenta_corriente_movimientos (tenant_id, cliente_id, lista, comprobante_id, tipo, monto, saldo_resultante, descripcion)
    values (new.tenant_id, v_pedido.cliente_id, v_pedido.lista, v_comprobante_id, 'haber', v_monto, v_saldo, 'Devolución / rechazo de entrega');

  if v_comprobante_id is not null then
    update comprobantes set
      saldo_pendiente = greatest(saldo_pendiente - v_monto, 0),
      estado = case when saldo_pendiente - v_monto <= 0 then 'pagado' else 'pagado_parcial' end
    where id = v_comprobante_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ajustar_cuenta_corriente_devolucion on entrega_item_rechazos;
create trigger trg_ajustar_cuenta_corriente_devolucion after insert on entrega_item_rechazos
  for each row execute function fn_ajustar_cuenta_corriente_devolucion();

-- ---------------------------------------------------------------------------
-- 15.2b Sincronizar pedidos.estado automaticamente al registrar una entrega
-- ---------------------------------------------------------------------------
-- FIX de otro problema preexistente: la policy "pedidos_update" solo permite
-- actualizar a master/dueno/vendedor (dueño de la venta) -- el rol 'entrega'
-- NUNCA pudo, bajo RLS real, hacer el UPDATE de pedidos.estado que el
-- frontend de repartidor intenta al confirmar una entrega. En vez de abrirle
-- UPDATE directo sobre pedidos a 'entrega' (superficie de fraude: podria
-- marcar cualquier pedido como lo que quiera), se sincroniza automaticamente
-- via trigger disparado por el insert en "entregas", que si esta
-- correctamente permitido para 'entrega' sobre sus propias entregas.
create or replace function fn_sincronizar_estado_pedido_desde_entrega()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update pedidos set estado = case new.estado
    when 'rechazada' then 'rechazado'
    when 'parcial' then 'entregado_parcial'
    else 'entregado'
  end::pedido_estado
  where id = new.pedido_id;
  return new;
end;
$$;

drop trigger if exists trg_sincronizar_estado_pedido on entregas;
create trigger trg_sincronizar_estado_pedido after insert on entregas
  for each row execute function fn_sincronizar_estado_pedido_desde_entrega();

-- ---------------------------------------------------------------------------
-- 15.3 Cobro contra-entrega
-- ---------------------------------------------------------------------------
-- NOTA: la policy "cobros_write" (ALL) ya existente permite insertar a
-- 'entrega' (junto con master/dueno/cobrador) mientras se cumpla
-- mi_alcance(tenant_id) y puedo_operar_lista(lista); no hace falta una
-- policy nueva para permitir el insert. Solo se agrega la columna para
-- poder distinguir quien cobro (cobrador vs. repartidor) en comisiones y
-- reportes.
alter table cobros add column if not exists repartidor_id uuid references profiles(id);
alter table cobros alter column cobrador_id drop not null;

-- ---------------------------------------------------------------------------
-- 15.4 Notificaciones internas (a Dueno/Administrador, no solo al cliente)
-- ---------------------------------------------------------------------------
alter table notificaciones add column if not exists destinatario_profile_id uuid references profiles(id);
alter table notificaciones alter column cliente_id drop not null;

create policy notificaciones_select_interna on notificaciones for select
  using (destinatario_profile_id = auth.uid());
