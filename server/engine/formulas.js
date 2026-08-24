import { config } from '../config.js';
import { BUILDINGS, RESEARCH, SHIPS, DEFENSES, FACTIONS, RESOURCES, itemDef } from '../gamedata.js';

const HOUR = 3600 * 1000;

/* ------------------------------------------------------------------ */
/* Kosten                                                              */
/* ------------------------------------------------------------------ */

/** Kosten für die nächste Stufe eines Gebäudes/einer Forschung (Stufe = Zielstufe). */
export function levelCost(def, targetLevel) {
  const out = {};
  for (const [res, base] of Object.entries(def.cost)) {
    out[res] = Math.floor(base * Math.pow(def.factor ?? 2, targetLevel - 1));
  }
  return out;
}

/** Kosten für eine Menge Schiffe/Verteidigung. */
export function unitCost(def, amount = 1) {
  const out = {};
  for (const [res, base] of Object.entries(def.cost)) out[res] = base * amount;
  return out;
}

export function costOf(kind, key, levelOrAmount) {
  const def = itemDef(kind, key);
  if (!def) return null;
  return kind === 'building' || kind === 'research'
    ? levelCost(def, levelOrAmount)
    : unitCost(def, levelOrAmount);
}

/** 70 % der bisherigen Investition werden beim Abriss zurückerstattet. */
export function demolishRefund(def, currentLevel) {
  const c = levelCost(def, currentLevel);
  const out = {};
  for (const [res, v] of Object.entries(c)) out[res] = Math.floor(v * 0.7);
  return out;
}

