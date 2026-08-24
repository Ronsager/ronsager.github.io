/**
 * Erzeugt die Bilder der Einfuehrung als echte PNG-Dateien.
 *
 * Es sind keine gezeichneten Nachbildungen, sondern Bildschirmfotos der
 * tatsaechlich laufenden Oberflaeche, versehen mit nummerierten Markierungen.
 * Dadurch koennen Bild und Wirklichkeit nicht auseinanderlaufen: Aendert sich
 * ein Knopf, zeigt das naechste erzeugte Bild ihn genau so.
 *
 * Das Skript startet dazu einen eigenen Server auf einer Wegwerf-Datenbank,
 * legt ein Demokonto mit Beispielausbau an und fotografiert die Ausschnitte -
 * je Fraktion, damit die Bilder zum Design des Spielers passen.
 *
 * Aufruf (benoetigt Playwright und Chromium):
 *   node scripts/generate-tutorial-images.mjs
 *
 * Die erzeugten Dateien liegen im Repository. Das Skript muss nur laufen,
 * wenn sich die Oberflaeche oder die Erklaerungen aendern.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'img', 'tutorial');
const PORT = Number(process.env.TUT_PORT || 3910);
const BASE = `http://127.0.0.1:${PORT}`;
const FACTIONS = ['federation', 'klingon', 'romulan', 'cardassian', 'ferengi'];

/* ------------------------------------------------------------------ */
/* Welche Ausschnitte mit welchen Markierungen                         */
/* ------------------------------------------------------------------ */

/**
 * clip      – Ausschnitt, der fotografiert wird
 * marks     – [Nummer, Auswahl] – die Nummer erscheint als Marke am Element
 * view      – Ansicht, die vorher geoeffnet wird
 * vor       – zusaetzliche Vorbereitung im Browser
 */
