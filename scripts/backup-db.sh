#!/usr/bin/env bash
# ============================================================================
# Backup manual de la base de datos completa (esquema + datos).
# ----------------------------------------------------------------------------
# Por qué existe: el proyecto de Supabase está en plan Free, que NO tiene
# backups automáticos ni point-in-time recovery (ver RUNBOOK_BACKUP_RECUPERACION.md
# para el detalle). Mientras siga en ese plan, este script es la única red de
# seguridad real — hay que correrlo a mano (o programarlo) con regularidad.
#
# Requiere tener instalado el cliente de PostgreSQL (pg_dump). En Windows,
# la forma más simple es instalar "PostgreSQL" desde postgresql.org (incluye
# pg_dump) o usar la Supabase CLI (`supabase db dump`) como alternativa —
# ver el runbook para esa opción.
#
# Uso:
#   export SUPABASE_DB_URL="postgresql://postgres:TU_PASSWORD@db.jeysrizigjgclqvlkfxd.supabase.co:5432/postgres"
#   ./scripts/backup-db.sh
#
# La connection string se consigue en el dashboard de Supabase:
# Project Settings → Database → Connection string (modo "URI").
# NUNCA se hardcodea en este script ni se sube a ningún repositorio.
# ============================================================================
set -euo pipefail

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "ERROR: falta la variable de entorno SUPABASE_DB_URL." >&2
  echo "Conseguila en el dashboard de Supabase: Project Settings > Database > Connection string." >&2
  exit 1
fi

mkdir -p backups
TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
ARCHIVO="backups/puny-mayorista_${TIMESTAMP}.sql.gz"

echo "Iniciando backup completo (esquema + datos)..."
pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges | gzip > "$ARCHIVO"

echo "Backup guardado en: $ARCHIVO"
echo "Tamaño: $(du -h "$ARCHIVO" | cut -f1)"
echo ""
echo "IMPORTANTE: este archivo queda en tu computadora. Copialo también a un"
echo "lugar aparte (Google Drive, otro disco, etc.) — un backup que vive en"
echo "el mismo lugar que se puede romper no es un backup real."
