import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });

export const db = new Database(config.dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
/* ---------------- Accounts ---------------- */
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  username       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  email          TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash  TEXT    NOT NULL,
  role           TEXT    NOT NULL DEFAULT 'user',      -- 'user' | 'admin'
  faction        TEXT    NOT NULL DEFAULT 'federation',
  banned         INTEGER NOT NULL DEFAULT 0,
  ban_reason     TEXT,
  vacation_until INTEGER,
  created_at     INTEGER NOT NULL,
  last_login     INTEGER,
  last_seen      INTEGER,
  token_version  INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_users_seen ON users(last_seen);

/* ---------------- Planeten ---------------- */
CREATE TABLE IF NOT EXISTS planets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quadrant     INTEGER NOT NULL,
  system       INTEGER NOT NULL,
  position     INTEGER NOT NULL,
  name         TEXT    NOT NULL,
  type         TEXT    NOT NULL DEFAULT 'M',
  temp_min     INTEGER NOT NULL DEFAULT 0,
  temp_max     INTEGER NOT NULL DEFAULT 40,
  fields_max   INTEGER NOT NULL DEFAULT 163,
  diameter     INTEGER NOT NULL DEFAULT 12800,
  duranium     REAL    NOT NULL DEFAULT 0,
  dilithium    REAL    NOT NULL DEFAULT 0,
  deuterium    REAL    NOT NULL DEFAULT 0,
  is_homeworld INTEGER NOT NULL DEFAULT 0,
  last_update  INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  UNIQUE(quadrant, system, position)
);
CREATE INDEX IF NOT EXISTS idx_planets_user ON planets(user_id);
CREATE INDEX IF NOT EXISTS idx_planets_sys  ON planets(quadrant, system);

/* ---------------- Besitz / Level ---------------- */
CREATE TABLE IF NOT EXISTS buildings (
  planet_id INTEGER NOT NULL REFERENCES planets(id) ON DELETE CASCADE,
  key       TEXT    NOT NULL,
  level     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (planet_id, key)
);
CREATE TABLE IF NOT EXISTS research (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key     TEXT    NOT NULL,
  level   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, key)
);
CREATE TABLE IF NOT EXISTS ships (
  planet_id INTEGER NOT NULL REFERENCES planets(id) ON DELETE CASCADE,
  key       TEXT    NOT NULL,
  count     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (planet_id, key)
);
CREATE TABLE IF NOT EXISTS defenses (
  planet_id INTEGER NOT NULL REFERENCES planets(id) ON DELETE CASCADE,
  key       TEXT    NOT NULL,
  count     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (planet_id, key)
);

