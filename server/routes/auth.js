import express from 'express';
import rateLimit from 'express-rate-limit';
import { db, now, getSetting, logAdmin } from '../db.js';
import { config } from '../config.js';
import { FACTIONS, DEFAULT_FACTION } from '../gamedata.js';
import { createPlanet, findHomeworldSlot } from '../engine/planet.js';
import { recomputeUser } from '../engine/stats.js';
import { sendMessage } from '../engine/messages.js';
import { hashPassword, verifyPassword, signToken, authenticate, setAuthCookie, clearAuthCookie } from '../auth.js';

export const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.' },
});

const USERNAME_RE = /^[A-Za-z0-9_\-. ]{3,20}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

/** Legt einen Spieler samt Heimatwelt an. Wird auch vom Seed-Skript genutzt. */
export function createAccount({ username, email, password, faction = DEFAULT_FACTION, role = 'user' }) {
  if (!USERNAME_RE.test(username))
    return { error: 'Der Name muss 3–20 Zeichen lang sein (Buchstaben, Ziffern, _ - . und Leerzeichen).' };
  if (!EMAIL_RE.test(email)) return { error: 'Bitte eine gültige E-Mail-Adresse angeben.' };
  if (!password || password.length < 8) return { error: 'Das Passwort muss mindestens 8 Zeichen lang sein.' };
  if (!FACTIONS[faction]) faction = DEFAULT_FACTION;

  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username))
    return { error: 'Dieser Kommandantenname ist bereits vergeben.' };
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email))
    return { error: 'Für diese E-Mail-Adresse existiert bereits ein Konto.' };

  const slot = findHomeworldSlot();
  if (!slot) return { error: 'Das Universum ist vollständig besiedelt. Bitte einen Administrator kontaktieren.' };

  const t = now();
  let user;
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        'INSERT INTO users (username, email, password_hash, role, faction, created_at, last_seen) VALUES (?,?,?,?,?,?,?)'
      )
      .run(username, email, hashPassword(password), role, faction, t, t);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    createPlanet(user.id, slot, { homeworld: true, name: 'Heimatwelt' });
  });
  tx();

  recomputeUser(user.id);
  sendMessage(user.id, {
    type: 'system',
    subject: 'Willkommen im Dienst, Kommandant',
    body:
      `Sternenflottenkommando an ${username}: Ihnen wurde das Kommando über die Heimatwelt in ` +
      `[${slot.q}:${slot.s}:${slot.p}] übertragen. Bauen Sie zunächst Duranium-Mine und Dilithium-Raffinerie aus, ` +
      `errichten Sie ein Solar-Kollektor-Feld für die Energieversorgung und anschließend ein Wissenschaftslabor. ` +
      `${getSetting('motd', '')}`,
  });
  return { user };
}

const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  email: u.email,
  role: u.role,
  faction: u.faction,
  factionName: FACTIONS[u.faction]?.short || u.faction,
  createdAt: u.created_at,
  vacationUntil: u.vacation_until,
});

router.get('/config', (req, res) => {
  res.json({
    registrationOpen: getSetting('registration_open', '1') === '1',
    motd: getSetting('motd', ''),
    factions: Object.entries(FACTIONS).map(([key, f]) => ({ key, ...f })),
    universe: config.universe,
    speed: config.speed,
  });
});

router.post('/register', loginLimiter, (req, res) => {
  if (getSetting('registration_open', '1') !== '1')
    return res.status(403).json({ error: 'Die Registrierung ist derzeit geschlossen.' });

  const { username = '', email = '', password = '', faction } = req.body || {};

  // Die Fraktion prägt die Boni des gesamten Spielverlaufs und lässt sich später
  // nur noch von einem Administrator ändern – deshalb ist sie hier Pflicht und
  // wird bewusst nicht stillschweigend auf einen Standard gesetzt.
  if (!faction || !FACTIONS[faction]) {
    return res.status(400).json({
      error: 'Bitte wählen Sie eine Fraktion. Die Wahl bestimmt Ihre Boni und ist später nicht mehr änderbar.',
      field: 'faction',
    });
  }

  const result = createAccount({
    username: String(username).trim(),
    email: String(email).trim().toLowerCase(),
    password: String(password),
    faction,
  });
  if (result.error) return res.status(400).json({ error: result.error });

  const token = signToken(result.user);
  setAuthCookie(res, token);
  db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(now(), result.user.id);
  res.json({ token, user: publicUser(result.user) });
});

router.post('/login', loginLimiter, (req, res) => {
  const { login = '', password = '' } = req.body || {};
  const key = String(login).trim();
  const user = db
    .prepare('SELECT * FROM users WHERE username = ? OR email = ?')
    .get(key, key.toLowerCase());

  if (!user || !verifyPassword(String(password), user.password_hash))
    return res.status(401).json({ error: 'Benutzername oder Passwort ist falsch.' });
  if (user.banned)
    return res.status(403).json({ error: `Konto gesperrt: ${user.ban_reason || 'Kein Grund angegeben.'}` });

  db.prepare('UPDATE users SET last_login = ?, last_seen = ? WHERE id = ?').run(now(), now(), user.id);
  const token = signToken(user);
  setAuthCookie(res, token);
  res.json({ token, user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.post('/password', authenticate, (req, res) => {
  const { current = '', next: nextPw = '' } = req.body || {};
  if (!verifyPassword(String(current), req.user.password_hash))
    return res.status(400).json({ error: 'Das aktuelle Passwort ist falsch.' });
  if (String(nextPw).length < 8)
    return res.status(400).json({ error: 'Das neue Passwort muss mindestens 8 Zeichen lang sein.' });

  db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?')
    .run(hashPassword(String(nextPw)), req.user.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const token = signToken(user);
  setAuthCookie(res, token);
  res.json({ ok: true, token });
});

/** Urlaubsmodus: schützt vor Angriffen, stoppt aber die Produktion nicht. */
router.post('/vacation', authenticate, (req, res) => {
  const { days = 7 } = req.body || {};
  const d = Math.min(60, Math.max(1, Number(days) || 7));
  const until = now() + d * 86400000;
  db.prepare('UPDATE users SET vacation_until = ? WHERE id = ?').run(until, req.user.id);
  res.json({ ok: true, vacationUntil: until });
});

router.delete('/vacation', authenticate, (req, res) => {
  db.prepare('UPDATE users SET vacation_until = NULL WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});

/** Konto endgültig löschen (inkl. aller Planeten). */
router.post('/delete-account', authenticate, (req, res) => {
  const { password = '' } = req.body || {};
  if (!verifyPassword(String(password), req.user.password_hash))
    return res.status(400).json({ error: 'Passwort ist falsch.' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
  logAdmin(req.user, 'account_self_delete', req.user.username, '');
  clearAuthCookie(res);
  res.json({ ok: true });
});
