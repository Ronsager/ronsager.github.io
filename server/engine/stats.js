import { db, now, getResearch } from '../db.js';
import { computePoints } from './formulas.js';
import { SHIPS } from '../gamedata.js';

/** Punkte eines Spielers neu berechnen (Gebäude + Forschung + Flotte + Verteidigung). */
export function recomputeUser(userId) {
  const planets = db.prepare('SELECT id FROM planets WHERE user_id = ?').all(userId);
  const buildingsByPlanet = new Map();
  const ships = {};
  const defenses = {};

  for (const { id } of planets) {
    const levels = {};
    for (const r of db.prepare('SELECT key, level FROM buildings WHERE planet_id = ?').all(id))
      levels[r.key] = r.level;
    buildingsByPlanet.set(id, levels);
    for (const r of db.prepare('SELECT key, count FROM ships WHERE planet_id = ?').all(id))
      ships[r.key] = (ships[r.key] || 0) + r.count;
    for (const r of db.prepare('SELECT key, count FROM defenses WHERE planet_id = ?').all(id))
      defenses[r.key] = (defenses[r.key] || 0) + r.count;
  }
  // Schiffe, die gerade unterwegs sind, zählen ebenfalls.
  for (const f of db.prepare('SELECT ships_json FROM fleets WHERE user_id = ? AND processed = 0').all(userId)) {
    for (const [key, n] of Object.entries(JSON.parse(f.ships_json || '{}')))
      if (SHIPS[key]) ships[key] = (ships[key] || 0) + n;
  }

  const research = getResearch(userId);

  // Gebäudepunkte planetenweise berechnen: die Kostenkurve gilt pro Planet,
  // eine Summierung über alle Kolonien würde die Punkte verfälschen.
  let eco = 0;
  for (const { id } of planets) {
    eco += computePoints({ buildings: buildingsByPlanet.get(id) }).eco_points;
  }

  const rest = computePoints({ research, ships, defenses });
  const total = eco + rest.res_points + rest.mil_points;

  db.prepare(
    `INSERT INTO stats (user_id, points, eco_points, res_points, mil_points, updated_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET
       points = excluded.points, eco_points = excluded.eco_points,
       res_points = excluded.res_points, mil_points = excluded.mil_points,
       updated_at = excluded.updated_at`
  ).run(userId, total, eco, rest.res_points, rest.mil_points, now());

  return { points: total, eco_points: eco, res_points: rest.res_points, mil_points: rest.mil_points };
}

/** Punkte aller Spieler neu berechnen (Cron/Tick). */
export function recomputeAll() {
  const users = db.prepare('SELECT id FROM users').all();
  for (const u of users) {
    try { recomputeUser(u.id); } catch (err) { console.error('Punkteberechnung fehlgeschlagen für', u.id, err); }
  }
  return users.length;
}

/** Rangliste. type: points | eco | res | mil */
export function highscore(type = 'points', limit = 100, offset = 0) {
  const column = { points: 'points', eco: 'eco_points', res: 'res_points', mil: 'mil_points' }[type] || 'points';
  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.faction, u.banned,
              COALESCE(s.points,0) AS points, COALESCE(s.eco_points,0) AS eco_points,
              COALESCE(s.res_points,0) AS res_points, COALESCE(s.mil_points,0) AS mil_points,
              (SELECT COUNT(*) FROM planets p WHERE p.user_id = u.id) AS planets,
              a.tag AS alliance_tag, a.id AS alliance_id
       FROM users u
       LEFT JOIN stats s ON s.user_id = u.id
       LEFT JOIN alliance_members am ON am.user_id = u.id
       LEFT JOIN alliances a ON a.id = am.alliance_id
       ORDER BY ${column} DESC, u.id ASC
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset);
  return rows.map((r, i) => ({ rank: offset + i + 1, ...r, points: Math.floor(r[column]) }));
}

export function userRank(userId, type = 'points') {
  const column = { points: 'points', eco: 'eco_points', res: 'res_points', mil: 'mil_points' }[type] || 'points';
  const row = db
    .prepare(
      `SELECT COUNT(*) + 1 AS rank FROM stats
       WHERE ${column} > (SELECT COALESCE(${column},0) FROM stats WHERE user_id = ?)`
    )
    .get(userId);
  return row?.rank ?? null;
}
