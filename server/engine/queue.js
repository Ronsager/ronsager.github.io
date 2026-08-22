import { db, now, getBuildings, getResearch, setLevel, addCount } from '../db.js';
import { itemDef } from '../gamedata.js';
import { tickPlanet } from './planet.js';

/** Warteschlangen-"Spur": Gebäude/Forschung/Werft laufen unabhängig voneinander. */
export function laneOf(kind) {
  if (kind === 'building') return 'building';
  if (kind === 'research') return 'research';
  return 'shipyard'; // Schiffe und Verteidigung teilen sich die Werft
}

const laneFilter = {
  building: "kind = 'building'",
  research: "kind = 'research'",
  shipyard: "kind IN ('ship','defense')",
};

/** Aktuelle Einträge einer Spur, chronologisch. */
export function laneEntries(lane, { planetId = null, userId = null }) {
  if (lane === 'research') {
    return db
      .prepare(`SELECT * FROM build_queue WHERE user_id = ? AND ${laneFilter.research} ORDER BY finish_at ASC`)
      .all(userId);
  }
  return db
    .prepare(`SELECT * FROM build_queue WHERE planet_id = ? AND ${laneFilter[lane]} ORDER BY finish_at ASC`)
    .all(planetId);
}

/** Zeitpunkt, an dem eine neue Bestellung in dieser Spur beginnen würde. */
export function laneFreeAt(lane, ctx) {
  const entries = laneEntries(lane, ctx);
  const t = now();
  if (!entries.length) return t;
  return Math.max(t, entries[entries.length - 1].finish_at);
}

/**
 * Arbeitet alle fälligen Einträge eines Planeten ab.
 * Wird "lazy" bei jedem Zugriff und zusätzlich vom globalen Tick aufgerufen.
 */
export function processPlanetQueue(planetId) {
  const planet = db.prepare('SELECT * FROM planets WHERE id = ?').get(planetId);
  if (!planet) return [];
  const t = now();
  const completed = [];

  const entries = db
    .prepare('SELECT * FROM build_queue WHERE planet_id = ? ORDER BY finish_at ASC')
    .all(planetId);

  for (const e of entries) {
    if (e.kind === 'building' || e.kind === 'research') {
      if (e.finish_at > t) continue;
      if (e.kind === 'building') {
        // target_level enthält bei Abriss bereits die verringerte Stufe
        setLevel('buildings', 'level', 'planet_id', planetId, e.item_key, e.target_level);
      } else {
        setLevel('research', 'level', 'user_id', e.user_id, e.item_key, e.target_level);
      }
      db.prepare('DELETE FROM build_queue WHERE id = ?').run(e.id);
      completed.push({ kind: e.kind, key: e.item_key, level: e.target_level, demolish: !!e.demolish });
    } else {
      // Schiffe/Verteidigung: stückweise Fertigstellung
      const elapsed = t - e.start_at;
      if (elapsed <= 0) continue;
      const doneNow = Math.min(e.amount, Math.floor(elapsed / Math.max(1, e.per_unit_ms)));
      const delta = doneNow - e.done;
      if (delta <= 0) continue;
      const table = e.kind === 'ship' ? 'ships' : 'defenses';
      addCount(table, 'planet_id', planetId, e.item_key, delta);
      completed.push({ kind: e.kind, key: e.item_key, amount: delta });
      if (doneNow >= e.amount) db.prepare('DELETE FROM build_queue WHERE id = ?').run(e.id);
      else db.prepare('UPDATE build_queue SET done = ? WHERE id = ?').run(doneNow, e.id);
    }
  }
  return completed;
}

/** Fertige Forschungen abarbeiten (können auf jedem Planeten des Spielers liegen). */
export function processUserQueues(userId) {
  const planets = db.prepare('SELECT id FROM planets WHERE user_id = ?').all(userId);
  const done = [];
  for (const { id } of planets) {
    tickPlanet(id);
    done.push(...processPlanetQueue(id));
  }
  return done;
}

/** Globaler Durchlauf für alle Planeten mit fälligen Aufträgen. */
export function processDueQueues() {
  const t = now();
  const rows = db
    .prepare(
      `SELECT DISTINCT planet_id FROM build_queue
       WHERE (kind IN ('building','research') AND finish_at <= ?)
          OR (kind IN ('ship','defense') AND start_at <= ?)`
    )
    .all(t, t);
  for (const r of rows) {
    tickPlanet(r.planet_id);
    processPlanetQueue(r.planet_id);
  }
  return rows.length;
}

/** Auftrag stornieren – Kosten werden vollständig zurückerstattet. */
export function cancelEntry(entryId, userId) {
  const e = db.prepare('SELECT * FROM build_queue WHERE id = ?').get(entryId);
  if (!e || e.user_id !== userId) return { error: 'Auftrag nicht gefunden.' };

  const cost = JSON.parse(e.cost_json || '{}');
  let refund = { duranium: 0, dilithium: 0, deuterium: 0 };

  if (e.kind === 'ship' || e.kind === 'defense') {
    const remaining = Math.max(0, e.amount - e.done);
    const def = itemDef(e.kind, e.item_key);
    if (def) {
      for (const [res, v] of Object.entries(def.cost)) refund[res] = (refund[res] || 0) + v * remaining;
    }
  } else if (!e.demolish) {
    refund = { duranium: cost.duranium || 0, dilithium: cost.dilithium || 0, deuterium: cost.deuterium || 0 };
  }

  db.prepare('DELETE FROM build_queue WHERE id = ?').run(entryId);

  // Nachfolgende Aufträge der gleichen Spur rücken auf.
  const lane = laneOf(e.kind);
  const ctx = { planetId: e.planet_id, userId: e.user_id };
  let cursor = now();
  for (const next of laneEntries(lane, ctx)) {
    const duration = next.kind === 'ship' || next.kind === 'defense'
      ? next.per_unit_ms * next.amount
      : next.finish_at - next.start_at;
    const start = Math.max(cursor, next.start_at > cursor ? cursor : next.start_at);
    db.prepare('UPDATE build_queue SET start_at = ?, finish_at = ? WHERE id = ?')
      .run(start, start + duration, next.id);
    cursor = start + duration;
  }

  db.prepare('UPDATE planets SET duranium = duranium + ?, dilithium = dilithium + ?, deuterium = deuterium + ? WHERE id = ?')
    .run(refund.duranium, refund.dilithium, refund.deuterium, e.planet_id);

  return { ok: true, refund };
}

/** Warteschlange eines Planeten für das Frontend aufbereiten. */
export function queueView(planetId, userId) {
  const t = now();
  const rows = db
    .prepare(
      `SELECT * FROM build_queue WHERE planet_id = ? OR (user_id = ? AND kind = 'research')
       ORDER BY finish_at ASC`
    )
    .all(planetId, userId);

  return rows.map((e) => {
    const def = itemDef(e.kind, e.item_key);
    const total = e.kind === 'ship' || e.kind === 'defense' ? e.per_unit_ms * e.amount : e.finish_at - e.start_at;
    return {
      id: e.id,
      kind: e.kind,
      key: e.item_key,
      name: def?.name || e.item_key,
      level: e.target_level,
      amount: e.amount,
      done: e.done,
      demolish: !!e.demolish,
      startAt: e.start_at,
      finishAt: e.finish_at,
      totalMs: total,
      remainingMs: Math.max(0, e.finish_at - t),
      lane: laneOf(e.kind),
      planetId: e.planet_id,
    };
  });
}
