import express from 'express';
import { db, now, logAdmin } from '../db.js';
import { authenticate, requireModerator, isModerator } from '../auth.js';

export const router = express.Router();
router.use(authenticate);

const MAX_LENGTH = 400;
const HISTORY = 80;
const RATE_WINDOW_MS = 30000;
const RATE_MAX = 8;          // Nachrichten je 30 Sekunden
const MIN_GAP_MS = 1200;     // Mindestabstand zwischen zwei Nachrichten

/* ------------------------------------------------------------------ */
/* Kanäle                                                              */
/* ------------------------------------------------------------------ */

/** Zugelassene Kanäle für diesen Spieler ermitteln. */
function channelsFor(userId) {
  const list = [{ key: 'global', name: 'Allgemein' }];
  const alliance = db
    .prepare(
      `SELECT a.id, a.tag, a.name FROM alliance_members m
       JOIN alliances a ON a.id = m.alliance_id WHERE m.user_id = ?`
    )
    .get(userId);
  if (alliance) list.push({ key: `alliance:${alliance.id}`, name: `[${alliance.tag}] ${alliance.name}` });
  return list;
}

const mayUse = (userId, channel) => channelsFor(userId).some((c) => c.key === channel);

/* ------------------------------------------------------------------ */
/* Stummschaltung                                                      */
/* ------------------------------------------------------------------ */

/** Aktive Stummschaltung oder null. Abgelaufene Einträge werden entfernt. */
function activeMute(userId) {
  const m = db.prepare('SELECT * FROM chat_mutes WHERE user_id = ?').get(userId);
  if (!m) return null;
  if (m.until && m.until <= now()) {
    db.prepare('DELETE FROM chat_mutes WHERE user_id = ?').run(userId);
    return null;
  }
  return m;
}

const muteText = (m) =>
  m.until
    ? `Sie sind bis ${new Date(m.until).toLocaleString('de-DE')} vom Chat ausgeschlossen.`
    : 'Sie sind dauerhaft vom Chat ausgeschlossen.';

/* ------------------------------------------------------------------ */
/* Lesen                                                               */
/* ------------------------------------------------------------------ */

router.get('/', (req, res) => {
  const channel = String(req.query.channel || 'global');
  if (!mayUse(req.user.id, channel)) return res.status(403).json({ error: 'Kein Zugriff auf diesen Kanal.' });

  const since = Math.max(0, Math.floor(Number(req.query.since) || 0));
  const rows = since
    ? db.prepare('SELECT * FROM chat_messages WHERE channel = ? AND id > ? ORDER BY id ASC LIMIT ?')
        .all(channel, since, HISTORY)
    : db.prepare('SELECT * FROM chat_messages WHERE channel = ? ORDER BY id DESC LIMIT ?')
        .all(channel, HISTORY).reverse();

  const mod = isModerator(req.user);
  const mute = activeMute(req.user.id);

  res.json({
    channel,
    channels: channelsFor(req.user.id),
    canModerate: mod,
    muted: mute ? { until: mute.until, reason: mute.reason, message: muteText(mute) } : null,
    messages: rows.map((m) => ({
      id: m.id,
      userId: m.user_id,
      username: m.username,
      // Gelöschte Nachrichten bleiben als Platzhalter stehen, damit der
      // Gesprächsverlauf nachvollziehbar bleibt. Moderatoren sehen den Text.
      text: m.deleted ? (mod ? m.text : null) : m.text,
      deleted: !!m.deleted,
      deletedBy: m.deleted ? m.deleted_by : null,
      role: m.user_id
        ? db.prepare('SELECT role FROM users WHERE id = ?').get(m.user_id)?.role || 'user'
        : 'user',
      own: m.user_id === req.user.id,
      createdAt: m.created_at,
    })),
    serverTime: now(),
  });
});

/* ------------------------------------------------------------------ */
/* Schreiben                                                           */
/* ------------------------------------------------------------------ */

