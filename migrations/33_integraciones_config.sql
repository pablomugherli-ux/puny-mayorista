-- ============================================================================
-- Migración 33: Panel de Configuración de Integraciones — AFIP, Tango,
-- periféricos (balanza / lector de código de barras / impresora de tickets).
--
-- IMPORTANTE (léase antes de asumir que esto "conecta" con algo real):
-- Esta tabla guarda METADATOS de configuración (CUIT, entorno, endpoints,
-- puertos), no credenciales críticas de larga vida como el certificado/clave
-- privada de AFIP. Esas NO se guardan en una columna de base de datos plana
-- — cuando haya certificado real, debe subirse a Supabase Storage con un
-- bucket privado dedicado, o cargarse como secreto de Edge Function, nunca
-- como texto en esta tabla. Mientras tanto el campo "notas" permite dejar
-- constancia de qué falta.
-- ============================================================================

create table if not exists integraciones_config (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  tipo text not null check (tipo in ('afip', 'tango', 'balanza', 'lector_codigo_barras', 'impresora_tickets')),
  estado text not null default 'no_configurado' check (estado in ('no_configurado', 'configurado', 'activo')),
  config jsonb not null default '{}'::jsonb,
  notas text,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references profiles(id),
  unique(tenant_id, tipo)
);
create index if not exists idx_integraciones_tenant on integraciones_config(tenant_id);

alter table integraciones_config enable row level security;

create policy integraciones_select on integraciones_config for select using (tenant_id = mi_tenant() and mi_rol() = 'dueno');
create policy integraciones_write on integraciones_config for all using (tenant_id = mi_tenant() and mi_rol() = 'dueno') with check (tenant_id = mi_tenant() and mi_rol() = 'dueno');

-- WhatsApp: campos adicionales pedidos explícitamente (WABA ID y plantillas
-- de mensaje aprobadas por Meta) — se guardan junto al resto de la config de
-- WhatsApp ya existente (whatsapp_config), no en integraciones_config, para
-- no fragmentar la pantalla que ya lo administra.
alter table whatsapp_config add column if not exists waba_id text;
alter table whatsapp_config add column if not exists plantillas_mensaje jsonb not null default '[]'::jsonb;
