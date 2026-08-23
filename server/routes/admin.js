import express from 'express';
import { db, now, getSetting, setSetting, logAdmin, getBuildings, getShips, getDefenses, getResearch, setLevel, setTunable, getTunables } from '../db.js';
import { config } from '../config.js';
import { BUILDINGS, RESEARCH, SHIPS, DEFENSES, FACTIONS, RESOURCES, MISSIONS } from '../gamedata.js';
import { authenticate, requireAdmin, hashPassword, ROLES } from '../auth.js';
import { tickPlanet, createPlanet, findHomeworldSlot, planetSnapshot, addDebris } from '../engine/planet.js';
import { recomputeUser, recomputeAll, setPoints, clearPointsBonus, pointsForRank, userRank } from '../engine/stats.js';
import { sendMessage, broadcast } from '../engine/messages.js';
import { queueView } from '../engine/queue.js';
import { listEntries, ensureCurrentEntry } from '../engine/changelog.js';
import { getVersion, getPackageVersion, setVersionOverride } from '../config.js';

export const router = express.Router();
router.use(authenticate, requireAdmin);

const clampInt = (v, min, max) => Math.min(max, Math.max(min, Math.floor(Number(v) || 0)));

/* ------------------------------------------------------------------ */
/* Übersicht / Dashboard                                               */
/* ------------------------------------------------------------------ */

router.get('/overview', (req, res) => {
  const t = now();
  const day = 86400000;
  const stat = (sql, ...p) => db.prepare(sql).get(...p);

  res.json({
    users: {
      total: stat('SELECT COUNT(*) AS c FROM users').c,
      admins: stat("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").c,
      banned: stat('SELECT COUNT(*) AS c FROM users WHERE banned = 1').c,
      vacation: stat('SELECT COUNT(*) AS c FROM users WHERE vacation_until > ?', t).c,
      online: stat('SELECT COUNT(*) AS c FROM users WHERE last_seen > ?', t - 5 * 60000).c,
      today: stat('SELECT COUNT(*) AS c FROM users WHERE created_at > ?', t - day).c,
      week: stat('SELECT COUNT(*) AS c FROM users WHERE last_seen > ?', t - 7 * day).c,
    },
    world: {
      planets: stat('SELECT COUNT(*) AS c FROM planets').c,
      fleets: stat('SELECT COUNT(*) AS c FROM fleets WHERE processed = 0').c,
      queue: stat('SELECT COUNT(*) AS c FROM build_queue').c,
      alliances: stat('SELECT COUNT(*) AS c FROM alliances').c,
      messages: stat('SELECT COUNT(*) AS c FROM messages').c,
      debrisFields: stat('SELECT COUNT(*) AS c FROM debris').c,
      resources: stat('SELECT COALESCE(SUM(duranium),0) AS d, COALESCE(SUM(dilithium),0) AS c, COALESCE(SUM(deuterium),0) AS t FROM planets'),
    },
    settings: {
      motd: getSetting('motd', ''),
      registrationOpen: getSetting('registration_open', '1') === '1',
      speed: config.speed,
      universe: config.universe,
      dbFile: config.dbFile,
    },
    topPlayers: db
      .prepare(
        `SELECT u.id, u.username, COALESCE(s.points,0) AS points FROM users u
         LEFT JOIN stats s ON s.user_id = u.id ORDER BY points DESC LIMIT 10`
      )
      .all()
      .map((r) => ({ ...r, points: Math.floor(r.points) })),
    recentUsers: db
      .prepare('SELECT id, username, created_at, last_seen FROM users ORDER BY created_at DESC LIMIT 10')
      .all(),
    recentLog: db.prepare('SELECT * FROM admin_log ORDER BY id DESC LIMIT 15').all(),
  });
});

/* ------------------------------------------------------------------ */
/* Benutzerverwaltung                                                  */
/* ------------------------------------------------------------------ */