router.post('/', (req, res) => {
  const channel = String(req.body?.channel || 'global');
  if (!mayUse(req.user.id, channel)) return res.status(403).json({ error: 'Kein Zugriff auf diesen Kanal.' });

  const mute = activeMute(req.user.id);
  if (mute) return res.status(403).json({ error: muteText(mute), muted: true });

  const text = String(req.body?.text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_LENGTH);
  if (!text) return res.status(400).json({ error: 'Die Nachricht ist leer.' });

  // Spamschutz: Mindestabstand und Höchstzahl je Zeitfenster
  const last = db
    .prepare('SELECT created_at FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT 1')
    .get(req.user.id);
  if (last && now() - last.created_at < MIN_GAP_MS)
    return res.status(429).json({ error: 'Bitte etwas langsamer schreiben.' });

  const recent = db
    .prepare('SELECT COUNT(*) AS c FROM chat_messages WHERE user_id = ? AND created_at > ?')
    .get(req.user.id, now() - RATE_WINDOW_MS).c;
  if (recent >= RATE_MAX)
    return res.status(429).json({ error: 'Zu viele Nachrichten in kurzer Zeit. Bitte kurz warten.' });

  const info = db
    .prepare('INSERT INTO chat_messages (channel, user_id, username, text, created_at) VALUES (?,?,?,?,?)')
    .run(channel, req.user.id, req.user.username, text, now());

  res.json({ ok: true, id: info.lastInsertRowid });
});

/* ------------------------------------------------------------------ */
/* Moderation                                                          */
/* ------------------------------------------------------------------ */

router.delete('/:id', requireModerator, (req, res) => {
  const id = Number(req.params.id);
  const msg = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id);
  if (!msg) return res.status(404).json({ error: 'Nachricht nicht gefunden.' });
  if (msg.deleted) return res.json({ ok: true });

  db.prepare('UPDATE chat_messages SET deleted = 1, deleted_by = ?, deleted_at = ? WHERE id = ?')
    .run(req.user.username, now(), id);
  logAdmin(req.user, 'chat_delete', msg.username, msg.text.slice(0, 120));
  res.json({ ok: true });
});

/** Nachricht wiederherstellen – für versehentliche Löschungen. */
router.post('/:id/restore', requireModerator, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('UPDATE chat_messages SET deleted = 0, deleted_by = NULL, deleted_at = NULL WHERE id = ?').run(id);
  logAdmin(req.user, 'chat_restore', String(id), '');
  res.json({ ok: true });
});

router.get('/mutes', requireModerator, (req, res) => {
  const rows = db
    .prepare(
      `SELECT m.*, u.username FROM chat_mutes m JOIN users u ON u.id = m.user_id
       ORDER BY m.created_at DESC`
    )
    .all();
  res.json({
    mutes: rows.map((m) => ({
      userId: m.user_id, username: m.username, until: m.until,
      reason: m.reason, byName: m.by_name, createdAt: m.created_at,
      expired: !!(m.until && m.until <= now()),
    })),
  });
});

router.post('/mute', requireModerator, (req, res) => {
  const userId = Number(req.body?.userId || 0);
  const target = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(userId);
  if (!target) return res.status(404).json({ error: 'Spieler nicht gefunden.' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'Sich selbst kann man nicht stummschalten.' });
  if (target.role === 'admin')
    return res.status(403).json({ error: 'Administratoren können nicht stummgeschaltet werden.' });
  if (target.role === 'moderator' && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Nur Administratoren können Moderatoren stummschalten.' });

  const minutes = Math.max(0, Math.min(60 * 24 * 365, Math.floor(Number(req.body?.minutes) || 0)));
  const until = minutes > 0 ? now() + minutes * 60000 : 0;
  const reason = String(req.body?.reason || '').slice(0, 300);

  db.prepare(
    `INSERT INTO chat_mutes (user_id, until, reason, by_name, created_at) VALUES (?,?,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET
       until = excluded.until, reason = excluded.reason,
       by_name = excluded.by_name, created_at = excluded.created_at`
  ).run(target.id, until, reason, req.user.username, now());

  logAdmin(req.user, 'chat_mute', target.username, minutes ? `${minutes} Min.: ${reason}` : `dauerhaft: ${reason}`);
  res.json({ ok: true, until });
});

router.delete('/mute/:userId', requireModerator, (req, res) => {
  const userId = Number(req.params.userId);
  const target = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
  db.prepare('DELETE FROM chat_mutes WHERE user_id = ?').run(userId);
  logAdmin(req.user, 'chat_unmute', target?.username || userId, '');
  res.json({ ok: true });
});
