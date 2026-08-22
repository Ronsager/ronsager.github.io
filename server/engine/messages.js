import { db, now } from '../db.js';

export function sendMessage(userId, { type, subject, body, data = null, fromUserId = null }) {
  if (!userId) return null;
  const info = db
    .prepare(
      'INSERT INTO messages (user_id, from_user_id, type, subject, body, data_json, created_at) VALUES (?,?,?,?,?,?,?)'
    )
    .run(userId, fromUserId, type, subject, body, data ? JSON.stringify(data) : null, now());
  return info.lastInsertRowid;
}

export function broadcast({ type = 'admin', subject, body, data = null, fromUserId = null, onlyActive = false }) {
  const users = db
    .prepare(`SELECT id FROM users WHERE banned = 0 ${onlyActive ? 'AND last_seen > ?' : ''}`)
    .all(...(onlyActive ? [now() - 7 * 86400000] : []));
  const stmt = db.prepare(
    'INSERT INTO messages (user_id, from_user_id, type, subject, body, data_json, created_at) VALUES (?,?,?,?,?,?,?)'
  );
  const t = now();
  const tx = db.transaction(() => {
    for (const u of users) stmt.run(u.id, fromUserId, type, subject, body, data ? JSON.stringify(data) : null, t);
  });
  tx();
  return users.length;
}

export function unreadCount(userId) {
  return db.prepare('SELECT COUNT(*) AS c FROM messages WHERE user_id = ? AND read = 0').get(userId).c;
}
