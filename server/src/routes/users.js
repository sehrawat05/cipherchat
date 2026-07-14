import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

export const usersRouter = Router();

// Find users by username prefix (to start a conversation with someone).
usersRouter.get('/', requireAuth, async (req, res) => {
  const q = z.string().min(1).max(32).safeParse(req.query.q);
  if (!q.success) return res.json({ users: [] });

  // Username is validated to [a-zA-Z0-9_]; escape defensively anyway.
  const prefix = q.data.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rows = await db.users
    .find({
      username: { $regex: `^${prefix}`, $options: 'i' },
      _id: { $ne: req.user.sub },
      public_key: { $ne: null },
    })
    .project({ username: 1 })
    .sort({ username: 1 })
    .limit(10)
    .toArray();

  res.json({ users: rows.map((u) => ({ id: u._id, username: u.username })) });
});

// Fetch a user's public key to derive a shared E2EE session key.
usersRouter.get('/:id/public-key', requireAuth, async (req, res) => {
  const row = await db.users.findOne(
    { _id: req.params.id },
    { projection: { username: 1, public_key: 1 } },
  );
  if (!row?.public_key) return res.status(404).json({ error: 'User or key not found' });
  res.json({ id: req.params.id, username: row.username, publicKey: row.public_key });
});
