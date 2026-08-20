import crypto from 'crypto';

/**
 * Signed session tokens for the credential login path.
 *
 * The prototype previously handed the client `mock-dev-token-<userId>` and
 * accepted any string of that shape on the way back in. That is not a token —
 * it is a user id with a prefix, and user ids are not secret: they come back in
 * project-member lists, task assignees and comments. Anyone who could read one
 * could mint a session as that user, including the platform super-admin, with
 * no password. The bypass ran in every environment, and production sets
 * NODE_ENV=development, so an environment check alone would not have closed it.
 *
 * These tokens carry the same claim but are HMAC-signed and expire, so a leaked
 * id is no longer a credential.
 */

const ALG = 'sha256';
const PREFIX = 'ddv1';
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000; // 12h

/**
 * Signing key. A missing secret must never silently degrade to a guessable
 * default, so we fall back to a random per-process key: sessions then die on
 * restart, which is a visible inconvenience rather than a silent hole.
 */
const SECRET: string = (() => {
  const configured = process.env.AUTH_SESSION_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (configured) {
    // eslint-disable-next-line no-console
    console.warn('[auth] AUTH_SESSION_SECRET is shorter than 32 chars — ignoring it.');
  }
  // eslint-disable-next-line no-console
  console.warn(
    '[auth] AUTH_SESSION_SECRET not set — using a random per-process key. ' +
      'Sessions will not survive a restart. Set it to persist logins.'
  );
  return crypto.randomBytes(48).toString('hex');
})();

const b64url = (buf: Buffer): string => buf.toString('base64url');

const sign = (payload: string): string =>
  crypto.createHmac(ALG, SECRET).update(payload).digest('base64url');

export interface SessionClaims {
  userId: string;
  expiresAt: number;
}

/** Mint a signed token for a user id. */
export function issueSessionToken(userId: string, ttlMs: number = DEFAULT_TTL_MS): string {
  const claims: SessionClaims = { userId, expiresAt: Date.now() + ttlMs };
  const body = b64url(Buffer.from(JSON.stringify(claims)));
  return `${PREFIX}.${body}.${sign(body)}`;
}

/**
 * Verify a token and return its claims, or null.
 *
 * Returns null for every failure mode rather than throwing — the caller's job
 * is to reject, and distinguishing "bad signature" from "expired" in a response
 * only helps an attacker.
 */
export function verifySessionToken(token: string): SessionClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;

  const [, body, signature] = parts;
  const expected = sign(body);
  // Constant-time compare; lengths must match first or timingSafeEqual throws.
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString()) as SessionClaims;
    if (!claims?.userId || typeof claims.expiresAt !== 'number') return null;
    if (Date.now() > claims.expiresAt) return null;
    return claims;
  } catch {
    return null;
  }
}

/**
 * Whether the unsigned `mock-dev-token-<id>` path is permitted.
 *
 * Explicit opt-in, never inferred from NODE_ENV — production runs with
 * NODE_ENV=development, so inferring it would leave the bypass wide open there.
 */
export const devAuthAllowed = (): boolean => process.env.ALLOW_DEV_AUTH === 'true';
