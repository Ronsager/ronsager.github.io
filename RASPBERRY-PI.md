# Star Trek Conquest auf dem Raspberry Pi Zero 2 W

Schritt-für-Schritt-Anleitung vom leeren Pi bis zum Spielserver, der aus dem
Internet erreichbar ist. Geschrieben für den **Raspberry Pi Zero 2 W** hinter
einer **FRITZ!Box**.

Alles wird ohne Bildschirm und Tastatur eingerichtet („headless") — du brauchst
nur deinen normalen Computer, den Pi und WLAN.

**Zeitbedarf:** etwa 60 Minuten, davon 20 Minuten Wartezeit.

---

## Inhalt

1. [Was du brauchst](#1-was-du-brauchst)
2. [Betriebssystem auf die Speicherkarte schreiben](#2-betriebssystem-auf-die-speicherkarte-schreiben)
3. [Ersten Start und Anmeldung per SSH](#3-ersten-start-und-anmeldung-per-ssh)
4. [Feste IP-Adresse in der FRITZ!Box](#4-feste-ip-adresse-in-der-fritzbox)
5. [Grundeinrichtung des Systems](#5-grundeinrichtung-des-systems)
6. [Node.js installieren](#6-nodejs-installieren)
7. [Das Spiel installieren](#7-das-spiel-installieren)
8. [Als Dienst dauerhaft laufen lassen](#8-als-dienst-dauerhaft-laufen-lassen)
9. [Aus dem Internet erreichbar machen](#9-aus-dem-internet-erreichbar-machen)
10. [Datensicherung einrichten](#10-datensicherung-einrichten)
11. [Wartung und Fehlerbehebung](#11-wartung-und-fehlerbehebung)

---

## 1. Was du brauchst

| Teil | Hinweis |
|---|---|
| **Raspberry Pi Zero 2 W** | Das **„2"** ist entscheidend. Der alte Zero / Zero W hat einen ARMv6-Prozessor, für den es kein Node.js mehr gibt |
| **microSD-Karte, 16 GB** | Markenware mit Kennzeichnung **A1** oder **A2**. Billige No-Name-Karten sind die häufigste Fehlerquelle |
| **Netzteil mit Micro-USB** | 5 V / mindestens 2 A. **Kein USB-C** — der Zero 2 W hat Micro-USB. Handy-Ladegeräte mit zu wenig Strom führen zu Abstürzen und defekten Karten |
| **Kartenleser** | Für deinen Computer, zum Beschreiben der Karte |
| **WLAN, 2,4 GHz** | Der Zero 2 W kann **kein 5-GHz-WLAN**. Siehe Hinweis in Schritt 2 |

Nicht nötig: Bildschirm, Tastatur, HDMI-Adapter, Netzwerkkabel. Der Pi Zero 2 W
hat ohnehin keinen Ethernet-Anschluss — die Einrichtung läuft komplett über WLAN.

> **Rein optional:** ein USB-Stick oder eine kleine USB-SSD samt
> **Micro-USB-OTG-Adapter**, um die Spieldatenbank auszulagern. Nötig ist das
> nicht — der Server schreibt im Leerlauf nichts auf die Karte. Siehe Schritt 7.

---

## 2. Betriebssystem auf die Speicherkarte schreiben

### Welches Betriebssystem?

**Raspberry Pi OS Lite (64 Bit)** — Version Bookworm oder neuer.

* **Lite** = ohne Desktop-Oberfläche. Der Pi soll ein Server sein; eine grafische
  Oberfläche würde nur Arbeitsspeicher verbrauchen, den wir bei 512 MB nicht
  verschenken wollen.
* **64 Bit** = passt zum Cortex-A53-Prozessor des Zero 2 W. Node.js liefert dafür
  fertige Binärdateien (`linux-arm64`), ebenso die Datenbankbibliothek des Spiels.

> Die 32-Bit-Variante funktioniert ebenfalls (Node.js `linux-armv7l` existiert),
> aber es gibt keinen Grund dafür. Nimm 64 Bit.

### Raspberry Pi Imager installieren

Lade den **Raspberry Pi Imager** von <https://www.raspberrypi.com/software/>
herunter und installiere ihn (gibt es für Windows, macOS und Linux).

### Karte beschreiben

1. Speicherkarte in den Kartenleser stecken, Imager starten.
2. **Modell wählen** → `Raspberry Pi Zero 2 W`
3. **OS wählen** → `Raspberry Pi OS (other)` → **`Raspberry Pi OS Lite (64-bit)`**
4. **SD-Karte wählen** → deine Karte (**gut hinschauen — die Karte wird komplett gelöscht**)
5. Auf **Weiter** klicken. Es erscheint die Frage *„Möchtest du OS-Anpassungen vornehmen?"*
   → **Einstellungen bearbeiten**

### Die Voreinstellungen — dieser Teil ist der wichtigste

Ohne diese Angaben kommst du später nicht auf den Pi, weil du weder Bildschirm
noch Tastatur hast.

**Reiter „Allgemein":**

| Feld | Eintrag |
|---|---|
| Hostname | `sternenflotte` (frei wählbar, du erreichst den Pi später darüber) |
| Benutzername | frei wählbar, z. B. `pi` — **notieren!** Du brauchst ihn gleich zum Anmelden |
| Passwort | Ein sicheres Passwort — **notieren!** |
| WLAN-SSID | Der Name deines WLANs |
| WLAN-Passwort | Dein WLAN-Schlüssel |
| WLAN-Land | `DE` |
| Zeitzone | `Europe/Berlin` |
| Tastaturlayout | `de` |

**Reiter „Dienste":**

* ✅ **SSH aktivieren** → **Passwort zur Anmeldung verwenden**

Dann **Speichern** → **Ja** → Sicherheitsabfrage bestätigen. Das Schreiben dauert
etwa 5 Minuten.

> ### ⚠ Wichtig zum WLAN
> Der Zero 2 W funkt **ausschließlich auf 2,4 GHz**. Wenn deine FRITZ!Box für
> 2,4 und 5 GHz **denselben** WLAN-Namen verwendet (Standardeinstellung), passt
> alles — der Pi sucht sich automatisch das 2,4-GHz-Band.
>
> Hast du die Bänder getrennt benannt (z. B. `MeinWLAN` und `MeinWLAN-5GHz`),
> dann trage hier unbedingt den **2,4-GHz-Namen** ein.
>
> Prüfen kannst du das in der FRITZ!Box unter
> **WLAN → Funknetz**. Steht dort bei „Name des WLAN-Funknetzes (SSID)" nur ein
> Eintrag, ist alles in Ordnung.

---

## 3. Ersten Start und Anmeldung per SSH

1. Karte aus dem Computer nehmen und in den Pi stecken.
2. Netzteil an den **mittleren** Micro-USB-Anschluss (beschriftet mit `PWR`).
   Der äußere Anschluss (`USB`) ist für Zubehör.
3. **Zwei bis drei Minuten warten.** Beim allerersten Start richtet sich das
   System ein und startet dabei einmal neu. Die grüne LED flackert dabei.

### Pi in der FRITZ!Box finden

Öffne <http://fritz.box> in deinem Browser und gehe zu
**Heimnetz → Netzwerk**. In der Liste sollte nun `sternenflotte` auftauchen,
mit einer IP-Adresse wie `192.168.178.42`.

Taucht der Pi nach fünf Minuten nicht auf, siehe [Fehlerbehebung](#11-wartung-und-fehlerbehebung).

### Per SSH verbinden

Öffne auf deinem Computer ein Terminal
(Windows: **PowerShell**; macOS/Linux: **Terminal**):

```bash
ssh DEIN-BENUTZERNAME@sternenflotte.fritz.box
```

Falls das nicht klappt, nimm die IP-Adresse aus der FRITZ!Box:

```bash
ssh DEIN-BENUTZERNAME@192.168.178.42
```

Beim ersten Mal fragt SSH, ob du dem Rechner vertraust → `yes` eingeben.
Dann dein Passwort aus Schritt 2 eingeben (die Eingabe ist unsichtbar, das ist normal).

Du bist drin, wenn die Zeile so aussieht:

```
ronsager@sternenflotte:~ $
```

Ab hier laufen **alle** Befehle auf dem Pi, nicht mehr auf deinem Computer.

---

## 4. Feste IP-Adresse in der FRITZ!Box

Damit der Pi immer dieselbe Adresse behält, vergibt die FRITZ!Box sie dauerhaft:

1. <http://fritz.box> → **Heimnetz → Netzwerk**
2. In der Zeile `sternenflotte` rechts auf den **Stift** (Bearbeiten) klicken
3. Häkchen setzen bei:
   **„Diesem Netzwerkgerät immer die gleiche IPv4-Adresse zuweisen"**
4. **OK**

Notiere dir die Adresse — du brauchst sie in Schritt 9.

---

## 5. Grundeinrichtung des Systems

### System aktualisieren

```bash
sudo apt update && sudo apt full-upgrade -y
```

Das dauert auf dem Zero 2 W **10 bis 20 Minuten**. Gute Gelegenheit für einen Kaffee.
Danach neu starten:

```bash
sudo reboot
```

Warte eine Minute, dann verbinde dich erneut per SSH.

### Werkzeuge nachinstallieren

```bash
sudo apt install -y git sqlite3
```

### Auslagerungsspeicher vergrößern — optional, kann übersprungen werden

512 MB Arbeitsspeicher reichen für den Spielserver locker aus: Er belegt im
Betrieb nur etwa 84 MB, und bei der Installation wird nichts kompiliert, weil
fertige ARM-Pakete geladen werden.

**Wenn du es eilig hast, überspring diesen Abschnitt und mach mit Schritt 6
weiter.** Wer etwas Reserve möchte, schaut zuerst nach, was das System überhaupt
mitbringt:

```bash
free -h
swapon --show
```

Je nach Ausgabe von `swapon --show` geht es unterschiedlich weiter:

**Fall 1 — es erscheint `/var/swap`** (klassisches Raspberry Pi OS):

```bash
sudo dphys-swapfile swapoff
sudo sed -i 's/^CONF_SWAPSIZE=.*/CONF_SWAPSIZE=512/' /etc/dphys-swapfile
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
```

**Fall 2 — es erscheint `/dev/zram0`:**
Dein System nutzt bereits komprimierten Arbeitsspeicher. Das ist für unseren
Zweck völlig ausreichend — **hier ist nichts zu tun.**

**Fall 3 — die Ausgabe ist leer, oder du bekommst
`sudo: dphys-swapfile: command not found`:**
Das Werkzeug ist auf deinem Abbild nicht vorinstalliert. Entweder du lässt es
einfach dabei bewenden (der Server läuft auch ganz ohne Auslagerung), oder du
installierst es nach:

```bash
sudo apt install -y dphys-swapfile
```

Danach funktionieren die Befehle aus Fall 1.

Zum Schluss prüfen — in der Zeile `Swap` sollten nun etwa 512 MB stehen:

```bash
free -h
```

---

## 6. Node.js installieren

Das Node.js-Paket in Raspberry Pi OS ist zu alt für dieses Spiel (benötigt wird
Version 20 oder neuer). Wir installieren daher die offizielle Binärdatei von
nodejs.org — sie enthält fertige ARM-Versionen.

### Architektur prüfen

```bash
uname -m
```

* `aarch64` → 64-Bit-System, weiter mit **arm64** (der Normalfall)
* `armv7l` → 32-Bit-System, ersetze unten `arm64` durch `armv7l`

### Installieren

```bash
NODE_VERSION=v22.23.2
ARCH=arm64

cd /tmp
wget https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-$ARCH.tar.xz

sudo tar -xJf node-$NODE_VERSION-linux-$ARCH.tar.xz -C /usr/local \
     --strip-components=1 \
     --exclude=CHANGELOG.md --exclude=LICENSE --exclude=README.md

rm node-$NODE_VERSION-linux-$ARCH.tar.xz
```

### Prüfen

```bash
node --version    # sollte v22.23.2 zeigen
npm --version
```

> Eine neuere LTS-Version findest du auf <https://nodejs.org/en/download> —
> trage sie oben bei `NODE_VERSION` ein. Wichtig ist nur: **Version 20 oder höher.**

---

## 7. Das Spiel installieren

### Dateien holen

```bash
cd ~
git clone https://github.com/Ronsager/ronsager.github.io.git star-trek-conquest
cd star-trek-conquest
git checkout claude/star-trek-ogame-webapp-qfbct6
```

> Liegt das Projekt woanders, ersetze die URL entsprechend. Alternativ kannst du
> den Ordner auch per `scp` von deinem Computer übertragen.

### Abhängigkeiten installieren

```bash
npm ci --omit=dev
```

Das dauert ein bis zwei Minuten. Die Datenbankbibliothek `better-sqlite3` bringt
eine fertige ARM-Binärdatei mit, es wird **nichts kompiliert**.

### Konfiguration anlegen

```bash
cp .env.example .env
```

Zuerst ein Sicherheitsgeheimnis erzeugen:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Kopiere die ausgegebene lange Zeichenkette. Dann die Datei bearbeiten:

```bash
nano .env
```

Ändere diese drei Zeilen:

```ini
JWT_SECRET=<die eben erzeugte Zeichenkette hier einfügen>
ADMIN_PASSWORD=DeinSicheresAdminPasswort
TRUST_PROXY=1
```

Speichern mit `Strg`+`O`, `Enter`, dann `Strg`+`X` zum Beenden.

### Optional: Datenbank auf einen USB-Stick legen

Der Spielserver schreibt nur dann in die Datenbank, wenn sich tatsächlich etwas
verändert hat — solange niemand spielt, wird die Speicherkarte gar nicht angefasst.
Für den normalen Betrieb reicht eine ordentliche A1/A2-Karte deshalb völlig aus.

Wer dauerhaft viele Mitspieler hat und die Karte zusätzlich entlasten will, legt
die Datenbank auf einen USB-Stick. Dafür brauchst du einen **Micro-USB-OTG-Adapter**
am äußeren Anschluss:

```bash
lsblk                                    # Stick finden, meist /dev/sda1
sudo mkdir -p /mnt/spieldaten
sudo mount /dev/sda1 /mnt/spieldaten
sudo chown pi:pi /mnt/spieldaten

# Dauerhaft einbinden
echo "UUID=$(sudo blkid -s UUID -o value /dev/sda1) /mnt/spieldaten auto defaults,nofail 0 2" | sudo tee -a /etc/fstab
```

Dann in der `.env` ergänzen:

```ini
DB_FILE=/mnt/spieldaten/universe.db
```


### Erster Testlauf

```bash
npm start
```

Es sollte erscheinen:

```
  ╔══════════════════════════════════════════════╗
  ║   S T A R   T R E K   C O N Q U E S T        ║
  ╚══════════════════════════════════════════════╝
  Server läuft auf http://localhost:3000
```

Öffne nun auf deinem Computer im Browser:
**`http://sternenflotte.fritz.box:3000`**
(oder `http://192.168.178.42:3000`)

Melde dich mit `admin` und deinem `ADMIN_PASSWORD` an. Wenn das Spiel erscheint,
beende den Testlauf im Terminal mit `Strg`+`C`.

---

## 8. Als Dienst dauerhaft laufen lassen

Damit das Spiel automatisch startet und nach einem Stromausfall von selbst
zurückkommt, richten wir es als Systemdienst ein.

```bash
cd ~/star-trek-conquest
sudo ./deploy/install-service.sh
```

Das Skript liest Benutzername, Projektpfad und Node-Pfad von deinem System aus,
erzeugt daraus die Dienst-Datei, aktiviert den Autostart und startet den Dienst.
Feste Pfade, die auf deinem Pi womöglich anders lauten, gibt es dadurch nicht mehr.

Nur prüfen, ohne etwas zu ändern:

```bash
./deploy/install-service.sh --check
```

Das meldet einzeln, was fehlt — etwa eine nicht angelegte `.env`, ein zu altes
Node oder fehlende Abhängigkeiten.

Status prüfen:

```bash
sudo systemctl status star-trek-conquest
```

Es sollte grün `active (running)` dastehen. Protokoll live mitlesen:

```bash
sudo journalctl -u star-trek-conquest -f
```

(Beenden mit `Strg`+`C` — der Dienst läuft weiter.)

Die wichtigsten Befehle für später:

```bash
sudo systemctl restart star-trek-conquest   # neu starten
sudo systemctl stop star-trek-conquest      # anhalten
sudo systemctl start star-trek-conquest     # starten
```

Teste es: Zieh dem Pi den Strom, steck ihn wieder an, warte zwei Minuten — das
Spiel muss von allein wieder erreichbar sein.

---

## 9. Aus dem Internet erreichbar machen

Jetzt läuft das Spiel im Heimnetz. Damit Freunde von außen mitspielen können,
gibt es drei Wege. **Weg A ist für die meisten der beste.**

### ⚠ Zuerst prüfen: Hast du überhaupt eine öffentliche IPv4-Adresse?

Viele deutsche Anschlüsse (besonders Kabel) nutzen **DS-Lite** — dabei teilst du
dir eine IPv4-Adresse mit anderen Kunden, und **Portfreigaben funktionieren
grundsätzlich nicht**.

Prüfen in der FRITZ!Box: **Internet → Online-Monitor**. Steht dort bei
„genutzte IP-Adresse" nur eine IPv6-Adresse, oder taucht irgendwo **„DS-Lite"**
auf, dann ist Weg B für dich versperrt — nimm Weg A.

> Weg A funktioniert **auch bei DS-Lite**, weil der Pi die Verbindung von innen
> nach außen aufbaut. Deshalb ist er die sichere Wahl.

---

### Weg A: Tailscale Funnel (empfohlen — ohne Portfreigabe, ohne eigene Domain)

Kostenlos für private Nutzung, liefert automatisch eine HTTPS-Adresse und braucht
in der FRITZ!Box **keine einzige Einstellung**.

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Der Befehl zeigt eine Internetadresse an. Öffne sie im Browser und melde dich an
(Google-, Microsoft- oder GitHub-Konto genügt, kostenlos). Danach die Freigabe
einschalten — **unbedingt mit `--bg`**:

```bash
sudo tailscale funnel --bg 3000
```

> ### ⚠ Das `--bg` ist wichtig
> Ohne diesen Zusatz läuft die Freigabe nur im Vordergrund: Sie endet, sobald du
> `Strg`+`C` drückst **oder einfach die SSH-Verbindung schließt**. Die Adresse ist
> dann tot, obwohl der Spielserver weiterläuft. Mit `--bg` bleibt die Freigabe
> dauerhaft bestehen und übersteht auch einen Neustart des Pi.

Beim ersten Mal weist Tailscale dich eventuell an, **HTTPS-Zertifikate** und
**Funnel** in der Weboberfläche freizuschalten — folge einfach dem angezeigten Link
und wiederhole den Befehl danach.

Anschließend bekommst du eine Adresse in dieser Form:

```
https://sternenflotte.dein-name.ts.net
```

Diese Adresse gibst du deinen Mitspielern. Fertig — inklusive HTTPS.

### Wenn die Funnel-Adresse nicht erreichbar ist

Arbeite diese vier Prüfungen der Reihe nach ab:

```bash
# 1. Läuft der Spielserver überhaupt?
curl http://localhost:3000/api/health

# 2. Ist die Freigabe aktiv? Hier muss dein ts.net-Name mit Port 3000 auftauchen
sudo tailscale funnel status

# 3. Ist der Pi überhaupt mit Tailscale verbunden?
sudo tailscale status

# 4. Freigabe neu setzen
sudo tailscale funnel --bg 3000
```

Zeigt Punkt 2 nichts an, war die Freigabe ohne `--bg` gestartet und ist beim
Schließen der SSH-Sitzung verschwunden — der häufigste Fall.

Meldet Tailscale etwas wie *„Funnel is not enabled"*, musst du Funnel einmalig in
der Tailscale-Weboberfläche unter **Access Controls** freischalten; der Befehl gibt
dazu einen direkten Link aus.

---

### Weg B: FRITZ!Box-Portfreigabe mit MyFRITZ! (nur ohne DS-Lite)

**Schritt 1 — Portfreigabe einrichten**

1. <http://fritz.box> → **Internet → Freigaben → Portfreigaben**
2. **Gerät für Freigaben hinzufügen**
3. Gerät: `sternenflotte`
4. **Neue Freigabe** → **Andere Anwendung**
   * Bezeichnung: `Star Trek Conquest`
   * Protokoll: `TCP`
   * Port an Gerät: `3000` bis `3000`
   * Port extern gewünscht: `3000`
5. **OK** → **Übernehmen**

**Schritt 2 — Feste Internetadresse über MyFRITZ!**

Deine Heim-IP ändert sich regelmäßig. MyFRITZ! gibt dir einen gleichbleibenden Namen:

1. **Internet → MyFRITZ!-Konto**
2. E-Mail-Adresse eintragen, Bestätigungsmail anklicken
3. Du erhältst eine Adresse wie `abc123xyz.myfritz.net`

Deine Mitspieler verbinden sich dann über:

```
http://abc123xyz.myfritz.net:3000
```

> **Achtung:** Das ist **`http`**, nicht `https` — die Verbindung ist
> **unverschlüsselt**. Passwörter gehen im Klartext durchs Netz. Nutze diesen Weg
> nur im engsten Freundeskreis und verwende auf keinen Fall ein Passwort, das du
> anderswo schon benutzt. Für echtes HTTPS brauchst du eine eigene Domain und ein
> Zertifikat — dann ist Weg A einfacher.

---

### Weg C: Cloudflare Tunnel (wenn du bereits eine eigene Domain hast)

Funktioniert wie Weg A ohne Portfreigabe, setzt aber eine Domain voraus, die bei
Cloudflare verwaltet wird. Zum schnellen Ausprobieren ohne Domain:

```bash
cloudflared tunnel --url http://localhost:3000
```

Das liefert sofort eine zufällige HTTPS-Adresse — praktisch zum Testen, aber sie
ändert sich bei jedem Neustart und eignet sich nicht für den Dauerbetrieb.

---

### Nach dem Livegang

Sobald alle Mitspieler registriert sind, schließe die Registrierung:
Im Spiel → **Adminbereich → Server** → Haken bei *„Registrierung geöffnet"* entfernen.

---

## 10. Datensicherung einrichten

Speicherkarten fallen irgendwann aus. Mit einer täglichen Sicherung ist das
ärgerlich statt katastrophal.

```bash
mkdir -p ~/sicherungen
crontab -e
```

Beim ersten Mal fragt der Editor nach — wähle `1` (nano). Ganz unten anfügen:

```
0 4 * * * $HOME/star-trek-conquest/deploy/backup.sh $HOME/sicherungen
```

Speichern mit `Strg`+`O`, `Enter`, `Strg`+`X`.

Jede Nacht um 4 Uhr wird nun eine Sicherung erstellt; Sicherungen älter als
14 Tage werden automatisch gelöscht. Einmal von Hand testen:

```bash
~/star-trek-conquest/deploy/backup.sh ~/sicherungen
ls -lh ~/sicherungen
```

> **Noch besser:** Kopiere die Sicherungen regelmäßig auf deinen Computer, damit
> sie nicht mit der Speicherkarte zusammen verloren gehen:
> ```bash
> # Auf deinem Computer ausführen:
> scp DEIN-BENUTZERNAME@sternenflotte.fritz.box:~/sicherungen/*.gz ~/Downloads/
> ```

---

> **Alle Server-Befehle auf einen Blick:** [BEFEHLE.md](BEFEHLE.md)

## 11. Wartung und Fehlerbehebung

### Der Pi taucht nicht in der FRITZ!Box auf

Fast immer liegt es am WLAN:

* **5-GHz-Netz eingetragen?** Der Zero 2 W kann nur 2,4 GHz (siehe Schritt 2)
* **Tippfehler** bei WLAN-Name oder -Passwort? Beides ist
  Groß-/Kleinschreibungs-empfindlich
* **WLAN-Land** im Imager auf `DE` gesetzt? Ohne Ländereinstellung bleibt das
  Funkmodul stumm
* **Netzteil zu schwach?** Bei Unterversorgung startet der Pi in einer Endlosschleife neu

Im Zweifel: Karte neu beschreiben und in Schritt 2 alles noch einmal sorgfältig
eintragen. Das geht schneller als die Fehlersuche.

### Der Pi antwortet gar nicht mehr — auch SSH nicht

Wichtig zur Einordnung: **SSH gehört zum Betriebssystem, nicht zum Spiel.**
Wenn SSH nicht mehr antwortet, ist nicht der Spielserver das Problem — dann ist
der Pi selbst nicht erreichbar. Ein abgestürzter Spielserver lässt SSH völlig
unberührt.

Der Reihe nach, von oben nach unten:

**1. Zeit lassen.** Ein Zero 2 W braucht bis zu drei Minuten zum Starten. Nach
einem Stromausfall kommt eine Dateisystemprüfung hinzu — dann können es auch
fünf bis zehn Minuten sein. Vorher lohnt das Suchen nicht.

**2. Steht der Pi im Heimnetz?** <http://fritz.box> → **Heimnetz → Netzwerk**.
Steht `sternenflotte` dort als *verbunden*, samt IP-Adresse?

* **Nicht in der Liste** → der Pi hat kein WLAN. Weiter bei Punkt 4.
* **In der Liste, aber „nicht verbunden"** → er war da und ist weg. Weiter bei Punkt 4.
* **Verbunden mit IP** → weiter bei Punkt 3.

**3. Antwortet er auf ein Ping?** Auf dem eigenen Computer:

```bash
ping sternenflotte.fritz.box          # macOS/Linux
ping -n 4 sternenflotte.fritz.box     # Windows PowerShell
```

Antwortet er, aber SSH nicht, zeigt dieser Aufruf, woran es hakt:

```bash
ssh -v DEIN-BENUTZERNAME@sternenflotte.fritz.box
```

* `Connection refused` → der Pi läuft, der SSH-Dienst nicht. Das deutet auf eine
  beschädigte Karte hin — weiter bei Punkt 5.
* `Connection timed out` → keine Antwort. Weiter bei Punkt 4.
* `Permission denied` → der Pi ist in Ordnung, nur Benutzername oder Passwort
  stimmen nicht.

**4. Strom und Karte prüfen.** In dieser Reihenfolge:

* Leuchtet die grüne LED? Ein kurzes Flackern beim Einstecken und dann nichts
  mehr heißt: Der Pi kommt nicht über den Startvorgang hinaus.
* **Anderes Netzteil** ausprobieren, mindestens 5 V / 2 A. Unterversorgung ist
  die häufigste Ursache für einen Pi, der scheinbar grundlos verstummt.
* Karte einmal herausnehmen, Kontakte ansehen, wieder einsetzen.

**5. Karte am Computer prüfen.** Steckt die Karte im Kartenleser, sollte
mindestens die kleine Boot-Partition (`bootfs`) sichtbar sein. Ist sie es nicht,
oder meldet der Computer sie als unlesbar, ist die Karte beschädigt.

Unter Linux oder macOS lässt sich das Dateisystem oft reparieren
(`/dev/sdX2` durch das tatsächliche Gerät ersetzen — Vorsicht, das falsche
Gerät zerstört andere Daten):

```bash
sudo fsck -y /dev/sdX2
```

Hilft das nicht, wird die Karte neu beschrieben (Schritt 2 dieser Anleitung).
Die Spielstände sind dann nur über eine Sicherung zurückzuholen — deshalb steht
in `BEFEHLE.md`, wie man Sicherungen regelmäßig auf den eigenen Rechner holt.

> **Warum das passiert:** Ein Pi vom Strom zu trennen, während er läuft, ist der
> häufigste Weg, eine SD-Karte zu beschädigen — mitten in einem Schreibvorgang
> bleibt das Dateisystem in einem halben Zustand zurück. Wo es geht, deshalb
> immer `sudo shutdown -h now` und erst nach dem Erlöschen der grünen LED den
> Stecker ziehen. Als Notlösung bei einem hängenden Pi bleibt das Trennen
> natürlich zulässig — es ist nur nichts, was man ohne Not tut.

**6. Wieder drin — was war los?** Sobald SSH wieder antwortet:

```bash
journalctl --list-boots | tail -5              # wurde sauber heruntergefahren?
journalctl -b -1 -n 60 --no-pager              # letzte Zeilen des vorherigen Starts
dmesg | grep -iE "ext4|i/o error|voltage"      # Karten- und Spannungsfehler
sudo systemctl status star-trek-conquest       # und was macht das Spiel?
```

Taucht `Under-voltage detected` auf, war das Netzteil zu schwach — dann ist ein
stärkeres die eigentliche Abhilfe, nicht ein weiterer Neustart.

### `Job for star-trek-conquest.service failed because of unavailable resources`

Diese Meldung kommt von systemd, nicht vom Spiel: Der Dienst durfte seinen
Namensraum nicht einrichten. In älteren Fassungen dieses Projekts stand in der
Dienst-Datei `ProtectSystem=strict` zusammen mit einer `ReadWritePaths=`-Zeile,
die auf `…/star-trek-conquest/data` zeigte. Dieses Verzeichnis entsteht aber erst
beim ersten Serverstart — nach einem frischen Klon existiert es noch nicht, und
systemd bricht ab.

Ebenso scheitert der Start, wenn die fest eingetragenen Pfade nicht zu deinem
System passen — etwa weil dein Benutzer nicht `pi` heißt, das Projekt woanders
liegt oder Node nicht unter `/usr/local/bin/node` installiert ist.

Beides löst das Einrichtungsskript, das die tatsächlichen Pfade ausliest:

```bash
cd ~/star-trek-conquest
git pull
sudo ./deploy/install-service.sh
```

Zeigt es weiterhin Probleme, hilft die Einzelprüfung:

```bash
./deploy/install-service.sh --check       # was fehlt konkret?
./deploy/install-service.sh --print       # welche Dienst-Datei entsteht?
journalctl -xeu star-trek-conquest -n 40  # was sagt systemd genau?
```

### Die Seite sieht kaputt aus / die Anmeldung reagiert nicht

War ein Fehler in älteren Fassungen dieses Projekts: Ein Sicherheitsheader zwang
den Browser, Stylesheet und Skripte über `https://` zu laden — was beim Zugriff
per `http://…:3000` im Heimnetz fehlschlägt. Die Seite erschien dann unformatiert
und der Anmeldeknopf tat nichts.

Behoben. Falls du eine ältere Fassung geklont hast:

```bash
cd ~/star-trek-conquest
git pull
sudo systemctl restart star-trek-conquest
```

Danach im Browser einmal mit `Strg`+`Umschalt`+`R` neu laden, damit der
zwischengespeicherte alte Stand verworfen wird.

### Das Spiel ist nicht erreichbar

```bash
sudo systemctl status star-trek-conquest    # läuft der Dienst?
sudo journalctl -u star-trek-conquest -n 50 # letzte 50 Protokollzeilen
curl http://localhost:3000/api/health       # antwortet der Server lokal?
```

### Speicherplatz und Auslastung prüfen

```bash
df -h /              # freier Platz auf der Karte
free -h              # Arbeitsspeicher
uptime               # Systemlast
```

### Auf eine neue Version aktualisieren

```bash
cd ~/star-trek-conquest
~/star-trek-conquest/deploy/backup.sh ~/sicherungen   # vorher sichern!
git pull
npm ci --omit=dev
sudo systemctl restart star-trek-conquest
```

Die Datenbank bleibt dabei erhalten — sie liegt in `data/` und wird von Git
nicht angefasst.

### Administratorzugang verloren

```bash
cd ~/star-trek-conquest
sqlite3 data/universe.db "UPDATE users SET role='admin' WHERE username='DeinName';"
```

### Pi sauber herunterfahren

**Nie einfach den Stecker ziehen** — das beschädigt auf Dauer die Speicherkarte:

```bash
sudo shutdown -h now
```

Warte, bis die grüne LED dauerhaft aus ist, dann erst den Strom trennen.

---

## Was dich erwartet

Auf dem Zero 2 W ist der Spielserver bequem für **10 bis 20 gleichzeitige
Mitspieler** ausgelegt. Gemessene Werte: 84 MB Arbeitsspeicher, und die
aufwendigste Hintergrundaufgabe braucht 0,32 Millisekunden pro Spieler und läuft
einmal pro Minute. Der Pi wird sich langweilen.

Der Stromverbrauch liegt bei etwa 1 Watt im Leerlauf — das sind rund
**2,50 Euro Stromkosten im Jahr** für einen durchlaufenden Spielserver.

Viel Erfolg, Kommandant. 🖖
