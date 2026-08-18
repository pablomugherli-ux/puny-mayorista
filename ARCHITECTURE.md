# Arquitectura técnica — PUNY 2026 INTEGRAL

Documento de referencia para cualquiera que tenga que mantener este sistema
además de Pablo. Los manuales (`01_Manual_*.docx` … `06_Manual_*.docx`) explican
cómo se **usa** la app por rol; este documento explica cómo está **construida**.

## 1. Stack y despliegue

- **Frontend**: Next.js 14 con `output: "export"` (build estático, sin servidor
  Node en producción) + React 18 + Tailwind. Todo el routing es client-side
  sobre HTML/JS estático.
- **Backend**: Supabase (Postgres + Auth + Storage + Edge Functions), proyecto
  `jeysrizigjgclqvlkfxd`, plan **Free** (ver limitaciones en la sección 6).
- **Hosting**: Netlify, sitio `puny-mayorista` (id `88095566-0044-47f8-9483-5d7a9a7cee1a`),
  deploy manual vía CLI (`npm run deploy`), no hay CD automático porque no hay
  repo remoto conectado (ver sección 5).
- **Control de versiones**: git local desde el 18/08/2026 (`git init` +
  commit inicial). Todavía sin remoto — ver sección 5.

## 2. Modelo de datos y multi-tenancy

Todas las tablas de negocio tienen `tenant_id` y Row Level Security (RLS)
habilitado (`list_tables` confirma RLS on en las ~100 tablas de `public`). El
aislamiento entre distribuidoras (tenants) se hace 100% en la base, no en el
frontend — el frontend nunca debe ser el único punto de control de acceso.

Roles de `profiles.role`: `master` (dueño de la plataforma, sin acceso a datos
de negocio de los tenants — solo gestión de cuentas/licencias), `dueno` /
`administrador` (superusuarios del tenant), y luego ~15 roles operativos
(`vendedor`, `entrega`, `cobrador`, `supervisor`, `vigilador`, etc.).

### RBAC dinámico

Desde la fase "RBAC dinámico" (ver `PUNY - Propuesta RBAC Dinamico...docx`),
los permisos finos NO están hardcodeados por rol en el código — viven en:

- `catalogo_permisos`: inventario de permisos otorgables.
- `rol_permisos_default`: qué trae cada rol al darlo de alta (plantilla).
- `usuario_permisos`: otorgamiento real por usuario (`vigente_hasta` nullable
  habilita coberturas temporales tipo vacaciones sin tabla aparte).
- `coberturas_temporales`: herencia temporal de *alcance de datos* (no de
  permisos de función) de un usuario a otro mientras dure una licencia.
- Función `tengo_permiso(p_clave text)`: la fuente de verdad única, usada en
  RLS y en RPCs. **Bypass total para `dueno`/`administrador`/`master`** —
  siguen siendo superusuarios por rol, fuera de este sistema.
- Frontend: `mis_permisos_activos()` (RPC) alimenta `useAuth()` →
  `permisos: Set<string>`, consumido por Ribbon/Sidebar (`lib/ribbonConfig.tsx`)
  para no mostrar acciones que la base igual va a rechazar.

## 3. Motor de costeo (costo promedio ponderado)

`productos.costo_promedio` se actualiza en **exactamente dos** lugares —
cualquier código nuevo que toque costos tiene que pasar por acá o por un
tercer punto explícitamente revisado:

- `fn_recibir_orden_compra()` (trigger `AFTER UPDATE OF estado` en
  `ordenes_compra`)
- `fn_nacionalizar_importacion(p_importacion_id uuid)` (RPC, módulo
  Importaciones)

Fórmula: `costo_nuevo = (stock_actual*costo_actual + cantidad*costo_compra) / (stock_actual + cantidad)`.

Cada movimiento que toca `costo_promedio` o `stock` queda auditado en
`movimientos_costo_stock` (ledger append-only, `select`-only por RLS) — es la
fuente para reconstruir "por qué el costo de este producto es el que es".

## 4. Offline-first (roles de campo)

`lib/offlineSync.ts` es el corazón de todo lo que corre en la calle
(Vendedor, Entrega, Cobrador):

- `ejecutarOEncolar(...)`: intenta escribir ya; si no hay conexión (o falla
  por error de red aunque `navigator.onLine` diga que sí), lo deja en una
  cola local (IndexedDB vía Dexie, `lib/offlineDb.ts`) para reintentar solo.
  Un error real de datos (RLS, validación) con conexión sí presente **no** se
  reintenta infinito — se le muestra al usuario.
- `leerConCache(...)`: sirve datos frescos si hay conexión (y los cachea);
  si no hay conexión, sirve la última copia local. Sin esto, ni siquiera se
  podría dibujar el formulario de pedido/cobro/entrega sin señal.
- `procesarCola()`: se dispara solo en el evento `online` y además cada 30s
  por si el evento no es confiable (común en navegadores móviles).

`components/GateUbicacion.tsx` envuelve TODA pantalla de campo (vendedor,
entrega, cobrador) y bloquea el acceso si no hay geolocalización activa —
es intencional (necesitan GPS real para check-in/geofence), pero desde el
18/08/2026 un fallo del chequeo periódico (cada 60s) ya no desmonta la
pantalla si hubo un chequeo exitoso antes — solo avisa, para no perder un
formulario a medio cargar.

