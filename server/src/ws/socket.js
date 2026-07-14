import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import { db } from '../db.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { config } from '../config.js';

/**
 * Real-time transport. The server never decrypts anything here — it authenticates
 * the socket, persists ciphertext, and relays it to the recipient's live sockets.
 */

// userId -> set of live sockets (a user may have multiple tabs/devices).
const online = new Map();

function addClient(userId, socket) {
  if (!online.has(userId)) online.set(userId, new Set());
  online.get(userId).add(socket);
}

function removeClient(userId, socket) {
  const set = online.get(userId);
  if (!set) return false;
  set.delete(socket);
  if (set.size === 0) {
    online.delete(userId);
    return true; // user is now fully offline
  }
  return false;
}

function isOnline(userId) {
  return online.has(userId);
}

function sendTo(userId, payload) {
  const set = online.get(userId);
  if (!set) return;
  const data = JSON.stringify(payload);
  for (const socket of set) {
    if (socket.readyState === WebSocket.OPEN) socket.send(data);
  }
}

function send(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

/** Return the *other* participant of a conversation, or null if not a member. */
async function otherParticipant(conversationId, userId) {
  const row = await db.conversations.findOne(
    { _id: conversationId },
    { projection: { user_a: 1, user_b: 1 } },
  );
  if (!row) return null;
  if (row.user_a === userId) return row.user_b;
  if (row.user_b === userId) return row.user_a;
  return null; // requester is not a member
}

/** Partner user ids for a given user (the other side of each conversation). */
async function partnerIds(userId) {
  const convs = await db.conversations
    .find({ $or: [{ user_a: userId }, { user_b: userId }] })
    .project({ user_a: 1, user_b: 1 })
    .toArray();
  return convs.map((c) => (c.user_a === userId ? c.user_b : c.user_a));
}

const sendSchema = z.object({
  type: z.literal('message:send'),
  conversationId: z.string().uuid(),
  ciphertext: z.string().min(1).max(20000),
  iv: z.string().min(1).max(256),
  tempId: z.string().max(64).optional(),
});

const typingSchema = z.object({
  type: z.literal('typing'),
  conversationId: z.string().uuid(),
  isTyping: z.boolean(),
});

const readSchema = z.object({
  type: z.literal('read'),
  conversationId: z.string().uuid(),
});

async function handleMessage(client, raw) {
  const base = z.object({ type: z.string() }).safeParse(raw);
  if (!base.success) return;

  switch (base.data.type) {
    case 'message:send': {
      const parsed = sendSchema.safeParse(raw);
      if (!parsed.success) return send(client.socket, { type: 'error', error: 'bad message' });
      const { conversationId, ciphertext, iv, tempId } = parsed.data;

      const recipient = await otherParticipant(conversationId, client.userId);
      if (!recipient) return send(client.socket, { type: 'error', error: 'not a member' });

      const id = randomUUID();
      const createdAt = new Date();
      await db.messages.insertOne({
        _id: id,
        conversation_id: conversationId,
        sender_id: client.userId,
        ciphertext,
        iv,
        delivered: isOnline(recipient),
        read_at: null,
        created_at: createdAt,
      });

      const message = {
        id,
        conversationId,
        senderId: client.userId,
        ciphertext,
        iv,
        createdAt,
      };

      // Relay ciphertext to recipient's live sockets...
      sendTo(recipient, { type: 'message:new', message });
      // ...and acknowledge to the sender (so the optimistic bubble confirms).
      send(client.socket, { type: 'message:sent', tempId, id, createdAt });
      break;
    }

    case 'typing': {
      const parsed = typingSchema.safeParse(raw);
      if (!parsed.success) return;
      const recipient = await otherParticipant(parsed.data.conversationId, client.userId);
      if (recipient) {
        sendTo(recipient, {
          type: 'typing',
          conversationId: parsed.data.conversationId,
          from: client.userId,
          isTyping: parsed.data.isTyping,
        });
      }
      break;
    }

    case 'read': {
      const parsed = readSchema.safeParse(raw);
      if (!parsed.success) return;
      const recipient = await otherParticipant(parsed.data.conversationId, client.userId);
      if (!recipient) return;
      await db.messages.updateMany(
        { conversation_id: parsed.data.conversationId, sender_id: recipient, read_at: null },
        { $set: { read_at: new Date() } },
      );
      sendTo(recipient, {
        type: 'read',
        conversationId: parsed.data.conversationId,
        from: client.userId,
      });
      break;
    }
  }
}

/** Notify a user's conversation partners about their presence change. */
async function broadcastPresence(userId, isUserOnline) {
  for (const partner of await partnerIds(userId)) {
    sendTo(partner, { type: 'presence', userId, online: isUserOnline });
  }
}

/** On connect, tell the new client which of their partners are currently online. */
async function sendPresenceSnapshot(client) {
  const partners = await partnerIds(client.userId);
  const onlinePartners = partners.filter((id) => isOnline(id));
  send(client.socket, { type: 'presence:snapshot', online: onlinePartners });
}

export function attachWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (socket, req) => {
    // Authenticate the handshake: ?token=<access JWT>. Origin is also checked.
    const origin = req.headers.origin;
    if (origin && !config.clientOrigins.includes(origin)) {
      socket.close(1008, 'origin not allowed');
      return;
    }
    const url = new URL(req.url ?? '', 'http://localhost');
    const token = url.searchParams.get('token');
    if (!token) return socket.close(1008, 'missing token');

    let client;
    try {
      const payload = verifyAccessToken(token);
      client = { userId: payload.sub, username: payload.username, socket };
    } catch {
      return socket.close(1008, 'invalid token');
    }

    addClient(client.userId, socket);

    // Register listeners synchronously BEFORE any await, so messages sent
    // immediately after the socket opens are never missed.
    let alive = true;
    socket.on('pong', () => (alive = true));
    const heartbeat = setInterval(() => {
      if (!alive) return socket.terminate();
      alive = false;
      socket.ping();
    }, 30_000);

    socket.on('message', async (data) => {
      try {
        await handleMessage(client, JSON.parse(data.toString()));
      } catch {
        send(socket, { type: 'error', error: 'malformed payload' });
      }
    });

    socket.on('close', async () => {
      clearInterval(heartbeat);
      const fullyOffline = removeClient(client.userId, socket);
      if (fullyOffline) await broadcastPresence(client.userId, false);
    });

    // Now the (async) presence work.
    await sendPresenceSnapshot(client);
    await broadcastPresence(client.userId, true);
  });

  console.log('[ws] websocket server attached at /ws');
}
