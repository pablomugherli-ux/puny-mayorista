-- ============================================================================
-- Migración 29: Bloque 4 del ERP — Stock mínimo, generación automática de
-- órdenes de compra, y alertas globales (stock / vencimiento de productos /
-- pagos a proveedores / cuenta corriente de clientes)
-- ============================================================================

alter table productos add column if not exists stock_minimo numeric(12,2) not null default 0;
alter table productos add column if not exists rubro text;
alter table productos add column if not exists proveedor_preferido_id uuid references proveedores(id) on delete set null;
alter table productos add column if not exists fecha_vencimiento date;

alter table proveedor_movimientos add column if not exists fecha_vencimiento date;

create table if not exists ordenes_compra (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  proveedor_id uuid references proveedores(id) on delete set null,
  estado text not null default 'sugerida' check (estado in ('sugerida','confirmada','recibida','cancelada')),
  generada_automaticamente boolean not null default false,
  criterio text check (criterio in ('producto','rubro','proveedor')),
  notas text,
  fecha timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_ordenescompra_tenant on ordenes_compra(tenant_id);
create index if not exists idx_ordenescompra_estado on ordenes_compra(tenant_id, estado);

create table if not exists orden_compra_items (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references ordenes_compra(id) on delete cascade,
  producto_id uuid not null references productos(id) on delete cascade,
  cantidad numeric(12,2) not null check (cantidad > 0),
  costo_unitario numeric(12,2),
  created_at timestamptz not null default now(),
  unique(orden_id, producto_id)
);
create index if not exists idx_ocitems_orden on orden_compra_items(orden_id);

alter table ordenes_compra enable row level security;
alter table orden_compra_items enable row level security;

create policy oc_select on ordenes_compra for select using (tenant_id = mi_tenant() and tengo_permiso_stock());
create policy oc_write on ordenes_compra for all using (tenant_id = mi_tenant() and tengo_permiso_stock()) with check (tenant_id = mi_tenant() and tengo_permiso_stock());

create policy ocitems_select on orden_compra_items for select using (
  exists (select 1 from ordenes_compra o where o.id = orden_compra_items.orden_id and o.tenant_id = mi_tenant() and tengo_permiso_stock())
);
create policy ocitems_write on orden_compra_items for all using (
  exists (select 1 from ordenes_compra o where o.id = orden_compra_items.orden_id and o.tenant_id = mi_tenant() and tengo_permiso_stock())
) with check (
  exists (select 1 from ordenes_compra o where o.id = orden_compra_items.orden_id and o.tenant_id = mi_tenant() and tengo_permiso_stock())
);

-- ---------------------------------------------------------------------------
-- Generación automática de orden de compra al cruzar el stock mínimo hacia
-- abajo. Agrupa por proveedor preferido: si ya existe una orden 'sugerida'
-- generada automáticamente para ese proveedor, suma el ítem ahí; si no,
-- crea una nueva.
-- ---------------------------------------------------------------------------
create or replace function public.fn_generar_orden_compra_automatica()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_orden_id uuid;
  v_cantidad numeric(12,2);
begin
  if new.stock_minimo is null or new.stock_minimo <= 0 then
    return new;
  end if;
  if new.stock > new.stock_minimo then
    return new;
  end if;
  if old.stock <= old.stock_minimo then
    -- ya estaba por debajo del mínimo antes de este update: no re-disparar
    return new;
  end if;

  v_cantidad := greatest(new.stock_minimo * 2 - new.stock, new.stock_minimo);

  select id into v_orden_id
    from ordenes_compra
    where tenant_id = new.tenant_id
      and proveedor_id is not distinct from new.proveedor_preferido_id
      and estado = 'sugerida'
      and generada_automaticamente = true
    order by created_at desc
    limit 1;

  if v_orden_id is null then
    insert into ordenes_compra (tenant_id, proveedor_id, estado, generada_automaticamente, criterio, notas)
      values (new.tenant_id, new.proveedor_preferido_id, 'sugerida', true, 'producto',
              'Generada automáticamente por stock bajo mínimo.')
      returning id into v_orden_id;
  end if;

  insert into orden_compra_items (orden_id, producto_id, cantidad)
    values (v_orden_id, new.id, v_cantidad)
    on conflict (orden_id, producto_id) do update set cantidad = excluded.cantidad;

  return new;
end;
$$;

drop trigger if exists trg_generar_orden_compra on productos;
create trigger trg_generar_orden_compra
  after update of stock on productos
  for each row execute function fn_generar_orden_compra_automatica();

-- Al marcar una orden de compra como "recibida", sumar cantidades al stock.
create or replace function public.fn_recibir_orden_compra()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  if new.estado = 'recibida' and old.estado <> 'recibida' then
    update productos p
      set stock = p.stock + oi.cantidad
      from orden_compra_items oi
      where oi.orden_id = new.id and oi.producto_id = p.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_recibir_orden_compra on ordenes_compra;
create trigger trg_recibir_orden_compra
  after update of estado on ordenes_compra
  for each row execute function fn_recibir_orden_compra();
