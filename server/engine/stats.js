import { db, now, getResearch } from '../db.js';
import { computePoints } from './formulas.js';
import { SHIPS } from '../gamedata.js';

const STAT_COLUMNS = ['points', 'eco_points', 'res_points', 'mil_points'];

/**
 * Vergleicht gespeicherte und neu berechnete Punktestände.
 * Die kleine Toleranz fängt Rundungsunterschiede der Gleitkommaarithmetik ab –
 * ein Punktwert ändert sich real immer um deutlich mehr als ein Millionstel.
 */
function statsDiffer(current, next) {
  return STAT_COLUMNS.some((key) => Math.abs((current[key] || 0) - (next[key] || 0)) > 1e-6);
}

/**
 * Faengt unbrauchbare Zahlen ab, bevor sie in die Datenbank gelangen.
 *
 * NaN und Infinity werden von SQLite als NULL gespeichert. Ein einziger
 * beschaedigter Wert liess so den Punktestand eines Spielers stillschweigend
 * auf null fallen - und jede spaetere Anpassung lief ins Leere, weil die
 * Rechnung schon vor dem Speichern zerfallen war. Statt das weiterzureichen,
 * wird der Wert hier auf null gesetzt und der Vorfall protokolliert.
 */
function zahlenPruefen(userId, werte) {
  for (const [name, wert] of Object.entries(werte)) {
    if (!Number.isFinite(wert)) {
      console.error(
        `[Punkte] Unbrauchbarer Wert bei Spieler ${userId}: ${name} = ${wert}. ` +
        'Vermutlich steht in buildings/research/ships/defenses ein Wert, der keine Zahl ist. ' +
        'Pruefen mit: node scripts/punkte-pruefen.mjs <Spielername>'
      );
      werte[name] = 0;
    }
  }
  return werte;
}

/** Punkte eines Spielers neu berechnen (Gebäude + Forschung + Flotte + Verteidigung). */
export function recomputeUser(userId) {
  const planets = db.prepare('SELECT id FROM planets WHERE user_id = ?').all(userId);
  const buildingsByPlanet = new Map();
  const ships = {};
  const defenses = {};

  for (const { id } of planets) {
    const levels = {};
    for (const r of db.prepare('SELECT key, level FROM buildings WHERE planet_id = ?').all(id))
      levels[r.key] = r.level;
    buildingsByPlanet.set(id, levels);
    for (const r of db.prepare('SELECT key, count FROM ships WHERE planet_id = ?').all(id))
      ships[r.key] = (ships[r.key] || 0) + r.count;
    for (const r of db.prepare('SELECT key, count FROM defenses WHERE planet_id = ?').all(id))
      defenses[r.key] = (defenses[r.key] || 0) + r.count;
  }
  // Schiffe, die gerade unterwegs sind, zählen ebenfalls.
  for (const f of db.prepare('SELECT ships_json FROM fleets WHERE user_id = ? AND processed = 0').all(userId)) {
    for (const [key, n] of Object.entries(JSON.parse(f.ships_json || '{}')))
      if (SHIPS[key]) ships[key] = (ships[key] || 0) + n;
  }

  const research = getResearch(userId);

  // Gebäudepunkte planetenweise berechnen: die Kostenkurve gilt pro Planet,
  // eine Summierung über alle Kolonien würde die Punkte verfälschen.
  let eco = 0;
  for (const { id } of planets) {
    eco += computePoints({ buildings: buildingsByPlanet.get(id) }).eco_points;
  }

  const rest = computePoints({ research, ships, defenses });

  // Ein im Adminbereich gesetzter Stand hat Vorrang und bleibt bei jeder
  // Neuberechnung erhalten. Er wird unmittelbar uebernommen, nicht
  // hinzugerechnet – jede Rechnung damit koennte ihn wieder verfaelschen.
  const override = db.prepare('SELECT points_override FROM stats WHERE user_id = ?').get(userId)?.points_override;
  const manuell = override !== null && override !== undefined && Number.isFinite(override);

  const next = zahlenPruefen(userId, {
    points: manuell ? override : eco + rest.res_points + rest.mil_points,
    eco_points: eco,
    res_points: rest.res_points,
    mil_points: rest.mil_points,
  });

  // Nur schreiben, wenn sich tatsächlich etwas geändert hat.
  // Solange niemand spielt, entstehen dadurch überhaupt keine Schreibzugriffe –
  // das schont vor allem SD-Karten auf Einplatinenrechnern wie dem Raspberry Pi.
  const current = db
    .prepare('SELECT points, eco_points, res_points, mil_points FROM stats WHERE user_id = ?')
    .get(userId);
  if (current && !statsDiffer(current, next)) return next;

  db.prepare(
    `INSERT INTO stats (user_id, points, eco_points, res_points, mil_points, updated_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET
       points = excluded.points, eco_points = excluded.eco_points,
       res_points = excluded.res_points, mil_points = excluded.mil_points,
       updated_at = excluded.updated_at`
  ).run(userId, next.points, next.eco_points, next.res_points, next.mil_points, now());

  return next;
}