const SHOTS = [
  {
    name: 'uebersicht',
    view: 'overview',
    layout: 'innen',
    clip: 'body',
    breite: 1280,
    hoehe: 760,
    marks: [
      [1, '.lcars-title'],
      [2, '#server-time'],
      [3, '#btn-logout'],
      [4, '#resource-bar'],
      [5, '#sidebar'],
      [6, '#view'],
    ],
  },
  {
    name: 'rohstoffe',
    view: 'overview',
    layout: 'unten',
    clip: '#resource-bar',
    marks: [
      [1, '#resource-bar .res.duranium'],
      [2, '#resource-bar .res.dilithium'],
      [3, '#resource-bar .res.deuterium'],
      [4, '#resource-bar .res.energy'],
      [5, '#planet-select'],
    ],
  },
  {
    name: 'navigation',
    view: 'overview',
    layout: 'rechts',
    clip: '#sidebar',
    marks: [],
    markiereGruppen: true,
  },
  {
    name: 'anlagen',
    view: 'buildings',
    clip: '#view .panel:not(.accent-orange) .card.available',
    marks: [
      [1, '#view .panel:not(.accent-orange) .card.available .card-title'],
      [2, '#view .panel:not(.accent-orange) .card.available .level'],
      [3, '#view .panel:not(.accent-orange) .card.available .desc'],
      [4, '#view .panel:not(.accent-orange) .card.available .costs'],
      [5, '#view .panel:not(.accent-orange) .card.available .actions [data-build]'],
      [6, '#view .panel:not(.accent-orange) .card.available .actions [data-demolish]'],
    ],
  },
  {
    name: 'warteschlange',
    view: 'buildings',
    clip: '#view .panel.accent-orange',
    marks: [
      [1, '#queue-box .queue-name'],
      [2, '#queue-box .progress'],
      [3, '#queue-box .queue-time'],
      [4, '#queue-box [data-cancel]'],
    ],
  },
  {
    name: 'forschung',
    view: 'research',
    clip: ['#view .panel:not(.accent-orange) .card.available', '#view .panel:not(.accent-orange) .card.locked'],
    marks: [
      [1, '#view .panel:not(.accent-orange) .card.available .card-title'],
      [2, '#view .panel:not(.accent-orange) .card.available [data-build]'],
      [3, '#view .panel:not(.accent-orange) .card.locked .tiny.bad'],
    ],
  },
  {
    name: 'werft',
    view: 'shipyard',
    clip: '#view .panel:not(.accent-orange) .card.available',
    marks: [
      [1, '#view .panel:not(.accent-orange) .card.available .tiny.muted'],
      [2, '#view .panel:not(.accent-orange) .card.available [data-amount]'],
      [3, '#view .panel:not(.accent-orange) .card.available [data-build]'],
    ],
  },
  {
    name: 'galaxie',
    view: 'galaxy',
    clip: '#view .panel.accent-orange',
    vor: () => {
      // Nur die ersten Zeilen zeigen - ein ganzes System waere unlesbar lang.
      const zeilen = [...document.querySelectorAll('#view .galaxy-row')];
      zeilen.slice(7).forEach((tr) => tr.remove());
    },
    marks: [
      [1, '#view .galaxy-nav'],
      [2, '#view .galaxy-row.own .galaxy-planet'],
      [3, '#view .galaxy-row:not(.own):not(.empty) [href*="espionage"]'],
      [4, '#view .galaxy-row:not(.own):not(.empty) [href*="attack"]'],
      [5, '#view .galaxy-row.empty [href*="colonize"]'],
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Markierungen im Browser zeichnen                                    */
/* ------------------------------------------------------------------ */

/* Wird im Browser ausgefuehrt: legt Rahmen und nummerierte Marken ueber die
   genannten Elemente. Fehlt ein Element, wird es stillschweigend ausgelassen -
   nicht jede Ansicht enthaelt jeden Knopf. */
function zeichneMarken(marks, gruppen, layout) {
  const alt = document.getElementById('tut-marker-layer');
  if (alt) alt.remove();

  const layer = document.createElement('div');
  layer.id = 'tut-marker-layer';
  layer.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none';
  document.body.appendChild(layer);

  const stil = document.createElement('style');
  stil.textContent = `
    .tut-ring { position:absolute; border:2px solid #ff9900; border-radius:6px;
                box-shadow:0 0 0 2px rgba(0,0,0,.6); }
    .tut-num  { position:absolute; width:26px; height:26px; border-radius:13px;
                background:#ff9900; color:#000; font:700 15px/26px system-ui,sans-serif;
                text-align:center; box-shadow:0 2px 8px rgba(0,0,0,.75); }
    .tut-band { position:absolute; background:#05050a; }`;
  layer.appendChild(stil);

  const eintraege = [...marks];
  if (gruppen) {
    [...document.querySelectorAll('#sidebar .group-label')]
      .forEach((node, i) => eintraege.push([i + 1, node]));
  }

  const ziele = eintraege
    .map(([nummer, ziel]) => {
      const el = typeof ziel === 'string' ? document.querySelector(ziel) : ziel;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.width < 4 || r.height < 4 ? null : { nummer, r };
    })
    .filter(Boolean);
  if (!ziele.length) return { anzahl: 0, box: null };

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%');
  layer.appendChild(svg);

  /* Drei Anordnungen, weil drei verschiedene Formen erklaert werden:
       innen – grosse Flaechen; die Marke sitzt in der Ecke und verdeckt nichts
       unten – waagerechte Reihen wie die Rohstoffleiste
       nah   – der Regelfall: die Marke steht unmittelbar links am Element,
               damit der Verbindungsstrich kurz bleibt und nichts kreuzt */
  const belegt = [];
  const schneidet = (a, b) =>
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

  /* Ein Platz ist frei, wenn dort weder eine andere Marke liegt noch der
     Rahmen eines anderen Elements - sonst verdeckt die Marke genau den Knopf,
     den die Nachbarnummer erklaert. */
  const frei = (x, y, eigenes) => {
    const kasten = { left: x - 2, top: y - 2, right: x + 28, bottom: y + 28 };
    if (belegt.some((b) => schneidet(kasten, b))) return false;
    return !ziele.some(({ r }) => r !== eigenes && schneidet(kasten, r));
  };

  for (const { nummer, r } of ziele) {
    const ring = document.createElement('div');
    ring.className = 'tut-ring';
    ring.style.left = `${r.left - 3}px`;
    ring.style.top = `${r.top - 3}px`;
    ring.style.width = `${r.width + 6}px`;
    ring.style.height = `${r.height + 6}px`;
    layer.appendChild(ring);

    let x, y, ziehen = true;
    if (layout === 'innen') {
      x = r.left + 8; y = r.top + 8; ziehen = false;
    } else if (layout === 'unten') {
      x = r.left + r.width / 2 - 13; y = r.bottom + 14;
      while (!frei(x, y, r)) y += 30;
    } else {
      // Der Reihe nach probieren. Die Navigation klebt am linken Bildrand -
      // dort ist rechts der einzige Platz, an dem nichts verdeckt wird.
      const links = [r.left - 36, r.top + r.height / 2 - 13];
      const rechts = [r.right + 10, r.top + r.height / 2 - 13];
      const oben = [r.left + r.width / 2 - 13, r.top - 34];
      const unten = [r.left + r.width / 2 - 13, r.bottom + 8];
      const stellen = (layout === 'rechts'
        ? [rechts, oben, unten, links]
        : [links, oben, rechts, unten]
      ).filter(([px, py]) => px >= 2 && py >= 2);
      const gewaehlt = stellen.find(([px, py]) => frei(px, py, r)) || stellen[0] || [r.left + 4, r.top + 4];
      [x, y] = gewaehlt;
    }
    belegt.push({ left: x - 2, top: y - 2, right: x + 28, bottom: y + 28 });

    if (ziehen) {
      const linie = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      // Vom Rand der Marke zum naechstgelegenen Punkt des Rahmens.
      const mx = x + 13, my = y + 13;
      const zx = Math.max(r.left - 4, Math.min(mx, r.right + 4));
      const zy = Math.max(r.top - 4, Math.min(my, r.bottom + 4));
      const dx = zx - mx, dy = zy - my;
      const laenge = Math.max(1, Math.hypot(dx, dy));
      linie.setAttribute('x1', String(mx + (dx / laenge) * 15));
      linie.setAttribute('y1', String(my + (dy / laenge) * 15));
      linie.setAttribute('x2', String(zx));
      linie.setAttribute('y2', String(zy));
      linie.setAttribute('stroke', '#ff9900');
      linie.setAttribute('stroke-width', '2');
      linie.setAttribute('opacity', '.85');
      svg.appendChild(linie);
    }

    const num = document.createElement('div');
    num.className = 'tut-num';
    num.textContent = String(nummer);
    num.style.left = `${x}px`;
    num.style.top = `${y}px`;
    layer.appendChild(num);
  }

  // Stehen die Marken unter einer waagerechten Reihe, liegen sie sonst auf dem
  // Text der naechsten Zeile. Ein dunkler Streifen trennt beides sauber.
  if (layout === 'unten') {
    const marken = [...layer.querySelectorAll('.tut-num')].map((n) => n.getBoundingClientRect());
    const band = document.createElement('div');
    band.className = 'tut-band';
    band.style.left = '0px';
    band.style.top = `${Math.min(...marken.map((r) => r.top)) - 8}px`;
    band.style.width = '100%';
    band.style.height = `${Math.max(...marken.map((r) => r.bottom)) - Math.min(...marken.map((r) => r.top)) + 16}px`;
    layer.insertBefore(band, layer.querySelector('.tut-num'));
  }

  // Umrandung aller gezeichneten Teile, damit der Bildausschnitt sie enthaelt.
  const teile = [...layer.querySelectorAll('.tut-ring, .tut-num')].map((n) => n.getBoundingClientRect());
  const box = {
    left: Math.min(...teile.map((r) => r.left)),
    top: Math.min(...teile.map((r) => r.top)),
    right: Math.max(...teile.map((r) => r.right)),
    bottom: Math.max(...teile.map((r) => r.bottom)),
  };
  return { anzahl: ziele.length, box };
}

/* ------------------------------------------------------------------ */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stc-tut-'));
const dbFile = path.join(tmp, 'demo.db');

console.log('Server wird gestartet …');
const server = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), DB_FILE: dbFile, JWT_SECRET: 'nur-fuer-bilder-1234567890' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (d) => process.stderr.write(`  [Server] ${d}`));

async function warteAufServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`${BASE}/api/auth/config`);
      if (r.ok) return;
    } catch { /* noch nicht bereit */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Server ist nicht gestartet.');
}
await warteAufServer();
console.log('  bereit.\n');

