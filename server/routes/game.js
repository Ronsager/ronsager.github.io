import express from 'express';
import { db, now, getBuildings, getShips, getDefenses, getResearch } from '../db.js';
import { config } from '../config.js';
import { BUILDINGS, RESEARCH, SHIPS, DEFENSES, FACTIONS, RESOURCES, PLANET_TYPES, itemDef } from '../gamedata.js';
import {
  levelCost, unitCost, demolishRefund, buildTimeMs, missingRequirements,
  storageCapacity, maxPlanets, maxFleetSlots,
} from '../engine/formulas.js';
import { tickPlanet, planetSnapshot, usedFields } from '../engine/planet.js';
import { processPlanetQueue, queueView, laneOf, laneEntries, laneFreeAt, cancelEntry } from '../engine/queue.js';
import { recomputeUser, userRank } from '../engine/stats.js';
import { unreadCount } from '../engine/messages.js';
import { authenticate } from '../auth.js';

export const router = express.Router();
router.use(authenticate);

const LANE_LIMITS = { building: 5, research: 3, shipyard: 10 };

/** Planet des angemeldeten Spielers laden (mit Tick + Warteschlangenlauf). */
function ownPlanet(req, res) {
  const id = Number(req.query.planetId || req.body?.planetId || 0);
  let planet;
  if (id) {
    planet = db.prepare('SELECT * FROM planets WHERE id = ? AND user_id = ?').get(id, req.user.id);
  } else {
    planet = db
      .prepare('SELECT * FROM planets WHERE user_id = ? ORDER BY is_homeworld DESC, id ASC LIMIT 1')
      .get(req.user.id);
  }
  if (!planet) {
    res.status(404).json({ error: 'Planet nicht gefunden.' });
    return null;
  }
  tickPlanet(planet.id);
  processPlanetQueue(planet.id);
  return db.prepare('SELECT * FROM planets WHERE id = ?').get(planet.id);
}

/* ------------------------------------------------------------------ */
/* Gesamtzustand                                                       */
/* ------------------------------------------------------------------ */

router.get('/state', (req, res) => {
  // Alle eigenen Planeten aktualisieren, damit die Kopfleiste stimmt.
  const planetRows = db
    .prepare('SELECT id FROM planets WHERE user_id = ? ORDER BY is_homeworld DESC, id ASC')
    .all(req.user.id);
  for (const p of planetRows) {
    tickPlanet(p.id);
    processPlanetQueue(p.id);
  }

  const planet = ownPlanet(req, res);
  if (!planet) return;

  const research = getResearch(req.user.id);
  const snapshot = planetSnapshot(planet.id);
  const stats = db.prepare('SELECT * FROM stats WHERE user_id = ?').get(req.user.id) || {};
  const alliance = db
    .prepare(
      `SELECT a.id, a.tag, a.name, m.rank FROM alliance_members m
       JOIN alliances a ON a.id = m.alliance_id WHERE m.user_id = ?`
    )
    .get(req.user.id);

  const planets = planetRows.map(({ id }) => {
    const p = db.prepare('SELECT * FROM planets WHERE id = ?').get(id);
    const b = getBuildings(id);
    return {
      id: p.id,
      name: p.name,
      coords: { q: p.quadrant, s: p.system, p: p.position },
      type: p.type,
      isHomeworld: !!p.is_homeworld,
      fields: { used: usedFields(id).used, max: p.fields_max },
      resources: {
        duranium: Math.floor(p.duranium), dilithium: Math.floor(p.dilithium), deuterium: Math.floor(p.deuterium),
      },
      capacity: storageCapacity(b),
    };
  });

  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
      faction: req.user.faction,
      factionName: FACTIONS[req.user.faction]?.short,
      factionBonus: FACTIONS[req.user.faction]?.bonus,
      vacationUntil: req.user.vacation_until,
    },
    alliance: alliance || null,
    stats: {
      points: Math.floor(stats.points || 0),
      eco: Math.floor(stats.eco_points || 0),
      res: Math.floor(stats.res_points || 0),
      mil: Math.floor(stats.mil_points || 0),
      rank: userRank(req.user.id),
    },
    limits: {
      planets: { used: planets.length, max: maxPlanets(research) },
      fleets: { max: maxFleetSlots(research) },
    },
    planets,
    planet: snapshot,
    queue: queueView(planet.id, req.user.id),
    research,
    unread: unreadCount(req.user.id),
    tutorialSeen: !!req.user.tutorial_seen,
    serverTime: now(),
  });
});

