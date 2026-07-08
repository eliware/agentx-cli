import crypto from 'node:crypto';

export const AUTH_TOKEN_TTL_MS = 30_000;

const authTokens = new Map();

function now() {
  return Date.now();
}

function purgeExpiredTokens(currentTime = now()) {
  for (const [token, record] of authTokens.entries()) {
    if (record.expiresAt <= currentTime) {
      authTokens.delete(token);
    }
  }
}

export function issueAuthToken(username, ttlMs = AUTH_TOKEN_TTL_MS) {
  purgeExpiredTokens();
  const token = crypto.randomBytes(24).toString('base64url');
  const expiresAt = now() + ttlMs;
  authTokens.set(token, { username, expiresAt });
  return { token, username, expiresAt, ttlMs };
}

export function consumeAuthToken(token) {
  if (!token) return null;
  purgeExpiredTokens();
  const record = authTokens.get(token);
  if (!record) return null;
  authTokens.delete(token);
  if (record.expiresAt <= now()) {
    return null;
  }
  return { token, ...record };
}

export function peekAuthToken(token) {
  if (!token) return null;
  purgeExpiredTokens();
  const record = authTokens.get(token);
  return record ? { token, ...record } : null;
}

export function parseBearerToken(value) {
  if (!value) return null;
  const text = Array.isArray(value) ? value[0] : String(value);
  const match = text.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() || null : null;
}

export function clearAuthTokens() {
  authTokens.clear();
}

export function countAuthTokens() {
  purgeExpiredTokens();
  return authTokens.size;
}
