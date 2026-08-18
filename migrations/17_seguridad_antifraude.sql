-- ============================================================================
-- Migracion 17 -- Endurecimiento de seguridad y controles anti-fraude.
-- ESTADO: BORRADOR NO APLICADO. Bloqueado por reconexion de cuenta Supabase.
--
-- Alcance de esta migracion (lo que SI cubre):
--  1. Nunca confiar en el precio/subtotal que manda el cliente al cargar un
--     pedido: se recalcula y se sobreescribe server-side contra listas_precio
--     y descuentos_volumen en el momento del insert.
--  2. Evitar sobre-rechazo en devoluciones (reclamar mas cantidad rechazada
--     de la que realmente tenia el pedido, para inflar stock/credito).
--  3. Tabla de auditoria inmutable sobre las operaciones con impacto
--     financiero (cobros, devoluciones, cambios de estado de pedido,
--     esquemas de comision, objetivos).
--  4. Politicas RESTRICTIVE que bloquean UPDATE/DELETE de roles de campo
--     sobre tablas transaccionales, sin importar que politicas permisivas
--     existan o se agreguen despues (las RESTRICTIVE siempre se combinan
--     con AND, asi que actuan como un techo duro).
--  5. Blindaje de auto-escalado de rol/tenant sobre profiles.
--  6. search_path fijo en funciones SECURITY DEFINER (evita hijacking).
--
-- Lo que esta migracion NO puede garantizar por si sola ("seguridad plena"
-- no es una propiedad binaria): sigue siendo necesario correr
-- `get_advisors(type: 'security')` de Supabase apenas se reconecte la
-- cuenta, como paso de verificacion obligatorio, no opcional.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 17.1 Integridad de precios: recalcular precio_unitario/subtotal server-side
-- ---------------------------------------------------------------------------
create or replace function fn_validar_precio_item()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pedido pedidos;
  v_precio numeric;
  v_desc numeric := 0;
begin
  select * into v_pedido from pedidos where id = new.pedido_id;

  select precio into v_precio from listas_precio
   where producto_id = new.producto_id and lista = v_pedido.lista;
  if v_precio is null then
    raise exception 'El producto % no tiene precio cargado para la lista %', new.producto_id, v_pedido.lista;
  end if;

  select max(descuento_pct) into v_desc from descuentos_volumen
   where producto_id = new.producto_id and lista = v_pedido.lista and cantidad_minima <= new.cantidad;
  v_desc := coalesce(v_desc, 0);

  -- Se ignora cualquier precio_unitario/descuento_pct/subtotal que haya
  -- mandado el cliente: se recalculan siempre desde el servidor.
  new.precio_unitario := v_precio;
  new.descuento_pct := v_desc;
  new.subtotal := new.cantidad * v_precio * (1 - v_desc / 100.0);

  return new;
end;
$$;

drop trigger if exists trg_validar_precio_item on pedido_items;
create trigger trg_validar_precio_item before insert on pedido_items
  for each row execute function fn_validar_precio_item();

-- ---------------------------------------------------------------------------
-- 17.2 Evitar sobre-rechazo en devoluciones (fraude de stock/credito)
-- ---------------------------------------------------------------------------
create or replace function fn_validar_cantidad_rechazo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cantidad_pedida numeric;
  v_ya_rechazado numeric;
begin
  select cantidad into v_cantidad_pedida from pedido_items where id = new.pedido_item_id;
  select coalesce(sum(cantidad_rechazada), 0) into v_ya_rechazado
    from entrega_item_rechazos where pedido_item_id = new.pedido_item_id;

  if v_ya_rechazado + new.cantidad_rechazada > v_cantidad_pedida then
    raise exception 'Cantidad rechazada (%) supera lo pedido para este item (pedido: %, ya rechazado: %)',
      new.cantidad_rechazada, v_cantidad_pedida, v_ya_rechazado;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validar_cantidad_rechazo on entrega_item_rechazos;
create trigger trg_validar_cantidad_rechazo before insert on entrega_item_rechazos
  for each row execute function fn_validar_cantidad_rechazo();

