import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

/** Version aus der package.json – wird in der Fußleiste angezeigt. */
function readVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}
export const VERSION = readVersion();

const bool = (v, def) => (v === undefined ? def : /^(1|true|yes|on)$/i.test(String(v)));
const num = (v, def) => (v === undefined || v === '' ? def : Number(v));

export const config = {
  port: num(process.env.PORT, 3000),
  host: process.env.HOST || '0.0.0.0',
  dbFile: process.env.DB_FILE || path.join(ROOT, 'data', 'universe.db'),

  jwtSecret: process.env.JWT_SECRET || 'CHANGE-ME-unsicherer-Entwicklungs-Schluessel',
  jwtExpires: process.env.JWT_EXPIRES || '7d',

  // Spielgeschwindigkeit: 1 = Original-OGame-Tempo, höher = schneller
  speed: {
    economy: num(process.env.SPEED_ECONOMY, 5),   // Rohstoffproduktion
    build: num(process.env.SPEED_BUILD, 5),       // Bau-/Forschungszeiten
    fleet: num(process.env.SPEED_FLEET, 3),       // Flugzeiten
  },

  universe: {
    quadrants: num(process.env.UNI_QUADRANTS, 4),   // Alpha, Beta, Gamma, Delta
    systems: num(process.env.UNI_SYSTEMS, 200),     // Systeme pro Quadrant
    slots: num(process.env.UNI_SLOTS, 15),          // Planeten pro System
  },

  // Startausstattung eines neuen Kommandanten
  start: {
    duranium: num(process.env.START_DURANIUM, 2000),
    dilithium: num(process.env.START_DILITHIUM, 1000),
    deuterium: num(process.env.START_DEUTERIUM, 500),
  },

  tickIntervalMs: num(process.env.TICK_INTERVAL_MS, 5000),
  registrationOpen: bool(process.env.REGISTRATION_OPEN, true),
  trustProxy: bool(process.env.TRUST_PROXY, false),

  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    email: process.env.ADMIN_EMAIL || 'admin@example.com',
    password: process.env.ADMIN_PASSWORD || '', // leer = kein Auto-Admin
  },
};
