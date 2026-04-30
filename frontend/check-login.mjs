import puppeteer from 'puppeteer';
import { mkdirSync, readdirSync } from 'fs';
import { resolve } from 'path';

const dir = resolve('temporary screenshots');
mkdirSync(dir, { recursive: true });

const existing = readdirSync(dir).filter(f => f.startsWith('screenshot-'));
let num = existing.length + 1;

const save = async (page, label) => {
  const filename = `screenshot-${num++}-${label}.png`;
  await page.screenshot({ path: resolve(dir, filename), fullPage: false });
  console.log(`Saved: temporary screenshots/${filename}`);
  return filename;
};

const BASE = 'http://localhost:3000';
const STORAGE_KEY = 'dd_auth_session';

const profiles = [
  { label: 'super-admin',     email: 'alan@dealdiligence.com',  password: 'dealdone198cdx4',    role: 'Super Admin' },
  { label: 'customer-admin',  email: 'admin@dealdiligence.com', password: 'Adm!n-9fK2pQzR7vLx', role: 'Customer Admin' },
  { label: 'member',          email: 'demo@dealdiligence.com',  password: 'Dem0-3hT8wYbN5qJe',  role: 'Member' },
];

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

// ── 1. Login page ─────────────────────────────────────────────────────────
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0', timeout: 20000 });
await save(page, 'login-page');

// ── 2. Each profile ───────────────────────────────────────────────────────
for (const profile of profiles) {
  // Clear any existing session
  await page.evaluate(key => localStorage.removeItem(key), STORAGE_KEY);
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0', timeout: 20000 });

  // Fill and submit the login form
  await page.type('input[type="email"]', profile.email);
  await page.type('input[type="password"]', profile.password);
  await page.click('button[type="submit"]');

  // Wait for navigation away from /login
  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 20000 }).catch(() => {});
  // Extra settle time for async renders
  await new Promise(r => setTimeout(r, 1500));

  await save(page, `logged-in-${profile.label}`);
  console.log(`  → ${profile.role}: ${page.url()}`);
}

await browser.close();
console.log('\nDone.');