/* ------------------------------------------------------------------ */
/* Technologiebaum mit Kosten, Zeiten und Voraussetzungen              */
/* ------------------------------------------------------------------ */

function techList(kind, defs, planet, buildings, research, faction, ships, defenses) {
  const out = [];
  for (const [key, def] of Object.entries(defs)) {
    const isLevelType = kind === 'building' || kind === 'research';
    const current = isLevelType
      ? (kind === 'building' ? buildings[key] || 0 : research[key] || 0)
      : (kind === 'ship' ? ships[key] || 0 : defenses[key] || 0);

    // Bereits in der Warteschlange stehende Stufen einrechnen
    const queued = db
      .prepare('SELECT COALESCE(MAX(target_level),0) AS lvl FROM build_queue WHERE kind = ? AND item_key = ? AND ' +
        (kind === 'research' ? 'user_id = ?' : 'planet_id = ?'))
      .get(kind, key, kind === 'research' ? planet.user_id : planet.id).lvl;

    const nextLevel = isLevelType ? Math.max(current, queued) + 1 : 1;
    const cost = isLevelType ? levelCost(def, nextLevel) : unitCost(def, 1);
    const time = buildTimeMs(kind, def, cost, buildings, research, faction);
    const missing = missingRequirements(def, buildings, research);

    out.push({
      key, kind, name: def.name, description: def.description,
      category: def.category || null,
      level: current,
      queuedLevel: queued || null,
      nextLevel: isLevelType ? nextLevel : null,
      cost, timeMs: time,
      requirements: missing,
      available: missing.length === 0,
      max: def.max || null,
      stats: kind === 'ship' || kind === 'defense'
        ? { shield: def.shield, weapon: def.weapon, speed: def.speed || 0, cargo: def.cargo || 0, fuel: def.fuel || 0 }
        : null,
    });
  }
  return out;
}

router.get('/tech', (req, res) => {
  const planet = ownPlanet(req, res);
  if (!planet) return;
  const buildings = getBuildings(planet.id);
  const research = getResearch(req.user.id);
  const ships = getShips(planet.id);
  const defenses = getDefenses(planet.id);
  const f = req.user.faction;

  res.json({
    planetId: planet.id,
    buildings: techList('building', BUILDINGS, planet, buildings, research, f, ships, defenses),
    research: techList('research', RESEARCH, planet, buildings, research, f, ships, defenses),
    ships: techList('ship', SHIPS, planet, buildings, research, f, ships, defenses),
    defenses: techList('defense', DEFENSES, planet, buildings, research, f, ships, defenses),
    resources: {
      duranium: Math.floor(planet.duranium),
      dilithium: Math.floor(planet.dilithium),
      deuterium: Math.floor(planet.deuterium),
    },
    fields: { ...usedFields(planet.id), max: planet.fields_max },
    queue: queueView(planet.id, req.user.id),
  });
});

/* ------------------------------------------------------------------ */
/* Bauauftrag erteilen                                                 */
/* ------------------------------------------------------------------ */

