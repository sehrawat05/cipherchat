import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

export const conversationsRouter = Router();

/** Conversations store the participant pair sorted, so (A,B) == (B,A). */
function sortPair(a, b) {
  return a < b ? [a, b] : [b, a];
}

/** Find-or-create the 1:1 conversation between req.user and :userId. */
export async function getOrCreateConversation(meId, otherId) {
  const [a, b] = sortPair(meId, otherId);
  const existing = await db.conversations.findOne({ user_a: a, user_b: b }, { projection: { _id: 1 } });
  if (existing) return existing._id;

  const id = randomUUID();
  await db.conversations.insertOne({ _id: id, user_a: a, user_b: b, created_at: new Date() });
  return id;
}

// List my conversations with the other participant + last-activity ordering.
conversationsRouter.get('/', requireAuth, async (req, res) => {
  const me = req.user.sub;
  const convs = await db.conversations
    .find({ $or: [{ user_a: me }, { user_b: me }] })
    .toArray();
  if (convs.length === 0) return res.json({ conversations: [] });

  const otherIds = convs.map((c) => (c.user_a === me ? c.user_b : c.user_a));
  const users = await db.users
    .find({ _id: { $in: otherIds } })
    .project({ username: 1, public_key: 1 })
    .toArray();
  const userMap = new Map(users.map((u) => [u._id, u]));

  // Last-activity timestamp per conversation.
  const lastAgg = await db.messages
    .aggregate([
      { $match: { conversation_id: { $in: convs.map((c) => c._id) } } },
      { $group: { _id: '$conversation_id', last_at: { $max: '$created_at' } } },
    ])
    .toArray();
  const lastMap = new Map(lastAgg.map((x) => [x._id, x.last_at]));

  const conversations = convs
    .map((c) => {
      const otherId = c.user_a === me ? c.user_b : c.user_a;
      const other = userMap.get(otherId) ?? {};
      return {
        id: c._id,
        other_id: otherId,
        other_username: other.username ?? null,
        other_public_key: other.public_key ?? null,
        last_at: lastMap.get(c._id) ?? null,
        _created: c.created_at,
      };
    })
    .sort((a, b) => {
      const at = a.last_at ? new Date(a.last_at).getTime() : 0;
      const bt = b.last_at ? new Date(b.last_at).getTime() : 0;
      if (bt !== at) return bt - at;
      return new Date(b._created).getTime() - new Date(a._created).getTime();
    })
    // eslint-disable-next-line no-unused-vars
    .map(({ _created, ...rest }) => rest);

  res.json({ conversations });
});

// Open (or create) a conversation with another user.
conversationsRouter.post('/', requireAuth, async (req, res) => {
  const parsed = z.object({ userId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid userId' });
  if (parsed.data.userId === req.user.sub) {
    return res.status(400).json({ error: 'Cannot start a conversation with yourself' });
  }

  const other = await db.users.findOne(
    { _id: parsed.data.userId },
    { projection: { username: 1, public_key: 1 } },
  );
  if (!other?.public_key) {
    return res.status(404).json({ error: 'User not found or has no key' });
  }

  const id = await getOrCreateConversation(req.user.sub, parsed.data.userId);
  res.json({
    id,
    other_id: other._id,
    other_username: other.username,
    other_public_key: other.public_key,
    last_at: null,
  });
});
