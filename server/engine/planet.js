import { db, now, getBuildings, getShips, getDefenses, getResearch, setLevel } from '../db.js';
import { config } from '../config.js';
import { PLANET_TYPES, RESOURCES } from '../gamedata.js';
import { production, storageCapacity } from './formulas.js';

const HOUR = 3600 * 1000;

const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const PLANET_NAMES = [
  'Vulcan', 'Andoria', 'Betazed', 'Bajor', 'Risa', 'Trill', 'Tellar Prime', 'Cardassia',
  "Qo'noS", 'Romulus', 'Remus', 'Ferenginar', 'Bolarus', 'Deneva', 'Rigel', 'Vega',
  'Altair', 'Ceti Alpha', 'Organia', 'Talos', 'Eminiar', 'Nimbus', 'Dorvan', 'Draylon',
  'Kelvin', 'Archanis', 'Benzar', 'Coridan', 'Delta Vega', 'Elba', 'Galorndon', 'Hoek',
  'Iconia', 'Janus', 'Kaferia', 'Lappa', 'Minos', 'Nervala', 'Ohniaka', 'Penthara',
];

/**
 * Bestimmt Planetentyp, Temperatur und Feldanzahl abhängig von der Position im System.
 * Innere Positionen sind heiß, äußere kalt – wie in OGame.
 */
export function rollPlanet(position, slots = config.universe.slots) {
  const rel = position / slots; // 0 (innen) .. 1 (außen)
  let candidates;
  if (rel < 0.25) candidates = PLANET_TYPES.filter((t) => ['H', 'D', 'K'].includes(t.key));
  else if (rel < 0.7) candidates = PLANET_TYPES.filter((t) => ['M', 'K', 'L'].includes(t.key));
  else candidates = PLANET_TYPES.filter((t) => ['P', 'L', 'D'].includes(t.key));

  const type = pick(candidates);
  const tempMax = rnd(type.minTemp + 20, type.maxTemp);
  const tempMin = tempMax - rnd(20, 50);
  const fields = rnd(type.fields[0], type.fields[1]);
  return {
    type: type.key,
    temp_min: tempMin,
    temp_max: tempMax,
    fields_max: fields,
    diameter: fields * 100 + rnd(0, 900),
  };
}

export function planetName(q, s, p) {
  return `${pick(PLANET_NAMES)} ${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][p - 1] || p}`;
}

/** Belegte Felder eines Planeten (Summe aller Gebäudestufen). */
export function usedFields(planetId) {
  const row = db.prepare('SELECT COALESCE(SUM(level),0) AS s FROM buildings WHERE planet_id = ?').get(planetId);
  const queued = db
    .prepare("SELECT COUNT(*) AS c FROM build_queue WHERE planet_id = ? AND kind = 'building' AND demolish = 0")
    .get(planetId);
  return { used: row.s, reserved: row.s + queued.c };
}

/**
 * Schreibt die seit last_update produzierten Rohstoffe in die Datenbank fort.
 * Wird vor jedem lesenden und schreibenden Zugriff aufgerufen ("lazy tick").
 */
export function tickPlanet(planetId) {
  const planet = db.prepare('SELECT * FROM planets WHERE id = ?').get(planetId);
  if (!planet) return null;
  const t = now();
  const elapsed = t - planet.last_update;
  if (elapsed < 1000) return planet;

  const buildings = getBuildings(planetId);
  const ships = getShips(planetId);
  const research = getResearch(planet.user_id);
  const user = db.prepare('SELECT faction FROM users WHERE id = ?').get(planet.user_id);

  const prod = production(planet, buildings, research, ships, user?.faction);
  const cap = storageCapacity(buildings);
  const hours = elapsed / HOUR;

  const next = {};
  for (const res of RESOURCES) {
    const gained = prod[res] * hours;
    const current = planet[res];
    // Über der Lagergrenze wird nicht mehr produziert, vorhandener Überschuss bleibt erhalten.
    next[res] = current >= cap[res] ? current : Math.min(cap[res], current + gained);
  }

  db.prepare(
    'UPDATE planets SET duranium = ?, dilithium = ?, deuterium = ?, last_update = ? WHERE id = ?'
  ).run(next.duranium, next.dilithium, next.deuterium, t, planetId);

  return { ...planet, ...next, last_update: t };
}

/** Alle Planeten eines Spielers ticken lassen. */
export function tickUserPlanets(userId) {
  const ids = db.prepare('SELECT id FROM planets WHERE user_id = ?').all(userId);
  for (const { id } of ids) tickPlanet(id);
}

