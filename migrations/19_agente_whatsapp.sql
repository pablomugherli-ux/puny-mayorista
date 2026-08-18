-- ============================================================================
-- Migracion 19 -- Agente de IA para WhatsApp (esquema + configuracion).
-- ESTADO: BORRADOR NO APLICADO. Bloqueado por reconexion de cuenta Supabase.
--
-- IMPORTANTE (arquitectura de seguridad, no omitir al leer esto):
-- Esta app es un export estatico sin servidor propio (Next.js con
-- output:"export", desplegado como archivos estaticos en Netlify). Un
-- token de WhatsApp Business API o una API key de un proveedor de IA NUNCA
-- deben vivir en el bundle del cliente: cualquiera que abra las herramientas
-- de desarrollador del navegador podria extraerlos. Por eso esos secretos
-- viven exclusivamente como variables de entorno de una Supabase Edge
-- Function (ver supabase/functions/whatsapp-agent/index.ts), nunca en una
-- tabla ni en el codigo Next.js. Esta migracion solo crea las tablas de
-- configuracion/registro que la app web SI puede leer/escribir con
-- seguridad (no contienen secretos).
-- ============================================================================

create table if not exists whatsapp_config (
  tenant_id uuid primary key references tenants(id),
  activo boolean not null default false,
  modo text not null default 'simulado' check (modo in ('simulado', 'produccion')),
  telefono_negocio text,
  instrucciones_agente text not null default
    'Sos el asistente de atencion al cliente de esta distribuidora mayorista. Respondes consultas sobre pedidos, estado de cuenta y catalogo de forma breve y cordial. Si la consulta requiere una decision comercial (descuentos especiales, reclamos, devoluciones) o no tenes informacion suficiente, derivala a un humano en lugar de inventar una respuesta.',
  updated_at timestamptz not null default now()
);

alter table whatsapp_config enable row level security;

create policy whatsapp_config_rw on whatsapp_config for all
  using ((mi_rol() = 'dueno' and tenant_id = mi_tenant()) or es_master())
  with check ((mi_rol() = 'dueno' and tenant_id = mi_tenant()) or es_master());

create table if not exists whatsapp_conversaciones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  telefono text not null,
  cliente_id uuid references clientes(id),
  agente_activo boolean not null default true, -- false = un humano tomo el control
  estado text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  ultimo_mensaje_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, telefono)
);

alter table whatsapp_conversaciones enable row level security;

create policy whatsapp_conv_select on whatsapp_conversaciones for select
  using (mi_alcance(tenant_id) and (mi_rol() = 'dueno' or es_master()));

create policy whatsapp_conv_update on whatsapp_conversaciones for update
  using (tenant_id = mi_tenant() and (mi_rol() = 'dueno' or es_master()))
  with check (tenant_id = mi_tenant() and (mi_rol() = 'dueno' or es_master()));

create table if not exists whatsapp_mensajes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  conversacion_id uuid not null references whatsapp_conversaciones(id),
  remitente text not null check (remitente in ('cliente', 'agente_ia', 'humano')),
  texto text not null,
  estado text not null default 'enviado' check (estado in ('recibido', 'enviado', 'simulado', 'error')),
  created_at timestamptz not null default now()
);

alter table whatsapp_mensajes enable row level security;

create policy whatsapp_msg_select on whatsapp_mensajes for select
  using (mi_alcance(tenant_id) and (mi_rol() = 'dueno' or es_master()));

-- La escritura de mensajes normalmente la hace la Edge Function con la
-- service_role key (que bypassea RLS). Esta policy solo habilita el envio
-- manual desde el panel admin (un humano tomando la conversacion).
create policy whatsapp_msg_insert_humano on whatsapp_mensajes for insert
  with check (tenant_id = mi_tenant() and (mi_rol() = 'dueno' or es_master()) and remitente = 'humano');

-- ============================================================================
-- PENDIENTE PARA ACTIVAR EN PRODUCCION (no lo puede completar Claude por si
-- solo, requiere credenciales que son del usuario):
--   1. Crear una app de Meta for Developers + WhatsApp Business API,
--      obtener: token de acceso, phone_number_id, un "verify token" propio
--      (inventado por el usuario) y el app secret.
--   2. Cargar esos 4 valores + ANTHROPIC_API_KEY como secretos de la Edge
--      Function (`supabase secrets set ...`), nunca en esta base de datos.
--   3. Deployar supabase/functions/whatsapp-agent/ (deploy_edge_function).
--   4. Configurar la URL de la function como webhook en Meta, con el mismo
--      verify token del paso 1.
--   5. Recien ahi cambiar whatsapp_config.modo a 'produccion'.
-- ============================================================================
