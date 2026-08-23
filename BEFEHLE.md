# Befehlsübersicht für den Server

Alle Befehle laufen per SSH auf dem Raspberry Pi.
Ersetze `DEIN-BENUTZER` durch deinen Anmeldenamen.

```bash
ssh DEIN-BENUTZER@sternenflotte.fritz.box
```

---

## Die zehn wichtigsten Befehle

| Zweck | Befehl |
|---|---|
| Läuft der Server? | `sudo systemctl status star-trek-conquest` |
| Neu starten | `sudo systemctl restart star-trek-conquest` |
| Protokoll live mitlesen | `sudo journalctl -u star-trek-conquest -f` |
| Auf neue Version aktualisieren | `cd ~/star-trek-conquest && git pull && sudo systemctl restart star-trek-conquest` |
| Sicherung von Hand erstellen | `~/star-trek-conquest/deploy/backup.sh ~/sicherungen` |
| Sicherungen anzeigen | `ls -lh ~/sicherungen` |
| Erreichbarkeit prüfen | `curl http://localhost:3000/api/health` |
| Internetfreigabe prüfen | `sudo tailscale funnel status` |
| Speicherplatz prüfen | `df -h /` |
| Sauber herunterfahren | `sudo shutdown -h now` |

---

## 1. Dienst steuern

```bash
sudo systemctl status star-trek-conquest     # Zustand anzeigen
sudo systemctl restart star-trek-conquest    # neu starten
sudo systemctl stop star-trek-conquest       # anhalten
sudo systemctl start star-trek-conquest      # starten
sudo systemctl enable star-trek-conquest     # Autostart einschalten
sudo systemctl disable star-trek-conquest    # Autostart ausschalten
```

Bei `status` steht in der zweiten Zeile das Wichtigste:

* `Active: active (running)` — alles in Ordnung
* `Active: failed` — Fehler, weiter mit dem Protokoll unten
* `Active: inactive (dead)` — angehalten

---

## 2. Protokoll lesen

```bash
sudo journalctl -u star-trek-conquest -f          # live mitlesen (Strg+C beendet)
sudo journalctl -u star-trek-conquest -n 50       # letzte 50 Zeilen
sudo journalctl -u star-trek-conquest --since today
sudo journalctl -u star-trek-conquest -p err      # nur Fehlermeldungen
sudo journalctl -u star-trek-conquest --since "1 hour ago"
```

Das Protokoll ist die erste Anlaufstelle, wenn etwas nicht läuft.

---

## 3. Aktualisieren

```bash
cd ~/star-trek-conquest

# Vorher sichern – dauert eine Sekunde und erspart im Ernstfall viel Ärger
./deploy/backup.sh ~/sicherungen

git pull                          # neue Fassung holen
npm ci --omit=dev                 # nur nötig, wenn sich Abhängigkeiten ändern
sudo systemctl restart star-trek-conquest
sudo systemctl status star-trek-conquest
```

Danach im Browser einmal **Strg + Umschalt + R** drücken.

> Wurde die Dienst-Datei selbst geändert, reicht `git pull` nicht — dann zusätzlich:
> ```bash
> sudo ./deploy/install-service.sh
> ```

---

## 4. Datensicherung

### Sicherung von Hand

```bash
~/star-trek-conquest/deploy/backup.sh ~/sicherungen
```

Ausgabe bei Erfolg:

```
Sicherung erstellt: /home/DEIN-BENUTZER/sicherungen/universe_2026-08-22_204512.db.gz
```

Der Befehl funktioniert aus jedem Verzeichnis und arbeitet auch im laufenden
Betrieb transaktionssicher — der Server muss nicht angehalten werden.

### Automatische Sicherung einrichten

```bash
mkdir -p ~/sicherungen
crontab -e
```

Ganz unten anfügen (beim ersten Mal `1` für nano wählen):

```
0 4 * * * $HOME/star-trek-conquest/deploy/backup.sh $HOME/sicherungen >> $HOME/sicherungen/backup.log 2>&1
```

Speichern mit `Strg+O`, `Enter`, `Strg+X`.

Der Zusatz `>> …/backup.log 2>&1` schreibt jede Ausführung mit — genau das
brauchst du, um später prüfen zu können, ob es geklappt hat.

### Prüfen, ob die automatische Sicherung funktioniert

**Schritt 1 — ist der Auftrag überhaupt eingetragen?**

```bash
crontab -l
```

Die Zeile mit `backup.sh` muss erscheinen. Fehlt sie, wurde beim Speichern
etwas nicht übernommen.

**Schritt 2 — läuft der Zeitplandienst?**

```bash
systemctl status cron
```

Muss `active (running)` zeigen.

**Schritt 3 — gibt es Sicherungsdateien, und wie alt sind sie?**

```bash
ls -lht ~/sicherungen
```

`-t` sortiert nach Zeit, die neueste steht oben. Ist die oberste Datei von
heute Nacht, hat die Automatik gearbeitet.

**Schritt 4 — das Protokoll der Sicherung selbst**

