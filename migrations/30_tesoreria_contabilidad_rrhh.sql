-- ============================================================================
-- Migración 30: Bloque 5 del ERP — Tesorería (cajas diarias), Libro de IVA
-- (ventas y compras) y Liquidación de Sueldos
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Cajas diarias
-- ---------------------------------------------------------------------------
create table if not exists cajas_diarias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  fecha date not null default current_date,
  monto_apertura numeric(14,2) not null default 0,
  monto_cierre numeric(14,2),
  estado text not null default 'abierta' check (estado in ('abierta','cerrada')),
  abierta_por uuid references profiles(id),
  cerrada_por uuid references profiles(id),
  notas text,
  created_at timestamptz not null default now(),
  unique(tenant_id, fecha)
);
create index if not exists idx_cajas_tenant on cajas_diarias(tenant_id);

create table if not exists caja_movimientos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  caja_id uuid not null references cajas_diarias(id) on delete cascade,
  tipo text not null check (tipo in ('ingreso','egreso')),
  concepto text not null,
  monto numeric(14,2) not null check (monto > 0),
  fecha timestamptz not null default now(),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_cajamov_tenant on caja_movimientos(tenant_id);
create index if not exists idx_cajamov_caja on caja_movimientos(caja_id);

-- ---------------------------------------------------------------------------
-- Libro de IVA: desglose neto/IVA en comprobantes de venta y en compras a
-- proveedores (ya existentes ambas tablas — se agregan columnas)
-- ---------------------------------------------------------------------------
alter table comprobantes add column if not exists neto numeric(14,2);
alter table comprobantes add column if not exists iva_monto numeric(14,2);
alter table comprobantes add column if not exists iva_porcentaje numeric(5,2) default 21;

alter table proveedor_movimientos add column if not exists neto numeric(14,2);
alter table proveedor_movimientos add column if not exists iva_monto numeric(14,2);
alter table proveedor_movimientos add column if not exists iva_porcentaje numeric(5,2) default 21;

-- ---------------------------------------------------------------------------
-- Liquidación de sueldos
-- ---------------------------------------------------------------------------
create table if not exists liquidaciones_sueldo (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  periodo date not null, -- primer día del mes liquidado
  sueldo_base numeric(14,2) not null default 0,
  comisiones numeric(14,2) not null default 0,
  premios numeric(14,2) not null default 0,
  premios_acumulados numeric(14,2) not null default 0,
  total numeric(14,2) generated always as (sueldo_base + comisiones + premios + premios_acumulados) stored,
  estado text not null default 'borrador' check (estado in ('borrador','cerrada')),
  notas text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  cerrado_en timestamptz,
  unique(tenant_id, profile_id, periodo)
);
create index if not exists idx_liquidaciones_tenant on liquidaciones_sueldo(tenant_id);
create index if not exists idx_liquidaciones_periodo on liquidaciones_sueldo(tenant_id, periodo);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table cajas_diarias enable row level security;
alter table caja_movimientos enable row level security;
alter table liquidaciones_sueldo enable row level security;

create policy cajas_select on cajas_diarias for select using (tenant_id = mi_tenant() and tengo_permiso_rrhh());
create policy cajas_write on cajas_diarias for all using (tenant_id = mi_tenant() and tengo_permiso_rrhh()) with check (tenant_id = mi_tenant() and tengo_permiso_rrhh());

create policy cajamov_select on caja_movimientos for select using (tenant_id = mi_tenant() and tengo_permiso_rrhh());
create policy cajamov_write on caja_movimientos for all using (tenant_id = mi_tenant() and tengo_permiso_rrhh()) with check (tenant_id = mi_tenant() and tengo_permiso_rrhh());

-- Liquidaciones: el Dueño / RRHH ven y gestionan todas; cada empleado puede
-- ver únicamente sus propias liquidaciones ya cerradas (recibo de sueldo).
create policy liquidaciones_select on liquidaciones_sueldo for select using (
  tenant_id = mi_tenant() and (tengo_permiso_rrhh() or (profile_id = auth.uid() and estado = 'cerrada'))
);
create policy liquidaciones_write on liquidaciones_sueldo for all using (
  tenant_id = mi_tenant() and tengo_permiso_rrhh()
) with check (
  tenant_id = mi_tenant() and tengo_permiso_rrhh()
);
