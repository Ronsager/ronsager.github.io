#!/usr/bin/env bash
# Sichert die Spieldatenbank im laufenden Betrieb (SQLite-konsistent).
#
#   ./deploy/backup.sh [Zielverzeichnis]
#
# Für tägliche Sicherungen in die crontab eintragen:
#   0 4 * * * /opt/star-trek-conquest/deploy/backup.sh /var/backups/stc

set -euo pipefail

DB="${DB_FILE:-./data/universe.db}"
DEST="${1:-./backups}"
STAMP="$(date +%Y-%m-%d_%H%M%S)"

mkdir -p "$DEST"

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 wird benötigt: sudo apt install sqlite3" >&2
  exit 1
fi

# .backup arbeitet transaktionssicher, auch während der Server läuft
sqlite3 "$DB" ".backup '$DEST/universe_$STAMP.db'"
gzip -f "$DEST/universe_$STAMP.db"

echo "Sicherung erstellt: $DEST/universe_$STAMP.db.gz"

# Sicherungen älter als 14 Tage entfernen
find "$DEST" -name 'universe_*.db.gz' -mtime +14 -delete