/** Punkte aller Spieler neu berechnen (Cron/Tick). */
export function recomputeAll() {
  const users = db.prepare('SELECT id FROM users').all();
  for (const u of users) {
    try { recomputeUser(u.id); } catch (err) { console.error('Punkteberechnung fehlgeschlagen für', u.id, err); }
  }
  return users.length;
}

/** Rangliste. type: points | eco | res | mil */
export function highscore(type = 'points', limit = 100, offset = 0) {
  const column = { points: 'points', eco: 'eco_points', res: 'res_points', mil: 'mil_points' }[type] || 'points';
  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.faction, u.banned,
              COALESCE(s.points,0) AS points, COALESCE(s.eco_points,0) AS eco_points,
              COALESCE(s.res_points,0) AS res_points, COALESCE(s.mil_points,0) AS mil_points,
              (SELECT COUNT(*) FROM planets p WHERE p.user_id = u.id) AS planets,
              a.tag AS alliance_tag, a.id AS alliance_id
       FROM users u
       LEFT JOIN stats s ON s.user_id = u.id
       LEFT JOIN alliance_members am ON am.user_id = u.id
       LEFT JOIN alliances a ON a.id = am.alliance_id
       ORDER BY ${column} DESC, u.id ASC
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset);
  return rows.map((r, i) => ({ rank: offset + i + 1, ...r, points: Math.floor(r[column]) }));
}

export function userRank(userId, type = 'points') {
  const column = { points: 'points', eco: 'eco_points', res: 'res_points', mil: 'mil_points' }[type] || 'points';
  const row = db
    .prepare(
      `SELECT COUNT(*) + 1 AS rank FROM stats
       WHERE ${column} > (SELECT COALESCE(${column},0) FROM stats WHERE user_id = ?)`
    )
    .get(userId);
  return row?.rank ?? null;
}


/* ------------------------------------------------------------------ */
/* Manuelle Anpassung durch Administratoren                            */
/* ------------------------------------------------------------------ */

/**
 * Setzt die angezeigten Gesamtpunkte eines Spielers.
 *
 * Die Punkte ergeben sich normalerweise aus Gebäuden, Forschung und Flotte.
 * Damit eine Anpassung die nächste Neuberechnung übersteht, wird nicht der
 * Punktestand selbst gespeichert, sondern die Differenz als Zuschlag.
 */
