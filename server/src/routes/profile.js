import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

export const profileRouter = Router();

// All profile data is ciphertext to the server — these limits just bound size.
const profileBody = z.object({
  encProfile: z.string().min(1).max(2_000_000), // encrypted blob incl. photo
  encProfileIv: z.string().min(1).max(256),
});

const shareBody = z.object({
  recipientId: z.string().uuid(),
  encKey: z.string().min(1).max(4000),
  iv: z.string().min(1).max(256),
});

// Upload/replace my own encrypted profile blob.
profileRouter.put('/', requireAuth, async (req, res) => {
  const parsed = profileBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid profile' });
  await db.users.updateOne(
    { _id: req.user.sub },
    { $set: { enc_profile: parsed.data.encProfile, enc_profile_iv: parsed.data.encProfileIv } },
  );
  res.json({ ok: true });
});

// Fetch a user's encrypted profile blob (useless without their profile key).
profileRouter.get('/:userId', requireAuth, async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.userId).success) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  const row = await db.users.findOne(
    { _id: req.params.userId },
    { projection: { enc_profile: 1, enc_profile_iv: 1 } },
  );
  if (!row?.enc_profile) return res.status(404).json({ error: 'No profile' });
  res.json({ encProfile: row.enc_profile, encProfileIv: row.enc_profile_iv });
});

// Share my profile key with a contact (encrypted under our conversation key).
profileRouter.put('/share/key', requireAuth, async (req, res) => {
  const parsed = shareBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid share' });
  const { recipientId, encKey, iv } = parsed.data;
  await db.profileKeyShares.updateOne(
    { owner_id: req.user.sub, recipient_id: recipientId },
    { $set: { enc_key: encKey, iv, updated_at: new Date() } },
    { upsert: true },
  );
  res.json({ ok: true });
});

// Fetch the profile key a given owner shared with me.
profileRouter.get('/key/:ownerId', requireAuth, async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.ownerId).success) {
    return res.status(400).json({ error: 'Invalid owner id' });
  }
  const row = await db.profileKeyShares.findOne({
    owner_id: req.params.ownerId,
    recipient_id: req.user.sub,
  });
  if (!row) return res.status(404).json({ error: 'No shared key' });
  res.json({ encKey: row.enc_key, iv: row.iv });
});
