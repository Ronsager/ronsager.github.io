import express from 'express';
import { db, now } from '../db.js';
import { authenticate } from '../auth.js';
import { sendMessage } from '../engine/messages.js';

export const router = express.Router();
router.use(authenticate);

const membership = (userId) =>
  db.prepare(
    `SELECT m.*, a.tag, a.name, a.description, a.founder_id
     FROM alliance_members m JOIN alliances a ON a.id = m.alliance_id WHERE m.user_id = ?`
  ).get(userId);

const RANKS = { leader: 3, officer: 2, member: 1 };
const canManage = (m) => m && RANKS[m.rank] >= 2;

function allianceDetail(allianceId, viewerId) {
  const alliance = db.prepare('SELECT * FROM alliances WHERE id = ?').get(allianceId);
  if (!alliance) return null;
  const members = db
    .prepare(
      `SELECT u.id, u.username, u.faction, u.last_seen, m.rank, m.joined_at,
              COALESCE(s.points,0) AS points
       FROM alliance_members m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN stats s ON s.user_id = u.id
       WHERE m.alliance_id = ? ORDER BY points DESC`
    )
    .all(allianceId);
  const viewer = membership(viewerId);
  const isMember = viewer?.alliance_id === allianceId;

  return {
    id: alliance.id, tag: alliance.tag, name: alliance.name,
    description: alliance.description, founderId: alliance.founder_id,
    createdAt: alliance.created_at,
    points: Math.floor(members.reduce((a, m) => a + m.points, 0)),
    members: members.map((m) => ({
      id: m.id, username: m.username, faction: m.faction, rank: m.rank,
      points: Math.floor(m.points), joinedAt: m.joined_at,
      lastSeen: isMember ? m.last_seen : null,
    })),
    myRank: isMember ? viewer.rank : null,
    applications: canManage(viewer) && isMember
      ? db.prepare(
          `SELECT ap.id, ap.text, ap.created_at, u.id AS user_id, u.username, COALESCE(s.points,0) AS points
           FROM alliance_applications ap JOIN users u ON u.id = ap.user_id
           LEFT JOIN stats s ON s.user_id = u.id WHERE ap.alliance_id = ?`
        ).all(allianceId)
      : [],
  };
}

router.get('/', (req, res) => {
  const mine = membership(req.user.id);
  const list = db
    .prepare(
      `SELECT a.id, a.tag, a.name, a.created_at,
              (SELECT COUNT(*) FROM alliance_members m WHERE m.alliance_id = a.id) AS members,
              (SELECT COALESCE(SUM(s.points),0) FROM alliance_members m
                 LEFT JOIN stats s ON s.user_id = m.user_id WHERE m.alliance_id = a.id) AS points
       FROM alliances a ORDER BY points DESC LIMIT 100`
    )
    .all()
    .map((a, i) => ({ rank: i + 1, ...a, points: Math.floor(a.points) }));

  res.json({
    own: mine ? allianceDetail(mine.alliance_id, req.user.id) : null,
    alliances: list,
    application: db
      .prepare(
        `SELECT ap.id, a.tag, a.name FROM alliance_applications ap
         JOIN alliances a ON a.id = ap.alliance_id WHERE ap.user_id = ?`
      )
      .all(req.user.id),
  });
});

router.get('/:id', (req, res) => {
  const detail = allianceDetail(Number(req.params.id), req.user.id);
  if (!detail) return res.status(404).json({ error: 'Flottenverband nicht gefunden.' });
  res.json(detail);
});

router.post('/create', (req, res) => {
  if (membership(req.user.id)) return res.status(400).json({ error: 'Sie sind bereits Mitglied eines Verbandes.' });
  const tag = String(req.body?.tag || '').trim().slice(0, 8);
  const name = String(req.body?.name || '').trim().slice(0, 40);
  if (tag.length < 2 || name.length < 3)
    return res.status(400).json({ error: 'Kürzel (2–8 Zeichen) und Name (min. 3 Zeichen) sind erforderlich.' });
  if (db.prepare('SELECT id FROM alliances WHERE tag = ? OR name = ?').get(tag, name))
    return res.status(400).json({ error: 'Kürzel oder Name ist bereits vergeben.' });

  const t = now();
  let id;
  db.transaction(() => {
    id = db.prepare('INSERT INTO alliances (tag, name, founder_id, created_at) VALUES (?,?,?,?)')
      .run(tag, name, req.user.id, t).lastInsertRowid;
    db.prepare('INSERT INTO alliance_members (alliance_id, user_id, rank, joined_at) VALUES (?,?,?,?)')
      .run(id, req.user.id, 'leader', t);
    db.prepare('DELETE FROM alliance_applications WHERE user_id = ?').run(req.user.id);
  })();
  res.json({ ok: true, alliance: allianceDetail(id, req.user.id) });
});

