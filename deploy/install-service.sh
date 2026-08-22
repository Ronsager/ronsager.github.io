#!/usr/bin/env bash
# Richtet Star Trek Conquest als systemd-Dienst ein.
#
# Das Skript liest Benutzername, Projektpfad und Node-Pfad vom laufenden System
# aus und erzeugt die Dienst-Datei daraus. Dadurch entfallen die festen Pfade,
# an denen die Einrichtung sonst scheitert.
#
#   sudo ./deploy/install-service.sh          einrichten und starten
#   ./deploy/install-service.sh --check       nur prüfen, nichts ändern
#   ./deploy/install-service.sh --print       erzeugte Dienst-Datei anzeigen

set -euo pipefail

SERVICE_NAME="star-trek-conquest"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

MODE="${1:-install}"

ok()   { printf '  \033[32m✔\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✘\033[0m %s\n' "$1"; }
info() { printf '  \033[33m•\033[0m %s\n' "$1"; }

PROBLEMS=0

echo
echo "Star Trek Conquest – Diensteinrichtung"
echo "──────────────────────────────────────"

# --- Projektverzeichnis -------------------------------------------------
if [ -f "$PROJECT_DIR/server/index.js" ]; then
  ok "Projektverzeichnis: $PROJECT_DIR"
else
  bad "server/index.js nicht gefunden unter $PROJECT_DIR"
  PROBLEMS=$((PROBLEMS + 1))
fi

# --- Benutzer, dem das Projekt gehört -----------------------------------
RUN_USER="$(stat -c '%U' "$PROJECT_DIR")"
if id "$RUN_USER" >/dev/null 2>&1; then
  RUN_GROUP="$(id -gn "$RUN_USER")"
  ok "Dienstbenutzer: $RUN_USER (Gruppe $RUN_GROUP)"
else
  bad "Benutzer '$RUN_USER' existiert nicht"
  PROBLEMS=$((PROBLEMS + 1))
fi

# --- Node -----------------------------------------------------------------
NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  bad "node nicht gefunden – bitte Schritt 6 der Anleitung ausführen"
  PROBLEMS=$((PROBLEMS + 1))
else
  NODE_MAJOR="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [ "$NODE_MAJOR" -ge 20 ] 2>/dev/null; then
    ok "Node: $NODE_BIN ($("$NODE_BIN" --version))"
  else
    bad "Node ist zu alt ($("$NODE_BIN" --version 2>/dev/null)) – benötigt wird v20 oder neuer"
    PROBLEMS=$((PROBLEMS + 1))
  fi
fi

# --- Abhängigkeiten -------------------------------------------------------
if [ -d "$PROJECT_DIR/node_modules/better-sqlite3" ]; then
  ok "Abhängigkeiten installiert"
else
  bad "node_modules fehlt – bitte 'npm ci --omit=dev' im Projektverzeichnis ausführen"
  PROBLEMS=$((PROBLEMS + 1))
fi

# --- Konfiguration --------------------------------------------------------
if [ -f "$PROJECT_DIR/.env" ]; then
  ok ".env vorhanden"
  if grep -qE '^[[:space:]]*JWT_SECRET[[:space:]]*=[[:space:]]*.+' "$PROJECT_DIR/.env"; then
    ok "JWT_SECRET ist gesetzt"
  else
    bad "JWT_SECRET fehlt in der .env"
    PROBLEMS=$((PROBLEMS + 1))
  fi
else
  bad ".env fehlt – 'cp .env.example .env' und ausfüllen"
  PROBLEMS=$((PROBLEMS + 1))
fi

# --- Datenverzeichnis -----------------------------------------------------
if [ ! -d "$PROJECT_DIR/data" ]; then
  info "Verzeichnis data/ fehlt noch – wird angelegt"
  mkdir -p "$PROJECT_DIR/data" 2>/dev/null && chown "$RUN_USER":"$RUN_GROUP" "$PROJECT_DIR/data" 2>/dev/null || true
fi
[ -d "$PROJECT_DIR/data" ] && ok "Datenverzeichnis: $PROJECT_DIR/data"

