# Runbook de Backup y Recuperación — PUNY 2026 INTEGRAL

**Hallazgo principal de esta revisión (18/08/2026): el proyecto de Supabase
(`puny-mayorista`, plan Free) NO tiene backups automáticos ni point-in-time
recovery. Es cero, no "backups limitados" — el plan Free de Supabase no
incluye ninguna copia automática.** Esto es más grave que la hipótesis con la
que arrancamos esta tarea ("hay backups pero nunca se probó el restore") — la
prioridad inmediata no es "probar la recuperación", es "empezar a tener algo
que recuperar".

Fuente: [documentación de backups de Supabase](https://supabase.com/docs/guides/platform/backups) y comparativa de planes 2026 — Pro incluye 7 días de backups diarios automáticos; Free, ninguno. Point-in-time recovery es un add-on aparte (desde USD 100/mes) solo disponible en Pro o superior.

Tampoco pude ejecutar el drill de recuperación con una branch de desarrollo de Supabase que había planeado (crea una base nueva aplicando las 118 migraciones reales, sin tocar producción): **branching tampoco está disponible en el plan Free** — Supabase lo devolvió explícitamente al intentarlo (`"Branching is supported only on the Pro plan or above"`).

## 1. Acción inmediata (hacer hoy, sin esperar al resto)

Corré esto una vez, ya, para tener al menos UNA copia de la base real:

```
export SUPABASE_DB_URL="postgresql://postgres:TU_PASSWORD@db.jeysrizigjgclqvlkfxd.supabase.co:5432/postgres"
bash scripts/backup-db.sh
```

La `SUPABASE_DB_URL` se consigue en el dashboard de Supabase: **Project
Settings → Database → Connection string** (modo "URI"). Nunca la compartas
conmigo ni la subas a ningún repositorio — el script la toma de la variable
de entorno de tu propia terminal.

Requiere tener `pg_dump` instalado (viene con PostgreSQL — instalá "PostgreSQL"
desde postgresql.org si no lo tenés, incluye la herramienta aunque no vayas a
usar el servidor). Alternativa sin instalar nada aparte: la Supabase CLI
(`npx supabase login`, después `npx supabase db dump --db-url "$SUPABASE_DB_URL" -f backup.sql`).

El archivo queda en `backups/` (ya excluido de git). **Copialo también a un
lugar aparte de tu computadora** (Google Drive, otro disco) — un backup que
vive solo donde vive la app no es un backup real.

## 2. Cadencia recomendada

Dado que el sistema maneja plata, stock y cuenta corriente de varios clientes
pagos con movimientos diarios, lo mínimo razonable es correr el backup **una
vez por día**, idealmente automatizado (ver sección 4). Con eso, en el peor
caso perdés como mucho un día de datos (RPO ≈ 24 h) — hoy, sin ningún
backup, el RPO es "todo lo que haya desde el día 0 del proyecto".

## 3. Procedimiento de recuperación real (restore)

Si algún día hace falta recuperar de un archivo de `scripts/backup-db.sh`:

1. **Nunca restaures directo sobre producción como primer paso.** Creá un
   proyecto nuevo de Supabase (gratis) y restaurá ahí primero, para
   verificar que el dump está sano antes de tocar el proyecto real.
2. Restaurar el dump en el proyecto de prueba:
   ```
   export TEST_DB_URL="postgresql://postgres:PASSWORD@db.NUEVO_PROYECTO.supabase.co:5432/postgres"
   gunzip -c backups/puny-mayorista_FECHA.sql.gz | psql "$TEST_DB_URL"
   ```
3. Verificar en ese proyecto de prueba (vía el SQL editor de Supabase) que
   las tablas clave tienen datos coherentes: `select count(*) from productos;`,
   `select count(*) from clientes;`, `select count(*) from comprobantes;` — y
   que los números tienen sentido comparados con lo que se esperaba.
4. Recién ahí, si todo cierra, coordinar la restauración sobre el proyecto
   real (esto sí requiere ventana de mantenimiento — la app va a estar
   inconsistente mientras se hace).

## 4. Automatizar el backup diario (para no depender de acordarse)

Opciones, de más simple a más robusta:

- **Manual con recordatorio**: pedirme que te programe un recordatorio diario
  (puedo hacerlo con la función de tareas programadas) para correr
  `scripts/backup-db.sh` — sigue siendo manual, pero no depende de la memoria.
- **GitHub Actions programado**: si en algún momento el proyecto se sube a un
  repo de GitHub (ver el punto de CI/CD de esta misma revisión), un workflow
  con `schedule: cron` puede correr el backup todos los días y subirlo a algún
  storage (S3, un bucket de Supabase Storage de OTRO proyecto, etc.) sin que
  vos tengas que acordarte de nada.
- **Upgrade a plan Pro (recomendado si el presupuesto lo permite)**: por
  USD 25/mes, Supabase Pro incluye backups diarios automáticos con 7 días de
  retención — sin mantener ningún script. Es la opción de menor esfuerzo y
  mayor confiabilidad. El add-on de point-in-time recovery (recuperar a
  cualquier minuto exacto, no solo al último backup diario) es aparte, desde
  USD 100/mes, y probablemente sea excesivo para el volumen actual — los
  backups diarios de Pro ya son una mejora enorme sobre el estado actual (cero).

## 5. Qué NO se pudo probar en esta revisión (y por qué)

El plan original era crear una branch de desarrollo de Supabase (aplica las
118 migraciones reales sobre una base nueva, sin tocar producción) para
demostrar en vivo que el esquema es reconstruible desde cero. Confirmé el
costo (USD 0,01344/hora) e intenté crearla con tu autorización, pero Supabase
la rechazó: esa función requiere plan Pro o superior, y el proyecto está en
Free. Dato positivo que sí pude confirmar: las **118 migraciones** del
proyecto están completas y versionadas del lado de Supabase (`list_migrations`)
— el problema de desincronización que habíamos detectado antes era solo de la
carpeta `migrations/` local del repo, no de la base real. Igual, sin plan Pro,
no hay forma de demostrarlo con una branch real hoy.
