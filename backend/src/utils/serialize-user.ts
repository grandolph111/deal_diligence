/**
 * Strip secrets before a user row crosses the API boundary.
 *
 * `devPassword` is a working credential stored in plaintext, and it was being
 * returned by GET /auth/me and by member creation — so any response body, proxy
 * log or browser devtools session handed over a usable login. Password issuance
 * is the one place it may legitimately appear, and that has to be a deliberate
 * call rather than the default.
 */

type MaybeUser = Record<string, unknown> | null | undefined;

/** A user row with credential fields removed. */
export function toPublicUser<T extends MaybeUser>(user: T): T {
  if (!user || typeof user !== 'object') return user;
  const { devPassword: _devPassword, ...safe } = user as Record<string, unknown>;
  return safe as T;
}

/** Same, for lists. */
export function toPublicUsers<T extends Record<string, unknown>>(users: T[]): T[] {
  return users.map((u) => toPublicUser(u));
}

/**
 * Strip `user.devPassword` from an arbitrary wrapper object (e.g. `{ user, … }`)
 * while leaving a deliberately-returned top-level password in place.
 */
export function withPublicUser<T extends Record<string, unknown>>(payload: T): T {
  if (!payload || typeof payload !== 'object') return payload;
  if ('user' in payload && payload.user && typeof payload.user === 'object') {
    return { ...payload, user: toPublicUser(payload.user as Record<string, unknown>) };
  }
  return payload;
}
