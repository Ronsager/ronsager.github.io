import { SHIPS, DEFENSES, RAPIDFIRE } from '../gamedata.js';
import { combatStats } from './formulas.js';

export const COMBAT_ROUNDS = 6;
export const DEBRIS_SHIP_RATIO = 0.3;      // Anteil zerstörter Schiffe im Trümmerfeld
export const DEBRIS_DEFENSE_RATIO = 0;     // Verteidigung erzeugt keine Trümmer
export const DEFENSE_REPAIR_CHANCE = 0.7;  // Anteil zerstörter Verteidigung, der sich neu aufbaut

/**
 * Baut die Kampfgruppen einer Seite auf.
 * units: { key: count }, kind: 'ship' | 'mixed'
 */
function buildGroups(shipCounts = {}, defenseCounts = {}, research = {}, faction = 'federation') {
  const groups = [];
  for (const [key, count] of Object.entries(shipCounts)) {
    if (!count || count <= 0) continue;
    const def = SHIPS[key];
    if (!def) continue;
    const st = combatStats(key, def, research, faction);
    groups.push({
      key, kind: 'ship', name: def.name, count, initial: count,
      weapon: st.weapon, shield: st.shield, hull: st.structure,
      damage: 0, // aufgelaufener Hüllenschaden an der "angeschlagenen" Einheit
    });
  }
  for (const [key, count] of Object.entries(defenseCounts)) {
    if (!count || count <= 0) continue;
    const def = DEFENSES[key];
    if (!def || def.missile) continue; // Torpedos nehmen nicht an der Schlacht teil
    const st = combatStats(key, def, research, faction);
    groups.push({
      key, kind: 'defense', name: def.name, count, initial: count,
      weapon: st.weapon, shield: st.shield, hull: st.structure,
      damage: 0,
    });
  }
  return groups;
}

const totalUnits = (groups) => groups.reduce((a, g) => a + g.count, 0);

/** Erwartete Schusszahl je Einheit unter Berücksichtigung des Mehrfachbeschusses. */
function shotsPerUnit(attackerKey, enemyGroups, enemyTotal) {
  const rf = RAPIDFIRE[attackerKey];
  if (!rf || enemyTotal <= 0) return 1;
  let pContinue = 0;
  for (const g of enemyGroups) {
    const share = g.count / enemyTotal;
    const r = rf[g.key];
    if (r && r > 1) pContinue += share * ((r - 1) / r);
  }
  if (pContinue >= 0.999) pContinue = 0.999;
  return 1 / (1 - pContinue);
}

/** Eine Feuerrunde: Seite A schießt auf Seite B. Ergebnis wird in B eingetragen. */
function fireRound(attackers, defenders) {
  const enemyTotal = totalUnits(defenders);
  if (enemyTotal <= 0) return 0;

  // Schaden pro Zielgruppe sammeln
  const incoming = new Map(defenders.map((g) => [g.key, 0]));
  let fired = 0;

  for (const a of attackers) {
    if (a.count <= 0 || a.weapon <= 0) continue;
    const shots = a.count * shotsPerUnit(a.key, defenders, enemyTotal);
    fired += shots;
    for (const d of defenders) {
      if (d.count <= 0) continue;
      const share = d.count / enemyTotal;
      const shotsAtTarget = shots * share;
      // Prallregel: Schaden unter 1 % der Schildstärke wird vollständig abgelenkt.
      if (a.weapon < d.shield * 0.01) continue;
      incoming.set(d.key, incoming.get(d.key) + shotsAtTarget * a.weapon);
    }
  }

  // Schaden auf die Zielgruppen anwenden
  let destroyedValue = 0;
  for (const d of defenders) {
    let dmg = incoming.get(d.key) || 0;
    if (dmg <= 0 || d.count <= 0) continue;

    // Schilde regenerieren zu Rundenbeginn und absorbieren zuerst.
    const shieldPool = d.shield * d.count;
    if (dmg <= shieldPool) continue;
    dmg -= shieldPool;

    // Restschaden trifft die Hülle
    let hullPool = d.hull * d.count - d.damage;
    hullPool -= dmg;
    if (hullPool <= 0) {
      destroyedValue += d.count;
      d.count = 0;
      d.damage = 0;
      continue;
    }
    const survivingFull = Math.floor(hullPool / d.hull);
    const rest = hullPool - survivingFull * d.hull;
    let survivors = survivingFull;
    // Angeschlagene Einheit: Explosionswahrscheinlichkeit nach OGame-Regel
    if (rest > 0) {
      const ratio = rest / d.hull;
      if (ratio >= 0.7 || Math.random() > 1 - ratio) survivors += 1;
    }
    survivors = Math.min(d.count, Math.max(0, survivors));
    destroyedValue += d.count - survivors;
    d.count = survivors;
    d.damage = rest > 0 && survivors > survivingFull ? d.hull - rest : 0;
  }
  return destroyedValue;
}

const toCounts = (groups, kind) => {
  const out = {};
  for (const g of groups) if (g.kind === kind && g.count > 0) out[g.key] = g.count;
  return out;
};

const lossesOf = (groups, kind) => {
  const out = {};
  for (const g of groups) {
    if (g.kind !== kind) continue;
    const lost = g.initial - g.count;
    if (lost > 0) out[g.key] = lost;
  }
  return out;
};

