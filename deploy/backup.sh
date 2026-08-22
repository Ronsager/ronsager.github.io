#!/usr/bin/env bash
# Sichert die Spieldatenbank im laufenden Betrieb (SQLite-konsistent).
#
#   ./deploy/backup.sh [Zielverzeichnis]
#
# Der Aufruf funktioniert aus jedem Arbeitsverzeichnis – das Skript ermittelt
# den Projektpfad aus seinem eigenen Ort. Für tägliche Sicherungen per crontab:
#   0 4 * * * $HOME/star-trek-conquest/deploy/backup.sh $HOME/sicherungen

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Pfad der Datenbank ermitteln: Umgebungsvariable, sonst .env, sonst Standard.
if [ -z "${DB_FILE:-}" ] && [ -f "$PROJECT_DIR/.env" ]; then
  DB_FILE="$(sed -n 's/^[[:space:]]*DB_FILE[[:space:]]*=[[:space:]]*//p' "$PROJECT_DIR/.env" \
             | tail -n 1 | tr -d '"'"'" | sed 's/[[:space:]]*$//')"
fi
DB="${DB_FILE:-data/universe.db}"

# Relative Angaben beziehen sich auf das Projektverzeichnis, nicht auf $PWD.
case "$DB" in
  /*) ;;
   *) DB="$PROJECT_DIR/${DB#./}" ;;
esac

DEST="${1:-$PROJECT_DIR/backups}"
STAMP="$(date +%Y-%m-%d_%H%M%S)"

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 wird benötigt: sudo apt install -y sqlite3" >&2
  exit 1
fi

if [ ! -f "$DB" ]; then
  echo "Datenbank nicht gefunden: $DB" >&2
  echo "Ist der Server schon einmal gelaufen? Andernfalls den Pfad angeben:" >&2
  echo "  DB_FILE=/pfad/zur/universe.db $0 $DEST" >&2
  exit 1
fi

mkdir -p "$DEST"

# .backup arbeitet transaktionssicher, auch während der Server läuft
sqlite3 "$DB" ".backup '$DEST/universe_$STAMP.db'"
gzip -f "$DEST/universe_$STAMP.db"

echo "Sicherung erstellt: $DEST/universe_$STAMP.db.gz"

# Sicherungen älter als 14 Tage entfernen
find "$DEST" -name 'universe_*.db.gz' -mtime +14 -delete
