import { randomBytes } from 'crypto';

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; // no 0/O/l/1
const SYMBOLS = '!@#$%*-_';

function pick(alphabet: string, n: number): string {
  const bytes = randomBytes(n);
  let out = '';
  for (let i = 0; i < n; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

/**
 * Generate a strong, user-readable random password for dev-creds accounts.
 * 14 alnum chars + 2 symbols, shuffled. Returns plaintext; prototype only.
 */
export function generateDevPassword(): string {
  const core = pick(ALPHA, 14);
  const symbols = pick(SYMBOLS, 2);
  const combined = (core + symbols).split('');
  // Fisher-Yates with random bytes for shuffle.
  const shuffleBytes = randomBytes(combined.length);
  for (let i = combined.length - 1; i > 0; i -= 1) {
    const j = shuffleBytes[i] % (i + 1);
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }
  return combined.join('');
}
