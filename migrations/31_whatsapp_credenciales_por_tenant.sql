-- ============================================================================
-- Migración 31: Bloque 2 del ERP — WhatsApp Cloud API con credenciales
-- propias por distribuidora (créditos exclusivos de cada tenant)
-- ============================================================================

alter table whatsapp_config add column if not exists whatsapp_token text;
alter table whatsapp_config add column if not exists whatsapp_verify_token text;
alter table whatsapp_config add column if not exists whatsapp_app_secret text;
alter table whatsapp_config add column if not exists creditos_disponibles integer;
alter table whatsapp_config add column if not exists mensajes_enviados_mes integer not null default 0;
alter table whatsapp_config add column if not exists mes_contador_actual date not null default date_trunc('month', now())::date;

-- La tabla ahora guarda credenciales sensibles (token propio de Meta de cada
-- distribuidora): restringimos el SELECT a Dueño únicamente (antes era
-- visible a cualquier usuario del tenant, lo cual era correcto cuando solo
-- había datos de configuración no sensibles).
drop policy if exists whatsapp_config_select on whatsapp_config;
create policy whatsapp_config_select on whatsapp_config for select using (tenant_id = mi_tenant() and mi_rol() = 'dueno');
