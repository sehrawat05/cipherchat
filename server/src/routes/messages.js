import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

export const messagesRouter = Router();

/** Ensure the requesting user actually belongs to the conversation. */
async function assertMember(conversationId, userId) {
  const c = await db.conversations.findOne(
    { _id: conversationId, $or: [{ user_a: userId }, { user_b: userId }] },
    { projection: { _id: 1 } },
  );
  return !!c;
}

// Paginated ciphertext history for a conversation (newest last).
messagesRouter.get('/:conversationId/messages', requireAuth, async (req, res) => {
  const { conversationId } = req.params;
  if (!z.string().uuid().safeParse(conversationId).success) {
    return res.status(400).json({ error: 'Invalid conversation id' });
  }
  if (!(await assertMember(conversationId, req.user.sub))) {
    return res.status(403).json({ error: 'Not a member of this conversation' });
  }

  const before = typeof req.query.before === 'string' ? new Date(req.query.before) : null;
  const filter = { conversation_id: conversationId };
  if (before && !Number.isNaN(before.getTime())) filter.created_at = { $lt: before };

  const rows = await db.messages
    .find(filter)
    .sort({ created_at: -1 })
    .limit(50)
    .toArray();

  // Return chronological (oldest first) for easy rendering.
  const messages = rows
    .reverse()
    .map((m) => ({
      id: m._id,
      sender_id: m.sender_id,
      ciphertext: m.ciphertext,
      iv: m.iv,
      created_at: m.created_at,
    }));
  res.json({ messages });
});
