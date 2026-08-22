import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'node:path';

import { config, ROOT } from './config.js';
import { db, now, getSetting } from './db.js';
import { router as authRouter, createAccount } from './routes/auth.js';
import { router as gameRouter } from './routes/game.js';
import { router as fleetRouter } from './routes/fleet.js';
import { router as galaxyRouter } from './routes/galaxy.js';
import { router as messagesRouter } from './routes/messages.js';
import { router as allianceRouter } from './routes/alliance.js';
import { router as highscoreRouter } from './routes/highscore.js';
import { router as adminRouter } from './routes/admin.js';
import { processDueQueues } from './engine/queue.js';
import { processFleets } from './engine/fleet.js';
import { recomputeAll } from './engine/stats.js';

const app = express();
if (config.trustProxy) app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        // helmet setzt diese Anweisung sonst automatisch. Sie zwingt den Browser,
        // jede http://-Anfrage auf https:// umzuschreiben – beim Zugriff über
        // Hostname oder IP im Heimnetz (http://pi.fritz.box:3000) scheitern dadurch
        // Stylesheet und Skripte. Über localhost fällt das nicht auf, weil Browser
        // dafür eine Ausnahme machen. Ein vorgelagerter Proxy liefert HTTPS ohnehin.
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);
app.use(compression());
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

app.use(
  '/api',
  rateLimit({
    windowMs: 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Zu viele Anfragen. Bitte kurz warten.' },
  })
);

app.use('/api/auth', authRouter);
app.use('/api/game', gameRouter);
app.use('/api/fleet', fleetRouter);
app.use('/api/galaxy', galaxyRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/alliance', allianceRouter);
app.use('/api/highscore', highscoreRouter);
app.use('/api/admin', adminRouter);

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    serverTime: now(),
    users: db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
    planets: db.prepare('SELECT COUNT(*) AS c FROM planets').get().c,
    fleets: db.prepare('SELECT COUNT(*) AS c FROM fleets WHERE processed = 0').get().c,
    motd: getSetting('motd', ''),
  });
});

// Der Browser fragt bei jedem Aufruf kurz beim Server nach, ob sich eine Datei
// geändert hat. Unveränderte Dateien beantwortet der Server mit "304 Not Modified"
// – das kostet ein paar Byte und der Browser nutzt weiter seine Kopie.
// Eine feste Vorhaltezeit ist hier falsch: Nach einem Update zeigte der Browser
// sonst bis zu einer Stunde lang die alte Fassung, ohne nachzufragen.
app.use(
  express.static(path.join(ROOT, 'public'), {
    index: 'index.html',
    etag: true,
    lastModified: true,
    maxAge: 0,
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
  })
);

// Alle übrigen Pfade an die Single-Page-App weiterreichen
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

app.use((err, req, res, _next) => {
  console.error('Unerwarteter Fehler:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Interner Serverfehler. Das Sternenflottenkommando wurde informiert.' });
});

/* ------------------------------------------------------------------ */
/* Spiel-Tick                                                          */
/* ------------------------------------------------------------------ */

let ticking = false;
let ticks = 0;

function gameTick() {
  if (ticking) return;
  ticking = true;
  try {
    processDueQueues();
    processFleets();
    // Punkte nur alle ~60 Sekunden neu berechnen – das ist der teuerste Teil.
    if (ticks % Math.max(1, Math.round(60000 / config.tickIntervalMs)) === 0) recomputeAll();
    ticks++;
  } catch (err) {
    console.error('Fehler im Spiel-Tick:', err);
  } finally {
    ticking = false;
  }
}

/* ------------------------------------------------------------------ */
/* Erststart: Administrator anlegen                                    */
/* ------------------------------------------------------------------ */

function bootstrapAdmin() {
  const admins = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get().c;
  if (admins > 0) return;
  if (!config.admin.password) {
    console.warn(
      '\n⚠  Es existiert noch kein Administrator.\n' +
      '   Setzen Sie ADMIN_USERNAME / ADMIN_EMAIL / ADMIN_PASSWORD in der .env-Datei\n' +
      '   und starten Sie den Server neu, oder führen Sie "npm run seed" aus.\n'
    );
    return;
  }
  const result = createAccount({
    username: config.admin.username,
    email: config.admin.email,
    password: config.admin.password,
    role: 'admin',
  });
  if (result.error) console.error('Administrator konnte nicht angelegt werden:', result.error);
  else console.log(`✔ Administrator "${config.admin.username}" wurde angelegt.`);
}

bootstrapAdmin();
gameTick();
const timer = setInterval(gameTick, config.tickIntervalMs);

const server = app.listen(config.port, config.host, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║   S T A R   T R E K   C O N Q U E S T        ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log(`  Server läuft auf http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
  console.log(`  Datenbank:  ${config.dbFile}`);
  console.log(`  Universum:  ${config.universe.quadrants} Quadranten × ${config.universe.systems} Systeme × ${config.universe.slots} Planeten`);
  console.log(`  Tempo:      Wirtschaft ${config.speed.economy}× | Bau ${config.speed.build}× | Flotte ${config.speed.fleet}×`);
  console.log('');
});

function shutdown(signal) {
  console.log(`\n${signal} empfangen – Server wird beendet …`);
  clearInterval(timer);
  server.close(() => {
    try { db.close(); } catch { /* ignorieren */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
