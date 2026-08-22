import { db, now, getShips, getDefenses, getResearch, addCount } from '../db.js';
import { config } from '../config.js';
import { SHIPS, MISSIONS, RESOURCES } from '../gamedata.js';
import {
  distance, fleetSpeed, flightTimeMs, fuelConsumption, cargoCapacity,
  maxFleetSlots, maxPlanets, storageCapacity,
} from './formulas.js';
import { tickPlanet, addResources, addDebris, getDebris, createPlanet, planetSnapshot } from './planet.js';
import { simulateBattle, calculatePlunder } from './combat.js';
import { sendMessage } from './messages.js';

const coordStr = (c) => `[${c.q}:${c.s}:${c.p}]`;
const parseShips = (s) => JSON.parse(s || '{}');

/** Planet an Koordinaten (oder null). */
export function planetAt({ q, s, p }) {
  return db.prepare('SELECT * FROM planets WHERE quadrant=? AND system=? AND position=?').get(q, s, p);
}

/* ------------------------------------------------------------------ */
/* Flotte starten                                                      */
/* ------------------------------------------------------------------ */

/**
 * Berechnet Flugdaten ohne die Flotte abzuschicken (für die Vorschau im Client).
 */
export function calculateMission({ origin, target, ships, research, faction, mission, speedPercent = 100, holdHours = 0 }) {
  const dist = distance(origin, target);
  const speed = fleetSpeed(ships, research);
  if (speed <= 0) return { error: 'Diese Flottenzusammenstellung kann nicht fliegen.' };

  const oneWay = flightTimeMs(dist, speed, speedPercent);
  const fuel = fuelConsumption(ships, research, dist, speedPercent);
  const capacity = cargoCapacity(ships, faction);
  const t = now();
  const arriveAt = t + oneWay;
  const holdMs = mission === 'hold' ? Math.max(0, holdHours) * 3600 * 1000 : 0;
  const returnAt = arriveAt + holdMs + oneWay;

  return { distance: dist, speed, oneWayMs: oneWay, arriveAt, returnAt, holdMs, fuel, capacity };
}

/**
 * Schickt eine Flotte los. Prüft Schiffe, Fracht, Treibstoff und Flottenslots.
 */
