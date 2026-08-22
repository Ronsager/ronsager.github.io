import express from 'express';
import { db } from '../db.js';
import { config } from '../config.js';
import { PLANET_TYPES } from '../gamedata.js';
import { authenticate } from '../auth.js';
import { processFleets } from '../engine/fleet.js';

export const router = express.Router();
router.use(authenticate);

const typeInfo = (key) => PLANET_TYPES.find((t) => t.key === key) || { name: key, description: '' };

router.get('/', (req, res) => {
  processFleets();
  const q = Math.min(config.universe.quadrants, Math.max(1, Math.floor(Number(req.query.q) || 1)));
  const s = Math.min(config.universe.systems, Math.max(1, Math.floor(Number(req.query.s) || 1)));

  const planets = db
    .prepare(
      `SELECT p.*, u.username, u.faction, u.banned, u.vacation_until, u.last_seen,
              a.tag AS alliance_tag, a.id AS alliance_id,
              COALESCE(st.points, 0) AS points
       FROM planets p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN alliance_members am ON am.user_id = u.id
       LEFT JOIN alliances a ON a.id = am.alliance_id
       LEFT JOIN stats st ON st.user_id = u.id
       WHERE p.quadrant = ? AND p.system = ?`
    )
    .all(q, s);

  const debrisRows = db
    .prepare('SELECT position, duranium, dilithium FROM debris WHERE quadrant = ? AND system = ?')
    .all(q, s);
  const debrisMap = new Map(debrisRows.map((d) => [d.position, d]));
  const planetMap = new Map(planets.map((p) => [p.position, p]));

  const slots = [];
  const inactiveThreshold = Date.now() - 7 * 86400000;
  for (let pos = 1; pos <= config.universe.slots; pos++) {
    const p = planetMap.get(pos);
    const d = debrisMap.get(pos);
    slots.push({
      position: pos,
      planet: p
        ? {
            id: p.id,
            name: p.name,
            type: p.type,
            typeName: typeInfo(p.type).name,
            diameter: p.diameter,
            temp: { min: p.temp_min, max: p.temp_max },
            isOwn: p.user_id === req.user.id,
            owner: {
              id: p.user_id,
              username: p.username,
              faction: p.faction,
              points: Math.floor(p.points),
              banned: !!p.banned,
              vacation: !!(p.vacation_until && p.vacation_until > Date.now()),
              inactive: !p.last_seen || p.last_seen < inactiveThreshold,
              alliance: p.alliance_tag ? { id: p.alliance_id, tag: p.alliance_tag } : null,
            },
          }
        : null,
      debris: d ? { duranium: Math.floor(d.duranium), dilithium: Math.floor(d.dilithium) } : null,
    });
  }

  res.json({
    coords: { q, s },
    universe: config.universe,
    slots,
    own: db
      .prepare('SELECT id, name, quadrant, system, position FROM planets WHERE user_id = ? ORDER BY is_homeworld DESC')
      .all(req.user.id)
      .map((p) => ({ id: p.id, name: p.name, coords: { q: p.quadrant, s: p.system, p: p.position } })),
  });
});

/** Kurzprofil eines Spielers. */
router.get('/player/:id', (req, res) => {
  const id = Number(req.params.id);
  const user = db
    .prepare(
      `SELECT u.id, u.username, u.faction, u.created_at, u.last_seen, u.banned,
              COALESCE(s.points,0) AS points, COALESCE(s.eco_points,0) AS eco, COALESCE(s.mil_points,0) AS mil,
              a.id AS alliance_id, a.tag AS alliance_tag, a.name AS alliance_name
       FROM users u
       LEFT JOIN stats s ON s.user_id = u.id
       LEFT JOIN alliance_members am ON am.user_id = u.id
       LEFT JOIN alliances a ON a.id = am.alliance_id
       WHERE u.id = ?`
    )
    .get(id);
  if (!user) return res.status(404).json({ error: 'Kommandant unbekannt.' });

  const planets = db
    .prepare('SELECT quadrant, system, position, name FROM planets WHERE user_id = ? ORDER BY is_homeworld DESC')
    .all(id);
  res.json({
    id: user.id, username: user.username, faction: user.faction,
    points: Math.floor(user.points), eco: Math.floor(user.eco), mil: Math.floor(user.mil),
    createdAt: user.created_at, lastSeen: user.last_seen, banned: !!user.banned,
    alliance: user.alliance_id ? { id: user.alliance_id, tag: user.alliance_tag, name: user.alliance_name } : null,
    planets: planets.map((p) => ({ name: p.name, coords: { q: p.quadrant, s: p.system, p: p.position } })),
  });
});