/* Je Fraktion ein Demokonto: Die Kopfzeile nennt die Fraktion, deshalb waere
   ein Foederationskonto im klingonischen Design widerspruechlich. Alle liegen
   im selben System, dadurch zeigt die Galaxie echte Nachbarn. */
const DEMOS = {
  federation: 'Picard',
  klingon: 'Martok',
  romulan: 'Toreth',
  cardassian: 'Dukat',
  ferengi: 'Brunt',
};
const PASSWORT = 'demopasswort';

const konten = {};
for (const [faction, name] of Object.entries(DEMOS)) {
  const r = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: name, email: `${name.toLowerCase()}@beispiel.de`, password: PASSWORT, faction }),
  }).then((x) => x.json());
  if (!r.token) throw new Error(`Konto ${name} liess sich nicht anlegen: ${JSON.stringify(r)}`);
  konten[faction] = r.user;
}

process.env.DB_FILE = dbFile;
process.env.JWT_SECRET = 'nur-fuer-bilder-1234567890';
const { db, setLevel, now } = await import(path.join(ROOT, 'server', 'db.js'));

/* Alle Demokonten in dasselbe System legen. */
const ersterPlanet = (userId) => db.prepare('SELECT id FROM planets WHERE user_id = ? LIMIT 1').get(userId).id;
const heimat = db.prepare('SELECT quadrant, system FROM planets WHERE id = ?').get(ersterPlanet(konten.federation.id));
let platz = 4;
for (const faction of Object.keys(DEMOS)) {
  const pid = ersterPlanet(konten[faction].id);
  db.prepare('UPDATE planets SET quadrant = ?, system = ?, position = ? WHERE id = ?')
    .run(heimat.quadrant, heimat.system, platz, pid);
  platz += 1;
}