```bash
tail -20 ~/sicherungen/backup.log
```

Dort steht je Lauf eine Zeile `Sicherung erstellt: …`. Steht dort eine
Fehlermeldung, siehst du sofort die Ursache.

**Schritt 5 — hat cron die Aufgabe tatsächlich gestartet?**

```bash
grep CRON /var/log/syslog | tail -10
```

Auf neueren Systemen stattdessen:

```bash
journalctl -u cron --since yesterday | grep backup
```

**Nicht bis morgen warten wollen?** Dann einmal von Hand mit derselben
Umgebung ausführen, die cron verwendet:

```bash
env -i PATH=/usr/bin:/bin HOME=$HOME $HOME/star-trek-conquest/deploy/backup.sh $HOME/sicherungen
```

Läuft das durch, wird auch der nächtliche Lauf funktionieren. Dieser Test ist
aussagekräftiger als ein normaler Aufruf, weil cron mit einer sehr sparsamen
Umgebung startet — die häufigste Ursache für stillschweigend fehlschlagende
Sicherungen.

### Sicherung zurückspielen

```bash
sudo systemctl stop star-trek-conquest

cd ~/star-trek-conquest
gunzip -c ~/sicherungen/universe_2026-08-22_040000.db.gz > data/universe.db
rm -f data/universe.db-wal data/universe.db-shm

sudo systemctl start star-trek-conquest
```

> Die beiden `-wal`/`-shm`-Dateien müssen weg, sonst mischt SQLite alte
> Änderungen in die zurückgespielte Datenbank.

### Sicherungen auf den eigenen Rechner holen

Auf deinem Computer ausführen, nicht auf dem Pi:

```bash
scp DEIN-BENUTZER@sternenflotte.fritz.box:~/sicherungen/*.gz ~/Downloads/
```

---

## 5. Erreichbarkeit prüfen

```bash
curl http://localhost:3000/api/health          # auf dem Pi selbst
```

Antwort bei laufendem Server:

```json
{"ok":true,"version":"0.9.0-beta.1","users":6,"planets":7,"fleets":0}
```

```bash
sudo tailscale funnel status     # ist die Internetfreigabe aktiv?
sudo tailscale funnel --bg 3000  # Freigabe (neu) setzen
sudo tailscale status            # ist der Pi mit Tailscale verbunden?
hostname -I                      # IP-Adresse im Heimnetz
```

---

## 6. Zustand des Pi

```bash
df -h /                # freier Speicherplatz
free -h                # Arbeitsspeicher
uptime                 # Laufzeit und Auslastung
vcgencmd measure_temp  # Temperatur
ps -eo pid,%mem,%cpu,cmd --sort=-%mem | head -5   # größte Verbraucher
```

Der Spielserver belegt im Normalbetrieb etwa 84 MB Arbeitsspeicher.

---

## 7. Datenbank direkt ansehen

```bash
cd ~/star-trek-conquest
sqlite3 data/universe.db
```

```sql
SELECT username, role, banned FROM users;
SELECT COUNT(*) FROM planets;
SELECT username, points FROM users u
  JOIN stats s ON s.user_id = u.id ORDER BY points DESC LIMIT 10;
.quit
```

Administratorrechte vergeben, falls der Zugang verloren ging:

```bash
sqlite3 data/universe.db "UPDATE users SET role='admin' WHERE username='DEIN-NAME';"
```

---

## 8. Server von Hand starten (zur Fehlersuche)

```bash
sudo systemctl stop star-trek-conquest
cd ~/star-trek-conquest
npm start
```

Fehler erscheinen dann direkt im Terminal statt im Protokoll. Beenden mit
`Strg+C`, danach wieder:

```bash
sudo systemctl start star-trek-conquest
```

> `npm start` funktioniert nur **im** Projektverzeichnis — sonst findet npm
> die `package.json` nicht.

---

## 9. Wenn gar nichts mehr geht

```bash
# 1. Was sagt das Protokoll?
sudo journalctl -u star-trek-conquest -n 40 --no-pager

# 2. Dienst neu einrichten (erkennt Pfade und Benutzer selbst)
cd ~/star-trek-conquest && sudo ./deploy/install-service.sh

# 3. Voraussetzungen prüfen, ohne etwas zu ändern
sudo ./deploy/install-service.sh --check

# 4. Pi neu starten
sudo reboot
```

---

## Kurzreferenz zum Ausdrucken

```
STATUS      sudo systemctl status star-trek-conquest
NEUSTART    sudo systemctl restart star-trek-conquest
PROTOKOLL   sudo journalctl -u star-trek-conquest -f
UPDATE      cd ~/star-trek-conquest && git pull && sudo systemctl restart star-trek-conquest
SICHERUNG   ~/star-trek-conquest/deploy/backup.sh ~/sicherungen
PRÜFEN      ls -lht ~/sicherungen  &&  tail -5 ~/sicherungen/backup.log
GESUNDHEIT  curl http://localhost:3000/api/health
FUNNEL      sudo tailscale funnel status
HERUNTER    sudo shutdown -h now
```
