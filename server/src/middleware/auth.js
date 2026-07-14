import { verifyAccessToken } from '../utils/jwt.js';

/** Requires a valid Bearer access token. Attaches req.user. */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing access token' });
    return;
  }
  try {
    req.user = verifyAccessToken(header.slice('Bearer '.length));
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired access token' });
  }
}