export function canAfford(planet, cost) {
  for (const res of RESOURCES) {
    if ((cost[res] || 0) > Math.floor(planet[res])) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Produktion                                                          */
/* ------------------------------------------------------------------ */

/**
 * Berechnet die stündliche Produktion sowie die Energiebilanz eines Planeten.
 * Rückgabe: { duranium, dilithium, deuterium, energyProduced, energyNeeded, energyFactor }
 */
export function production(planet, buildings, research, ships, faction) {
  const spd = config.speed.economy;
  const b = (k) => buildings[k] || 0;
  const prodBonus = FACTIONS[faction]?.bonus.production ?? 1;
  const energyTech = research.energy_tech || 0;
  const maxTemp = planet.temp_max;

  const mineD = 30 * b('duranium_mine') * Math.pow(1.1, b('duranium_mine'));
  const mineC = 20 * b('dilithium_mine') * Math.pow(1.1, b('dilithium_mine'));
  const mineT = 10 * b('deuterium_synth') * Math.pow(1.1, b('deuterium_synth')) * (1.44 - 0.004 * maxTemp);

  // Energieerzeugung
  const solar = 20 * b('solar_array') * Math.pow(1.1, b('solar_array'));
  const fusion = 30 * b('fusion_reactor') * Math.pow(1.05 + energyTech * 0.01, b('fusion_reactor'));
  const satEach = Math.max(0, Math.floor((maxTemp + 160) / 6));
  const satellites = (ships.solar_satellite || 0) * satEach;
  const energyProduced = solar + fusion + satellites;

  // Energieverbrauch der Förderanlagen
  const needD = 10 * b('duranium_mine') * Math.pow(1.1, b('duranium_mine'));
  const needC = 10 * b('dilithium_mine') * Math.pow(1.1, b('dilithium_mine'));
  const needT = 20 * b('deuterium_synth') * Math.pow(1.1, b('deuterium_synth'));
  const energyNeeded = needD + needC + needT;

  const factor = energyNeeded > 0 ? Math.min(1, energyProduced / energyNeeded) : 1;

  // Fusionsreaktoren verbrauchen Deuterium
  const fusionFuel = 10 * b('fusion_reactor') * Math.pow(1.1, b('fusion_reactor'));

  // Grundversorgung des Planeten (auch ohne Minen)
  const baseD = 30, baseC = 15;

  return {
    duranium:  (baseD + mineD * factor) * spd * prodBonus,
    dilithium: (baseC + mineC * factor) * spd * prodBonus,
    deuterium: Math.max(0, (mineT * factor) * spd * prodBonus - fusionFuel * spd),
    energyProduced: Math.floor(energyProduced),
    energyNeeded: Math.floor(energyNeeded),
    energyFactor: factor,
    detail: {
      mines: { duranium: mineD * factor * spd, dilithium: mineC * factor * spd, deuterium: mineT * factor * spd },
      base: { duranium: baseD * spd, dilithium: baseC * spd },
      fusionFuel: fusionFuel * spd,
      satEach,
    },
  };
}

/** Lagerkapazität pro Rohstoff. */
export function storageCapacity(buildings) {
  const cap = (lvl) => 5000 * Math.floor(2.5 * Math.exp((20 * lvl) / 33));
  return {
    duranium:  cap(buildings.duranium_storage || 0),
    dilithium: cap(buildings.dilithium_storage || 0),
    deuterium: cap(buildings.deuterium_tank || 0),
  };
}

/* ------------------------------------------------------------------ */
/* Bauzeiten                                                           */
/* ------------------------------------------------------------------ */

export function buildTimeMs(kind, def, cost, buildings, research, faction) {
  const spd = config.speed.build;
  const sum = (cost.duranium || 0) + (cost.dilithium || 0);
  const drone = buildings.drone_factory || 0;
  const nanite = buildings.nanite_factory || 0;
  const shipyard = buildings.shipyard || 0;
  const lab = buildings.research_lab || 0;
  let hours;

  if (kind === 'building') {
    hours = sum / (2500 * (1 + drone) * Math.pow(2, nanite) * spd);
  } else if (kind === 'research') {
    const rBonus = FACTIONS[faction]?.bonus.researchSpeed ?? 1;
    hours = sum / (1000 * (1 + lab) * spd * rBonus);
  } else {
    // Schiffe & Verteidigung
    hours = sum / (2500 * (1 + shipyard) * Math.pow(2, nanite) * spd);
  }
  return Math.max(1000, Math.round(hours * HOUR));
}

/* ------------------------------------------------------------------ */
/* Voraussetzungen                                                     */
/* ------------------------------------------------------------------ */

/** Prüft die Voraussetzungen. Gibt [] zurück wenn alles erfüllt ist. */
export function missingRequirements(def, buildings, research) {
  const missing = [];
  const req = def.requires;
  if (!req) return missing;
  for (const [key, lvl] of Object.entries(req.buildings || {})) {
    if ((buildings[key] || 0) < lvl) missing.push({ type: 'building', key, name: BUILDINGS[key]?.name || key, level: lvl });
  }
  for (const [key, lvl] of Object.entries(req.research || {})) {
    if ((research[key] || 0) < lvl) missing.push({ type: 'research', key, name: RESEARCH[key]?.name || key, level: lvl });
  }
  return missing;
}

/* ------------------------------------------------------------------ */
/* Flotte                                                              */
/* ------------------------------------------------------------------ */

/** Antriebsstufe eines Schiffstyps unter Berücksichtigung der Forschung. */
export function shipSpeed(key, research) {
  const def = SHIPS[key];
  if (!def || !def.drive) return 0;
  const lvl = research[def.drive] || 0;
  const bonusPerLevel = { combustion_drive: 0.1, impulse_drive: 0.2, hyperspace_drive: 0.3 }[def.drive] ?? 0.1;
  return def.speed * (1 + lvl * bonusPerLevel);
}

/** Langsamstes Schiff bestimmt das Tempo des Verbandes. */
export function fleetSpeed(shipMap, research) {
  let min = Infinity;
  for (const [key, n] of Object.entries(shipMap)) {
    if (!n) continue;
    const s = shipSpeed(key, research);
    if (s <= 0) return 0;
    min = Math.min(min, s);
  }
  return min === Infinity ? 0 : min;
}

/** Entfernung zwischen zwei Koordinaten (OGame-Schema). */
export function distance(a, b) {
  if (a.q !== b.q) return 20000 * Math.abs(a.q - b.q);
  if (a.s !== b.s) return 2700 + 95 * Math.abs(a.s - b.s);
  if (a.p !== b.p) return 1000 + 5 * Math.abs(a.p - b.p);
  return 5;
}

/**
 * Flugdauer in Millisekunden.
 * speedPercent: 10..100 (langsamer fliegen spart Treibstoff)
 */
export function flightTimeMs(dist, maxSpeed, speedPercent = 100) {
  if (maxSpeed <= 0) return Infinity;
  const p = Math.min(100, Math.max(10, speedPercent));
  const seconds = (35000 / p * Math.sqrt(dist * 10 / maxSpeed) + 10) / config.speed.fleet;
  return Math.round(seconds * 1000);
}

/** Treibstoffverbrauch der gesamten Flotte für Hin- und Rückweg. */
export function fuelConsumption(shipMap, research, dist, speedPercent = 100) {
  const p = Math.min(100, Math.max(10, speedPercent));
  let total = 0;
  for (const [key, n] of Object.entries(shipMap)) {
    if (!n) continue;
    const def = SHIPS[key];
    if (!def || !def.fuel) continue;
    const spd = shipSpeed(key, research);
    if (spd <= 0) continue;
    const factor = p / 100;
    const consumption = def.fuel * n * dist / 35000 * Math.pow(factor * 0.99 + 1, 2);
    total += consumption;
  }
  return Math.max(1, Math.round(total));
}

/** Gesamte Frachtkapazität eines Verbandes. */
export function cargoCapacity(shipMap, faction) {
  const bonus = FACTIONS[faction]?.bonus.cargo ?? 1;
  let cap = 0;
  for (const [key, n] of Object.entries(shipMap)) {
    if (!n) continue;
    cap += (SHIPS[key]?.cargo || 0) * n;
  }
  return Math.floor(cap * bonus);
}

/** Maximale Anzahl paralleler Flottenverbände. */
export function maxFleetSlots(research) {
  return 1 + (research.computer_tech || 0);
}

/** Maximale Anzahl Planeten (Heimatwelt + Kolonien). */
export function maxPlanets(research) {
  return 1 + Math.floor((research.astrophysics || 0) / 2) + ((research.astrophysics || 0) % 2 > 0 ? 1 : 0);
}

/* ------------------------------------------------------------------ */
/* Kampfwerte                                                          */
/* ------------------------------------------------------------------ */

/** Kampfwerte einer Einheit inkl. Technologie- und Fraktionsbonus. */
export function combatStats(key, def, research, faction) {
  const bonus = FACTIONS[faction]?.bonus ?? { weapons: 1, shields: 1 };
  const w = (research.weapons_tech || 0) * 0.1;
  const s = (research.shielding_tech || 0) * 0.1;
  const a = (research.armour_tech || 0) * 0.1;
  const structure = ((def.cost.duranium || 0) + (def.cost.dilithium || 0)) / 10;
  return {
    weapon: def.weapon * (1 + w) * bonus.weapons,
    shield: def.shield * (1 + s) * bonus.shields,
    structure: structure * (1 + a),
  };
}

/* ------------------------------------------------------------------ */
/* Punkte                                                              */
/* ------------------------------------------------------------------ */

/* SQLite ist schwach typisiert: In einer INTEGER-Spalte kann durchaus Text
   stehen. Ein einziger solcher Wert genuegte bisher, um die gesamte Summe zu
   NaN zu machen - und NaN wird beim Speichern zu NULL, wodurch der Punktestand
   eines Spielers stillschweigend auf null fiel. Deshalb wird jede Zahl aus der
   Datenbank hier geprueft, bevor sie in eine Rechnung eingeht. */
function ganzzahl(wert) {
  const n = Number(wert);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** 1 Punkt je 1.000 investierter Rohstoffe (wie in OGame). */
function investedForLevels(defs, levels) {
  let sum = 0;
  for (const [key, lvl] of Object.entries(levels)) {
    const def = defs[key];
    if (!def) continue;
    const stufe = Math.min(ganzzahl(lvl), 1000);   // Deckel gegen Ueberlauf
    for (let i = 1; i <= stufe; i++) {
      const c = levelCost(def, i);
      sum += (c.duranium || 0) + (c.dilithium || 0) + (c.deuterium || 0);
    }
  }
  return Number.isFinite(sum) ? sum : 0;
}

function investedForUnits(defs, counts) {
  let sum = 0;
  for (const [key, n] of Object.entries(counts)) {
    const def = defs[key];
    const anzahl = ganzzahl(n);
    if (!def || !anzahl) continue;
    const c = def.cost;
    sum += ((c.duranium || 0) + (c.dilithium || 0) + (c.deuterium || 0)) * anzahl;
  }
  return Number.isFinite(sum) ? sum : 0;
}

export function computePoints({ buildings = {}, research = {}, ships = {}, defenses = {} }) {
  const eco = investedForLevels(BUILDINGS, buildings);
  const res = investedForLevels(RESEARCH, research);
  const mil = investedForUnits(SHIPS, ships) + investedForUnits(DEFENSES, defenses);
  return {
    eco_points: eco / 1000,
    res_points: res / 1000,
    mil_points: mil / 1000,
    points: (eco + res + mil) / 1000,
  };
}
