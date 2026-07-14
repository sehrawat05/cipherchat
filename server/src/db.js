import { MongoClient } from 'mongodb';
import { config } from './config.js';

/**
 * MongoDB data layer. The server is zero-knowledge: it stores public keys,
 * encrypted private-key backups it cannot decrypt, and message ciphertext only.
 *
 * Document ids are string UUIDs (stored as `_id`) so they flow cleanly into JWTs
 * and the client, and match the `uuid` validation the routes already use.
 */

let client;

// Populated by connectDb(); routes read collections off this object at call time.
export const db = {
  users: null,
  refreshTokens: null,
  conversations: null,
  messages: null,
  profileKeyShares: null,
};

export async function connectDb() {
  client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const database = client.db(config.mongoDb);
  db.users = database.collection('users');
  db.refreshTokens = database.collection('refresh_tokens');
  db.conversations = database.collection('conversations');
  db.messages = database.collection('messages');
  db.profileKeyShares = database.collection('profile_key_shares');
  await ensureIndexes();
  console.log(`[db] connected to MongoDB (${config.mongoDb})`);
}

async function ensureIndexes() {
  await db.users.createIndex({ username: 1 }, { unique: true });
  await db.refreshTokens.createIndex({ token_hash: 1 });
  await db.refreshTokens.createIndex({ user_id: 1 });
  await db.conversations.createIndex({ user_a: 1, user_b: 1 }, { unique: true });
  await db.messages.createIndex({ conversation_id: 1, created_at: 1 });
  await db.profileKeyShares.createIndex({ owner_id: 1, recipient_id: 1 }, { unique: true });
}

export async function closeDb() {
  if (client) await client.close();
}
