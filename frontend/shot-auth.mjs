/**
 * Screenshot an authenticated page.
 *
 * The stock screenshot.mjs lands on the login wall for anything behind auth, so
 * this seeds the dev session into localStorage before navigating. Dev-only: the
 * backend accepts `mock-dev-token-<userId>` (middleware/auth.ts).
 *
 *   node shot-auth.mjs <path> <label> [userId]
 */
import puppeteer from 'puppeteer';
import { mkdirSync, readdirSync } from 'fs';
import { resolve } from 'path';

const dir = resolve('temporary screenshots');
mkdirSync(dir, { recursive: true });

const path = process.argv[2] || '/';
const label = process.argv[3] || 'shot';
// Defaults to the CUAD deal's own user.
const userId = process.argv[4] || '949d66ba-517b-425f-83cf-a16b243e14cb';
const email = process.argv[5] || 'cuad@dealdiligence.com';
const platformRole = process.argv[6] || 'MEMBER';

const existing = readdirSync(dir).filter((f) => f.startsWith('screenshot-'));
const filename = `screenshot-${existing.length + 1}-${label}.png`;

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

page.on('console', (m) => {
  if (m.type() === 'error') console.log('  [console error]', m.text().slice(0, 200));
});
page.on('pageerror', (e) => console.log('  [page error]', String(e).slice(0, 200)));

await page.goto('http://localhost:3100/', { waitUntil: 'domcontentloaded' });
await page.evaluate(
  (session) => localStorage.setItem('dd_auth_session', JSON.stringify(session)),
  {
    token: `mock-dev-token-${userId}`,
    user: { id: userId, email, name: 'Screenshot User', platformRole, companyId: null },
  }
);

await page.goto(`http://localhost:3100${path}`, {
  waitUntil: 'networkidle0',
  timeout: 45000,
});
await page.addStyleTag({
  content:
    '*, *::before, *::after { animation-duration: 0.001s !important; animation-delay: 0s !important; transition-duration: 0.001s !important; }',
});
// Graph layouts settle after paint; give cytoscape a beat.
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: resolve(dir, filename), fullPage: process.env.FULLPAGE === '1' });
await browser.close();

console.log(`Saved: temporary screenshots/${filename}`);
