-- ============================================================================
-- Migración 28: Bloque 3 del ERP — Bancos, Proveedores, Cartera de Valores
-- Permisos granulares nuevos: permiso_finanzas, permiso_rrhh, permiso_stock
-- (delegables por el Dueño a personal específico, vía Admin > Usuarios)
-- ============================================================================

alter table profiles add column if not exists permiso_finanzas boolean not null default false;
alter table profiles add column if not exists permiso_rrhh boolean not null default false;
alter table profiles add column if not exists permiso_stock boolean not null default false;

create or replace function public.tengo_permiso_finanzas()
returns boolean
language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select coalesce((select permiso_finanzas or role = 'dueno' from profiles where id = auth.uid()), false);
$$;

create or replace function public.tengo_permiso_rrhh()
returns boolean
language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select coalesce((select permiso_rrhh or role = 'dueno' from profiles where id = auth.uid()), false);
$$;

create or replace function public.tengo_permiso_stock()
returns boolean
language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select coalesce((select permiso_stock or role = 'dueno' from profiles where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- Bancos
-- ---------------------------------------------------------------------------
create table if not exists bancos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  nombre text not null,
  cbu text,
  alias text,
  moneda text not null default 'ARS',
  saldo_actual numeric(14,2) not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_bancos_tenant on bancos(tenant_id);

create table if not exists movimientos_bancarios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  banco_id uuid not null references bancos(id) on delete cascade,
  fecha timestamptz not null default now(),
  tipo text not null check (tipo in ('ingreso','egreso')),
  concepto text not null,
  monto numeric(14,2) not null check (monto > 0),
  conciliado boolean not null default false,
  comprobante_ref text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_movbanc_tenant on movimientos_bancarios(tenant_id);
create index if not exists idx_movbanc_banco on movimientos_bancarios(banco_id);

-- ---------------------------------------------------------------------------
-- Proveedores
-- ---------------------------------------------------------------------------
create table if not exists proveedores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  nombre text not null,
  cuit text,
  contacto text,
  telefono text,
  email text,
  direccion text,
  condicion_pago text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_proveedores_tenant on proveedores(tenant_id);

create table if not exists proveedor_movimientos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  proveedor_id uuid not null references proveedores(id) on delete cascade,
  fecha timestamptz not null default now(),
  tipo text not null check (tipo in ('compra','pago','ajuste')),
  monto numeric(14,2) not null,
  saldo_resultante numeric(14,2),
  comprobante_ref text,
  descripcion text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_provmov_tenant on proveedor_movimientos(tenant_id);
create index if not exists idx_provmov_proveedor on proveedor_movimientos(proveedor_id);

-- ---------------------------------------------------------------------------
-- Cartera de valores: cheques físicos y eCheqs (propios recibidos, o de
-- terceros usados para pagar a proveedores)
-- ---------------------------------------------------------------------------
create table if not exists valores_cartera (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  tipo text not null check (tipo in ('cheque_fisico','echeq')),
  numero text not null,
  banco_emisor text,
  librador text,
  monto numeric(14,2) not null check (monto > 0),
  fecha_emision date,
  fecha_vencimiento date not null,
  estado text not null default 'en_cartera' check (estado in ('en_cartera','depositado','endosado','rechazado','cobrado')),
  cliente_id uuid references clientes(id) on delete set null,
  proveedor_id uuid references proveedores(id) on delete set null,
  notas text,
  created_at timestamptz not null default now()
);
create index if not exists idx_valores_tenant on valores_cartera(tenant_id);
create index if not exists idx_valores_estado on valores_cartera(tenant_id, estado);

-- ---------------------------------------------------------------------------
-- Medios de pago habilitados (registro/configuración de referencia —
-- NO procesa transacciones reales de dinero; eso el sistema nunca lo hace
-- de forma automática, cada cobro se sigue registrando manualmente como
-- hasta ahora en "cobros")
-- ---------------------------------------------------------------------------
create table if not exists medios_pago_config (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  tipo text not null check (tipo in ('efectivo','cheque','echeq','transferencia','tarjeta','qr','mercado_pago','modo')),
  alias text,
  activo boolean not null default true,
  notas text,
  created_at timestamptz not null default now(),
  unique(tenant_id, tipo)
);
create index if not exists idx_mediospago_tenant on medios_pago_config(tenant_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table bancos enable row level security;
alter table movimientos_bancarios enable row level security;
alter table proveedores enable row level security;
alter table proveedor_movimientos enable row level security;
alter table valores_cartera enable row level security;
alter table medios_pago_config enable row level security;

create policy bancos_select on bancos for select using (tenant_id = mi_tenant() and tengo_permiso_finanzas());
create policy bancos_write on bancos for all using (tenant_id = mi_tenant() and tengo_permiso_finanzas()) with check (tenant_id = mi_tenant() and tengo_permiso_finanzas());

create policy movbanc_select on movimientos_bancarios for select using (tenant_id = mi_tenant() and tengo_permiso_finanzas());
create policy movbanc_write on movimientos_bancarios for all using (tenant_id = mi_tenant() and tengo_permiso_finanzas()) with check (tenant_id = mi_tenant() and tengo_permiso_finanzas());

create policy proveedores_select on proveedores for select using (tenant_id = mi_tenant() and tengo_permiso_finanzas());
create policy proveedores_write on proveedores for all using (tenant_id = mi_tenant() and tengo_permiso_finanzas()) with check (tenant_id = mi_tenant() and tengo_permiso_finanzas());

create policy provmov_select on proveedor_movimientos for select using (tenant_id = mi_tenant() and tengo_permiso_finanzas());
create policy provmov_write on proveedor_movimientos for all using (tenant_id = mi_tenant() and tengo_permiso_finanzas()) with check (tenant_id = mi_tenant() and tengo_permiso_finanzas());

create policy valores_select on valores_cartera for select using (tenant_id = mi_tenant() and tengo_permiso_finanzas());
create policy valores_write on valores_cartera for all using (tenant_id = mi_tenant() and tengo_permiso_finanzas()) with check (tenant_id = mi_tenant() and tengo_permiso_finanzas());

create policy mediospago_select on medios_pago_config for select using (tenant_id = mi_tenant() and tengo_permiso_finanzas());
create policy mediospago_write on medios_pago_config for all using (tenant_id = mi_tenant() and tengo_permiso_finanzas()) with check (tenant_id = mi_tenant() and tengo_permiso_finanzas());

-- Trigger: mantener saldo_actual del banco al insertar movimientos
create or replace function public.fn_actualizar_saldo_banco()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  update bancos
    set saldo_actual = saldo_actual + case when new.tipo = 'ingreso' then new.monto else -new.monto end
    where id = new.banco_id;
  return new;
end;
$$;

drop trigger if exists trg_actualizar_saldo_banco on movimientos_bancarios;
create trigger trg_actualizar_saldo_banco
  after insert on movimientos_bancarios
  for each row execute function fn_actualizar_saldo_banco();

-- Trigger: mantener saldo_resultante y validar tenant coherente en proveedor_movimientos
create or replace function public.fn_registrar_mov_proveedor()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_saldo_previo numeric(14,2);
begin
  select coalesce(saldo_resultante, 0) into v_saldo_previo
    from proveedor_movimientos
    where proveedor_id = new.proveedor_id
    order by fecha desc, created_at desc
    limit 1;

  -- compra: aumenta lo que le debemos al proveedor. pago: lo reduce.
  new.saldo_resultante := coalesce(v_saldo_previo, 0) + case
    when new.tipo = 'compra' then new.monto
    when new.tipo = 'pago' then -new.monto
    else new.monto
  end;
  return new;
end;
$$;

drop trigger if exists trg_registrar_mov_proveedor on proveedor_movimientos;
create trigger trg_registrar_mov_proveedor
  before insert on proveedor_movimientos
  for each row execute function fn_registrar_mov_proveedor();
