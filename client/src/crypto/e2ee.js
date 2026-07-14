/**
 * CipherChat end-to-end encryption core.
 *
 * Everything in this file runs IN THE BROWSER. The server never sees a private
 * key or any plaintext. Primitives (all from the standard Web Crypto API):
 *
 *   Identity keys   ECDH P-256 (per user, long-term)
 *   Key agreement   ECDH  ->  shared secret
 *   Key derivation  HKDF-SHA256  ->  AES-256-GCM conversation key
 *   Message cipher  AES-256-GCM with a fresh random 96-bit IV per message
 *   Key-at-rest     private key wrapped with AES-GCM under a PBKDF2(password) key
 */

const subtle = crypto.subtle;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const PBKDF2_ITERATIONS = 100_000;

// ---------- byte helpers ----------
function alloc(len) {
  return new Uint8Array(len);
}
function randomBytes(len) {
  return crypto.getRandomValues(alloc(len));
}
function utf8(str) {
  const src = encoder.encode(str);
  const out = alloc(src.byteLength);
  out.set(src);
  return out;
}
function bufToB64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function b64ToBuf(b64) {
  const bin = atob(b64);
  const bytes = alloc(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const HKDF_INFO = utf8('CipherChat-session-v1');
const PROFILE_INFO = utf8('CipherChat-profile-v1');

function b64urlToBytes(b64url) {
  const b64 = b64url
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(b64url.length / 4) * 4, '=');
  return b64ToBuf(b64);
}

// ---------- identity keys ----------
export async function generateIdentityKeyPair() {
  return subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
}

export async function exportPublicKey(key) {
  const jwk = await subtle.exportKey('jwk', key);
  return JSON.stringify(jwk);
}

export async function importPublicKey(jwkString) {
  const jwk = JSON.parse(jwkString);
  return subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
}

async function importPrivateKey(jwk) {
  return subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
}

// ---------- conversation key (ECDH -> HKDF -> AES-GCM) ----------
export async function deriveConversationKey(myPrivateKey, theirPublicKey) {
  // 1. ECDH agreement -> raw shared secret bits.
  const sharedBits = await subtle.deriveBits(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    256,
  );
  // 2. Feed the secret through HKDF so the AES key is uniformly random.
  const hkdfKey = await subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: alloc(0), info: HKDF_INFO },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ---------- profile key (derived from the identity private key) ----------
/**
 * Deterministically derive a symmetric "profile key" from the user's private
 * key via HKDF. Because it's derived, it needs no separate backup — it can be
 * recreated on any device that has restored the private key. It's exportable so
 * it can be shared to contacts (encrypted under the pairwise conversation key).
 */
export async function deriveProfileKey(privateKey) {
  const jwk = await subtle.exportKey('jwk', privateKey);
  if (!jwk.d) throw new Error('private key not exportable');
  const ikm = b64urlToBytes(jwk.d);
  const hkdfKey = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: alloc(0), info: PROFILE_INFO },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    true, // extractable so we can share it with contacts
    ['encrypt', 'decrypt'],
  );
}

/** Export a symmetric AES key to a base64 string (to share it with a contact). */
export async function exportRawKey(key) {
  return bufToB64(await subtle.exportKey('raw', key));
}

/** Import a base64 AES key shared by a contact. */
export async function importRawKey(b64) {
  return subtle.importKey('raw', b64ToBuf(b64), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

// ---------- message encryption ----------
export async function encryptMessage(key, plaintext) {
  const iv = randomBytes(12);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, utf8(plaintext));
  return { ciphertext: bufToB64(ct), iv: bufToB64(iv) };
}

export async function decryptMessage(key, payload) {
  const pt = await subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBuf(payload.iv) },
    key,
    b64ToBuf(payload.ciphertext),
  );
  return decoder.decode(pt);
}

// ---------- private-key wrapping (encrypt-at-rest with the password) ----------
async function deriveKeyEncryptionKey(password, salt) {
  const baseKey = await subtle.importKey('raw', utf8(password), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypt the private key with a password-derived key (for server backup). */
export async function wrapPrivateKey(privateKey, password) {
  const jwk = await subtle.exportKey('jwk', privateKey);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const kek = await deriveKeyEncryptionKey(password, salt);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, kek, utf8(JSON.stringify(jwk)));
  return {
    encPrivateKey: bufToB64(ct),
    encPkSalt: bufToB64(salt),
    encPkIv: bufToB64(iv),
  };
}

/** Decrypt a wrapped private key on a fresh device using the password. */
export async function unwrapPrivateKey(wrapped, password) {
  const kek = await deriveKeyEncryptionKey(password, b64ToBuf(wrapped.encPkSalt));
  const ptBuf = await subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBuf(wrapped.encPkIv) },
    kek,
    b64ToBuf(wrapped.encPrivateKey),
  );
  const jwk = JSON.parse(decoder.decode(ptBuf));
  return importPrivateKey(jwk);
}

/** Short fingerprint of a public key — a human-comparable "safety number". */
export async function keyFingerprint(publicKeyJwk) {
  const digest = await subtle.digest('SHA-256', utf8(publicKeyJwk));
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  // 5 groups of 5 hex chars, e.g. "a1b2c d3e4f ...".
  return hex.slice(0, 25).replace(/(.{5})/g, '$1 ').trim();
}
