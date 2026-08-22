import express from 'express';
import { db } from '../db.js';
import { authenticate } from '../auth.js';
import { highscore, userRank } from '../engine/stats.js';

export const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const type = ['points', 'eco', 'res', 'mil'].includes(String(req.query.type)) ? String(req.query.type) : 'points';
  const page = Math.max(0, Math.floor(Number(req.query.page) || 0));
  const limit = 50;

  const rows = highscore(type, limit, page * limit);
  const total = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;

  res.json({
    type, page, pages: Math.ceil(total / limit), total,
    rows: rows.map((r) => ({
      rank: r.rank, id: r.id, username: r.username, faction: r.faction,
      points: r.points, planets: r.planets, banned: !!r.banned,
      alliance: r.alliance_tag ? { id: r.alliance_id, tag: r.alliance_tag } : null,
      isMe: r.id === req.user.id,
    })),
    myRank: userRank(req.user.id, type),
  });
});