router.post('/build', (req, res) => {
  const planet = ownPlanet(req, res);
  if (!planet) return;

  const kind = String(req.body?.kind || '');
  const key = String(req.body?.key || '');
  const amount = Math.max(1, Math.min(100000, Math.floor(Number(req.body?.amount) || 1)));
  const def = itemDef(kind, key);
  if (!def) return res.status(400).json({ error: 'Unbekannte Technologie.' });

  const buildings = getBuildings(planet.id);
  const research = getResearch(req.user.id);
  const lane = laneOf(kind);
  const ctx = { planetId: planet.id, userId: req.user.id };

  const missing = missingRequirements(def, buildings, research);
  if (missing.length)
    return res.status(400).json({
      error: 'Voraussetzungen nicht erfüllt: ' + missing.map((m) => `${m.name} Stufe ${m.level}`).join(', '),
      requirements: missing,
    });

  const entries = laneEntries(lane, ctx);
  if (entries.length >= LANE_LIMITS[lane])
    return res.status(400).json({ error: `Diese Warteschlange ist voll (max. ${LANE_LIMITS[lane]} Aufträge).` });

  // Werft/Verteidigung benötigen eine Sternenflotten-Werft
  if ((kind === 'ship' || kind === 'defense') && (buildings.shipyard || 0) < 1)
    return res.status(400).json({ error: 'Es wird eine Sternenflotten-Werft benötigt.' });
  if (kind === 'research' && (buildings.research_lab || 0) < 1)
    return res.status(400).json({ error: 'Es wird ein Wissenschaftslabor benötigt.' });

  let targetLevel = null;
  let cost;
  let count = amount;

  if (kind === 'building' || kind === 'research') {
    count = 1;
    const currentLevel = kind === 'building' ? buildings[key] || 0 : research[key] || 0;
    const queuedMax = db
      .prepare(
        `SELECT COALESCE(MAX(target_level),0) AS lvl FROM build_queue WHERE kind = ? AND item_key = ? AND ` +
        (kind === 'research' ? 'user_id = ?' : 'planet_id = ?')
      )
      .get(kind, key, kind === 'research' ? req.user.id : planet.id).lvl;
    targetLevel = Math.max(currentLevel, queuedMax) + 1;
    cost = levelCost(def, targetLevel);

    if (kind === 'building') {
      const fields = usedFields(planet.id);
      if (fields.reserved >= planet.fields_max)
        return res.status(400).json({ error: 'Auf diesem Planeten sind alle Bauflächen belegt. Terraforming erforderlich.' });
    }
  } else {
    if (def.max) {
      const have = kind === 'ship' ? getShips(planet.id)[key] || 0 : getDefenses(planet.id)[key] || 0;
      const inQueue = db
        .prepare('SELECT COALESCE(SUM(amount - done),0) AS a FROM build_queue WHERE planet_id = ? AND item_key = ?')
        .get(planet.id, key).a;
      if (have + inQueue + count > def.max)
        return res.status(400).json({ error: `Von "${def.name}" ist maximal ${def.max} Stück pro Planet zulässig.` });
    }
    if (def.missile) {
      const siloCapacity = (buildings.torpedo_silo || 0) * 10;
      const stored = Object.entries(getDefenses(planet.id))
        .filter(([k]) => DEFENSES[k]?.missile)
        .reduce((a, [k, n]) => a + n * (k === 'interplanetary_missile' ? 2 : 1), 0);
      const slotsNeeded = key === 'interplanetary_missile' ? count * 2 : count;
      if (stored + slotsNeeded > siloCapacity)
        return res.status(400).json({ error: `Das Torpedo-Magazin fasst nur ${siloCapacity} Einheiten.` });
    }
    cost = unitCost(def, count);
  }

  for (const r of RESOURCES) {
    if ((cost[r] || 0) > Math.floor(planet[r])) {
      const label = { duranium: 'Duranium', dilithium: 'Dilithium', deuterium: 'Deuterium' }[r];
      return res.status(400).json({
        error: `Nicht genügend ${label}. Benötigt: ${(cost[r] || 0).toLocaleString('de-DE')}, vorhanden: ${Math.floor(planet[r]).toLocaleString('de-DE')}.`,
        missingResource: r,
      });
    }
  }
  // Energiekosten (z. B. Terraforming) müssen aus der Bilanz gedeckt sein.
  if (cost.energy) {
    const snap = planetSnapshot(planet.id);
    const free = snap.production.energyProduced - snap.production.energyNeeded;
    if (free < cost.energy)
      return res.status(400).json({ error: `Es werden ${cost.energy} freie Energieeinheiten benötigt (verfügbar: ${free}).` });
  }

  const unitTime = kind === 'ship' || kind === 'defense'
    ? buildTimeMs(kind, def, unitCost(def, 1), buildings, research, req.user.faction)
    : buildTimeMs(kind, def, cost, buildings, research, req.user.faction);

  const startAt = laneFreeAt(lane, ctx);
  const totalTime = kind === 'ship' || kind === 'defense' ? unitTime * count : unitTime;

  const tx = db.transaction(() => {
    db.prepare('UPDATE planets SET duranium = duranium - ?, dilithium = dilithium - ?, deuterium = deuterium - ? WHERE id = ?')
      .run(cost.duranium || 0, cost.dilithium || 0, cost.deuterium || 0, planet.id);
    db.prepare(
      `INSERT INTO build_queue
        (planet_id, user_id, kind, item_key, target_level, amount, per_unit_ms, cost_json, start_at, finish_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(
      planet.id, req.user.id, kind, key, targetLevel, count, unitTime,
      JSON.stringify(cost), startAt, startAt + totalTime
    );
  });
  tx();

  res.json({
    ok: true,
    queue: queueView(planet.id, req.user.id),
    startAt, finishAt: startAt + totalTime,
    cost,
  });
});

/* ------------------------------------------------------------------ */
/* Gebäude abreißen                                                    */
/* ------------------------------------------------------------------ */

router.post('/demolish', (req, res) => {
  const planet = ownPlanet(req, res);
  if (!planet) return;
  const key = String(req.body?.key || '');
  const def = BUILDINGS[key];
  if (!def) return res.status(400).json({ error: 'Unbekanntes Gebäude.' });

  const buildings = getBuildings(planet.id);
  const level = buildings[key] || 0;
  if (level <= 0) return res.status(400).json({ error: 'Dieses Gebäude existiert nicht.' });

  const ctx = { planetId: planet.id, userId: req.user.id };
  if (laneEntries('building', ctx).length >= LANE_LIMITS.building)
    return res.status(400).json({ error: 'Die Bau-Warteschlange ist voll.' });

  const refund = demolishRefund(def, level);
  const research = getResearch(req.user.id);
  const time = Math.round(buildTimeMs('building', def, levelCost(def, level), buildings, research, req.user.faction) / 2);
  const startAt = laneFreeAt('building', ctx);

  const tx = db.transaction(() => {
    db.prepare('UPDATE planets SET duranium = duranium + ?, dilithium = dilithium + ?, deuterium = deuterium + ? WHERE id = ?')
      .run(refund.duranium || 0, refund.dilithium || 0, refund.deuterium || 0, planet.id);
    db.prepare(
      `INSERT INTO build_queue
        (planet_id, user_id, kind, item_key, target_level, amount, per_unit_ms, demolish, cost_json, start_at, finish_at)
       VALUES (?,?,?,?,?,?,?,1,?,?,?)`
    ).run(planet.id, req.user.id, 'building', key, level - 1, 1, time, JSON.stringify(refund), startAt, startAt + time);
  });
  tx();

  res.json({ ok: true, refund, queue: queueView(planet.id, req.user.id) });
});

/* ------------------------------------------------------------------ */
/* Auftrag abbrechen                                                   */
/* ------------------------------------------------------------------ */

router.post('/cancel', (req, res) => {
  const entryId = Number(req.body?.entryId || 0);
  const entry = db.prepare('SELECT planet_id FROM build_queue WHERE id = ?').get(entryId);
  const result = cancelEntry(entryId, req.user.id);
  if (result.error) return res.status(400).json(result);
  recomputeUser(req.user.id);
  res.json({ ...result, queue: entry ? queueView(entry.planet_id, req.user.id) : [] });
});

/* ------------------------------------------------------------------ */
/* Planetenverwaltung                                                  */
/* ------------------------------------------------------------------ */

router.post('/planet/rename', (req, res) => {
  const planet = ownPlanet(req, res);
  if (!planet) return;
  const name = String(req.body?.name || '').trim().slice(0, 32);
  if (name.length < 2) return res.status(400).json({ error: 'Der Name muss mindestens 2 Zeichen haben.' });
  db.prepare('UPDATE planets SET name = ? WHERE id = ?').run(name, planet.id);
  res.json({ ok: true, name });
});

router.post('/planet/abandon', (req, res) => {
  const planet = ownPlanet(req, res);
  if (!planet) return;
  if (planet.is_homeworld) return res.status(400).json({ error: 'Die Heimatwelt kann nicht aufgegeben werden.' });
  db.prepare('DELETE FROM planets WHERE id = ?').run(planet.id);
  recomputeUser(req.user.id);
  res.json({ ok: true });
});

router.get('/planet', (req, res) => {
  const planet = ownPlanet(req, res);
  if (!planet) return;
  res.json({ planet: planetSnapshot(planet.id), queue: queueView(planet.id, req.user.id) });
});

/** Einführung als gesehen markieren bzw. erneut anzeigen lassen. */
router.post('/tutorial', (req, res) => {
  const seen = req.body?.seen === false ? 0 : 1;
  db.prepare('UPDATE users SET tutorial_seen = ? WHERE id = ?').run(seen, req.user.id);
  res.json({ ok: true, tutorialSeen: !!seen });
});

/** Statische Nachschlagedaten für das Frontend. */
router.get('/reference', (req, res) => {
  res.json({
    buildings: BUILDINGS, research: RESEARCH, ships: SHIPS, defenses: DEFENSES,
    factions: FACTIONS, planetTypes: PLANET_TYPES, universe: config.universe, speed: config.speed,
  });
});
