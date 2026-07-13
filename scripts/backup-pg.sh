#!/usr/bin/env bash
# Copia de seguridad de la base de datos PostgreSQL (para VPS/servidor propio).
#
# Supabase y Neon ya incluyen backups gestionados — si usas uno de ellos NO
# necesitas este script: verifica en su panel que los backups están activos
# (Supabase: Database → Backups; Neon: point-in-time restore).
#
# Uso:    DATABASE_URL="postgresql://…" ./scripts/backup-pg.sh [directorio]
# Cron:   0 3 * * *  DATABASE_URL="…" /ruta/appcitas/scripts/backup-pg.sh /var/backups/appcitas
#
# Guarda un dump comprimido con fecha y conserva los últimos 14.

set -euo pipefail

BACKUP_DIR="${1:-./backups}"
RETENTION=14

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: define DATABASE_URL (postgresql://…)" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$BACKUP_DIR/appcitas-$STAMP.sql.gz"

pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip > "$FILE"
echo "Backup creado: $FILE ($(du -h "$FILE" | cut -f1))"

# Retención: borra los dumps más antiguos que los últimos $RETENTION
ls -1t "$BACKUP_DIR"/appcitas-*.sql.gz 2>/dev/null | tail -n "+$((RETENTION + 1))" | xargs -r rm --
echo "Retención: se conservan los últimos $RETENTION dumps en $BACKUP_DIR"

# Restaurar:  gunzip -c appcitas-FECHA.sql.gz | psql "$DATABASE_URL"
