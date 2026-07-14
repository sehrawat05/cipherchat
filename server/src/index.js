import { createServer } from 'node:http';
import express from 'express';
import 'express-async-errors'; // forwards async route rejections to the error handler
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { connectDb, closeDb } from './db.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { conversationsRouter } from './routes/conversations.js';
import { messagesRouter } from './routes/messages.js';
import { profileRouter } from './routes/profile.js';
import { attachWebSocket } from './ws/socket.js';

const app = express();

// Behind a proxy in prod (needed for secure cookies + correct client IPs).
app.set('trust proxy', 1);

// --- Security headers (CSP, HSTS, no-sniff, frameguard, etc.) ---
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", ...config.clientOrigins, 'ws:', 'wss:'],
        imgSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    hsts: config.isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
  }),
);

// --- CORS: allow-list only, credentials enabled for refresh cookie ---
app.use(
  cors({
    origin: config.clientOrigins,
    credentials: true,
  }),
);

app.use(express.json({ limit: '2mb' })); // generous: encrypted profile photos
app.use(cookieParser());
app.use('/api', apiLimiter);

app.get('/api/health', (_req, res) => res.json({ ok: true, database: 'mongodb', ts: Date.now() }));

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/conversations', messagesRouter); // GET /:id/messages
app.use('/api/profile', profileRouter);

// Centralized error handler — never leak internals to clients.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[api] unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = createServer(app);
attachWebSocket(server);

async function start() {
  await connectDb();
  server.listen(config.port, () => {
    console.log(`[http] CipherChat API listening on http://localhost:${config.port}`);
    console.log(`[http] allowed origins: ${config.clientOrigins.join(', ')}`);
  });
}

start().catch((err) => {
  console.error('[fatal] failed to start server', err);
  process.exit(1);
});

// Safety net: log stray async errors instead of crashing the process.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

// Graceful shutdown.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    console.log(`\n[shutdown] ${signal} received, closing...`);
    server.close();
    await closeDb();
    process.exit(0);
  });
}