/* ---------------- Bau-Warteschlangen ---------------- */
CREATE TABLE IF NOT EXISTS build_queue (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  planet_id    INTEGER NOT NULL REFERENCES planets(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT    NOT NULL,   -- building | research | ship | defense
  item_key     TEXT    NOT NULL,
  target_level INTEGER,            -- bei building/research
  amount       INTEGER NOT NULL DEFAULT 1,
  done         INTEGER NOT NULL DEFAULT 0,
  per_unit_ms  INTEGER NOT NULL DEFAULT 0,
  demolish     INTEGER NOT NULL DEFAULT 0,
  cost_json    TEXT    NOT NULL DEFAULT '{}',
  start_at     INTEGER NOT NULL,
  finish_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_queue_planet ON build_queue(planet_id, kind);
CREATE INDEX IF NOT EXISTS idx_queue_finish ON build_queue(finish_at);

/* ---------------- Flotten ---------------- */
CREATE TABLE IF NOT EXISTS fleets (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission          TEXT    NOT NULL,
  state            TEXT    NOT NULL DEFAULT 'outbound', -- outbound | holding | returning
  origin_planet_id INTEGER,
  origin_q INTEGER NOT NULL, origin_s INTEGER NOT NULL, origin_p INTEGER NOT NULL,
  target_q INTEGER NOT NULL, target_s INTEGER NOT NULL, target_p INTEGER NOT NULL,
  ships_json  TEXT NOT NULL,
  cargo_json  TEXT NOT NULL DEFAULT '{}',
  depart_at   INTEGER NOT NULL,
  arrive_at   INTEGER NOT NULL,
  hold_until  INTEGER,
  return_at   INTEGER NOT NULL,
  processed   INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fleets_user ON fleets(user_id);
CREATE INDEX IF NOT EXISTS idx_fleets_time ON fleets(arrive_at, return_at);
CREATE INDEX IF NOT EXISTS idx_fleets_target ON fleets(target_q, target_s, target_p);

/* ---------------- Trümmerfelder ---------------- */
CREATE TABLE IF NOT EXISTS debris (
  quadrant  INTEGER NOT NULL,
  system    INTEGER NOT NULL,
  position  INTEGER NOT NULL,
  duranium  REAL NOT NULL DEFAULT 0,
  dilithium REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (quadrant, system, position)
);

/* ---------------- Nachrichten ---------------- */
CREATE TABLE IF NOT EXISTS messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_user_id INTEGER,
  type         TEXT    NOT NULL,  -- combat | espionage | transport | system | player | admin
  subject      TEXT    NOT NULL,
  body         TEXT    NOT NULL,
  data_json    TEXT,
  read         INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_user ON messages(user_id, created_at DESC);

/* ---------------- Allianzen (Flottenverbände) ---------------- */
CREATE TABLE IF NOT EXISTS alliances (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tag         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT NOT NULL DEFAULT '',
  founder_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS alliance_members (
  alliance_id INTEGER NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rank        TEXT    NOT NULL DEFAULT 'member', -- leader | officer | member
  joined_at   INTEGER NOT NULL,
  PRIMARY KEY (user_id)
);
CREATE TABLE IF NOT EXISTS alliance_applications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  alliance_id INTEGER NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text        TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  UNIQUE(alliance_id, user_id)
);

/* ---------------- Punkte / Statistik ---------------- */
CREATE TABLE IF NOT EXISTS stats (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  points     REAL NOT NULL DEFAULT 0,
  eco_points REAL NOT NULL DEFAULT 0,
  res_points REAL NOT NULL DEFAULT 0,
  mil_points REAL NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

/* ---------------- Admin-Protokoll ---------------- */
CREATE TABLE IF NOT EXISTS admin_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id   INTEGER,
  admin_name TEXT NOT NULL DEFAULT '',
  action     TEXT NOT NULL,
  target     TEXT NOT NULL DEFAULT '',
  detail     TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

/* ---------------- Änderungsprotokoll (Changelog) ---------------- */
CREATE TABLE IF NOT EXISTS changelog (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  version      TEXT    NOT NULL UNIQUE,
  title        TEXT    NOT NULL DEFAULT '',
  body         TEXT    NOT NULL DEFAULT '',
  published    INTEGER NOT NULL DEFAULT 1,
  auto         INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_changelog_created ON changelog(created_at DESC);

/* ---------------- Laufzeit-Einstellungen ---------------- */
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

/* ------------------------------------------------------------------ */
/* Nachträgliche Schemaerweiterungen                                   */
/* ------------------------------------------------------------------ */

/** Fügt eine Spalte hinzu, falls sie noch fehlt (für bestehende Datenbanken). */
function addColumnIfMissing(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (cols.some((c) => c.name === column)) return false;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return true;
}

addColumnIfMissing('users', 'tutorial_seen', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('users', 'changelog_seen', "TEXT NOT NULL DEFAULT ''");

/* ------------------------------------------------------------------ */
/* Hilfsfunktionen                                                     */
/* ------------------------------------------------------------------ */

export const now = () => Date.now();

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

export function logAdmin(admin, action, target = '', detail = '') {
  db.prepare(
    'INSERT INTO admin_log (admin_id, admin_name, action, target, detail, created_at) VALUES (?,?,?,?,?,?)'
  ).run(admin?.id ?? null, admin?.username ?? 'system', action, String(target), String(detail), now());
}

/** Alle Level/Anzahlen eines Planeten bzw. Spielers als einfaches Objekt. */
export function levelMap(table, column, idColumn, id) {
  const rows = db.prepare(`SELECT key, ${column} AS v FROM ${table} WHERE ${idColumn} = ?`).all(id);
  const out = {};
  for (const r of rows) out[r.key] = r.v;
  return out;
}

export const getBuildings = (planetId) => levelMap('buildings', 'level', 'planet_id', planetId);
export const getShips     = (planetId) => levelMap('ships', 'count', 'planet_id', planetId);
export const getDefenses  = (planetId) => levelMap('defenses', 'count', 'planet_id', planetId);
export const getResearch  = (userId)   => levelMap('research', 'level', 'user_id', userId);

export function setLevel(table, column, idColumn, id, key, value) {
  db.prepare(
    `INSERT INTO ${table} (${idColumn}, key, ${column}) VALUES (?,?,?)
     ON CONFLICT(${idColumn}, key) DO UPDATE SET ${column} = excluded.${column}`
  ).run(id, key, value);
}

export function addCount(table, idColumn, id, key, delta) {
  db.prepare(
    `INSERT INTO ${table} (${idColumn}, key, count) VALUES (?,?,?)
     ON CONFLICT(${idColumn}, key) DO UPDATE SET count = MAX(0, count + ?)`
  ).run(id, key, Math.max(0, delta), delta);
}

/* ------------------------------------------------------------------ */
/* Zur Laufzeit änderbare Spielparameter                               */
/* ------------------------------------------------------------------ */

/**
 * Geschwindigkeiten und Startausstattung liegen in der Einstellungstabelle und
 * überschreiben die Werte aus der .env. Da sämtliche Berechnungen config.speed
 * erst im Moment des Aufrufs lesen, wirkt eine Änderung sofort – ohne Neustart.
 */
export const TUNABLES = {
  speed_economy:    { target: ['speed', 'economy'],   min: 0.1, max: 10000, label: 'Wirtschaftstempo' },
  speed_build:      { target: ['speed', 'build'],     min: 0.1, max: 10000, label: 'Bautempo' },
  speed_fleet:      { target: ['speed', 'fleet'],     min: 0.1, max: 10000, label: 'Flottentempo' },
  start_duranium:   { target: ['start', 'duranium'],  min: 0,   max: 1e12,  label: 'Start-Duranium' },
  start_dilithium:  { target: ['start', 'dilithium'], min: 0,   max: 1e12,  label: 'Start-Dilithium' },
  start_deuterium:  { target: ['start', 'deuterium'], min: 0,   max: 1e12,  label: 'Start-Deuterium' },
};

/** Setzt einen Parameter zur Laufzeit und speichert ihn dauerhaft. */
export function setTunable(key, value) {
  const def = TUNABLES[key];
  if (!def) return { error: `Unbekannter Parameter: ${key}` };
  const v = Number(value);
  if (!Number.isFinite(v)) return { error: `${def.label}: keine gültige Zahl.` };
  if (v < def.min || v > def.max)
    return { error: `${def.label} muss zwischen ${def.min} und ${def.max} liegen.` };

  const [group, prop] = def.target;
  const previous = config[group][prop];
  config[group][prop] = v;
  setSetting(key, String(v));
  return { ok: true, key, label: def.label, previous, value: v };
}

/** Aktuelle Werte aller änderbaren Parameter. */
export function getTunables() {
  const out = {};
  for (const [key, def] of Object.entries(TUNABLES)) {
    const [group, prop] = def.target;
    out[key] = { value: config[group][prop], label: def.label, min: def.min, max: def.max };
  }
  return out;
}

/** Beim Start gespeicherte Werte auf die Konfiguration anwenden. */
for (const [key, def] of Object.entries(TUNABLES)) {
  const stored = getSetting(key);
  if (stored === null) continue;
  const v = Number(stored);
  if (Number.isFinite(v) && v >= def.min && v <= def.max) {
    const [group, prop] = def.target;
    config[group][prop] = v;
  }
}

/** Startwerte für Einstellungen einmalig anlegen. */
if (getSetting('motd') === null) {
  setSetting('motd', 'Willkommen im Alpha-Quadranten, Kommandant. Die Sternenflotte zählt auf Sie.');
}
if (getSetting('registration_open') === null) {
  setSetting('registration_open', config.registrationOpen ? '1' : '0');
}