function resourceValue(counts, defs) {
  let duranium = 0, dilithium = 0, deuterium = 0;
  for (const [key, n] of Object.entries(counts)) {
    const def = defs[key];
    if (!def) continue;
    duranium += (def.cost.duranium || 0) * n;
    dilithium += (def.cost.dilithium || 0) * n;
    deuterium += (def.cost.deuterium || 0) * n;
  }
  return { duranium, dilithium, deuterium };
}

/**
 * Führt eine vollständige Schlacht durch.
 *
 * attacker: { ships, research, faction, name }
 * defender: { ships, defenses, research, faction, name }
 *
 * Rückgabe enthält Rundenprotokoll, Verluste, Trümmerfeld und Sieger.
 */
export function simulateBattle(attacker, defender) {
  const atk = buildGroups(attacker.ships, {}, attacker.research, attacker.faction);
  const def = buildGroups(defender.ships, defender.defenses, defender.research, defender.faction);

  const startAtk = atk.map((g) => ({ key: g.key, name: g.name, count: g.count }));
  const startDef = def.map((g) => ({ key: g.key, name: g.name, count: g.count, kind: g.kind }));

  const rounds = [];
  for (let r = 1; r <= COMBAT_ROUNDS; r++) {
    if (totalUnits(atk) <= 0 || totalUnits(def) <= 0) break;
    // Beide Seiten feuern gleichzeitig – daher auf Kopien der Ausgangslage.
    const atkBefore = atk.map((g) => ({ ...g }));
    const defBefore = def.map((g) => ({ ...g }));
    fireRound(atkBefore, def);
    fireRound(defBefore, atk);
    rounds.push({
      round: r,
      attackerUnits: totalUnits(atk),
      defenderUnits: totalUnits(def),
      attackerShips: toCounts(atk, 'ship'),
      defenderShips: toCounts(def, 'ship'),
      defenderDefenses: toCounts(def, 'defense'),
    });
  }

  const atkAlive = totalUnits(atk);
  const defAlive = totalUnits(def);
  let result;
  if (atkAlive > 0 && defAlive <= 0) result = 'attacker';
  else if (defAlive > 0 && atkAlive <= 0) result = 'defender';
  else if (atkAlive <= 0 && defAlive <= 0) result = 'draw';
  else result = 'draw';

  const atkLosses = lossesOf(atk, 'ship');
  const defShipLosses = lossesOf(def, 'ship');
  const defDefLosses = lossesOf(def, 'defense');

  const atkLostValue = resourceValue(atkLosses, SHIPS);
  const defLostValue = resourceValue(defShipLosses, SHIPS);
  const defDefValue = resourceValue(defDefLosses, DEFENSES);

  const debris = {
    duranium: Math.floor((atkLostValue.duranium + defLostValue.duranium) * DEBRIS_SHIP_RATIO +
      defDefValue.duranium * DEBRIS_DEFENSE_RATIO),
    dilithium: Math.floor((atkLostValue.dilithium + defLostValue.dilithium) * DEBRIS_SHIP_RATIO +
      defDefValue.dilithium * DEBRIS_DEFENSE_RATIO),
  };

  // Ein Teil der zerstörten Verteidigungsanlagen wird automatisch wieder aufgebaut.
  const defenseRebuilt = {};
  for (const [key, lost] of Object.entries(defDefLosses)) {
    const back = Math.floor(lost * DEFENSE_REPAIR_CHANCE);
    if (back > 0) defenseRebuilt[key] = back;
  }

  return {
    result,
    rounds,
    start: { attacker: startAtk, defender: startDef },
    survivors: {
      attackerShips: toCounts(atk, 'ship'),
      defenderShips: toCounts(def, 'ship'),
      defenderDefenses: toCounts(def, 'defense'),
    },
    losses: {
      attackerShips: atkLosses,
      defenderShips: defShipLosses,
      defenderDefenses: defDefLosses,
      defenseRebuilt,
    },
    lostValue: {
      attacker: atkLostValue,
      defender: {
        duranium: defLostValue.duranium + defDefValue.duranium,
        dilithium: defLostValue.dilithium + defDefValue.dilithium,
        deuterium: defLostValue.deuterium + defDefValue.deuterium,
      },
    },
    debris,
    names: { attacker: attacker.name, defender: defender.name },
  };
}

/** Plünderquote: maximal 50 % der auf dem Planeten liegenden Rohstoffe. */
export function calculatePlunder(planetResources, cargoCapacity) {
  const max = {
    duranium: Math.floor(planetResources.duranium * 0.5),
    dilithium: Math.floor(planetResources.dilithium * 0.5),
    deuterium: Math.floor(planetResources.deuterium * 0.5),
  };
  const total = max.duranium + max.dilithium + max.deuterium;
  if (total <= 0 || cargoCapacity <= 0) return { duranium: 0, dilithium: 0, deuterium: 0 };
  if (total <= cargoCapacity) return max;
  const ratio = cargoCapacity / total;
  return {
    duranium: Math.floor(max.duranium * ratio),
    dilithium: Math.floor(max.dilithium * ratio),
    deuterium: Math.floor(max.deuterium * ratio),
  };
}
