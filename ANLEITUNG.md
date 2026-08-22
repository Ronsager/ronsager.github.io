# Star Trek Conquest — Aufbau- und Betriebsanleitung

Ein browserbasiertes Weltraum-Strategiespiel nach dem Vorbild von **OGame**,
vollständig im **Star-Trek-Universum** angesiedelt. Multiplayer über das Internet,
alle Fortschritte in einer Datenbank, mit eigenem Administrationsbereich.

---

## Inhalt

1. [Was gebaut wurde](#1-was-gebaut-wurde)
2. [Schnellstart in 5 Minuten](#2-schnellstart-in-5-minuten)
3. [Konfiguration](#3-konfiguration)
4. [Testdaten erzeugen](#4-testdaten-erzeugen)
5. [Öffentlich im Internet betreiben](#5-öffentlich-im-internet-betreiben)
6. [Der Administrationsbereich](#6-der-administrationsbereich)
7. [Datenbank](#7-datenbank)
8. [Spielmechanik und Begriffe](#8-spielmechanik-und-begriffe)
9. [Projektstruktur](#9-projektstruktur)
10. [Anpassen und erweitern](#10-anpassen-und-erweitern)
11. [Fehlerbehebung](#11-fehlerbehebung)

---

## 1. Was gebaut wurde

| Bereich | Umsetzung |
|---|---|
| **Backend** | Node.js 20+ mit Express, ES-Module |
| **Datenbank** | SQLite über `better-sqlite3` (WAL-Modus, 17 Tabellen) |
| **Accounts** | Registrierung, Anmeldung, bcrypt-Passwörter, JWT-Token, Rollen `user`/`admin`, Sperren, Urlaubsmodus |
| **Frontend** | Einzelseiten-Anwendung in reinem JavaScript (ES-Module), LCARS-Design, ohne Build-Schritt |
| **Multiplayer** | Gemeinsames Universum, Flottenflüge zwischen Spielern, Kampfsystem, Spionage, Trümmerfelder, Nachrichten, Flottenverbände (Allianzen), Rangliste |
| **Adminbereich** | Benutzer-, Ressourcen-, Gebäude-, Schiffs-, Forschungs- und Flottenverwaltung, Rundsprüche, Servereinstellungen, Protokoll |

**Spielumfang:** 15 Gebäude, 16 Technologien, 14 Schiffsklassen, 10 Verteidigungsanlagen,
5 spielbare Fraktionen, 7 Flottenaufträge.

---

## 2. Schnellstart in 5 Minuten

### Voraussetzungen

* **Node.js 20 oder neuer** — Prüfen mit `node --version`
  ([Download](https://nodejs.org/) oder unter Linux via `nvm`)
* Ein C++-Compiler für `better-sqlite3` — unter Debian/Ubuntu:
  `sudo apt install build-essential python3`
  (unter Windows/macOS bringt npm meist fertige Binärpakete mit, es ist nichts zu tun)

### Installation

```bash
# 1. Ins Projektverzeichnis wechseln
cd star-trek-conquest

# 2. Abhängigkeiten installieren
npm install

# 3. Konfigurationsdatei anlegen
cp .env.example .env
```

### `.env` bearbeiten

Zwei Werte müssen gesetzt werden:

```bash
# Ein langes Zufallsgeheimnis erzeugen und in .env eintragen:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

```ini
JWT_SECRET=<der eben erzeugte Wert>
ADMIN_PASSWORD=IhrSicheresAdminPasswort
```

> Solange `ADMIN_PASSWORD` leer bleibt, wird **kein** Administrator angelegt und der
> Server gibt beim Start einen entsprechenden Hinweis aus.

### Starten

```bash
npm start
```

```
  ╔══════════════════════════════════════════════╗
  ║   S T A R   T R E K   C O N Q U E S T        ║
  ╚══════════════════════════════════════════════╝
  Server läuft auf http://localhost:3000
  Datenbank:  /pfad/data/universe.db
  Universum:  4 Quadranten × 200 Systeme × 15 Planeten
  Tempo:      Wirtschaft 5× | Bau 5× | Flotte 3×
```

Browser öffnen: **http://localhost:3000** — mit `admin` und dem gesetzten Passwort anmelden.

Für die Entwicklung mit automatischem Neustart bei Codeänderungen:

```bash
npm run dev
```

---

## 3. Konfiguration

Alle Einstellungen stehen in der `.env`. Nach Änderungen ist ein **Serverneustart** nötig.

### Server

| Variable | Vorgabe | Bedeutung |
|---|---|---|
| `PORT` | `3000` | Port, auf dem der Server lauscht |
| `HOST` | `0.0.0.0` | Netzwerk-Interface (`127.0.0.1` = nur lokal erreichbar) |
| `TRUST_PROXY` | `0` | Auf `1` setzen, wenn hinter nginx/Caddy/Traefik — sonst greift die Ratenbegrenzung falsch |

### Sicherheit

| Variable | Bedeutung |
|---|---|
| `JWT_SECRET` | **Pflicht.** Signiert die Sitzungstoken. Bei Änderung werden alle Spieler abgemeldet. |
| `JWT_EXPIRES` | Gültigkeitsdauer der Anmeldung, z. B. `7d`, `24h` |

### Spielgeschwindigkeit

| Variable | Vorgabe | Wirkung |
|---|---|---|
| `SPEED_ECONOMY` | `5` | Rohstoffförderung (`1` = OGame-Originaltempo) |
| `SPEED_BUILD` | `5` | Bau- und Forschungsdauer |
| `SPEED_FLEET` | `3` | Fluggeschwindigkeit der Flotten |

Für einen gemütlichen Langzeit-Server: alles auf `1`.
Für einen schnellen Wochenend-Server: `25` / `25` / `10`.

### Universum

| Variable | Vorgabe | Bedeutung |
|---|---|---|
| `UNI_QUADRANTS` | `4` | Alpha, Beta, Gamma, Delta |
| `UNI_SYSTEMS` | `200` | Systeme je Quadrant |
| `UNI_SLOTS` | `15` | Planetenpositionen je System |

Das ergibt 12.000 Planetenplätze. Faustregel: rund 100 Plätze je erwartetem Spieler.

> **Achtung:** Die Universumsgröße nachträglich zu verkleinern kann bestehende Planeten
> außerhalb des neuen Bereichs unerreichbar machen. Vor dem Start festlegen.

### Startausstattung und Sonstiges

| Variable | Vorgabe | Bedeutung |
|---|---|---|
| `START_DURANIUM` / `START_DILITHIUM` / `START_DEUTERIUM` | `2000`/`1000`/`500` | Rohstoffe auf der Heimatwelt |
| `TICK_INTERVAL_MS` | `5000` | Takt für Flottenankünfte und Bauabschlüsse |
| `REGISTRATION_OPEN` | `true` | Anfangswert; später im Adminbereich umschaltbar |
| `DB_FILE` | `./data/universe.db` | Speicherort der Datenbank |

---

## 4. Testdaten erzeugen

Zum Ausprobieren lassen sich KI-Kommandanten mit ausgebauten Planeten anlegen:

```bash
npm run seed          # 8 Testspieler
node scripts/seed.js 30   # 30 Testspieler
```

Angelegt werden ein Administrator, Spieler mit unterschiedlich weit entwickelten
Imperien (Namen aus dem Star-Trek-Kanon: Kirk, Picard, Sisko, Janeway …) und ein
Beispiel-Flottenverband. **Alle Testspieler haben das Passwort `test12345`.**

Universum vollständig zurücksetzen:

```bash
npm run reset -- --yes
```

> Das löscht die Datenbankdatei unwiderruflich. Beim nächsten Start entsteht ein leeres Universum.

---

## 5. Öffentlich im Internet betreiben

Damit Freunde mitspielen können, muss der Server aus dem Internet erreichbar sein.
Drei erprobte Wege — **Variante B ist für die meisten die beste Wahl.**

> **Du hast einen Raspberry Pi?** Für den Pi (insbesondere den Zero 2 W hinter
> einer FRITZ!Box) gibt es eine eigene, ausführliche Schritt-für-Schritt-Anleitung:
> **[RASPBERRY-PI.md](RASPBERRY-PI.md)** — von der Wahl des Betriebssystems bis
> zur Freigabe ins Internet.

### Variante A: Heimserver mit Portfreigabe (schnell, aber unverschlüsselt)

1. `.env`: `HOST=0.0.0.0`
2. Im Router eine Portweiterleitung einrichten: extern `3000` → interne IP des Rechners, Port `3000`
3. Firewall öffnen: `sudo ufw allow 3000/tcp`
4. Mitspieler verbinden sich über `http://<Ihre-öffentliche-IP>:3000`

> Ohne HTTPS werden Passwörter unverschlüsselt übertragen. Nur im Freundeskreis
> und niemals mit wiederverwendeten Passwörtern nutzen. Für dauerhaften Betrieb
> zusätzlich einen DynDNS-Dienst einrichten, da sich die Heim-IP regelmäßig ändert.

### Variante B: Server mit Domain und HTTPS (empfohlen)

Voraussetzung: ein kleiner V-Server (1 vCPU / 1 GB RAM genügt für ~100 Spieler) und
eine Domain, deren A-Record auf die Server-IP zeigt.

```bash
# --- Auf dem Server ---
sudo apt update && sudo apt install -y nodejs npm build-essential python3 nginx certbot python3-certbot-nginx

# Eigener Benutzer ohne Login-Shell
sudo useradd -r -m -d /opt/star-trek-conquest -s /usr/sbin/nologin stconquest

# Projekt einspielen
sudo -u stconquest git clone <IHR-REPOSITORY> /opt/star-trek-conquest
cd /opt/star-trek-conquest
sudo -u stconquest npm ci --omit=dev

# Konfiguration
sudo -u stconquest cp .env.example .env
sudo -u stconquest nano .env      # JWT_SECRET, ADMIN_PASSWORD, TRUST_PROXY=1 setzen
```

**Dienst einrichten** (die fertige Unit-Datei liegt bei):

```bash
sudo cp deploy/star-trek-conquest.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now star-trek-conquest
sudo systemctl status star-trek-conquest
sudo journalctl -u star-trek-conquest -f     # Logs mitlesen
```

**Reverse-Proxy mit HTTPS:**

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/star-trek-conquest
sudo nano /etc/nginx/sites-available/star-trek-conquest   # spiel.example.com ersetzen
sudo ln -s /etc/nginx/sites-available/star-trek-conquest /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Kostenloses Zertifikat holen (erneuert sich danach selbst)
sudo certbot --nginx -d spiel.example.com
```

Fertig — das Spiel läuft unter `https://spiel.example.com`.

> Wer es noch einfacher mag, nimmt statt nginx **Caddy**: `deploy/Caddyfile` anpassen,
> `caddy run --config deploy/Caddyfile` starten. Caddy besorgt das Zertifikat automatisch.

### Variante C: Docker

```bash
# .env mit mindestens JWT_SECRET und ADMIN_PASSWORD anlegen
echo "JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")" > .env
echo "ADMIN_PASSWORD=IhrAdminPasswort" >> .env

docker compose up -d
docker compose logs -f
```

Die Datenbank liegt im benannten Volume `game-data` und übersteht Updates:

```bash
git pull && docker compose up -d --build
```

Auch hier gehört für den öffentlichen Betrieb ein Reverse-Proxy mit HTTPS davor.

### Nach dem Livegang

* **Registrierung schließen**, wenn alle Mitspieler angemeldet sind:
  Adminbereich → *Server* → Haken bei „Registrierung geöffnet" entfernen
* **Sicherungen einrichten** (siehe [Abschnitt 7](#7-datenbank))
* **Begrüßungstext setzen**: Adminbereich → *Server* → MOTD

---

## 6. Der Administrationsbereich

Sichtbar für Konten mit der Rolle `admin` — als roter Navigationspunkt **Adminbereich**.

### Lagezentrum

Kennzahlen des Universums: Spielerzahl, gerade online, Planeten, Flotten in Bewegung,
Bauaufträge, Rohstoffe im gesamten Universum, führende Kommandanten, neue Registrierungen
und die letzten Verwaltungsaktionen. Die Schaltfläche *Punkte neu berechnen* stößt eine
vollständige Neuberechnung aller Ranglistenwerte an.

### Benutzer

Durchsuchbare, sortierbare Liste aller Konten. **Verwalten** öffnet die Detailansicht:

**Stammdaten**
* Name und E-Mail ändern
* Rolle zwischen *Spieler* und *Administrator* umschalten
* Fraktion wechseln
* Konto **sperren/entsperren** mit Begründung (gesperrte Spieler werden sofort abgemeldet)
* **Passwort zurücksetzen** (beendet alle offenen Sitzungen des Spielers)
* **Nachricht senden** — landet im Postfach des Spielers
* **Planet hinzufügen** — an festen Koordinaten `q:s:p` oder auf einem zufälligen freien Platz
* **Konto löschen** — entfernt Spieler samt Planeten, Flotten und Nachrichten

**Forschungsstufen** — jede der 16 Technologien direkt auf einen Wert setzen.

**Je Planet**
* **Rohstoffe** exakt setzen oder als Gutschrift addieren
* **Gebäudestufen**, **Schiffszahlen** und **Verteidigungsanlagen** frei setzen
* **Warteschlange leeren**
* **Planet löschen**

Alle Änderungen berechnen die Punkte des Spielers sofort neu.

### Flotten

Alle Flotten, die gerade unterwegs sind, mit Route, Ladung und Ankunftszeit.
*Zurückrufen* schickt einen Verband sofort zum Heimatplaneten, *Auflösen* entfernt ihn
ersatzlos (nützlich bei festhängenden Flotten).

### Rundspruch

Nachricht an alle Kommandanten gleichzeitig — wahlweise nur an Spieler, die in den
letzten sieben Tagen aktiv waren.

### Server

* **MOTD** — Begrüßungstext auf dem Anmeldebildschirm und in der Willkommensnachricht
* **Registrierung öffnen/schließen** — wirkt sofort, ohne Neustart
* Anzeige der aktuellen Geschwindigkeits- und Universumseinstellungen
* **Trümmerfeld anlegen** an beliebigen Koordinaten

### Protokoll

Jede Verwaltungsaktion wird mit Zeitstempel, Administrator, Aktion, Ziel und Details
festgehalten — wichtig, wenn mehrere Administratoren tätig sind.

---

## 7. Datenbank

SQLite-Datei unter `data/universe.db` (über `DB_FILE` verschiebbar). WAL-Modus für
parallele Lese- und Schreibzugriffe.

### Tabellen

| Tabelle | Inhalt |
|---|---|
| `users` | Konten: Name, E-Mail, bcrypt-Hash, Rolle, Fraktion, Sperre, Urlaubsmodus |
| `planets` | Planeten mit Koordinaten, Typ, Temperatur, Feldern, Rohstoffbestand |
| `buildings` / `ships` / `defenses` | Besitz je Planet |
| `research` | Technologiestufen je Spieler |
| `build_queue` | Laufende Bau- und Forschungsaufträge |
| `fleets` | Flotten in Bewegung samt Ladung und Zeitplan |
| `debris` | Trümmerfelder nach Schlachten |
| `messages` | Postfach: Gefechts-, Spionage-, Transport- und Systemnachrichten |
| `alliances`, `alliance_members`, `alliance_applications` | Flottenverbände |
| `stats` | Punktestand je Spieler (Wirtschaft, Forschung, Militär) |
| `admin_log` | Protokoll aller Verwaltungsaktionen |
| `settings` | Zur Laufzeit änderbare Einstellungen (MOTD, Registrierung) |

Das Schema legt sich beim ersten Start selbst an — es gibt keinen separaten Migrationsschritt.

### Sicherung

**Im laufenden Betrieb** (transaktionssicher, kein Serverstopp nötig):

```bash
./deploy/backup.sh /var/backups/stc
```

Täglich per cron:

```bash
sudo crontab -e
# 0 4 * * * /opt/star-trek-conquest/deploy/backup.sh /var/backups/stc
```

**Wiederherstellen:**

```bash
sudo systemctl stop star-trek-conquest
gunzip -c /var/backups/stc/universe_2026-08-22_040000.db.gz > /opt/star-trek-conquest/data/universe.db
rm -f /opt/star-trek-conquest/data/universe.db-wal /opt/star-trek-conquest/data/universe.db-shm
sudo chown stconquest:stconquest /opt/star-trek-conquest/data/universe.db
sudo systemctl start star-trek-conquest
```

> Einfaches Kopieren der `.db`-Datei bei laufendem Server kann zu inkonsistenten
> Sicherungen führen, weil ungeschriebene Daten im `-wal` liegen. Deshalb `backup.sh`
> mit `sqlite3 .backup` verwenden.

### Direkter Datenbankzugriff

```bash
sqlite3 data/universe.db
sqlite> SELECT username, role, banned FROM users;
sqlite> SELECT COUNT(*) FROM planets;
sqlite> .quit
```

---

## 8. Spielmechanik und Begriffe

Die Mechanik folgt OGame; sämtliche Bezeichnungen stammen aus Star Trek.

### Rohstoffe

| Star Trek Conquest | OGame | Beschreibung |
|---|---|---|
| **Duranium** | Metall | Rumpfmaterial, Grundstoff für alles |
| **Dilithium** | Kristall | Kristalle für Warpkerne und Elektronik |
| **Deuterium** | Deuterium | Treibstoff für Flotten und Fusionsreaktoren |
| **Energie** | Energie | Bilanzwert; Unterdeckung drosselt die Förderung |

### Fraktionen

Jede Fraktion bringt dauerhafte Boni mit — die Wahl fällt bei der Registrierung und
lässt sich danach nur noch durch einen Administrator ändern.

| Fraktion | Stärke |
|---|---|
| **Vereinigte Föderation der Planeten** | +15 % Forschungstempo, +5 % Schilde |
| **Klingonisches Imperium** | +20 % Waffenwirkung |
| **Romulanisches Sternenimperium** | +20 % Schildstärke |
| **Cardassianische Union** | +15 % Rohstoffförderung |
| **Ferengi-Allianz** | +30 % Frachtkapazität |

### Gebäude (Auswahl)

| Star Trek Conquest | OGame-Vorbild |
|---|---|
| Duranium-Mine | Metallmine |
| Dilithium-Raffinerie | Kristallmine |
| Deuterium-Extraktor | Deuteriumsynthetisierer |
| Solar-Kollektor-Feld / Fusionsreaktor | Solarkraftwerk / Fusionskraftwerk |
| Drohnen-Werkstatt | Roboterfabrik |
| Nanosonden-Fabrik | Nanitenfabrik |
| Sternenflotten-Werft | Raumschiffwerft |
| Wissenschaftslabor | Forschungslabor |
| Terraforming-Anlage | Terraformer |
| Torpedo-Magazin | Raketensilo |

### Schiffe (Auswahl)

| Star Trek Conquest | OGame-Vorbild |
|---|---|
| Transport-Shuttle / Frachter der Antares-Klasse | Kleiner / Großer Transporter |
| Jäger der Peregrine-Klasse | Leichter Jäger |
| Runabout der Danube-Klasse | Schwerer Jäger |
| Kreuzer der Miranda-Klasse | Kreuzer |
| Kreuzer der Excelsior-Klasse | Schlachtschiff |
| Schlachtkreuzer der Galaxy-Klasse | Schlachtkreuzer |
| Angriffsschiff der Defiant-Klasse | Bomber |
| Zerstörer der Sovereign-Klasse | Zerstörer |
| **Taktischer Borg-Kubus** | Todesstern |
| Kolonieschiff der Olympic-Klasse | Kolonieschiff |
| Bergungsschiff der Nebula-Klasse | Recycler |
| Sensorsonde | Spionagesonde |

### Verteidigung (Auswahl)

| Star Trek Conquest | OGame-Vorbild |
|---|---|
| Photonentorpedo-Batterie | Raketenwerfer |
| Leichter / Schwerer Phaser-Turm | Leichtes / Schweres Lasergeschütz |
| Disruptor-Bank | Ionengeschütz |
| Quantentorpedo-Werfer | Gaußkanone |
| Plasma-Geschützturm | Plasmawerfer |
| Kleine / Große Deflektorschild-Kuppel | Kleine / Große Schildkuppel |

### Wichtige Regeln

* **Koordinaten** lauten `[Quadrant:System:Position]`, z. B. `[2:143:7]`.
* **Kolonien:** je zwei Stufen *Astrometrie* erlauben eine weitere Kolonie.
* **Flottenverbände:** jede Stufe *Positronik* erlaubt einen parallelen Flottenauftrag.
* **Energie:** Reicht die Energie nicht, sinkt die Förderleistung anteilig — sichtbar in der Kopfleiste.
* **Kampf:** bis zu 6 Runden, Mehrfachbeschuss (Rapidfire), Schadenswerte unter 1 % der
  gegnerischen Schildstärke prallen wirkungslos ab.
* **Trümmerfeld:** 30 % der zerstörten Schiffe bleiben als Duranium und Dilithium im
  Orbit zurück und können mit Bergungsschiffen eingesammelt werden.
* **Plünderung:** höchstens 50 % der auf dem Planeten lagernden Rohstoffe, begrenzt durch
  den freien Frachtraum der überlebenden Angriffsflotte.
* **Verteidigung:** 70 % der zerstörten Anlagen werden nach der Schlacht automatisch wieder aufgebaut.
* **Urlaubsmodus:** schützt vor Angriffen (Einstellungen → Urlaubsmodus).
* **Abriss:** erstattet 70 % der Baukosten der abgerissenen Stufe.

---

## 9. Projektstruktur

```
star-trek-conquest/
├── package.json
├── .env.example              Vorlage für die Konfiguration
├── Dockerfile                Container-Abbild
├── docker-compose.yml        Betrieb per Docker
│
├── server/
│   ├── index.js              Serverstart, Spiel-Tick, Routen-Einbindung
│   ├── config.js             Auslesen der .env
│   ├── db.js                 Datenbankschema und Zugriffshelfer
│   ├── auth.js               JWT, bcrypt, Berechtigungsprüfung
│   ├── gamedata.js           ▶ Alle Gebäude, Technologien, Schiffe, Fraktionen
│   ├── engine/
│   │   ├── formulas.js       Kosten, Produktion, Bauzeiten, Flugzeiten, Punkte
│   │   ├── planet.js         Rohstoff-Ticks, Kolonisierung, Trümmerfelder
│   │   ├── queue.js          Bau- und Forschungswarteschlangen
│   │   ├── fleet.js          Flottenstart und Auflösung aller Missionen
│   │   ├── combat.js         Kampfsimulation
│   │   ├── stats.js          Punkteberechnung und Rangliste
│   │   └── messages.js       Postfach
│   └── routes/
│       ├── auth.js           Registrierung, Anmeldung, Konto
│       ├── game.js           Zustand, Technologiebaum, Bauaufträge
│       ├── fleet.js          Flottenkommando
│       ├── galaxy.js         Galaxiekarte, Spielerprofile
│       ├── messages.js       Nachrichten
│       ├── alliance.js       Flottenverbände
│       ├── highscore.js      Rangliste
│       └── admin.js          ▶ Administrationsschnittstelle
│
├── public/
│   ├── index.html
│   ├── css/lcars.css         LCARS-Design
│   └── js/
│       ├── app.js            Router, Zustand, Kopfleiste
│       ├── api.js            Fetch-Wrapper mit Token
│       ├── util.js           Formatierung, Countdowns, Dialoge
│       └── views/            Eine Datei je Ansicht (inkl. admin.js)
│
├── scripts/
│   ├── seed.js               Testdaten anlegen
│   └── reset.js              Universum zurücksetzen
│
└── deploy/
    ├── star-trek-conquest.service   systemd-Dienst (Linux-Server)
    ├── raspberry-pi.service         systemd-Dienst (Raspberry Pi)
    ├── nginx.conf                   Reverse-Proxy mit HTTPS
    ├── Caddyfile                    Alternative mit automatischem HTTPS
    └── backup.sh                    Datenbanksicherung
```

---

## 10. Anpassen und erweitern

### Spielbalance ändern

Alles steckt in **`server/gamedata.js`**. Beispiel — eine Duranium-Mine verbilligen:

```js
duranium_mine: {
  name: 'Duranium-Mine',
  cost: { duranium: 40, dilithium: 10 },   // war 60/15
  factor: 1.45,                            // war 1.5 — flachere Kostenkurve
},
```

Nach dem Neustart gilt der neue Wert. Bereits gebaute Stufen bleiben erhalten,
nur künftige Kosten ändern sich.

### Neues Schiff hinzufügen

```js
// in server/gamedata.js, Objekt SHIPS
scout_intrepid: {
  name: 'Aufklärer der Intrepid-Klasse',
  category: 'military',
  description: 'Wendiger Langstreckenforscher mit variabler Gondelgeometrie.',
  cost: { duranium: 25000, dilithium: 18000, deuterium: 6000 },
  shield: 150, weapon: 600, speed: 20000, cargo: 1200, fuel: 400,
  drive: 'impulse_drive',
  requires: { buildings: { shipyard: 6 }, research: { impulse_drive: 5 } },
},
```

Mehr ist nicht nötig — Oberfläche, Bauwarteschlange, Kampfsystem und Punktewertung
lesen den Katalog automatisch. Optional lässt sich in `RAPIDFIRE` noch Mehrfachbeschuss
gegen bestimmte Ziele ergänzen.

### Produktionsformeln anpassen

`server/engine/formulas.js`, Funktion `production()`. Die Konstanten entsprechen dem
OGame-Original (30 je Stufe für Metall, Faktor 1,1 pro Stufe usw.).

### Aussehen ändern

`public/css/lcars.css` — alle Farben stehen als CSS-Variablen im `:root`-Block ganz oben.

### Neue Ansicht hinzufügen

1. Datei unter `public/js/views/meineansicht.js` mit `export async function render(container, ctx)`
2. In `public/js/app.js` im Objekt `VIEWS` eintragen

---

## 11. Fehlerbehebung

**`npm install` bricht bei `better-sqlite3` ab**
Es fehlen die Build-Werkzeuge:
`sudo apt install build-essential python3` (Debian/Ubuntu) bzw.
`xcode-select --install` (macOS). Danach `npm install` wiederholen.

**„Es existiert noch kein Administrator"**
`ADMIN_PASSWORD` in der `.env` setzen und den Server neu starten — oder `npm run seed` ausführen.

**Administratorzugang verloren**
Direkt in der Datenbank eine bestehende Kennung zum Administrator machen:
```bash
sqlite3 data/universe.db "UPDATE users SET role='admin' WHERE username='IhrName';"
```

**Port 3000 ist belegt**
In der `.env` `PORT` ändern, oder den blockierenden Prozess finden: `lsof -i :3000`

**Ratenbegrenzung greift hinter dem Proxy für alle gleichzeitig**
`TRUST_PROXY=1` in der `.env` setzen — sonst sehen alle Anfragen wie eine einzige IP aus.

**Spieler werden ständig abgemeldet**
`JWT_SECRET` wurde geändert oder ist nicht gesetzt. Einen festen Wert eintragen.

**Flotten kommen nicht an, Gebäude werden nicht fertig**
Der Spiel-Tick steht. Serverprotokoll prüfen: `sudo journalctl -u star-trek-conquest -n 100`

**Rohstoffe zeigen mehr als die Lagerkapazität**
Das ist beabsichtigt: über der Grenze wird nichts mehr produziert, bereits vorhandene
Überschüsse (aus Transporten, Beute oder Adminzuweisung) bleiben aber erhalten.

**Serverzustand jederzeit prüfen**
```bash
curl http://localhost:3000/api/health
```

---

## Lizenz und Hinweis

Der Quellcode steht unter der MIT-Lizenz.

*Star Trek* und alle zugehörigen Marken sind Eigentum von **CBS Studios Inc. / Paramount**.
Dieses Projekt ist ein nicht-kommerzielles Fan-Projekt und steht in keiner Verbindung
zu den Rechteinhabern. Für einen öffentlichen Betrieb sollten die markenrechtlichen
Rahmenbedingungen im Blick behalten werden.
