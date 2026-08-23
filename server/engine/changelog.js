/**
 * Änderungsprotokoll.
 *
 * Beim Serverstart wird geprüft, ob für die laufende Version bereits ein
 * Eintrag existiert. Fehlt er, entsteht er automatisch aus den Git-Commits
 * seit der zuletzt protokollierten Version. Der Text lässt sich im
 * Adminbereich anschließend frei überarbeiten – ein von Hand bearbeiteter
 * Eintrag wird nie wieder automatisch überschrieben.
 */
import { execFileSync } from 'node:child_process';
import { db, now } from '../db.js';
import { ROOT, getVersion } from '../config.js';

/** Commit-Titel seit dem angegebenen Zeitpunkt, ohne technische Fußzeilen. */
function commitsSince(sinceTimestamp) {
  try {
    const args = ['-C', ROOT, 'log', '--no-merges', '--pretty=format:%s'];
    if (sinceTimestamp) args.push(`--since=${new Date(sinceTimestamp).toISOString()}`);
    else args.push('-n', '25');

    const out = execFileSync('git', args, { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !/^(Co-Authored-By|Claude-Session|Merge)/i.test(l))
      .slice(0, 40);
  } catch {
    return []; // kein Git verfügbar (z. B. im Container) – dann bleibt der Text leer
  }
}

/** Sorgt dafür, dass für die laufende Version ein Eintrag existiert. */
export function ensureCurrentEntry() {
  const existing = db.prepare('SELECT * FROM changelog WHERE version = ?').get(getVersion());
  if (existing) return existing;

  const previous = db.prepare('SELECT created_at FROM changelog ORDER BY created_at DESC LIMIT 1').get();
  const lines = commitsSince(previous?.created_at);

  const body = lines.length
    ? lines.map((l) => `- ${l}`).join('\n')
    : 'Für diese Version wurde noch keine Beschreibung hinterlegt.';

  const t = now();
  db.prepare(
    `INSERT INTO changelog (version, title, body, published, auto, created_at, updated_at)
     VALUES (?,?,?,?,1,?,?)`
  ).run(getVersion(), `Version ${getVersion()}`, body, 1, t, t);

  return db.prepare('SELECT * FROM changelog WHERE version = ?').get(getVersion());
}

/** Alle veröffentlichten Einträge, neueste zuerst. */
export function listEntries({ includeUnpublished = false, limit = 50 } = {}) {
  const where = includeUnpublished ? '' : 'WHERE published = 1';
  return db
    .prepare(`SELECT * FROM changelog ${where} ORDER BY created_at DESC LIMIT ?`)
    .all(limit)
    .map((e) => ({
      id: e.id, version: e.version, title: e.title, body: e.body,
      published: !!e.published, auto: !!e.auto,
      createdAt: e.created_at, updatedAt: e.updated_at,
    }));
}

/** Neuester veröffentlichter Eintrag. */
export function latestEntry() {
  const e = db.prepare('SELECT * FROM changelog WHERE published = 1 ORDER BY created_at DESC LIMIT 1').get();
  if (!e) return null;
  return {
    id: e.id, version: e.version, title: e.title, body: e.body,
    createdAt: e.created_at, updatedAt: e.updated_at,
  };
}

/**
 * Prüft, ob einem Spieler der neueste Eintrag noch angezeigt werden soll.
 * Verglichen wird die Version, nicht ein Datum – so erscheint der Hinweis
 * genau einmal je Aktualisierung.
 */
export function unseenFor(user) {
  const latest = latestEntry();
  if (!latest) return null;
  return (user.changelog_seen || '') === latest.version ? null : latest;
}

export function markSeen(userId, version) {
  db.prepare('UPDATE users SET changelog_seen = ? WHERE id = ?').run(String(version || ''), userId);
}
