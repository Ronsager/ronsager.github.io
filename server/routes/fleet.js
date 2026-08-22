import express from 'express';
import { db, getResearch, getShips } from '../db.js';
import { MISSIONS, SHIPS } from '../gamedata.js';
import { tickPlanet, getDebris } from '../engine/planet.js';
import { fleetView, dispatchFleet, recallFleet, calculateMission, planetAt } from '../engine/fleet.js';
import { processFleets } from '../engine/fleet.js';
import { recomputeUser } from '../engine/stats.js';
import { authenticate } from '../auth.js';

export const router = express.Router();
router.use(authenticate);

function ownPlanet(req, res) {
  const id = Number(req.query.planetId || req.body?.planetId || 0);
  const planet = id
    ? db.prepare('SELECT * FROM planets WHERE id = ? AND user_id = ?').get(id, req.user.id)
    : db.prepare('SELECT * FROM planets WHERE user_id = ? ORDER BY is_homeworld DESC LIMIT 1').get(req.user.id);
  if (!planet) {
    res.status(404).json({ error: 'Planet nicht gefunden.' });
    return null;
  }
  tickPlanet(planet.id);
  return db.prepare('SELECT * FROM planets WHERE id = ?').get(planet.id);
}

const parseCoords = (raw) => ({
  q: Math.floor(Number(raw?.q) || 0),
  s: Math.floor(Number(raw?.s) || 0),
  p: Math.floor(Number(raw?.p) || 0),
});

router.get('/', (req, res) => {
  processFleets();
  res.json({ ...fleetView(req.user.id), missions: MISSIONS });
});

/** Flugvorschau: Dauer, Treibstoff, Frachtkapazität – ohne die Flotte zu starten. */
router.post('/calculate', (req, res) => {
  const planet = ownPlanet(req, res);
  if (!planet) return;
  const ships = {};
  for (const [key, raw] of Object.entries(req.body?.ships || {})) {
    const n = Math.floor(Number(raw) || 0);
    if (n > 0 && SHIPS[key]) ships[key] = n;
  }
  if (!Object.keys(ships).length) return res.status(400).json({ error: 'Keine Schiffe ausgewählt.' });

  const result = calculateMission({
    origin: { q: planet.quadrant, s: planet.system, p: planet.position },
    target: parseCoords(req.body?.target),
    ships,
    research: getResearch(req.user.id),
    faction: req.user.faction,
    mission: String(req.body?.mission || 'transport'),
    speedPercent: Number(req.body?.speedPercent) || 100,
    holdHours: Number(req.body?.holdHours) || 0,
  });
  if (result.error) return res.status(400).json(result);

  const target = parseCoords(req.body?.target);
  const targetPlanet = planetAt(target);
  res.json({
    ...result,
    available: { deuterium: Math.floor(planet.deuterium) },
    target: {
      coords: target,
      occupied: !!targetPlanet,
      name: targetPlanet?.name || null,
      owner: targetPlanet
        ? db.prepare('SELECT username FROM users WHERE id = ?').get(targetPlanet.user_id)?.username
        : null,
      isOwn: targetPlanet?.user_id === req.user.id,
      debris: getDebris(target),
    },
  });
});

router.post('/send', (req, res) => {
  const planet = ownPlanet(req, res);
  if (!planet) return;
  const result = dispatchFleet(req.user, planet, {
    mission: String(req.body?.mission || ''),
    target: parseCoords(req.body?.target),
    ships: req.body?.ships || {},
    cargo: req.body?.cargo || {},
    speedPercent: Number(req.body?.speedPercent) || 100,
    holdHours: Number(req.body?.holdHours) || 0,
  });
  if (result.error) return res.status(400).json(result);
  recomputeUser(req.user.id);
  res.json({ ...result, fleet: fleetView(req.user.id) });
});

router.post('/recall', (req, res) => {
  const result = recallFleet(Number(req.body?.fleetId || 0), req.user.id);
  if (result.error) return res.status(400).json(result);
  res.json({ ...result, fleet: fleetView(req.user.id) });
});

/** Schiffe auf einem Planeten inkl. Kennwerten (für den Flottendialog). */
router.get('/ships', (req, res) => {
  const planet = ownPlanet(req, res);
  if (!planet) return;
  const ships = getShips(planet.id);
  const research = getResearch(req.user.id);
  res.json({
    planetId: planet.id,
    coords: { q: planet.quadrant, s: planet.system, p: planet.position },
    resources: {
      duranium: Math.floor(planet.duranium),
      dilithium: Math.floor(planet.dilithium),
      deuterium: Math.floor(planet.deuterium),
    },
    ships: Object.entries(ships)
      .filter(([key, n]) => n > 0 && SHIPS[key] && !SHIPS[key].stationary)
      .map(([key, n]) => ({ key, name: SHIPS[key].name, count: n, cargo: SHIPS[key].cargo, speed: SHIPS[key].speed })),
    research,
  });
});