router.post('/apply', (req, res) => {
  if (membership(req.user.id)) return res.status(400).json({ error: 'Sie sind bereits Mitglied eines Verbandes.' });
  const allianceId = Number(req.body?.allianceId || 0);
  const alliance = db.prepare('SELECT * FROM alliances WHERE id = ?').get(allianceId);
  if (!alliance) return res.status(404).json({ error: 'Flottenverband nicht gefunden.' });

  db.prepare(
    `INSERT INTO alliance_applications (alliance_id, user_id, text, created_at) VALUES (?,?,?,?)
     ON CONFLICT(alliance_id, user_id) DO UPDATE SET text = excluded.text, created_at = excluded.created_at`
  ).run(allianceId, req.user.id, String(req.body?.text || '').slice(0, 1000), now());

  const leaders = db
    .prepare("SELECT user_id FROM alliance_members WHERE alliance_id = ? AND rank IN ('leader','officer')")
    .all(allianceId);
  for (const l of leaders) {
    sendMessage(l.user_id, {
      type: 'alliance', subject: `Aufnahmegesuch: ${req.user.username}`,
      body: `${req.user.username} bewirbt sich um Aufnahme in ${alliance.name}.`,
      fromUserId: req.user.id,
    });
  }
  res.json({ ok: true });
});

router.post('/application/:id', (req, res) => {
  const mine = membership(req.user.id);
  if (!canManage(mine)) return res.status(403).json({ error: 'Keine Berechtigung.' });
  const app = db.prepare('SELECT * FROM alliance_applications WHERE id = ?').get(Number(req.params.id));
  if (!app || app.alliance_id !== mine.alliance_id)
    return res.status(404).json({ error: 'Gesuch nicht gefunden.' });

  const accept = !!req.body?.accept;
  db.transaction(() => {
    db.prepare('DELETE FROM alliance_applications WHERE id = ?').run(app.id);
    if (accept && !membership(app.user_id)) {
      db.prepare('INSERT INTO alliance_members (alliance_id, user_id, rank, joined_at) VALUES (?,?,?,?)')
        .run(mine.alliance_id, app.user_id, 'member', now());
    }
  })();

  sendMessage(app.user_id, {
    type: 'alliance',
    subject: accept ? `Aufnahme in ${mine.name}` : `Absage von ${mine.name}`,
    body: accept
      ? `Willkommen an Bord! Sie sind nun Mitglied von ${mine.name}.`
      : `Ihr Aufnahmegesuch bei ${mine.name} wurde abgelehnt.`,
    fromUserId: req.user.id,
  });
  res.json({ ok: true, alliance: allianceDetail(mine.alliance_id, req.user.id) });
});

router.post('/leave', (req, res) => {
  const mine = membership(req.user.id);
  if (!mine) return res.status(400).json({ error: 'Sie sind in keinem Verband.' });
  const others = db.prepare('SELECT COUNT(*) AS c FROM alliance_members WHERE alliance_id = ?').get(mine.alliance_id).c;
  if (mine.rank === 'leader' && others > 1)
    return res.status(400).json({ error: 'Übertragen Sie zuerst die Führung an ein anderes Mitglied.' });

  db.transaction(() => {
    db.prepare('DELETE FROM alliance_members WHERE user_id = ?').run(req.user.id);
    if (others <= 1) db.prepare('DELETE FROM alliances WHERE id = ?').run(mine.alliance_id);
  })();
  res.json({ ok: true });
});

router.post('/member/:id', (req, res) => {
  const mine = membership(req.user.id);
  if (!canManage(mine)) return res.status(403).json({ error: 'Keine Berechtigung.' });
  const targetId = Number(req.params.id);
  const target = db.prepare('SELECT * FROM alliance_members WHERE user_id = ?').get(targetId);
  if (!target || target.alliance_id !== mine.alliance_id)
    return res.status(404).json({ error: 'Mitglied nicht gefunden.' });
  if (targetId === req.user.id) return res.status(400).json({ error: 'Nicht auf sich selbst anwendbar.' });

  const action = String(req.body?.action || '');
  if (action === 'kick') {
    if (RANKS[target.rank] >= RANKS[mine.rank]) return res.status(403).json({ error: 'Keine Berechtigung.' });
    db.prepare('DELETE FROM alliance_members WHERE user_id = ?').run(targetId);
    sendMessage(targetId, { type: 'alliance', subject: `Ausschluss aus ${mine.name}`, body: 'Sie wurden aus dem Flottenverband entfernt.' });
  } else if (action === 'promote' || action === 'demote') {
    if (mine.rank !== 'leader') return res.status(403).json({ error: 'Nur die Führung kann Ränge vergeben.' });
    const rank = action === 'promote' ? 'officer' : 'member';
    db.prepare('UPDATE alliance_members SET rank = ? WHERE user_id = ?').run(rank, targetId);
  } else if (action === 'transfer') {
    if (mine.rank !== 'leader') return res.status(403).json({ error: 'Nur die Führung kann übertragen werden.' });
    db.transaction(() => {
      db.prepare('UPDATE alliance_members SET rank = ? WHERE user_id = ?').run('leader', targetId);
      db.prepare('UPDATE alliance_members SET rank = ? WHERE user_id = ?').run('officer', req.user.id);
    })();
  } else {
    return res.status(400).json({ error: 'Unbekannte Aktion.' });
  }
  res.json({ ok: true, alliance: allianceDetail(mine.alliance_id, req.user.id) });
});

router.post('/description', (req, res) => {
  const mine = membership(req.user.id);
  if (!canManage(mine)) return res.status(403).json({ error: 'Keine Berechtigung.' });
  db.prepare('UPDATE alliances SET description = ? WHERE id = ?')
    .run(String(req.body?.description || '').slice(0, 4000), mine.alliance_id);
  res.json({ ok: true });
});