## 5. Edge Functions

Todas viven directamente en Supabase (deploy vía MCP), **no en
`supabase/functions/` local** — esa carpeta local solo tiene
`whatsapp-agent`, el resto está desincronizado del lado del repo (mismo tipo
de desincronización que ya existía en `migrations/`, ver más abajo). Lista
real (`list_edge_functions`, 18/08/2026):

| Función | JWT | Propósito |
|---|---|---|
| `master-cuentas` | sí | Alta/gestión de distribuidoras y dueños, licenciamiento (llamada por Master) |
| `dueno-usuarios` | sí | Alta/gestión de usuarios de un tenant (llamada por Dueño/Administrador) |
| `escanear-comprobantes` | sí | OCR/IA de comprobantes de compra |
| `whatsapp-agent` | no | Agente de IA de WhatsApp (simulado) |
| `whatsapp-webhook` | no | Webhook entrante de WhatsApp Business (pluggable, requiere credenciales Meta) |
| `agentes-orquestador` | no | Deriva conversaciones de WhatsApp según reglas |
| `redes-sociales-webhook` | no | DMs entrantes de IG/FB (pluggable) |
| `redes-sociales-publicador` | no | Publicar contenido en IG/FB/YouTube/LinkedIn |
| `redes-sociales-metricas-sync` | no | Sincroniza métricas de redes |
| `youtube-comentarios-sync` | no | Comentarios de YouTube como proxy de leads |
| `bootstrap-master-onceoff` | sí | **Neutralizada** (devuelve 410) — se usó una sola vez el 18/08/2026 para crear la cuenta Master real de Pablo sin que su contraseña pasara por el asistente. Se puede borrar del todo si algún día se agrega un `delete_edge_function` al toolset. |

Patrón común: `requireX(req)` valida el JWT del caller contra `profiles.role`
antes de usar el cliente `service_role` (nunca expuesto al frontend).

## 6. Limitaciones conocidas del plan Free de Supabase

- **Sin backups nativos ni PITR** — mitigado con la tarea programada
  `puny-backup-diario` (ver `RUNBOOK_BACKUP_RECUPERACION.md`), pero un backup
  automático no nativo no es tan robusto como el de un plan pago.
- **Pausa el proyecto tras 7 días sin actividad de base de datos** — la misma
  tarea programada, al correr una consulta diaria, evita que esto pase
  mientras Cowork se abra con cierta regularidad (la tarea NO es un cron real
  del sistema operativo: si la app está cerrada el día que toca, corre recién
  al abrirla de nuevo).
- **Sin branching** (no se puede crear una base de prueba real a partir de
  las migraciones de producción).
- Subir a plan Pro (USD 25/mes) resuelve los tres puntos de una — es una
  decisión de costo que le corresponde a Pablo, no algo que el asistente
  pueda ejecutar por su cuenta.

## 7. Testing y CI

- `vitest` (`lib/**/*.test.ts`) — cobertura acotada a funciones puras
  (`importUtils`, `stats`, `licencia`). No cubre componentes React, RPCs de
  Postgres ni RLS más allá de `scripts/rls-smoke-tests.sql` (4 casos:
  bypass de `dueno`, bloqueo sin permiso, RPC de importación de precios sin
  `stock.acceso`, función interna no ejecutable por `authenticated`).
- `npm run predeploy` (`tsc --noEmit` + `npm test`) corre antes de todo
  deploy real (`npm run deploy`) — es el único gate hoy.
- `.github/workflows/ci.yml` existe pero está inerte: no hay repo remoto en
  GitHub/GitLab al que Netlify o Actions puedan reaccionar. Corregir esto
  (conectar un remoto) es una decisión de Pablo — crear la cuenta/repo no es
  algo que el asistente pueda hacer por él.
- `npm run deploy:preview` sube a una URL de borrador de Netlify (sin
  `--prod`) para poder mirar antes de pasar a producción — no reemplaza un
  ambiente de staging real basado en git, pero es mejor que nada mientras no
  haya remoto.

## 8. Desincronización conocida: `migrations/` local vs. Supabase real

La carpeta `migrations/*.sql` del repo NO refleja el historial real de
cambios aplicados — el historial real y completo vive del lado de Supabase
(`list_migrations`, ~118+ migraciones a la fecha). Cualquier cambio de
esquema debe aplicarse vía las tools de Supabase (`apply_migration`) para que
quede en el historial real; escribir un archivo en `migrations/` sin
aplicarlo no tiene efecto y further desincroniza el repo.

## 9. Dónde mirar para cada tema

- Manuales de usuario por rol → `0X_Manual_*.docx`
- Backups y recuperación → `RUNBOOK_BACKUP_RECUPERACION.md`
- Arquitectura del ecosistema completo (WhatsApp, redes, BI) →
  `PUNY_ECOSYSTEM_Arquitectura.docx`
- RBAC dinámico en detalle → `PUNY - Propuesta RBAC Dinamico (Permisos y RRHH).docx`
- Rediseño UX/UI (Ribbon) → `Propuesta_Rediseno_UXUI_Ribbon.docx`
