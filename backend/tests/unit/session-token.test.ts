/**
 * Session tokens.
 *
 * These guard the worst bug this codebase has had: `mock-dev-token-<userId>`
 * was accepted in every environment with no signature, no expiry and no
 * password. User ids are not secret — they come back in member lists, task
 * assignees and comments — so anyone who could read one could authenticate as
 * that user, including the platform super-admin. Production sets
 * NODE_ENV=development, so an environment check alone would not have closed it.
 *
 * Any change that makes a token accepted without a valid signature reopens a
 * total compromise of every deal on the platform.
 */

import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.AUTH_SESSION_SECRET = 'a-test-secret-that-is-at-least-32-characters';
});

const load = async () => import('../../src/utils/session-token');

describe('session tokens', () => {
  it('round-trips a user id', async () => {
    const { issueSessionToken, verifySessionToken } = await load();
    const token = issueSessionToken('user-123');
    expect(verifySessionToken(token)?.userId).toBe('user-123');
  });

  it('rejects a tampered payload — the forgery this exists to stop', async () => {
    const { issueSessionToken, verifySessionToken } = await load();
    const token = issueSessionToken('user-123');
    const [prefix, body, sig] = token.split('.');

    // Swap the claimed user id but keep the original signature: this is exactly
    // "I read a super-admin's id from a member list".
    const forged = Buffer.from(JSON.stringify({ userId: 'super-admin', expiresAt: Date.now() + 60_000 })).toString('base64url');
    expect(verifySessionToken(`${prefix}.${forged}.${sig}`)).toBeNull();
  });

  it('rejects a tampered signature', async () => {
    const { issueSessionToken, verifySessionToken } = await load();
    const token = issueSessionToken('user-123');
    expect(verifySessionToken(`${token.slice(0, -1)}X`)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const { issueSessionToken, verifySessionToken } = await load();
    expect(verifySessionToken(issueSessionToken('user-123', -1000))).toBeNull();
  });

  it('rejects garbage and the legacy unsigned format', async () => {
    const { verifySessionToken } = await load();
    for (const bad of [
      '',
      'nonsense',
      'ddv1.only-two-parts',
      // The legacy format must never verify as a session on its own.
      'mock-dev-token-12fe6547-499f-4c71-a6ee-19c3113cbd80',
    ]) {
      expect(verifySessionToken(bad), `expected null for ${JSON.stringify(bad)}`).toBeNull();
    }
  });

  it('gates the legacy dev path on an explicit flag, never on NODE_ENV', async () => {
    const { devAuthAllowed } = await load();

    delete process.env.ALLOW_DEV_AUTH;
    expect(devAuthAllowed()).toBe(false);

    // Production runs NODE_ENV=development here, so inferring the gate from the
    // environment would have left the bypass open in exactly the place it
    // mattered. Only the explicit flag may open it.
    process.env.NODE_ENV = 'development';
    expect(devAuthAllowed()).toBe(false);

    process.env.ALLOW_DEV_AUTH = 'true';
    expect(devAuthAllowed()).toBe(true);
    delete process.env.ALLOW_DEV_AUTH;
  });
});