/* Gleicher Ausbau fuer alle, damit sich die Bilder nur im Design unterscheiden. */
for (const faction of Object.keys(DEMOS)) {
  const uid = konten[faction].id;
  const pid = ersterPlanet(uid);
  for (const [key, lvl] of [
    ['duranium_mine', 12], ['dilithium_mine', 10], ['deuterium_synth', 8],
    ['solar_array', 14], ['research_lab', 4], ['shipyard', 4], ['drone_factory', 2],
    ['duranium_storage', 4], ['dilithium_storage', 3],
  ]) setLevel('buildings', 'level', 'planet_id', pid, key, lvl);
  for (const [key, lvl] of [['energy_tech', 5], ['laser_tech', 4], ['computer_tech', 3]])
    setLevel('research', 'level', 'user_id', uid, key, lvl);
  for (const [key, n] of [['small_cargo', 14], ['light_fighter', 30], ['espionage_probe', 8]])
    setLevel('ships', 'count', 'planet_id', pid, key, n);
  db.prepare('UPDATE planets SET duranium = 486300, dilithium = 214870, deuterium = 96450 WHERE id = ?').run(pid);

  // Ein laufender Auftrag, damit die Warteschlange etwas zeigt. Er liegt
  // bewusst nicht auf der Karte, die im Bild erklaert wird.
  db.prepare(
    `INSERT INTO build_queue (user_id, planet_id, kind, item_key, target_level, amount, done, per_unit_ms, start_at, finish_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(uid, pid, 'building', 'solar_array', 15, 1, 0, 30 * 60 * 1000,
    now() - 9 * 60 * 1000, now() + 21 * 60 * 1000);
}

const { recomputeAll } = await import(path.join(ROOT, 'server', 'engine', 'stats.js'));
recomputeAll();

console.log(`${Object.keys(DEMOS).length} Demokonten eingerichtet.\n`);

/* ------------------------------------------------------------------ */

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 });
const page = await context.newPage();

async function anmelden(name) {
  // Vorherige Sitzung beenden, sonst zeigt die Seite gleich wieder das Spiel
  // des zuletzt angemeldeten Kontos statt der Anmeldung.
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { try { localStorage.clear(); } catch { /* egal */ } });
  await page.context().clearCookies();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#login-name', { state: 'visible', timeout: 20000 });
  await page.fill('#login-name', name);
  await page.fill('#login-pass', PASSWORT);
  await page.click('#login-form button[type=submit]');
  await page.waitForSelector('#app.active', { timeout: 20000 });

  // Einfuehrung und Aenderungsprotokoll wegklicken - sie sollen nicht ins Bild.
  for (let i = 0; i < 10; i += 1) {
    await page.click('#tut-skip', { timeout: 700 }).catch(() => {});
    await page.click('#cl-close', { timeout: 700 }).catch(() => {});
    await page.waitForTimeout(250);
    const frei = await page.evaluate(() =>
      !document.querySelector('#tutorial .tut-box') && !document.getElementById('changelog'));
    if (frei) break;
  }
}

let anzahl = 0;
for (const faction of FACTIONS) {
  fs.mkdirSync(path.join(OUT, faction), { recursive: true });
  await anmelden(DEMOS[faction]);

  for (const shot of SHOTS) {
    // Ansicht oeffnen. Steht sie schon offen, wird ein Umweg genommen, damit
    // sie tatsaechlich neu aufgebaut wird.
    await page.evaluate((v) => {
      if (location.hash === '#' + v) location.hash = 'overview';
      location.hash = v;
    }, shot.view);
    try {
      const warte = Array.isArray(shot.clip) ? shot.clip[0] : shot.clip;
      await page.waitForSelector(warte, { timeout: 8000, state: 'attached' });
    } catch {
      console.log(`  ! ${faction}/${shot.name}: "${shot.clip}" erschien nicht`);
      continue;
    }
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo(0, 0));
    if (shot.vor) await page.evaluate(`(${shot.vor.toString()})()`);

    // Der Ausschnitt muss vollstaendig sichtbar sein: Ein Bildschirmfoto kann
    // nur zeigen, was auch im Fenster steht.
    await page.evaluate((sel) => {
      const el = document.querySelector(Array.isArray(sel) ? sel[0] : sel);
      if (el && el.getBoundingClientRect().bottom > window.innerHeight - 20) {
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
      }
    }, shot.clip);
    await page.waitForTimeout(300);

    const ergebnis = await page.evaluate(
      ({ marks, gruppen, layout, fn }) =>
        new Function('m', 'g', 'l', `return (${fn})(m, g, l)`)(marks, gruppen, layout),
      {
        marks: shot.marks, gruppen: Boolean(shot.markiereGruppen),
        layout: shot.layout || 'nah', fn: zeichneMarken.toString(),
      }
    );
    const gesetzt = ergebnis.anzahl;

    const box = await page.evaluate((sel) => {
      const liste = (Array.isArray(sel) ? sel : [sel])
        .map((s) => document.querySelector(s))
        .filter(Boolean)
        .map((el) => el.getBoundingClientRect());
      if (!liste.length) return null;
      const x = Math.min(...liste.map((r) => r.left));
      const y = Math.min(...liste.map((r) => r.top));
      return {
        x, y,
        width: Math.max(...liste.map((r) => r.right)) - x,
        height: Math.max(...liste.map((r) => r.bottom)) - y,
      };
    }, shot.clip);
    if (!box) { console.log(`  ! ${faction}/${shot.name}: Ausschnitt "${shot.clip}" nicht gefunden`); continue; }

    // Der Ausschnitt umfasst Inhalt und Markierungen gleichermassen.
    const m = ergebnis.box;
    const links = m ? Math.min(box.x, m.left) : box.x;
    const oben = m ? Math.min(box.y, m.top) : box.y;
    const rechts = m ? Math.max(box.x + box.width, m.right) : box.x + box.width;
    const unten = m ? Math.max(box.y + (shot.hoehe || box.height), m.bottom) : box.y + box.height;

    const rand = 14;
    const x = Math.max(0, links - rand);
    const y = Math.max(0, oben - rand);
    const clip = {
      x, y,
      width: Math.min(1280 - x, rechts - x + rand),
      height: Math.min(800 - y, unten - y + rand),
    };
    const datei = path.join(OUT, faction, `${shot.name}.png`);
    await page.screenshot({ path: datei, clip });
    await page.evaluate(() => document.getElementById('tut-marker-layer')?.remove());
    anzahl += 1;
    if (faction === FACTIONS[0]) console.log(`  ${shot.name}: ${gesetzt} Markierungen`);
  }
  console.log(`Fraktion ${faction} fertig.`);
}

await browser.close();
server.kill('SIGTERM');
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${anzahl} Bilder erzeugt in public/img/tutorial/`);