router.get('/users', (req, res) => {
  const search = String(req.query.search || '').trim();
  const page = Math.max(0, Math.floor(Number(req.query.page) || 0));
  const limit = 25;
  const sortMap = {
    points: 'points DESC', username: 'u.username COLLATE NOCASE ASC', created: 'u.created_at DESC',
    seen: 'u.last_seen DESC', id: 'u.id ASC',
  };
  const order = sortMap[String(req.query.sort)] || sortMap.points;
  const roleFilter = ROLES.includes(String(req.query.role)) ? String(req.query.role) : null;
  const clauses = [];
  const params = [];
  if (search) { clauses.push('(u.username LIKE ? OR u.email LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  if (roleFilter) { clauses.push('u.role = ?'); params.push(roleFilter); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.email, u.role, u.faction, u.banned, u.ban_reason,
              u.vacation_until, u.created_at, u.last_login, u.last_seen,
              COALESCE(s.points,0) AS points,
              (SELECT COUNT(*) FROM planets p WHERE p.user_id = u.id) AS planets,
              a.tag AS alliance_tag
       FROM users u
       LEFT JOIN stats s ON s.user_id = u.id
       LEFT JOIN alliance_members am ON am.user_id = u.id
       LEFT JOIN alliances a ON a.id = am.alliance_id
       ${where} ORDER BY ${order} LIMIT ? OFFSET ?`
    )
    .all(...params, limit, page * limit);

  const total = db.prepare(`SELECT COUNT(*) AS c FROM users u ${where}`).get(...params).c;

  res.json({
    users: rows.map((u) => ({ ...u, points: Math.floor(u.points), banned: !!u.banned })),
    total, page, pages: Math.ceil(total / limit),
  });
});

router.get('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });

  const planets = db.prepare('SELECT id FROM planets WHERE user_id = ? ORDER BY is_homeworld DESC, id ASC').all(id);
  for (const p of planets) tickPlanet(p.id);

  const stats = db.prepare('SELECT * FROM stats WHERE user_id = ?').get(id) || {};
  const alliance = db
    .prepare(
      `SELECT a.id, a.tag, a.name, m.rank FROM alliance_members m
       JOIN alliances a ON a.id = m.alliance_id WHERE m.user_id = ?`
    ).get(id);

  res.json({
    user: {
      id: user.id, username: user.username, email: user.email, role: user.role,
      faction: user.faction, banned: !!user.banned, banReason: user.ban_reason,
      vacationUntil: user.vacation_until, createdAt: user.created_at,
      lastLogin: user.last_login, lastSeen: user.last_seen,
    },
    stats: {
      points: Math.floor(stats.points || 0), eco: Math.floor(stats.eco_points || 0),
      res: Math.floor(stats.res_points || 0), mil: Math.floor(stats.mil_points || 0),
      bonus: Math.round(stats.points_bonus || 0), rank: userRank(id),
    },
    alliance: alliance || null,
    research: getResearch(id),
    planets: planets.map((p) => {
      const snap = planetSnapshot(p.id);
      return { ...snap, queue: queueView(p.id, id) };
    }),
    fleets: db
      .prepare('SELECT * FROM fleets WHERE user_id = ? AND processed = 0')
      .all(id)
      .map((f) => ({
        id: f.id, mission: f.mission, missionName: MISSIONS[f.mission]?.name || f.mission,
        state: f.state,
        origin: { q: f.origin_q, s: f.origin_s, p: f.origin_p },
        target: { q: f.target_q, s: f.target_s, p: f.target_p },
        ships: JSON.parse(f.ships_json || '{}'), cargo: JSON.parse(f.cargo_json || '{}'),
        arriveAt: f.arrive_at, returnAt: f.return_at,
      })),
    messageCount: db.prepare('SELECT COUNT(*) AS c FROM messages WHERE user_id = ?').get(id).c,
  });
});

/** Stammdaten ändern: Name, E-Mail, Rolle, Fraktion, Sperre, Urlaubsmodus. */
router.patch('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });

  const b = req.body || {};
  const changes = [];
  const fields = [];
  const values = [];

  if (typeof b.username === 'string' && b.username.trim() && b.username !== user.username) {
    const name = b.username.trim().slice(0, 20);
    if (db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(name, id))
      return res.status(400).json({ error: 'Name bereits vergeben.' });
    fields.push('username = ?'); values.push(name); changes.push(`Name: ${user.username} → ${name}`);
  }
  if (typeof b.email === 'string' && b.email.trim() && b.email !== user.email) {
    const email = b.email.trim().toLowerCase();
    if (db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, id))
      return res.status(400).json({ error: 'E-Mail bereits vergeben.' });
    fields.push('email = ?'); values.push(email); changes.push(`E-Mail geändert`);
  }
  if (ROLES.includes(b.role)) {
    if (b.role !== user.role) {
      if (user.id === req.user.id && b.role !== 'admin')
        return res.status(400).json({ error: 'Die eigenen Administratorrechte können nicht entzogen werden.' });
      fields.push('role = ?'); values.push(b.role); changes.push(`Rolle: ${user.role} → ${b.role}`);
    }
  }
  if (typeof b.faction === 'string' && FACTIONS[b.faction] && b.faction !== user.faction) {
    fields.push('faction = ?'); values.push(b.faction); changes.push(`Fraktion: ${b.faction}`);
  }
  if (b.banned !== undefined) {
    const banned = b.banned ? 1 : 0;
    if (banned && user.id === req.user.id)
      return res.status(400).json({ error: 'Das eigene Konto kann nicht gesperrt werden.' });
    if (banned !== user.banned) {
      fields.push('banned = ?', 'ban_reason = ?');
      values.push(banned, banned ? String(b.banReason || 'Verstoß gegen die Spielregeln.').slice(0, 500) : null);
      changes.push(banned ? `gesperrt (${b.banReason || '-'})` : 'entsperrt');
      if (banned) { fields.push('token_version = token_version + 1'); }
    }
  }
  if (b.vacationUntil !== undefined) {
    const v = b.vacationUntil ? Number(b.vacationUntil) : null;
    fields.push('vacation_until = ?'); values.push(v);
    changes.push(v ? 'Urlaubsmodus gesetzt' : 'Urlaubsmodus beendet');
  }

  if (!fields.length) return res.json({ ok: true, changes: [] });

  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);
  logAdmin(req.user, 'user_update', user.username, changes.join('; '));
  res.json({ ok: true, changes });
});

router.post('/users/:id/password', (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
  const pw = String(req.body?.password || '');
  if (pw.length < 8) return res.status(400).json({ error: 'Das Passwort muss mindestens 8 Zeichen haben.' });

  db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?')
    .run(hashPassword(pw), id);
  logAdmin(req.user, 'password_reset', user.username, '');
  res.json({ ok: true });
});

router.delete('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'Das eigene Konto kann hier nicht gelöscht werden.' });
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });

  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  logAdmin(req.user, 'user_delete', user.username, '');
  res.json({ ok: true });
});

router.post('/users/:id/message', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(id))
    return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
  sendMessage(id, {
    type: 'admin',
    subject: String(req.body?.subject || 'Mitteilung der Admiralität').slice(0, 120),
    body: String(req.body?.body || '').slice(0, 4000),
    fromUserId: req.user.id,
  });
  logAdmin(req.user, 'message', id, String(req.body?.subject || ''));
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Ressourcen und Besitz bearbeiten                                    */
/* ------------------------------------------------------------------ */

router.post('/planets/:id/resources', (req, res) => {
  const id = Number(req.params.id);
  const planet = db.prepare('SELECT * FROM planets WHERE id = ?').get(id);
  if (!planet) return res.status(404).json({ error: 'Planet nicht gefunden.' });
  tickPlanet(id);

  const mode = req.body?.mode === 'add' ? 'add' : 'set';
  const updates = {};
  for (const r of RESOURCES) {
    if (req.body?.[r] === undefined || req.body[r] === '') continue;
    const v = Number(req.body[r]);
    if (!Number.isFinite(v)) continue;
    updates[r] = mode === 'add'
      ? Math.max(0, planet[r] + v)
      : Math.max(0, Math.min(1e15, v));
  }
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Keine Werte angegeben.' });

  const sets = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE planets SET ${sets} WHERE id = ?`).run(...Object.values(updates), id);
  logAdmin(req.user, 'resources', `Planet ${id}`, `${mode}: ${JSON.stringify(updates)}`);
  recomputeUser(planet.user_id);
  res.json({ ok: true, planet: planetSnapshot(id) });
});

/** Gebäudestufe, Schiffs- oder Verteidigungsanzahl direkt setzen. */
router.post('/planets/:id/units', (req, res) => {
  const id = Number(req.params.id);
  const planet = db.prepare('SELECT * FROM planets WHERE id = ?').get(id);
  if (!planet) return res.status(404).json({ error: 'Planet nicht gefunden.' });

  const kind = String(req.body?.kind || '');
  const key = String(req.body?.key || '');
  const value = clampInt(req.body?.value, 0, 1e9);

  if (kind === 'building') {
    if (!BUILDINGS[key]) return res.status(400).json({ error: 'Unbekanntes Gebäude.' });
    setLevel('buildings', 'level', 'planet_id', id, key, Math.min(value, 100));
  } else if (kind === 'ship') {
    if (!SHIPS[key]) return res.status(400).json({ error: 'Unbekannter Schiffstyp.' });
    setLevel('ships', 'count', 'planet_id', id, key, value);
  } else if (kind === 'defense') {
    if (!DEFENSES[key]) return res.status(400).json({ error: 'Unbekannte Verteidigungsanlage.' });
    setLevel('defenses', 'count', 'planet_id', id, key, value);
  } else {
    return res.status(400).json({ error: 'Unbekannte Kategorie.' });
  }
  logAdmin(req.user, 'units', `Planet ${id}`, `${kind}.${key} = ${value}`);
  recomputeUser(planet.user_id);
  res.json({ ok: true, planet: planetSnapshot(id) });
});

/**
 * Gesamtpunkte oder Rang eines Spielers anpassen.
 *
 * Der Rang ergibt sich aus der Punktzahl – er lässt sich nicht unabhängig
 * davon festlegen, ohne die Rangliste widersprüchlich zu machen. Wird ein
 * Zielrang angegeben, errechnet der Server die dafür nötige Punktzahl.
 */
router.post('/users/:id/points', (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });

  const b = req.body || {};
  let ziel;

  if (b.reset) {
    const nachher = clearPointsBonus(id);
    logAdmin(req.user, 'points_reset', user.username, '');
    return res.json({ ok: true, points: Math.floor(nachher.points), rank: userRank(id), bonus: 0 });
  }

  if (b.rank !== undefined && b.rank !== '') {
    const rang = Math.max(1, Math.floor(Number(b.rank) || 1));
    ziel = pointsForRank(id, rang);
  } else if (b.points !== undefined && b.points !== '') {
    ziel = Number(b.points);
  } else {
    return res.status(400).json({ error: 'Es wurde weder eine Punktzahl noch ein Rang angegeben.' });
  }

  if (!Number.isFinite(ziel) || ziel < 0 || ziel > 1e12)
    return res.status(400).json({ error: 'Ungültiger Wert. Zulässig sind 0 bis 1.000.000.000.000 Punkte.' });

  const r = setPoints(id, ziel);
  const rang = userRank(id);
  logAdmin(req.user, 'points', user.username,
    `Ziel ${Math.floor(ziel)} (Zuschlag ${Math.round(r.bonus)}) → Rang ${rang}`);
  res.json({ ok: true, points: Math.floor(r.points), rank: rang, bonus: Math.round(r.bonus) });
});