export function setPoints(userId, zielPunkte) {
  const ziel = Math.max(0, Number(zielPunkte) || 0);

  db.prepare(
    `INSERT INTO stats (user_id, points, eco_points, res_points, mil_points, points_bonus, updated_at)
     VALUES (?,0,0,0,0,0,?) ON CONFLICT(user_id) DO NOTHING`
  ).run(userId, now());

  // Der gewuenschte Stand wird unmittelbar abgelegt. Frueher wurde stattdessen
  // die Differenz zum berechneten Wert gespeichert und beim naechsten Durchlauf
  // wieder aufaddiert. Bei sehr grossen berechneten Werten - erreichbar ueber
  // hohe Ausbaustufen im Adminbereich - loeschte die Fliesskommaarithmetik den
  // gewuenschten Wert dabei restlos aus: Summe und Differenz ergaben exakt null.
  db.prepare('UPDATE stats SET points_override = ?, points_bonus = 0 WHERE user_id = ?').run(ziel, userId);
  const nachher = recomputeUser(userId);

  // Der berechnete Anteil wird nur noch zur Anzeige ermittelt.
  const berechnet = (nachher.eco_points || 0) + (nachher.res_points || 0) + (nachher.mil_points || 0);

  const gespeichert = db.prepare('SELECT points FROM stats WHERE user_id = ?').get(userId)?.points;
  if (!Number.isFinite(gespeichert) || Math.abs(gespeichert - ziel) > 0.5) {
    console.error(
      `[Punkte] Zielwert verfehlt bei Spieler ${userId}: gewollt ${ziel}, ` +
      `berechnet ${berechnet}, gespeichert ${gespeichert}. Wird direkt gesetzt.`
    );
    db.prepare('UPDATE stats SET points = ?, updated_at = ? WHERE user_id = ?').run(ziel, now(), userId);
    return { berechnet, points: ziel, korrigiert: true };
  }

  return { berechnet, points: nachher.points };
}

/** Hebt eine gesetzte Anpassung wieder auf; es zaehlt dann wieder der Besitz. */
export function clearPointsBonus(userId) {
  db.prepare('UPDATE stats SET points_override = NULL, points_bonus = 0 WHERE user_id = ?').run(userId);
  return recomputeUser(userId);
}

/**
 * Ermittelt die Punktzahl, die nötig ist, um einen bestimmten Rang zu belegen.
 * Gerechnet wird knapp über dem derzeitigen Inhaber dieses Platzes.
 */
export function pointsForRank(userId, zielRang) {
  const andere = db
    .prepare('SELECT points FROM stats WHERE user_id != ? ORDER BY points DESC')
    .all(userId)
    .map((r) => r.points || 0);
  const n = andere.length;

  // Mehr Plaetze als Spieler gibt es nicht: Rang n+1 ist der letzte.
  const rang = Math.min(Math.max(1, Math.floor(zielRang) || 1), n + 1);

  // Der Rang zaehlt, wie viele andere echt mehr Punkte haben. Fuer Rang R
  // muessen also genau R-1 Spieler oberhalb liegen.
  if (rang === 1) return (andere[0] ?? 0) + 1;
  if (rang === n + 1) return Math.max(0, (andere[n - 1] ?? 0) - 1);

  const oben = andere[rang - 2];   // soll kuenftig direkt darueber stehen
  const unten = andere[rang - 1];  // soll kuenftig direkt darunter stehen

  // Genau den Wert des Unteren zu nehmen genuegt: er zaehlt dann nicht mehr
  // als "darueber", der Obere schon. Frueher wurde die Mitte gewaehlt, was bei
  // dicht beieinanderliegenden Staenden auf denselben Wert gerundet wurde.
  if (oben > unten) return unten;

  // Gleichstand: Dieser Rang ist nicht erreichbar, ohne die Gleichstaende
  // aufzubrechen. Der Spieler reiht sich in die Gruppe ein.
  return unten;
}

/** Rang, den ein Punktestand ergaebe - ohne etwas zu veraendern. */
export function rankForPoints(userId, punkte) {
  const row = db
    .prepare('SELECT COUNT(*) + 1 AS rank FROM stats WHERE user_id != ? AND points > ?')
    .get(userId, punkte);
  return row?.rank ?? 1;
}
