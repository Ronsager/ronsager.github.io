/**
 * Prueft die Punkteberechnung eines Spielers an der echten Datenbank.
 *
 * Das Skript arbeitet auf einer Kopie - die laufende Datenbank wird nicht
 * angefasst. Es zeigt jeden Zwischenschritt und benennt am Ende, woran es
 * hakt, statt nur "hat nicht funktioniert" zu melden.
 *
 *   node scripts/punkte-pruefen.mjs <Spielername> [Zielpunkte]
 *
 * Beispiel:
 *   node scripts/punkte-pruefen.mjs Ronsager 100
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const name = process.argv[2];
const ziel = Number(process.argv[3] ?? 100);
if (!name) {
  console.error('Aufruf: node scripts/punkte-pruefen.mjs <Spielername> [Zielpunkte]');
  process.exit(1);
}

/* ---- Datenbank finden (.env beachten, wie der Server es tut) ---------- */
function dbPfad() {
  const envDatei = path.join(ROOT, '.env');
  if (fs.existsSync(envDatei)) {
    const treffer = fs.readFileSync(envDatei, 'utf8').match(/^\s*DB_FILE\s*=\s*(.+)$/m);
    if (treffer) {
      const wert = treffer[1].trim().replace(/^["']|["']$/g, '');
      return path.isAbsolute(wert) ? wert : path.join(ROOT, wert);
    }
  }
  return path.join(ROOT, 'data', 'game.db');
}

const quelle = dbPfad();
if (!fs.existsSync(quelle)) {
  console.error(`Datenbank nicht gefunden: ${quelle}`);
  process.exit(1);
}

/* ---- Auf einer Kopie arbeiten ---------------------------------------- */
const kopie = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'stc-pruef-')), 'game.db');
fs.copyFileSync(quelle, kopie);
for (const anhang of ['-wal', '-shm']) {
  if (fs.existsSync(quelle + anhang)) fs.copyFileSync(quelle + anhang, kopie + anhang);
}
process.env.DB_FILE = kopie;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'nur-fuer-die-pruefung';

const { db } = await import('../server/db.js');
const { recomputeUser, setPoints, userRank } = await import('../server/engine/stats.js');

const zahl = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
const zeile = (a, b) => console.log('  ' + String(a).padEnd(34) + b);

console.log(`\nDatenbank : ${quelle}`);
console.log(`Kopie     : ${kopie}\n`);

const user = db.prepare('SELECT id, username, role FROM users WHERE username = ? COLLATE NOCASE').get(name);
if (!user) {
  console.error(`Kein Spieler mit dem Namen "${name}".`);
  console.error('Vorhanden: ' + db.prepare('SELECT username FROM users ORDER BY id').all().map((u) => u.username).join(', '));
  process.exit(1);
}
console.log(`Spieler   : ${user.username} (id ${user.id}, Rolle ${user.role})\n`);

/* ---- 1. Gespeicherter Zustand ---------------------------------------- */
console.log('1. Gespeicherter Zustand');
const vorher = db.prepare('SELECT * FROM stats WHERE user_id = ?').get(user.id);
if (!vorher) zeile('stats-Zeile', 'FEHLT');
else for (const [k, v] of Object.entries(vorher)) zeile(k, zahl(v));

/* ---- 2. Rohdaten auf unbrauchbare Werte pruefen ----------------------- */
console.log('\n2. Rohdaten des Spielers');
let verdaechtig = 0;
const pruefeSpalte = (tabelle, spalte, bedingung, parameter) => {
  const rows = db.prepare(`SELECT key, ${spalte} AS wert FROM ${tabelle} WHERE ${bedingung}`).all(...parameter);
  const schlecht = rows.filter((r) => !Number.isFinite(Number(r.wert)));
  zeile(`${tabelle}: Eintraege`, `${rows.length}${schlecht.length ? `  ← ${schlecht.length} unbrauchbar` : ''}`);
  for (const r of schlecht) {
    verdaechtig += 1;
    console.log(`      ✘ ${tabelle}.${r.key} = ${JSON.stringify(r.wert)} (keine Zahl)`);
  }
};
const planeten = db.prepare('SELECT id FROM planets WHERE user_id = ?').all(user.id);
zeile('Planeten', planeten.length);
for (const p of planeten) {
  pruefeSpalte('buildings', 'level', 'planet_id = ?', [p.id]);
  pruefeSpalte('ships', 'count', 'planet_id = ?', [p.id]);
  pruefeSpalte('defenses', 'count', 'planet_id = ?', [p.id]);
}
pruefeSpalte('research', 'level', 'user_id = ?', [user.id]);

/* ---- 3. Neuberechnung ------------------------------------------------ */
console.log('\n3. Neuberechnung aus dem Besitz');
const berechnet = recomputeUser(user.id);
for (const [k, v] of Object.entries(berechnet)) {
  zeile(k, `${zahl(v)}${Number.isFinite(v) ? '' : '   ← UNBRAUCHBAR'}`);
}

/* ---- 4. Zielwert setzen ---------------------------------------------- */
console.log(`\n4. Gesamtpunkte auf ${ziel} setzen`);
const r = setPoints(user.id, ziel);
zeile('aus Besitz berechnet', zahl(r.berechnet));
zeile('Rueckgabe', zahl(r.points));
if (r.korrigiert) zeile('Hinweis', 'musste direkt geschrieben werden');

const nachher = db.prepare('SELECT points, points_override FROM stats WHERE user_id = ?').get(user.id);
zeile('in der Datenbank', zahl(nachher?.points));
zeile('Rang danach', userRank(user.id));

/* ---- 5. Urteil ------------------------------------------------------- */
console.log('\n5. Ergebnis');
const getroffen = Number.isFinite(nachher?.points) && Math.abs(nachher.points - ziel) <= 0.5;
if (getroffen && !verdaechtig && !r.korrigiert) {
  console.log(`  ✔ Der Zielwert ${ziel} wird korrekt gespeichert. Die Berechnung ist in Ordnung.`);
  console.log('    Bleibt der Wert im Spiel trotzdem nicht stehen, schreibt ein zweiter');
  console.log('    Serverprozess dagegen. Pruefen mit: pgrep -af "node server/index.js"');
} else if (verdaechtig) {
  console.log(`  ✘ ${verdaechtig} unbrauchbare(r) Wert(e) in den Rohdaten - siehe Abschnitt 2.`);
  console.log('    Diese Zeilen machen die Berechnung zunichte und muessen korrigiert werden.');
} else if (r.korrigiert) {
  console.log('  ! Der Zielwert liess sich nur durch direktes Schreiben erreichen.');
  console.log('    Bitte die Ausgabe der Abschnitte 3 und 4 melden.');
} else {
  console.log(`  ✘ Gespeichert wurde ${zahl(nachher?.points)} statt ${ziel}.`);
  console.log('    Bitte die vollstaendige Ausgabe melden.');
}
console.log('\n  (Die echte Datenbank wurde nicht veraendert.)\n');
