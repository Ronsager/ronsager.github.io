import { db, now, getResearch } from '../db.js';
import { computePoints } from './formulas.js';
import { SHIPS } from '../gamedata.js';

const STAT_COLUMNS = ['points', 'eco_points', 'res_points', 'mil_points'];

/**
 * Vergleicht gespeicherte und neu berechnete Punktestände.
 * Die kleine Toleranz fängt Rundungsunterschiede der Gleitkommaarithmetik ab –
 * ein Punktwert ändert sich real immer um deutlich mehr als ein Millionstel.
 */
function statsDiffer(current, next) {
  return STAT_COLUMNS.some((key) => Math.abs((current[key] || 0) - (next[key] || 0)) > 1e-6);
}

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

  // Ein im Adminbereich gesetzter Zuschlag bleibt bei jeder Neuberechnung
  // erhalten – sonst würde er beim nächsten Durchlauf überschrieben.
  const bonus = db.prepare('SELECT points_bonus FROM stats WHERE user_id = ?').get(userId)?.points_bonus || 0;

  const next = {
    points: eco + rest.res_points + rest.mil_points + bonus,
    eco_points: eco,
    res_points: rest.res_points,
    mil_points: rest.mil_points,
  };

  // Nur schreiben, wenn sich tatsächlich etwas geändert hat.
  // Solange niemand spielt, entstehen dadurch überhaupt keine Schreibzugriffe –
  // das schont vor allem SD-Karten auf Einplatinenrechnern wie dem Raspberry Pi.
  const current = db
    .prepare('SELECT points, eco_points, res_points, mil_points FROM stats WHERE user_id = ?')
    .get(userId);
  if (current && !statsDiffer(current, next)) return next;

  db.prepare(
    `INSERT INTO stats (user_id, points, eco_points, res_points, mil_points, updated_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET
       points = excluded.points, eco_points = excluded.eco_points,
       res_points = excluded.res_points, mil_points = excluded.mil_points,
       updated_at = excluded.updated_at`
  ).run(userId, next.points, next.eco_points, next.res_points, next.mil_points, now());

  return next;
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


/* ------------------------------------------------------------------ */
/* Manuelle Anpassung durch Administratoren                            */
/* ------------------------------------------------------------------ */

/**
 * Setzt die angezeigten Gesamtpunkte eines Spielers.
 *
 * Die Punkte ergeben sich normalerweise aus Gebäuden, Forschung und Flotte.
 * Damit eine Anpassung die nächste Neuberechnung übersteht, wird nicht der
 * Punktestand selbst gespeichert, sondern die Differenz als Zuschlag.
 */
export function setPoints(userId, zielPunkte) {
  const row = db.prepare('SELECT points, points_bonus FROM stats WHERE user_id = ?').get(userId);
  if (!row) {
    db.prepare('INSERT INTO stats (user_id, points, points_bonus, updated_at) VALUES (?,?,?,?)')
      .run(userId, Number(zielPunkte) || 0, Number(zielPunkte) || 0, now());
    return { bonus: Number(zielPunkte) || 0, points: Number(zielPunkte) || 0 };
  }
  const berechnet = row.points - (row.points_bonus || 0);   // Punkte ohne Zuschlag
  const bonus = Number(zielPunkte) - berechnet;
  db.prepare('UPDATE stats SET points_bonus = ? WHERE user_id = ?').run(bonus, userId);
  const nachher = recomputeUser(userId);
  return { bonus, berechnet, points: nachher.points };
}

/** Hebt einen gesetzten Zuschlag wieder auf. */
export function clearPointsBonus(userId) {
  db.prepare('UPDATE stats SET points_bonus = 0 WHERE user_id = ?').run(userId);
  return recomputeUser(userId);
}

/**
 * Ermittelt die Punktzahl, die nötig ist, um einen bestimmten Rang zu belegen.
 * Gerechnet wird knapp über dem derzeitigen Inhaber dieses Platzes.
 */
export function pointsForRank(userId, zielRang) {
  const liste = db
    .prepare('SELECT user_id, points FROM stats WHERE user_id != ? ORDER BY points DESC')
    .all(userId);
  const rang = Math.max(1, Math.floor(zielRang));

  if (rang === 1) return (liste[0]?.points || 0) + 1;
  const davor = liste[rang - 2];        // Spieler, der künftig direkt darüber steht
  const danach = liste[rang - 1];       // Spieler, der künftig direkt darunter steht
  if (!davor) return (liste[liste.length - 1]?.points || 0) + 1;
  if (!danach) return Math.max(0, davor.points - 1);
  // Genau zwischen beide legen; bei gleichen Werten knapp darunter
  return davor.points > danach.points ? (davor.points + danach.points) / 2 : Math.max(0, danach.points - 1);
}