-- ---------------------------------------------------------------------------
-- 17.3 Auditoria inmutable de operaciones sensibles
-- ---------------------------------------------------------------------------
create table if not exists auditoria_eventos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  profile_id uuid,
  tabla text not null,
  registro_id uuid,
  accion text not null,
  detalle jsonb,
  created_at timestamptz not null default now()
);

alter table auditoria_eventos enable row level security;

-- Solo lectura para dueno/master del propio tenant. Nadie puede editar ni
-- borrar auditoria (no se define ninguna policy de update/delete: RLS
-- deniega por defecto si no hay policy permisiva).
create policy auditoria_select on auditoria_eventos for select
  using (mi_alcance(tenant_id) and (mi_rol() = 'dueno' or es_master()));

create or replace function fn_auditar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into auditoria_eventos (tenant_id, profile_id, tabla, registro_id, accion, detalle)
  values (
    coalesce(new.tenant_id, old.tenant_id),
    auth.uid(),
    TG_TABLE_NAME,
    coalesce(new.id, old.id),
    TG_OP,
    to_jsonb(new)
  );
  return new;
end;
$$;

drop trigger if exists trg_auditar_cobros on cobros;
create trigger trg_auditar_cobros after insert on cobros
  for each row execute function fn_auditar();

drop trigger if exists trg_auditar_devoluciones on entrega_item_rechazos;
create trigger trg_auditar_devoluciones after insert on entrega_item_rechazos
  for each row execute function fn_auditar();

drop trigger if exists trg_auditar_pedidos_estado on pedidos;
create trigger trg_auditar_pedidos_estado after update of estado on pedidos
  for each row execute function fn_auditar();

drop trigger if exists trg_auditar_comisiones on esquemas_comision;
create trigger trg_auditar_comisiones after insert or update on esquemas_comision
  for each row execute function fn_auditar();

drop trigger if exists trg_auditar_objetivos on objetivos_comerciales;
create trigger trg_auditar_objetivos after insert or update on objetivos_comerciales
  for each row execute function fn_auditar();

-- ---------------------------------------------------------------------------
-- 17.4 Techo duro (RESTRICTIVE): roles de campo no pueden UPDATE/DELETE
-- sobre tablas transaccionales, sin importar otras politicas presentes o
-- futuras. Solo dueno/master pueden corregir (y queda auditado arriba).
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['pedidos','pedido_items','cobros','entregas','entrega_item_rechazos','comprobantes','cuenta_corriente_movimientos']
  loop
    execute format('drop policy if exists restrict_update_%1$s on %1$s', t);
    execute format('drop policy if exists restrict_delete_%1$s on %1$s', t);
    execute format(
      'create policy restrict_update_%1$s on %1$s as restrictive for update using (mi_rol() = ''dueno'' or es_master())',
      t
    );
    execute format(
      'create policy restrict_delete_%1$s on %1$s as restrictive for delete using (mi_rol() = ''dueno'' or es_master())',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 17.5 Blindar auto-escalado de rol/tenant en profiles
-- ---------------------------------------------------------------------------
drop policy if exists restrict_update_profiles_self on profiles;
create policy restrict_update_profiles_self on profiles as restrictive for update
  using (true)
  with check (
    (mi_rol() = 'dueno' or es_master())
    or (id = auth.uid() and role = (select role from profiles where id = auth.uid())
        and tenant_id is not distinct from (select tenant_id from profiles where id = auth.uid())
        and cliente_id is not distinct from (select cliente_id from profiles where id = auth.uid()))
  );

-- ============================================================================
-- PASO OBLIGATORIO POST-APLICACION (no omitir):
--   1. Ejecutar get_advisors(type: 'security') y resolver cualquier hallazgo.
--   2. Revisar que ninguna policy permisiva preexistente para 'vendedor',
--      'cobrador' o 'entrega' otorgue UPDATE/DELETE ademas de esta restrictiva
--      (la restrictiva ya lo bloquea, pero conviene limpiar redundancias).
-- ============================================================================
