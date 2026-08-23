import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db, now } from './db.js';
import { config } from './config.js';

export const hashPassword = (plain) => bcrypt.hashSync(plain, 10);
export const verifyPassword = (plain, hash) => bcrypt.compareSync(plain, hash);

export function signToken(user) {
  return jwt.sign(
    { uid: user.id, role: user.role, tv: user.token_version },
    config.jwtSecret,
    { expiresIn: config.jwtExpires }
  );
}

function readToken(req) {
  const header = req.get('authorization');
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  if (req.cookies?.stc_token) return req.cookies.stc_token;
  return null;
}

/** Lädt den Spieler aus dem Token. Bricht mit 401 ab, wenn kein gültiges Token vorliegt. */
export function authenticate(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: 'Nicht angemeldet.' });
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return res.status(401).json({ error: 'Sitzung abgelaufen. Bitte erneut anmelden.' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.uid);
  if (!user) return res.status(401).json({ error: 'Konto existiert nicht mehr.' });
  if (user.token_version !== payload.tv)
    return res.status(401).json({ error: 'Sitzung wurde beendet. Bitte erneut anmelden.' });
  if (user.banned)
    return res.status(403).json({ error: `Konto gesperrt: ${user.ban_reason || 'Kein Grund angegeben.'}`, banned: true });

  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(now(), user.id);
  req.user = user;
  next();
}

export const ROLES = ['user', 'moderator', 'admin'];

/** Nur für Administratoren. */
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin')
    return res.status(403).json({ error: 'Für diesen Bereich fehlen die Berechtigungen der Sternenflotten-Admiralität.' });
  next();
}

/**
 * Für Moderation im Chat. Administratoren haben diese Rechte ebenfalls –
 * eine eigene Moderatorenrolle erlaubt es, Spielern das Moderieren zu
 * übertragen, ohne ihnen den gesamten Adminbereich zu öffnen.
 */
export function requireModerator(req, res, next) {
  if (req.user?.role !== 'admin' && req.user?.role !== 'moderator')
    return res.status(403).json({ error: 'Diese Aktion ist Moderatoren vorbehalten.' });
  next();
}

export const isModerator = (user) => user?.role === 'admin' || user?.role === 'moderator';

export function setAuthCookie(res, token) {
  res.cookie('stc_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 3600 * 1000,
  });
}

export function clearAuthCookie(res) {
  res.clearCookie('stc_token');
}
