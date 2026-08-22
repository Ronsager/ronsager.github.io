/**
 * Legt Testdaten an: einen Administrator und mehrere KI-Kommandanten
 * mit ausgebauten Planeten, Flotten und einem Flottenverband.
 *
 *   node scripts/seed.js [Anzahl Spieler]
 */
import { db, setLevel, addCount } from '../server/db.js';
import { createAccount } from '../server/routes/auth.js';
import { recomputeAll } from '../server/engine/stats.js';
import { FACTIONS } from '../server/gamedata.js';
import { config } from '../server/config.js';

const count = Math.max(1, Number(process.argv[2]) || 8);
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const factions = Object.keys(FACTIONS);

const NAMES = [
  'Kirk', 'Picard', 'Sisko', 'Janeway', 'Archer', 'Spock', 'Data', 'Worf', 'Riker', 'Kira',
  'Gowron', 'Martok', 'Dukat', 'Garak', 'Quark', 'Tomalak', 'Sela', 'Shran', 'Seven', 'Tuvok',
];

console.log(`Erzeuge Testdaten für ${count} Kommandanten …`);

// Administrator
if (!db.prepare("SELECT id FROM users WHERE role = 'admin'").get()) {
  const admin = createAccount({
    username: config.admin.username || 'admin',
    email: config.admin.email || 'admin@example.com',
    password: config.admin.password || 'admin12345',
    role: 'admin',
  });
  if (admin.error) console.error('  Admin:', admin.error);
  else console.log(`  ✔ Administrator "${admin.user.username}" (Passwort: ${config.admin.password || 'admin12345'})`);
}

let created = 0;
for (let i = 0; i < count; i++) {
  const name = `${NAMES[i % NAMES.length]}${i >= NAMES.length ? i : ''}`;
  const result = createAccount({
    username: name,
    email: `${name.toLowerCase()}@example.com`,
    password: 'test12345',
    faction: factions[i % factions.length],
  });
  if (result.error) { console.log(`  – ${name}: ${result.error}`); continue; }

  const user = result.user;
  const planet = db.prepare('SELECT id FROM planets WHERE user_id = ?').get(user.id);
  const scale = rnd(1, 4); // unterschiedlich weit entwickelte Spieler

  const buildings = {
    duranium_mine: rnd(4, 6) * scale, dilithium_mine: rnd(3, 5) * scale,
    deuterium_synth: rnd(2, 4) * scale, solar_array: rnd(5, 7) * scale,
    drone_factory: rnd(1, 3) * scale, shipyard: rnd(1, 3) * scale,
    research_lab: rnd(1, 3) * scale, duranium_storage: scale, dilithium_storage: scale,
  };
  for (const [key, lvl] of Object.entries(buildings))
    setLevel('buildings', 'level', 'planet_id', planet.id, key, Math.min(30, lvl));

  const research = {
    energy_tech: rnd(1, 3) * scale, combustion_drive: rnd(1, 3) * scale,
    computer_tech: rnd(1, 2) * scale, espionage_tech: rnd(1, 2) * scale,
    weapons_tech: rnd(0, 2) * scale, shielding_tech: rnd(0, 2) * scale, armour_tech: rnd(0, 2) * scale,
    impulse_drive: rnd(0, 2) * scale, astrophysics: rnd(0, 2) * scale, laser_tech: rnd(1, 3) * scale,
  };
  for (const [key, lvl] of Object.entries(research))
    setLevel('research', 'level', 'user_id', user.id, key, Math.min(20, lvl));

  const ships = {
    small_cargo: rnd(5, 20) * scale, large_cargo: rnd(2, 8) * scale,
    light_fighter: rnd(10, 60) * scale, heavy_fighter: rnd(0, 20) * scale,
    cruiser: rnd(0, 10) * scale, espionage_probe: rnd(3, 10),
  };
  for (const [key, n] of Object.entries(ships)) addCount('ships', 'planet_id', planet.id, key, n);

  const defenses = {
    rocket_launcher: rnd(10, 40) * scale, light_laser: rnd(5, 20) * scale, heavy_laser: rnd(0, 8) * scale,
  };
  for (const [key, n] of Object.entries(defenses)) addCount('defenses', 'planet_id', planet.id, key, n);

  db.prepare('UPDATE planets SET duranium = ?, dilithium = ?, deuterium = ? WHERE id = ?')
    .run(rnd(20000, 200000) * scale, rnd(10000, 100000) * scale, rnd(5000, 50000) * scale, planet.id);

  created++;
  console.log(`  ✔ ${name} (${FACTIONS[user.faction].short}) – Passwort: test12345`);
}

// Beispiel-Flottenverband
const members = db.prepare("SELECT id FROM users WHERE role = 'user' ORDER BY id LIMIT 4").all();
if (members.length >= 2 && !db.prepare('SELECT id FROM alliances').get()) {
  const t = Date.now();
  const allianceId = db
    .prepare('INSERT INTO alliances (tag, name, description, founder_id, created_at) VALUES (?,?,?,?,?)')
    .run('SF', 'Sternenflottenkommando', 'Frieden durch Stärke. Erkundung durch Neugier.', members[0].id, t)
    .lastInsertRowid;
  members.forEach((m, i) => {
    db.prepare('INSERT OR IGNORE INTO alliance_members (alliance_id, user_id, rank, joined_at) VALUES (?,?,?,?)')
      .run(allianceId, m.id, i === 0 ? 'leader' : 'member', t);
  });
  console.log('  ✔ Flottenverband [SF] Sternenflottenkommando angelegt');
}

recomputeAll();
console.log(`\nFertig. ${created} Kommandanten angelegt. Serverstart mit: npm start`);
process.exit(0);
