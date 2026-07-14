# 🔐 CipherChat — End-to-End Encrypted Messenger

A Signal-style, **zero-knowledge** real-time messenger. Every message is encrypted
**in the browser** before it ever touches the network. The server stores only
ciphertext and never has access to private keys or plaintext.

> Built to demonstrate applied cryptography, real-time networking, and hardened
> backend security in a single full-stack JavaScript codebase (Node + React).

---

## ✨ What makes this impressive

| Area | What's implemented |
|------|-------------------|
| **End-to-end encryption** | ECDH (P-256) key agreement → HKDF-SHA256 → AES-256-GCM. All crypto runs in-browser via the **Web Crypto API**. |
| **Zero-knowledge server** | Server stores only `ciphertext + IV`. Private keys never leave the device; they're encrypted with a **PBKDF2** password-derived key before any backup. |
| **Real-time networking** | Authenticated **WebSocket** transport with live message delivery, presence (online/offline), typing indicators, and delivery receipts. |
| **Auth & sessions** | **Argon2id** password hashing, short-lived JWT **access tokens** + rotating **refresh tokens** in `httpOnly` `SameSite` cookies. |
| **Defense in depth** | Helmet (CSP, HSTS), per-route **rate limiting**, strict **Zod** input validation, CORS allow-listing, **MongoDB** with typed query filters (no injection). |
| **Forward-secrecy aware** | Per-message random 96-bit IVs; architecture documented for a Double-Ratchet upgrade path. |
| **Encrypted profiles** | Display name, bio, accent color and photo are encrypted client-side and shared to contacts via a profile key delivered under the pairwise ECDH key (sender-key pattern). Even profiles are zero-knowledge. |
| **Cryptographic identicons** | Default avatar is a deterministic identicon derived from the user's public-key fingerprint — your avatar *is* a visual hash of your key, so impersonation is visible at a glance. |
| **X-ray mode** | A per-conversation toggle that reveals the actual AES-256-GCM ciphertext + IV travelling on the wire beside each decrypted message — the zero-knowledge claim made visible. |

---

## 🏗️ Architecture

```
┌─────────────────────────┐         WSS / HTTPS          ┌──────────────────────────┐
│        Browser          │◀───────────────────────────▶│      Node / Express        │
│  ┌───────────────────┐  │                              │  ┌─────────────────────┐  │
│  │  Web Crypto API   │  │   only ciphertext crosses    │  │  REST + ws server   │  │
│  │  ECDH · HKDF ·    │  │   the wire — never plaintext │  │  Argon2 · JWT       │  │
│  │  AES-256-GCM      │  │                              │  │  Helmet · RateLimit │  │
│  └───────────────────┘  │                              │  └──────────┬──────────┘  │
│  Private key (IndexedDB,│                              │             │             │
│  encrypted w/ PBKDF2)   │                              │      ┌──────▼──────┐      │
└─────────────────────────┘                              │      │   MongoDB   │      │
                                                         │      │ (ciphertext)│      │
                                                         │      └─────────────┘      │
                                                         └──────────────────────────┘
```

The trust boundary is the **browser**. Even a fully compromised server (or DBA with
`SELECT *`) sees only random-looking ciphertext.

---

## 🚀 Getting started

### Prerequisites
- Node.js 20+ (tested on v22)
- A **MongoDB** to point at. Easiest with no install: a free **MongoDB Atlas**
  cluster (copy its connection string). Or run locally with
  `docker run -d -p 27017:27017 mongo:7` (or `docker compose up -d`).

### 1. Backend
```bash
cd server
cp .env.example .env       # set MONGODB_URI (Atlas or local) + secrets
npm install
npm run dev                # http://localhost:4000
```
Collections (`users`, `refresh_tokens`, `conversations`, `messages`,
`profile_key_shares`) and their indexes are created automatically on boot.

### 2. Frontend (in a second terminal)
```bash
cd client
npm install
npm run dev                # http://localhost:5173
```

Open two browser windows (or one normal + one incognito), register two users,
start a conversation, and watch encrypted messages flow in real time. Open the
**Network** tab — you'll only ever see base64 ciphertext.

---

## 🔒 Crypto walkthrough (the interview talking points)

1. **Registration** — the browser generates an ECDH P-256 key pair. The public key
   is uploaded; the private key is exported, encrypted with `AES-GCM` under a key
   derived from the password via `PBKDF2(100k, SHA-256)`, and stored locally
   (with an encrypted backup on the server the server cannot read).
2. **Session key** — to talk to Bob, Alice computes
   `ECDH(alicePriv, bobPub)` → 256-bit shared secret → `HKDF-SHA256` →
   `AES-256-GCM` conversation key. Bob derives the identical key independently.
3. **Message** — `AES-GCM` with a fresh random 96-bit IV per message. The server
   persists `{ciphertext, iv}` and relays it; it can never decrypt.

See [`client/src/crypto/e2ee.js`](client/src/crypto/e2ee.js) — the entire crypto
core is ~150 readable lines.

---

## 📁 Layout
```
cipherchat/
├── docker-compose.yml      # MongoDB (optional, for local dev)
├── server/                 # Express + ws + MongoDB (JavaScript, ESM)
└── client/                 # React + Vite + Tailwind (JavaScript / JSX)
```

## ⚠️ Security notes
This is a portfolio project demonstrating the right primitives. For production
you'd add: device-key verification (safety numbers), the full Double Ratchet for
forward secrecy, key transparency, and a hardened TURN/relay deployment. These are
documented as deliberate next steps, not oversights.