# --- Dienst-Datei zusammensetzen -----------------------------------------
# Zwei Fassungen: einmal mit Absicherung, einmal ohne. Scheitert der Start mit
# Absicherung, wird automatisch die schlanke Fassung versucht – so bleibt kein
# unklarer "unavailable resources"-Fehler stehen.

HARDENING="NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=false
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictSUIDSGID=true"

make_unit() {
  printf '%s\n' "[Unit]
Description=Star Trek Conquest – Browserspiel-Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${RUN_USER}
Group=${RUN_GROUP:-$RUN_USER}
WorkingDirectory=${PROJECT_DIR}
EnvironmentFile=${PROJECT_DIR}/.env
ExecStart=${NODE_BIN} ${PROJECT_DIR}/server/index.js

Restart=always
RestartSec=10
TimeoutStartSec=90

${1:-}

StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

[Install]
WantedBy=multi-user.target"
}

if [ "$MODE" = "--print" ]; then
  echo
  make_unit "$HARDENING"
  exit 0
fi

echo
if [ "$PROBLEMS" -gt 0 ]; then
  bad "$PROBLEMS Problem(e) gefunden – bitte zuerst beheben."
  exit 1
fi
ok "Alle Voraussetzungen erfüllt."

if [ "$MODE" = "--check" ]; then
  echo
  info "PRÜFMODUS – es wurde nichts installiert und nichts gestartet."
  info "Die Dienst-Datei in /etc/systemd/system/ ist noch die alte."
  echo
  echo "  Zum tatsächlichen Einrichten jetzt ausführen:"
  echo "      sudo $0"
  exit 0
fi

if [ "$(id -u)" -ne 0 ]; then
  echo
  bad "Zum Einrichten werden Administratorrechte benötigt:"
  echo "     sudo $0"
  exit 1
fi

UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}.service"

try_start() {
  make_unit "$1" > "$UNIT_PATH"
  systemctl daemon-reload
  systemctl reset-failed "$SERVICE_NAME" >/dev/null 2>&1 || true
  systemctl restart "$SERVICE_NAME" >/dev/null 2>&1 || true
  sleep 3
  systemctl is-active --quiet "$SERVICE_NAME"
}

echo
echo "Dienst wird eingerichtet …"
systemctl enable "$SERVICE_NAME" >/dev/null 2>&1 || true

if try_start "$HARDENING"; then
  ok "Dienst läuft (mit Absicherung)."
elif try_start ""; then
  ok "Dienst läuft."
  echo
  info "Hinweis: Mit den systemd-Absicherungsoptionen ließ sich der Dienst auf"
  info "diesem System nicht starten, ohne sie schon. Die Absicherung wurde"
  info "deshalb weggelassen – das Spiel läuft damit uneingeschränkt."
  info "Betroffen waren: ProtectSystem, ProtectHome, PrivateTmp, ProtectKernelTunables."
else
  bad "Der Dienst lässt sich auch ohne Absicherung nicht starten."
  echo
  echo "  ── systemctl status ─────────────────────────────────────────"
  systemctl status "$SERVICE_NAME" --no-pager -l 2>&1 | sed 's/^/    /' || true
  echo
  echo "  ── journalctl (letzte 40 Zeilen) ────────────────────────────"
  journalctl -u "$SERVICE_NAME" -n 40 --no-pager 2>&1 | sed 's/^/    /' || true
  echo
  echo "  ── Direkter Startversuch als $RUN_USER ──────────────────────"
  # Ohne systemd starten: zeigt Fehler der Anwendung selbst im Klartext
  ( cd "$PROJECT_DIR" && sudo -u "$RUN_USER" env $(grep -vE '^\s*#|^\s*$' .env | xargs) \
      timeout 8 "$NODE_BIN" server/index.js 2>&1 | head -25 | sed 's/^/    /' ) || true
  echo
  info "Bitte diese Ausgabe vollständig weitergeben – darin steht die Ursache."
  exit 1
fi

PORT="$(grep -E '^[[:space:]]*PORT[[:space:]]*=' "$PROJECT_DIR/.env" | tail -1 | cut -d= -f2 | tr -d ' "' || true)"
echo
echo "  Im Browser erreichbar unter:  http://$(hostname).local:${PORT:-3000}"
echo "  Protokoll mitlesen:           sudo journalctl -u ${SERVICE_NAME} -f"