router.post('/users/:id/research', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(id))
    return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
  const key = String(req.body?.key || '');
  if (!RESEARCH[key]) return res.status(400).json({ error: 'Unbekannte Technologie.' });
  const value = clampInt(req.body?.value, 0, 100);

  setLevel('research', 'level', 'user_id', id, key, value);
  logAdmin(req.user, 'research', id, `${key} = ${value}`);
  recomputeUser(id);
  res.json({ ok: true, research: getResearch(id) });
});

/* ------------------------------------------------------------------ */
/* Planetenverwaltung                                                  */
/* ------------------------------------------------------------------ */

router.patch('/planets/:id', (req, res) => {
  const id = Number(req.params.id);
  const planet = db.prepare('SELECT * FROM planets WHERE id = ?').get(id);
  if (!planet) return res.status(404).json({ error: 'Planet nicht gefunden.' });

  const fields = [], values = [];
  if (typeof req.body?.name === 'string' && req.body.name.trim()) {
    fields.push('name = ?'); values.push(req.body.name.trim().slice(0, 32));
  }
  if (req.body?.fieldsMax !== undefined) {
    fields.push('fields_max = ?'); values.push(clampInt(req.body.fieldsMax, 1, 1000));
  }
  if (req.body?.tempMax !== undefined) {
    fields.push('temp_max = ?'); values.push(clampInt(req.body.tempMax, -200, 300));
  }
  if (req.body?.ownerId !== undefined) {
    const owner = db.prepare('SELECT id FROM users WHERE id = ?').get(Number(req.body.ownerId));
    if (!owner) return res.status(400).json({ error: 'Neuer Besitzer nicht gefunden.' });
    fields.push('user_id = ?', 'is_homeworld = 0'); values.push(owner.id);
  }
  if (!fields.length) return res.status(400).json({ error: 'Keine Änderungen angegeben.' });

  db.prepare(`UPDATE planets SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);
  logAdmin(req.user, 'planet_update', `Planet ${id}`, JSON.stringify(req.body));
  recomputeUser(planet.user_id);
  if (req.body?.ownerId) recomputeUser(Number(req.body.ownerId));
  res.json({ ok: true, planet: planetSnapshot(id) });
});

router.delete('/planets/:id', (req, res) => {
  const id = Number(req.params.id);
  const planet = db.prepare('SELECT * FROM planets WHERE id = ?').get(id);
  if (!planet) return res.status(404).json({ error: 'Planet nicht gefunden.' });
  db.prepare('DELETE FROM planets WHERE id = ?').run(id);
  logAdmin(req.user, 'planet_delete', `Planet ${id}`, `${planet.quadrant}:${planet.system}:${planet.position}`);
  recomputeUser(planet.user_id);
  res.json({ ok: true });
});

router.post('/planets', (req, res) => {
  const userId = Number(req.body?.userId || 0);
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(userId))
    return res.status(404).json({ error: 'Benutzer nicht gefunden.' });

  let coords = req.body?.coords;
  if (coords?.q && coords?.s && coords?.p) {
    coords = { q: clampInt(coords.q, 1, config.universe.quadrants), s: clampInt(coords.s, 1, config.universe.systems), p: clampInt(coords.p, 1, config.universe.slots) };
  } else {
    coords = findHomeworldSlot();
  }
  if (!coords) return res.status(400).json({ error: 'Kein freier Platz gefunden.' });

  const planet = createPlanet(userId, coords, { homeworld: !!req.body?.homeworld, name: req.body?.name });
  if (!planet) return res.status(400).json({ error: 'Diese Koordinaten sind bereits belegt.' });
  logAdmin(req.user, 'planet_create', `User ${userId}`, `${coords.q}:${coords.s}:${coords.p}`);
  recomputeUser(userId);
  res.json({ ok: true, planet: planetSnapshot(planet.id) });
});

router.post('/planets/:id/queue/clear', (req, res) => {
  const id = Number(req.params.id);
  const n = db.prepare('DELETE FROM build_queue WHERE planet_id = ?').run(id).changes;
  logAdmin(req.user, 'queue_clear', `Planet ${id}`, `${n} Aufträge`);
  res.json({ ok: true, removed: n });
});

/* ------------------------------------------------------------------ */
/* Flotten und Trümmerfelder                                           */
/* ------------------------------------------------------------------ */

router.get('/fleets', (req, res) => {
  const rows = db
    .prepare(
      `SELECT f.*, u.username FROM fleets f JOIN users u ON u.id = f.user_id
       WHERE f.processed = 0 ORDER BY f.arrive_at ASC LIMIT 200`
    ).all();
  res.json({
    fleets: rows.map((f) => ({
      id: f.id, user: f.username, userId: f.user_id, mission: f.mission,
      missionName: MISSIONS[f.mission]?.name || f.mission, state: f.state,
      origin: { q: f.origin_q, s: f.origin_s, p: f.origin_p },
      target: { q: f.target_q, s: f.target_s, p: f.target_p },
      ships: JSON.parse(f.ships_json || '{}'), cargo: JSON.parse(f.cargo_json || '{}'),
      arriveAt: f.arrive_at, returnAt: f.return_at,
    })),
  });
});

router.delete('/fleets/:id', (req, res) => {
  const id = Number(req.params.id);
  const fleet = db.prepare('SELECT * FROM fleets WHERE id = ?').get(id);
  if (!fleet) return res.status(404).json({ error: 'Flotte nicht gefunden.' });

  if (req.body?.returnHome !== false && fleet.origin_planet_id) {
    db.prepare("UPDATE fleets SET state = 'returning', return_at = ?, hold_until = NULL WHERE id = ?")
      .run(now() + 1000, id);
    logAdmin(req.user, 'fleet_recall', `Flotte ${id}`, '');
    return res.json({ ok: true, recalled: true });
  }
  db.prepare('DELETE FROM fleets WHERE id = ?').run(id);
  logAdmin(req.user, 'fleet_delete', `Flotte ${id}`, '');
  recomputeUser(fleet.user_id);
  res.json({ ok: true, deleted: true });
});

router.post('/debris', (req, res) => {
  const coords = {
    q: clampInt(req.body?.q, 1, config.universe.quadrants),
    s: clampInt(req.body?.s, 1, config.universe.systems),
    p: clampInt(req.body?.p, 1, config.universe.slots),
  };
  addDebris(coords, Number(req.body?.duranium) || 0, Number(req.body?.dilithium) || 0);
  logAdmin(req.user, 'debris', `${coords.q}:${coords.s}:${coords.p}`, JSON.stringify(req.body));
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Servereinstellungen, Rundmail, Protokoll                            */
/* ------------------------------------------------------------------ */

router.post('/settings', (req, res) => {
  if (typeof req.body?.motd === 'string') setSetting('motd', req.body.motd.slice(0, 500));
  if (req.body?.registrationOpen !== undefined)
    setSetting('registration_open', req.body.registrationOpen ? '1' : '0');
  logAdmin(req.user, 'settings', '', JSON.stringify(req.body));
  res.json({
    ok: true,
    settings: { motd: getSetting('motd', ''), registrationOpen: getSetting('registration_open', '1') === '1' },
  });
});

/**
 * Spielparameter im laufenden Betrieb ändern (Geschwindigkeiten, Startausstattung).
 * Die Werte wirken sofort für alle künftigen Berechnungen; bereits erteilte
 * Bauaufträge und gestartete Flotten behalten ihre beim Start berechneten Zeiten.
 */
router.post('/tunables', (req, res) => {
  const changes = [];
  const errors = [];
  for (const [key, value] of Object.entries(req.body || {})) {
    if (value === '' || value === null || value === undefined) continue;
    const result = setTunable(key, value);
    if (result.error) errors.push(result.error);
    else if (result.previous !== result.value)
      changes.push(`${result.label}: ${result.previous} → ${result.value}`);
  }
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });
  if (changes.length) logAdmin(req.user, 'tunables', '', changes.join('; '));
  res.json({ ok: true, changes, tunables: getTunables() });
});

router.get('/tunables', (req, res) => {
  res.json({ tunables: getTunables() });
});

router.post('/broadcast', (req, res) => {
  const subject = String(req.body?.subject || 'Mitteilung der Admiralität').slice(0, 120);
  const body = String(req.body?.body || '').slice(0, 4000);
  if (!body.trim()) return res.status(400).json({ error: 'Die Nachricht ist leer.' });
  const count = broadcast({ subject, body, fromUserId: req.user.id, onlyActive: !!req.body?.onlyActive });
  logAdmin(req.user, 'broadcast', `${count} Empfänger`, subject);
  res.json({ ok: true, recipients: count });
});

router.post('/recompute', (req, res) => {
  const n = recomputeAll();
  logAdmin(req.user, 'recompute', `${n} Spieler`, '');
  res.json({ ok: true, users: n });
});

router.get('/log', (req, res) => {
  const page = Math.max(0, Math.floor(Number(req.query.page) || 0));
  const limit = 50;
  res.json({
    log: db.prepare('SELECT * FROM admin_log ORDER BY id DESC LIMIT ? OFFSET ?').all(limit, page * limit),
    total: db.prepare('SELECT COUNT(*) AS c FROM admin_log').get().c,
    page,
  });
});

/* ------------------------------------------------------------------ */
/* Änderungsprotokoll                                                  */
/* ------------------------------------------------------------------ */

/** Versionsnummer von Hand setzen oder auf den Wert der package.json zurücksetzen. */
router.post('/version', (req, res) => {
  const raw = String(req.body?.version ?? '').trim();
  if (raw && !/^[\w.+-]{1,40}$/.test(raw))
    return res.status(400).json({ error: 'Erlaubt sind Buchstaben, Ziffern sowie . _ + - (max. 40 Zeichen).' });

  const previous = getVersion();
  const applied = setVersionOverride(raw);
  if (raw) setSetting('app_version', applied);
  else db.prepare("DELETE FROM settings WHERE key = 'app_version'").run();

  // Für die neue Version gleich einen Eintrag anlegen, damit Spieler den
  // Hinweis auf die Aktualisierung erhalten.
  ensureCurrentEntry();

  logAdmin(req.user, 'version', `${previous} → ${applied}`, raw ? 'manuell' : 'zurückgesetzt');
  res.json({
    ok: true, version: applied, packageVersion: getPackageVersion(),
    manual: Boolean(raw),
    entries: listEntries({ includeUnpublished: true, limit: 100 }),
  });
});

router.get('/changelog', (req, res) => {
  res.json({
    entries: listEntries({ includeUnpublished: true, limit: 100 }),
    currentVersion: getVersion(),
    packageVersion: getPackageVersion(),
    versionIsManual: getVersion() !== getPackageVersion(),
  });
});

/** Eintrag anlegen oder überschreiben (Version dient als Schlüssel). */
router.post('/changelog', (req, res) => {
  const version = String(req.body?.version || '').trim().slice(0, 40);
  if (!version) return res.status(400).json({ error: 'Eine Versionsangabe ist erforderlich.' });
  const title = String(req.body?.title || `Version ${version}`).slice(0, 160);
  const body = String(req.body?.body || '').slice(0, 20000);
  const published = req.body?.published === false ? 0 : 1;
  const t = now();

  db.prepare(
    `INSERT INTO changelog (version, title, body, published, auto, created_at, updated_at)
     VALUES (?,?,?,?,0,?,?)
     ON CONFLICT(version) DO UPDATE SET
       title = excluded.title, body = excluded.body,
       published = excluded.published, auto = 0, updated_at = excluded.updated_at`
  ).run(version, title, body, published, t, t);

  logAdmin(req.user, 'changelog', version, title);
  res.json({ ok: true, entries: listEntries({ includeUnpublished: true, limit: 100 }) });
});

router.delete('/changelog/:id', (req, res) => {
  const row = db.prepare('SELECT version FROM changelog WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });
  db.prepare('DELETE FROM changelog WHERE id = ?').run(Number(req.params.id));
  logAdmin(req.user, 'changelog_delete', row.version, '');
  res.json({ ok: true, entries: listEntries({ includeUnpublished: true, limit: 100 }) });
});

/**
 * Eintrag der laufenden Version aus der Git-Historie neu erzeugen.
 * Überschreibt einen von Hand bearbeiteten Text – daher nur auf Anforderung.
 */
router.post('/changelog/regenerate', (req, res) => {
  db.prepare('DELETE FROM changelog WHERE version = ?').run(getVersion());
  const entry = ensureCurrentEntry();
  logAdmin(req.user, 'changelog_regenerate', getVersion(), '');
  res.json({ ok: true, entry, entries: listEntries({ includeUnpublished: true, limit: 100 }) });
});

/**
 * Den Hinweis für alle Spieler zurücksetzen. Nötig, wenn der Text einer bereits
 * ausgelieferten Version nachträglich überarbeitet wurde – der Hinweis hängt
 * sonst an der Versionsnummer und erschiene erst bei der nächsten Version.
 */
router.post('/changelog/reshow', (req, res) => {
  const n = db.prepare("UPDATE users SET changelog_seen = ''").run().changes;
  logAdmin(req.user, 'changelog_reshow', `${n} Spieler`, '');
  res.json({ ok: true, users: n });
});

/** Katalog für die Auswahlfelder im Adminbereich. */
router.get('/catalog', (req, res) => {
  const names = (defs) => Object.entries(defs).map(([key, d]) => ({ key, name: d.name }));
  res.json({
    buildings: names(BUILDINGS), research: names(RESEARCH),
    ships: names(SHIPS), defenses: names(DEFENSES),
    factions: Object.entries(FACTIONS).map(([key, f]) => ({ key, name: f.short })),
  });
});