export function dispatchFleet(user, planet, { mission, target, ships, cargo = {}, speedPercent = 100, holdHours = 0 }) {
  if (!MISSIONS[mission]) return { error: 'Unbekannter Auftrag.' };
  tickPlanet(planet.id);
  planet = db.prepare('SELECT * FROM planets WHERE id = ?').get(planet.id);

  const research = getResearch(user.id);
  const available = getShips(planet.id);

  // Schiffe prüfen
  const shipMap = {};
  for (const [key, raw] of Object.entries(ships || {})) {
    const n = Math.floor(Number(raw) || 0);
    if (n <= 0) continue;
    if (!SHIPS[key]) return { error: `Unbekannter Schiffstyp: ${key}` };
    if (SHIPS[key].stationary) return { error: `${SHIPS[key].name} kann den Orbit nicht verlassen.` };
    if ((available[key] || 0) < n) return { error: `Nicht genügend Einheiten vom Typ ${SHIPS[key].name}.` };
    shipMap[key] = n;
  }
  if (!Object.keys(shipMap).length) return { error: 'Es wurden keine Schiffe ausgewählt.' };

  const origin = { q: planet.quadrant, s: planet.system, p: planet.position };
  if (origin.q === target.q && origin.s === target.s && origin.p === target.p)
    return { error: 'Start und Ziel sind identisch.' };

  const { quadrants, systems, slots } = config.universe;
  if (target.q < 1 || target.q > quadrants || target.s < 1 || target.s > systems || target.p < 1 || target.p > slots)
    return { error: 'Zielkoordinaten liegen außerhalb des bekannten Raums.' };

  // Flottenslots
  const activeFleets = db
    .prepare("SELECT COUNT(*) AS c FROM fleets WHERE user_id = ? AND processed = 0").get(user.id).c;
  if (activeFleets >= maxFleetSlots(research))
    return { error: `Alle ${maxFleetSlots(research)} Flottenverbände sind bereits im Einsatz. Positronik erforschen!` };

  // Missionsspezifische Zielprüfung
  const targetPlanet = planetAt(target);
  if (mission === 'colonize') {
    if (targetPlanet) return { error: 'Dieser Planet ist bereits besiedelt.' };
    if (!shipMap.colony_ship) return { error: 'Für eine Kolonisierung wird ein Kolonieschiff benötigt.' };
  } else if (mission === 'recycle') {
    const d = getDebris(target);
    if (d.duranium <= 0 && d.dilithium <= 0) return { error: 'An diesen Koordinaten befindet sich kein Trümmerfeld.' };
    if (!shipMap.recycler) return { error: 'Für die Bergung werden Bergungsschiffe benötigt.' };
  } else if (mission === 'espionage') {
    if (!targetPlanet) return { error: 'Dort befindet sich kein Planet.' };
    if (!shipMap.espionage_probe) return { error: 'Für die Spionage werden Sensorsonden benötigt.' };
  } else if (mission === 'deploy') {
    if (!targetPlanet || targetPlanet.user_id !== user.id) return { error: 'Stationieren ist nur auf eigenen Planeten möglich.' };
  } else if (mission === 'attack') {
    if (!targetPlanet) return { error: 'Dort befindet sich kein Planet.' };
    if (targetPlanet.user_id === user.id) return { error: 'Ein Angriff auf die eigene Kolonie ist nicht zulässig.' };
    const owner = db.prepare('SELECT vacation_until, banned FROM users WHERE id = ?').get(targetPlanet.user_id);
    if (owner?.vacation_until && owner.vacation_until > now())
      return { error: 'Dieser Kommandant befindet sich im Urlaubsmodus und ist geschützt.' };
  } else if (mission === 'transport' || mission === 'hold') {
    if (!targetPlanet) return { error: 'Dort befindet sich kein Planet.' };
  }

  const calc = calculateMission({ origin, target, ships: shipMap, research, faction: user.faction, mission, speedPercent, holdHours });
  if (calc.error) return calc;

  // Fracht prüfen
  const load = {};
  let loadSum = 0;
  for (const res of RESOURCES) {
    const n = Math.max(0, Math.floor(Number(cargo?.[res]) || 0));
    load[res] = n;
    loadSum += n;
  }
  if (loadSum > calc.capacity)
    return { error: `Die Ladung übersteigt die Frachtkapazität (${calc.capacity.toLocaleString('de-DE')}).` };

  // Treibstoff + Fracht vom Planeten abziehen
  const needDeuterium = load.deuterium + calc.fuel;
  if (planet.duranium < load.duranium) return { error: 'Nicht genügend Duranium für die Ladung.' };
  if (planet.dilithium < load.dilithium) return { error: 'Nicht genügend Dilithium für die Ladung.' };
  if (planet.deuterium < needDeuterium)
    return { error: `Nicht genügend Deuterium. Benötigt: ${needDeuterium.toLocaleString('de-DE')} (inkl. ${calc.fuel.toLocaleString('de-DE')} Treibstoff).` };

  const t = now();
  const tx = db.transaction(() => {
    db.prepare('UPDATE planets SET duranium=?, dilithium=?, deuterium=? WHERE id=?').run(
      planet.duranium - load.duranium,
      planet.dilithium - load.dilithium,
      planet.deuterium - needDeuterium,
      planet.id
    );
    for (const [key, n] of Object.entries(shipMap)) addCount('ships', 'planet_id', planet.id, key, -n);

    db.prepare(
      `INSERT INTO fleets
        (user_id, mission, state, origin_planet_id, origin_q, origin_s, origin_p,
         target_q, target_s, target_p, ships_json, cargo_json, depart_at, arrive_at, hold_until, return_at, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      user.id, mission, 'outbound', planet.id, origin.q, origin.s, origin.p,
      target.q, target.s, target.p, JSON.stringify(shipMap), JSON.stringify(load),
      t, calc.arriveAt, calc.holdMs ? calc.arriveAt + calc.holdMs : null, calc.returnAt, t
    );
  });
  tx();

  return { ok: true, fleetId: db.prepare('SELECT last_insert_rowid() AS id').get().id, ...calc, fuelUsed: calc.fuel };
}

/* ------------------------------------------------------------------ */
/* Rückkehr                                                            */
/* ------------------------------------------------------------------ */

function landFleet(fleet, extraCargo = null) {
  const ships = parseShips(fleet.ships_json);
  const cargo = extraCargo || JSON.parse(fleet.cargo_json || '{}');
  const planet = db.prepare('SELECT * FROM planets WHERE id = ?').get(fleet.origin_planet_id);

  if (!planet) {
    // Heimatplanet existiert nicht mehr – die Flotte geht verloren.
    db.prepare('UPDATE fleets SET processed = 1, state = ? WHERE id = ?').run('lost', fleet.id);
    sendMessage(fleet.user_id, {
      type: 'system',
      subject: 'Flottenverband verschollen',
      body: 'Der Heimatplanet der Flotte existiert nicht mehr. Der Verband hat sich aufgelöst.',
    });
    return;
  }
  tickPlanet(planet.id);
  for (const [key, n] of Object.entries(ships)) addCount('ships', 'planet_id', planet.id, key, n);
  addResources(planet.id, cargo);
  db.prepare('UPDATE fleets SET processed = 1, state = ? WHERE id = ?').run('landed', fleet.id);
}

function startReturn(fleet, cargo) {
  db.prepare('UPDATE fleets SET state = ?, cargo_json = ? WHERE id = ?')
    .run('returning', JSON.stringify(cargo || {}), fleet.id);
}

/* ------------------------------------------------------------------ */
/* Missionsauflösung                                                   */
/* ------------------------------------------------------------------ */

function resolveTransport(fleet) {
  const target = planetAt({ q: fleet.target_q, s: fleet.target_s, p: fleet.target_p });
  const cargo = JSON.parse(fleet.cargo_json || '{}');
  const coords = coordStr({ q: fleet.target_q, s: fleet.target_s, p: fleet.target_p });

  if (!target) {
    startReturn(fleet, cargo);
    sendMessage(fleet.user_id, {
      type: 'transport', subject: `Transport nach ${coords} gescheitert`,
      body: 'Am Zielort wurde kein Planet gefunden. Die Flotte kehrt mit voller Ladung zurück.',
    });
    return;
  }
  tickPlanet(target.id);
  addResources(target.id, cargo);
  const sum = (cargo.duranium || 0) + (cargo.dilithium || 0) + (cargo.deuterium || 0);
  const sender = db.prepare('SELECT username FROM users WHERE id = ?').get(fleet.user_id);

  sendMessage(fleet.user_id, {
    type: 'transport', subject: `Lieferung an ${target.name} ${coords}`,
    body: `Die Ladung wurde übergeben: ${cargo.duranium || 0} Duranium, ${cargo.dilithium || 0} Dilithium, ${cargo.deuterium || 0} Deuterium.`,
    data: { cargo },
  });
  if (target.user_id !== fleet.user_id && sum > 0) {
    sendMessage(target.user_id, {
      type: 'transport', subject: `Warenlieferung von ${sender?.username || 'Unbekannt'}`,
      body: `Auf ${target.name} ${coords} sind eingetroffen: ${cargo.duranium || 0} Duranium, ${cargo.dilithium || 0} Dilithium, ${cargo.deuterium || 0} Deuterium.`,
      fromUserId: fleet.user_id, data: { cargo },
    });
  }
  startReturn(fleet, {});
}

function resolveDeploy(fleet) {
  const target = planetAt({ q: fleet.target_q, s: fleet.target_s, p: fleet.target_p });
  const cargo = JSON.parse(fleet.cargo_json || '{}');
  if (!target || target.user_id !== fleet.user_id) {
    startReturn(fleet, cargo);
    return;
  }
  tickPlanet(target.id);
  const ships = parseShips(fleet.ships_json);
  for (const [key, n] of Object.entries(ships)) addCount('ships', 'planet_id', target.id, key, n);
  addResources(target.id, cargo);
  db.prepare('UPDATE fleets SET processed = 1, state = ? WHERE id = ?').run('deployed', fleet.id);
  sendMessage(fleet.user_id, {
    type: 'transport', subject: `Flotte stationiert auf ${target.name}`,
    body: `Der Verband ist auf ${target.name} ${coordStr({ q: target.quadrant, s: target.system, p: target.position })} eingetroffen und wurde dort stationiert.`,
  });
}

function resolveColonize(fleet) {
  const coords = { q: fleet.target_q, s: fleet.target_s, p: fleet.target_p };
  const cargo = JSON.parse(fleet.cargo_json || '{}');
  const ships = parseShips(fleet.ships_json);
  const research = getResearch(fleet.user_id);
  const count = db.prepare('SELECT COUNT(*) AS c FROM planets WHERE user_id = ?').get(fleet.user_id).c;

  const fail = (reason) => {
    startReturn(fleet, cargo);
    sendMessage(fleet.user_id, {
      type: 'system', subject: `Kolonisierung von ${coordStr(coords)} gescheitert`, body: reason,
    });
  };

  if (planetAt(coords)) return fail('Der Planet wurde bereits von jemand anderem besiedelt.');
  if (count >= maxPlanets(research))
    return fail(`Die maximale Koloniezahl (${maxPlanets(research)}) ist erreicht. Erforschen Sie Astrometrie.`);

  const planet = createPlanet(fleet.user_id, coords, {});
  if (!planet) return fail('Der Planet konnte nicht erschlossen werden.');

  addResources(planet.id, cargo);
  // Das Kolonieschiff wird beim Aufbau verbraucht, der Rest der Flotte bleibt vor Ort.
  const rest = { ...ships, colony_ship: (ships.colony_ship || 1) - 1 };
  for (const [key, n] of Object.entries(rest)) if (n > 0) addCount('ships', 'planet_id', planet.id, key, n);

  db.prepare('UPDATE fleets SET processed = 1, state = ? WHERE id = ?').run('colonized', fleet.id);
  sendMessage(fleet.user_id, {
    type: 'system', subject: `Neue Kolonie: ${planet.name}`,
    body: `Die Siedler haben ${coordStr(coords)} erfolgreich erschlossen. Der Planet bietet ${planet.fields_max} Bauflächen bei ${planet.temp_min} °C bis ${planet.temp_max} °C.`,
    data: { planetId: planet.id, coords },
  });
}

function resolveEspionage(fleet) {
  const coords = { q: fleet.target_q, s: fleet.target_s, p: fleet.target_p };
  const target = planetAt(coords);
  const cargo = JSON.parse(fleet.cargo_json || '{}');
  if (!target) {
    startReturn(fleet, cargo);
    return;
  }
  tickPlanet(target.id);

  const spyLevel = getResearch(fleet.user_id).espionage_tech || 0;
  const defLevel = getResearch(target.user_id).espionage_tech || 0;
  const probes = parseShips(fleet.ships_json).espionage_probe || 0;
  // Informationstiefe nach OGame-Schema: mehr Sonden und Technologievorsprung = mehr Daten
  const power = probes + (spyLevel - defLevel) * 2;

  const snap = planetSnapshot(target.id);
  const owner = db.prepare('SELECT username, faction FROM users WHERE id = ?').get(target.user_id);

  const report = {
    coords, planet: target.name, owner: owner?.username, faction: owner?.faction,
    resources: snap.resources,
    fleet: power >= 2 ? snap.ships : null,
    defenses: power >= 3 ? snap.defenses : null,
    buildings: power >= 5 ? snap.buildings : null,
    research: power >= 7 ? snap.research : null,
    probes, level: power,
  };

  sendMessage(fleet.user_id, {
    type: 'espionage', subject: `Sensorbericht ${coordStr(coords)} – ${target.name}`,
    body: `Aufklärungsdaten von ${target.name} (${owner?.username || 'unbekannt'}).`,
    data: report,
  });

  // Gegenspionage: Der Ausgespähte wird gewarnt.
  const detectChance = Math.min(0.9, Math.max(0.05, 0.25 + (defLevel - spyLevel) * 0.05));
  const detected = Math.random() < detectChance;
  if (detected) {
    const spy = db.prepare('SELECT username FROM users WHERE id = ?').get(fleet.user_id);
    sendMessage(target.user_id, {
      type: 'espionage', subject: `Fremde Sonden bei ${target.name}`,
      body: `Die Sensorphalanx hat ${probes} fremde Sonde(n) über ${target.name} ${coordStr(coords)} registriert. Ursprung: ${coordStr({ q: fleet.origin_q, s: fleet.origin_s, p: fleet.origin_p })} (${spy?.username || 'unbekannt'}).`,
      fromUserId: fleet.user_id,
    });
  }
  startReturn(fleet, cargo);
}

function resolveRecycle(fleet) {
  const coords = { q: fleet.target_q, s: fleet.target_s, p: fleet.target_p };
  const ships = parseShips(fleet.ships_json);
  const user = db.prepare('SELECT faction FROM users WHERE id = ?').get(fleet.user_id);
  const capacity = cargoCapacity(ships, user?.faction);
  const field = getDebris(coords);

  const total = field.duranium + field.dilithium;
  let taken = { duranium: 0, dilithium: 0, deuterium: 0 };
  if (total > 0) {
    const ratio = Math.min(1, capacity / total);
    taken = {
      duranium: Math.floor(field.duranium * ratio),
      dilithium: Math.floor(field.dilithium * ratio),
      deuterium: 0,
    };
    db.prepare('UPDATE debris SET duranium = duranium - ?, dilithium = dilithium - ? WHERE quadrant=? AND system=? AND position=?')
      .run(taken.duranium, taken.dilithium, coords.q, coords.s, coords.p);
    db.prepare('DELETE FROM debris WHERE quadrant=? AND system=? AND position=? AND duranium < 1 AND dilithium < 1')
      .run(coords.q, coords.s, coords.p);
  }

  const old = JSON.parse(fleet.cargo_json || '{}');
  const cargo = {
    duranium: (old.duranium || 0) + taken.duranium,
    dilithium: (old.dilithium || 0) + taken.dilithium,
    deuterium: old.deuterium || 0,
  };
  sendMessage(fleet.user_id, {
    type: 'transport', subject: `Bergung bei ${coordStr(coords)}`,
    body: `Die Bergungsschiffe haben ${taken.duranium.toLocaleString('de-DE')} Duranium und ${taken.dilithium.toLocaleString('de-DE')} Dilithium aus dem Trümmerfeld geborgen.`,
    data: { taken, capacity },
  });
  startReturn(fleet, cargo);
}

function resolveAttack(fleet) {
  const coords = { q: fleet.target_q, s: fleet.target_s, p: fleet.target_p };
  const target = planetAt(coords);
  const cargo = JSON.parse(fleet.cargo_json || '{}');
  if (!target) {
    startReturn(fleet, cargo);
    return;
  }
  tickPlanet(target.id);

  const attackerUser = db.prepare('SELECT id, username, faction FROM users WHERE id = ?').get(fleet.user_id);
  const defenderUser = db.prepare('SELECT id, username, faction FROM users WHERE id = ?').get(target.user_id);
  const attackerShips = parseShips(fleet.ships_json);

  const battle = simulateBattle(
    {
      ships: attackerShips,
      research: getResearch(attackerUser.id),
      faction: attackerUser.faction,
      name: attackerUser.username,
    },
    {
      ships: getShips(target.id),
      defenses: getDefenses(target.id),
      research: getResearch(defenderUser.id),
      faction: defenderUser.faction,
      name: defenderUser.username,
    }
  );

  // Verteidiger: überlebende Einheiten übernehmen, zerstörte Verteidigung teilweise wiederaufbauen
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM ships WHERE planet_id = ?').run(target.id);
    for (const [key, n] of Object.entries(battle.survivors.defenderShips))
      addCount('ships', 'planet_id', target.id, key, n);
    db.prepare('DELETE FROM defenses WHERE planet_id = ?').run(target.id);
    for (const [key, n] of Object.entries(battle.survivors.defenderDefenses))
      addCount('defenses', 'planet_id', target.id, key, n);
    for (const [key, n] of Object.entries(battle.losses.defenseRebuilt))
      addCount('defenses', 'planet_id', target.id, key, n);
    // Torpedos im Magazin bleiben unangetastet
  });
  tx();

  // Plünderung nur bei Sieg des Angreifers
  let plunder = { duranium: 0, dilithium: 0, deuterium: 0 };
  const survivingShips = battle.survivors.attackerShips;
  if (battle.result === 'attacker' && Object.keys(survivingShips).length) {
    const freeCargo = cargoCapacity(survivingShips, attackerUser.faction)
      - ((cargo.duranium || 0) + (cargo.dilithium || 0) + (cargo.deuterium || 0));
    const p = db.prepare('SELECT duranium, dilithium, deuterium FROM planets WHERE id = ?').get(target.id);
    plunder = calculatePlunder(p, Math.max(0, freeCargo));
    addResources(target.id, {
      duranium: -plunder.duranium, dilithium: -plunder.dilithium, deuterium: -plunder.deuterium,
    });
  }

  addDebris(coords, battle.debris.duranium, battle.debris.dilithium);

  const reportData = {
    coords, planetName: target.name, battle, plunder,
    attacker: attackerUser.username, defender: defenderUser.username,
  };
  const resultText = { attacker: 'Angreifer siegreich', defender: 'Verteidiger siegreich', draw: 'Unentschieden' }[battle.result];

  sendMessage(attackerUser.id, {
    type: 'combat', subject: `Gefechtsbericht ${coordStr(coords)} – ${resultText}`,
    body: `Schlacht um ${target.name} gegen ${defenderUser.username}.`,
    data: reportData,
  });
  sendMessage(defenderUser.id, {
    type: 'combat', subject: `Angriff auf ${target.name} ${coordStr(coords)} – ${resultText}`,
    body: `${attackerUser.username} hat ${target.name} angegriffen.`,
    fromUserId: attackerUser.id, data: reportData,
  });

  if (!Object.keys(survivingShips).length) {
    // Die gesamte Angriffsflotte wurde vernichtet.
    db.prepare('UPDATE fleets SET processed = 1, state = ? WHERE id = ?').run('destroyed', fleet.id);
    return;
  }
  db.prepare('UPDATE fleets SET ships_json = ? WHERE id = ?').run(JSON.stringify(survivingShips), fleet.id);
  const back = db.prepare('SELECT * FROM fleets WHERE id = ?').get(fleet.id);
  startReturn(back, {
    duranium: (cargo.duranium || 0) + plunder.duranium,
    dilithium: (cargo.dilithium || 0) + plunder.dilithium,
    deuterium: (cargo.deuterium || 0) + plunder.deuterium,
  });
}

/* ------------------------------------------------------------------ */
/* Globale Verarbeitung                                                */
/* ------------------------------------------------------------------ */

const RESOLVERS = {
  transport: resolveTransport,
  deploy: resolveDeploy,
  colonize: resolveColonize,
  espionage: resolveEspionage,
  recycle: resolveRecycle,
  attack: resolveAttack,
  hold: (fleet) => {
    // Beim Eintreffen passiert nichts – die Flotte wartet bis hold_until.
    db.prepare('UPDATE fleets SET state = ? WHERE id = ?').run('holding', fleet.id);
  },
};

/** Verarbeitet alle fälligen Flottenereignisse. */
export function processFleets() {
  const t = now();
  let handled = 0;

  // 1) Ankünfte
  const arriving = db
    .prepare("SELECT * FROM fleets WHERE processed = 0 AND state = 'outbound' AND arrive_at <= ? ORDER BY arrive_at ASC")
    .all(t);
  for (const fleet of arriving) {
    try {
      (RESOLVERS[fleet.mission] || resolveTransport)(fleet);
      handled++;
    } catch (err) {
      console.error('Fehler bei Flottenauflösung', fleet.id, err);
      db.prepare("UPDATE fleets SET state = 'returning' WHERE id = ?").run(fleet.id);
    }
  }

  // 2) Wartende Flotten losschicken
  const holding = db
    .prepare("SELECT * FROM fleets WHERE processed = 0 AND state = 'holding' AND hold_until IS NOT NULL AND hold_until <= ?")
    .all(t);
  for (const fleet of holding) {
    startReturn(fleet, JSON.parse(fleet.cargo_json || '{}'));
    handled++;
  }

  // 3) Rückkehrer landen
  const returning = db
    .prepare("SELECT * FROM fleets WHERE processed = 0 AND state = 'returning' AND return_at <= ?")
    .all(t);
  for (const fleet of returning) {
    landFleet(fleet);
    handled++;
  }
  return handled;
}

/** Flotte vorzeitig zurückrufen. */
export function recallFleet(fleetId, userId) {
  const fleet = db.prepare('SELECT * FROM fleets WHERE id = ?').get(fleetId);
  if (!fleet || fleet.user_id !== userId) return { error: 'Flotte nicht gefunden.' };
  if (fleet.processed) return { error: 'Diese Flotte ist bereits gelandet.' };
  if (fleet.state === 'returning') return { error: 'Die Flotte befindet sich bereits auf dem Rückflug.' };

  const t = now();
  const flown = t - fleet.depart_at;
  const returnAt = t + Math.max(1000, flown); // gleiche Strecke zurück
  db.prepare("UPDATE fleets SET state = 'returning', return_at = ?, hold_until = NULL WHERE id = ?")
    .run(returnAt, fleetId);
  return { ok: true, returnAt };
}

/** Flottenübersicht für das Frontend. */
export function fleetView(userId) {
  const t = now();
  const own = db
    .prepare('SELECT * FROM fleets WHERE user_id = ? AND processed = 0 ORDER BY arrive_at ASC')
    .all(userId);

  const rows = own.map((f) => ({
    id: f.id,
    mission: f.mission,
    missionName: MISSIONS[f.mission]?.name || f.mission,
    state: f.state,
    origin: { q: f.origin_q, s: f.origin_s, p: f.origin_p },
    target: { q: f.target_q, s: f.target_s, p: f.target_p },
    ships: parseShips(f.ships_json),
    cargo: JSON.parse(f.cargo_json || '{}'),
    departAt: f.depart_at,
    arriveAt: f.arrive_at,
    holdUntil: f.hold_until,
    returnAt: f.return_at,
    etaMs: f.state === 'returning' ? f.return_at - t : f.arrive_at - t,
    own: true,
  }));

  // Anfliegende fremde Flotten auf eigenen Planeten (Frühwarnsystem)
  const myPlanets = db.prepare('SELECT quadrant, system, position, name FROM planets WHERE user_id = ?').all(userId);
  const incoming = [];
  for (const p of myPlanets) {
    const hostile = db
      .prepare(
        `SELECT * FROM fleets WHERE processed = 0 AND state = 'outbound' AND user_id != ?
         AND target_q = ? AND target_s = ? AND target_p = ? AND mission IN ('attack','transport','hold','espionage')`
      )
      .all(userId, p.quadrant, p.system, p.position);
    for (const f of hostile) {
      const sender = db.prepare('SELECT username FROM users WHERE id = ?').get(f.user_id);
      incoming.push({
        id: f.id,
        mission: f.mission,
        missionName: MISSIONS[f.mission]?.name || f.mission,
        from: { q: f.origin_q, s: f.origin_s, p: f.origin_p },
        target: { q: p.quadrant, s: p.system, p: p.position },
        targetName: p.name,
        attacker: sender?.username || 'Unbekannt',
        arriveAt: f.arrive_at,
        etaMs: f.arrive_at - t,
        // Nur Spionageflotten und Angriffe werden erkannt, Schiffszahlen bleiben verborgen.
        shipCount: f.mission === 'attack' ? Object.values(parseShips(f.ships_json)).reduce((a, b) => a + b, 0) : null,
        own: false,
      });
    }
  }
  return { fleets: rows, incoming, slots: { used: rows.length, max: maxFleetSlots(getResearch(userId)) } };
}
