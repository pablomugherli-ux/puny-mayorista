-- ============================================================================
-- Migracion 16 -- Esquemas de comision y objetivos comerciales por usuario.
-- ESTADO: BORRADOR NO APLICADO. Bloqueado por reconexion de cuenta Supabase
-- (el conector sigue apuntando a la org "Puny PW", no a la original).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 16.1 Esquemas de comision
-- ---------------------------------------------------------------------------
-- Un esquema puede aplicar a un usuario puntual (profile_id) o a todo un rol
-- (profile_id null). Si existen ambos para el mismo rol, el especifico por
-- usuario prevalece (se resuelve en la capa de aplicacion, no en SQL, para
-- mantener el calculo legible y auditable).
create table if not exists esquemas_comision (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  profile_id uuid references profiles(id), -- null = aplica a todo el rol
  rol text not null check (rol in ('vendedor','cobrador','entrega')),
  tipo text not null check (tipo in ('pct_venta','pct_cobranza','fijo_por_entrega')),
  valor numeric not null check (valor >= 0),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table esquemas_comision enable row level security;

create policy esquemas_comision_select on esquemas_comision for select
  using (
    mi_alcance(tenant_id)
    and (profile_id is null or profile_id = auth.uid() or mi_rol() in ('dueno') or es_master())
  );

create policy esquemas_comision_write on esquemas_comision for all
  using ((mi_rol() = 'dueno' and tenant_id = mi_tenant()) or es_master())
  with check ((mi_rol() = 'dueno' and tenant_id = mi_tenant()) or es_master());

-- ---------------------------------------------------------------------------
-- 16.2 Objetivos comerciales (metas mensuales por usuario)
-- ---------------------------------------------------------------------------
create table if not exists objetivos_comerciales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  profile_id uuid not null references profiles(id),
  periodo date not null, -- primer dia del mes, ej. 2026-08-01
  tipo_objetivo text not null check (tipo_objetivo in ('monto_ventas','unidades','cobranza','entregas')),
  meta numeric not null check (meta >= 0),
  lista int check (lista in (1,2)), -- null = ambas listas
  created_at timestamptz not null default now(),
  unique (profile_id, periodo, tipo_objetivo, lista)
);

alter table objetivos_comerciales enable row level security;

create policy objetivos_select on objetivos_comerciales for select
  using (mi_alcance(tenant_id) and (profile_id = auth.uid() or mi_rol() = 'dueno' or es_master()));

create policy objetivos_write on objetivos_comerciales for all
  using ((mi_rol() = 'dueno' and tenant_id = mi_tenant()) or es_master())
  with check ((mi_rol() = 'dueno' and tenant_id = mi_tenant()) or es_master());

-- ---------------------------------------------------------------------------
-- NOTA: el devengado de comision y el % de cumplimiento de objetivo se
-- calculan en el cliente (tiempo real, sobre pedidos/cobros/entregas ya
-- existentes) para no depender de una vista materializada que hoy no se
-- puede verificar contra el esquema real de cuenta_corriente_movimientos.
-- Si el volumen de datos lo justifica mas adelante, esto se puede migrar a
-- una vista SQL (`comisiones_periodo_actual`) sin cambiar la UI.
-- ============================================================================
