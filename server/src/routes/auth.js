import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { z } from 'zod';
import { db } from '../db.js';
import { config } from '../config.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/auth.js';
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
  refreshExpiry,
} from '../utils/jwt.js';

export const authRouter = Router();

const REFRESH_COOKIE = 'cc_refresh';

const credentials = z.object({
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/, 'letters, numbers, underscore only'),
  password: z.string().min(8).max(200),
});

// Optional E2EE key material uploaded at registration (all client-encrypted).
const keyBundle = z.object({
  publicKey: z.string().min(1).max(4000),
  encPrivateKey: z.string().min(1).max(8000),
  encPkSalt: z.string().min(1).max(256),
  encPkIv: z.string().min(1).max(256),
});

const registerBody = credentials.extend({ keys: keyBundle.optional() });

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: config.isProd ? 'strict' : 'lax',
    path: '/api/auth',
    maxAge: config.jwt.refreshTtlDays * 24 * 60 * 60 * 1000,
  });
}

async function issueRefreshToken(res, userId) {
  const { token, hash } = generateRefreshToken();
  await db.refreshTokens.insertOne({
    _id: randomUUID(),
    user_id: userId,
    token_hash: hash,
    expires_at: refreshExpiry(),
    revoked: false,
    created_at: new Date(),
  });
  setRefreshCookie(res, token);
}

authRouter.post('/register', authLimiter, async (req, res) => {
  const parsed = registerBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
  }
  const { username, password, keys } = parsed.data;

  const exists = await db.users.findOne({ username }, { projection: { _id: 1 } });
  if (exists) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  // Argon2id (default): memory-hard, the modern standard for password hashing.
  const passwordHash = await argonHash(password);

  const userId = randomUUID();
  await db.users.insertOne({
    _id: userId,
    username,
    password_hash: passwordHash,
    public_key: keys?.publicKey ?? null,
    enc_private_key: keys?.encPrivateKey ?? null,
    enc_pk_salt: keys?.encPkSalt ?? null,
    enc_pk_iv: keys?.encPkIv ?? null,
    enc_profile: null,
    enc_profile_iv: null,
    created_at: new Date(),
  });

  await issueRefreshToken(res, userId);
  const accessToken = signAccessToken({ sub: userId, username });
  res.status(201).json({ accessToken, user: { id: userId, username } });
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid credentials format' });
  }
  const { username, password } = parsed.data;

  const row = await db.users.findOne(
    { username },
    { projection: { password_hash: 1 } },
  );

  // Constant-ish response: always verify against *something* to blunt user enumeration.
  const ok = row ? await argonVerify(row.password_hash, password) : false;
  if (!ok || !row) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  await issueRefreshToken(res, row._id);
  const accessToken = signAccessToken({ sub: row._id, username });
  res.json({ accessToken, user: { id: row._id, username } });
});

// Rotating refresh: each refresh revokes the old token and issues a new one.
authRouter.post('/refresh', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) return res.status(401).json({ error: 'No refresh token' });

  const tokenHash = hashToken(token);
  const rt = await db.refreshTokens.findOne({
    token_hash: tokenHash,
    revoked: false,
    expires_at: { $gt: new Date() },
  });
  if (!rt) return res.status(401).json({ error: 'Invalid refresh token' });

  const user = await db.users.findOne({ _id: rt.user_id }, { projection: { username: 1 } });
  if (!user) return res.status(401).json({ error: 'Invalid refresh token' });

  await db.refreshTokens.updateOne({ _id: rt._id }, { $set: { revoked: true } });
  await issueRefreshToken(res, rt.user_id);
  const accessToken = signAccessToken({ sub: rt.user_id, username: user.username });
  res.json({ accessToken, user: { id: rt.user_id, username: user.username } });
});

authRouter.post('/logout', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) {
    await db.refreshTokens.updateMany(
      { token_hash: hashToken(token) },
      { $set: { revoked: true } },
    );
  }
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  res.json({ ok: true });
});

// Returns this user's own encrypted private-key bundle for device restore.
authRouter.get('/keys/me', requireAuth, async (req, res) => {
  const row = await db.users.findOne(
    { _id: req.user.sub },
    { projection: { public_key: 1, enc_private_key: 1, enc_pk_salt: 1, enc_pk_iv: 1 } },
  );
  if (!row?.public_key) return res.status(404).json({ error: 'No keys on file' });
  res.json({
    publicKey: row.public_key,
    encPrivateKey: row.enc_private_key,
    encPkSalt: row.enc_pk_salt,
    encPkIv: row.enc_pk_iv,
  });
});

// Upload/replace key material (e.g. first login after registering without keys).
authRouter.put('/keys/me', requireAuth, async (req, res) => {
  const parsed = keyBundle.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid key bundle' });
  const { publicKey, encPrivateKey, encPkSalt, encPkIv } = parsed.data;
  await db.users.updateOne(
    { _id: req.user.sub },
    {
      $set: {
        public_key: publicKey,
        enc_private_key: encPrivateKey,
        enc_pk_salt: encPkSalt,
        enc_pk_iv: encPkIv,
      },
    },
  );
  res.json({ ok: true });
});