/** Vollständige Sicht auf einen Planeten für das Frontend. */
export function planetSnapshot(planetId) {
  const planet = tickPlanet(planetId);
  if (!planet) return null;
  const buildings = getBuildings(planetId);
  const ships = getShips(planetId);
  const defenses = getDefenses(planetId);
  const research = getResearch(planet.user_id);
  const user = db.prepare('SELECT faction FROM users WHERE id = ?').get(planet.user_id);
  const prod = production(planet, buildings, research, ships, user?.faction);
  const cap = storageCapacity(buildings);
  const fields = usedFields(planetId);

  return {
    id: planet.id,
    name: planet.name,
    coords: { q: planet.quadrant, s: planet.system, p: planet.position },
    type: planet.type,
    temp: { min: planet.temp_min, max: planet.temp_max },
    diameter: planet.diameter,
    isHomeworld: !!planet.is_homeworld,
    fields: { used: fields.used, reserved: fields.reserved, max: planet.fields_max },
    resources: {
      duranium: Math.floor(planet.duranium),
      dilithium: Math.floor(planet.dilithium),
      deuterium: Math.floor(planet.deuterium),
    },
    capacity: cap,
    production: {
      duranium: Math.floor(prod.duranium),
      dilithium: Math.floor(prod.dilithium),
      deuterium: Math.floor(prod.deuterium),
      energyProduced: prod.energyProduced,
      energyNeeded: prod.energyNeeded,
      energyFactor: prod.energyFactor,
      satelliteOutput: prod.detail.satEach,
    },
    buildings,
    ships,
    defenses,
    research,
  };
}

/** Legt einen Planeten an und weist ihn einem Spieler zu. */
export function createPlanet(userId, { q, s, p }, { homeworld = false, name = null } = {}) {
  const taken = db.prepare('SELECT id FROM planets WHERE quadrant=? AND system=? AND position=?').get(q, s, p);
  if (taken) return null;

  const roll = rollPlanet(p);
  if (homeworld) {
    // Heimatwelten sind immer Klasse M mit garantierten Feldern.
    roll.type = 'M';
    roll.temp_max = rnd(20, 40);
    roll.temp_min = roll.temp_max - 40;
    roll.fields_max = 163;
    roll.diameter = 12800;
  }

  const t = now();
  const info = db
    .prepare(
      `INSERT INTO planets
       (user_id, quadrant, system, position, name, type, temp_min, temp_max, fields_max, diameter,
        duranium, dilithium, deuterium, is_homeworld, last_update, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      userId, q, s, p,
      name || (homeworld ? 'Heimatwelt' : planetName(q, s, p)),
      roll.type, roll.temp_min, roll.temp_max, roll.fields_max, roll.diameter,
      homeworld ? config.start.duranium : 500,
      homeworld ? config.start.dilithium : 250,
      homeworld ? config.start.deuterium : 0,
      homeworld ? 1 : 0, t, t
    );
  return db.prepare('SELECT * FROM planets WHERE id = ?').get(info.lastInsertRowid);
}

/** Sucht einen freien Startplatz möglichst in einem wenig besiedelten System. */
export function findHomeworldSlot() {
  const { quadrants, systems, slots } = config.universe;
  for (let attempt = 0; attempt < 500; attempt++) {
    const q = rnd(1, quadrants);
    const s = rnd(1, systems);
    const p = rnd(4, Math.min(12, slots)); // mittlere Positionen = gute Planeten
    const occupied = db
      .prepare('SELECT COUNT(*) AS c FROM planets WHERE quadrant=? AND system=?')
      .get(q, s).c;
    if (occupied >= 4) continue;
    const free = !db.prepare('SELECT id FROM planets WHERE quadrant=? AND system=? AND position=?').get(q, s, p);
    if (free) return { q, s, p };
  }
  // Fallback: erste freie Position im Universum
  for (let q = 1; q <= quadrants; q++)
    for (let s = 1; s <= systems; s++)
      for (let p = 1; p <= slots; p++)
        if (!db.prepare('SELECT id FROM planets WHERE quadrant=? AND system=? AND position=?').get(q, s, p))
          return { q, s, p };
  return null;
}

/** Trümmerfeld an Koordinaten gutschreiben. */
export function addDebris({ q, s, p }, duranium, dilithium) {
  if (duranium <= 0 && dilithium <= 0) return;
  db.prepare(
    `INSERT INTO debris (quadrant, system, position, duranium, dilithium) VALUES (?,?,?,?,?)
     ON CONFLICT(quadrant, system, position)
     DO UPDATE SET duranium = duranium + excluded.duranium, dilithium = dilithium + excluded.dilithium`
  ).run(q, s, p, duranium, dilithium);
}

export function getDebris({ q, s, p }) {
  return (
    db.prepare('SELECT duranium, dilithium FROM debris WHERE quadrant=? AND system=? AND position=?').get(q, s, p) ||
    { duranium: 0, dilithium: 0 }
  );
}

/** Rohstoffe verbuchen (positiv = Gutschrift). Respektiert keine Lagergrenze. */
export function addResources(planetId, delta) {
  const p = db.prepare('SELECT duranium, dilithium, deuterium FROM planets WHERE id = ?').get(planetId);
  if (!p) return;
  db.prepare('UPDATE planets SET duranium=?, dilithium=?, deuterium=? WHERE id=?').run(
    Math.max(0, p.duranium + (delta.duranium || 0)),
    Math.max(0, p.dilithium + (delta.dilithium || 0)),
    Math.max(0, p.deuterium + (delta.deuterium || 0)),
    planetId
  );
}

export { setLevel };
