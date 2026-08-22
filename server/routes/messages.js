import express from 'express';
import { db, now } from '../db.js';
import { authenticate } from '../auth.js';
import { sendMessage, unreadCount } from '../engine/messages.js';

export const router = express.Router();
router.use(authenticate);

const TYPES = ['combat', 'espionage', 'transport', 'system', 'player', 'admin', 'alliance'];

router.get('/', (req, res) => {
  const type = TYPES.includes(String(req.query.type)) ? String(req.query.type) : null;
  const page = Math.max(0, Math.floor(Number(req.query.page) || 0));
  const limit = 25;

  const where = type ? 'user_id = ? AND type = ?' : 'user_id = ?';
  const params = type ? [req.user.id, type] : [req.user.id];

  const rows = db
    .prepare(`SELECT * FROM messages WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, page * limit);
  const total = db.prepare(`SELECT COUNT(*) AS c FROM messages WHERE ${where}`).get(...params).c;

  const counts = {};
  for (const t of TYPES) {
    counts[t] = db.prepare('SELECT COUNT(*) AS c FROM messages WHERE user_id = ? AND type = ? AND read = 0')
      .get(req.user.id, t).c;
  }

  res.json({
    messages: rows.map((m) => ({
      id: m.id, type: m.type, subject: m.subject, body: m.body,
      data: m.data_json ? JSON.parse(m.data_json) : null,
      from: m.from_user_id
        ? db.prepare('SELECT id, username FROM users WHERE id = ?').get(m.from_user_id)
        : null,
      read: !!m.read, createdAt: m.created_at,
    })),
    total, page, pages: Math.ceil(total / limit),
    unread: unreadCount(req.user.id), counts,
  });
});

router.post('/read', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : null;
  if (ids && ids.length) {
    const stmt = db.prepare('UPDATE messages SET read = 1 WHERE id = ? AND user_id = ?');
    const tx = db.transaction(() => { for (const id of ids) stmt.run(id, req.user.id); });
    tx();
  } else {
    db.prepare('UPDATE messages SET read = 1 WHERE user_id = ?').run(req.user.id);
  }
  res.json({ ok: true, unread: unreadCount(req.user.id) });
});

router.post('/delete', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ error: 'Keine Nachrichten ausgewählt.' });
  const stmt = db.prepare('DELETE FROM messages WHERE id = ? AND user_id = ?');
  const tx = db.transaction(() => { for (const id of ids) stmt.run(id, req.user.id); });
  tx();
  res.json({ ok: true });
});

/** Spielernachricht verschicken. */
router.post('/send', (req, res) => {
  const toId = Number(req.body?.to || 0);
  const subject = String(req.body?.subject || '').trim().slice(0, 120) || 'Ohne Betreff';
  const body = String(req.body?.body || '').trim().slice(0, 4000);
  if (!body) return res.status(400).json({ error: 'Die Nachricht ist leer.' });

  const target = db.prepare('SELECT id, username FROM users WHERE id = ?').get(toId);
  if (!target) return res.status(404).json({ error: 'Empfänger unbekannt.' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'Nachrichten an sich selbst sind nicht möglich.' });

  // Einfacher Spamschutz: max. 20 Nachrichten pro Stunde
  const recent = db
    .prepare("SELECT COUNT(*) AS c FROM messages WHERE from_user_id = ? AND type = 'player' AND created_at > ?")
    .get(req.user.id, now() - 3600000).c;
  if (recent >= 20) return res.status(429).json({ error: 'Zu viele Nachrichten. Bitte später erneut versuchen.' });

  sendMessage(target.id, { type: 'player', subject, body, fromUserId: req.user.id });
  res.json({ ok: true });
});
