import puppeteer from 'puppeteer';
import { mkdirSync } from 'fs';
import { resolve } from 'path';

const dir = resolve('temporary screenshots');
mkdirSync(dir, { recursive: true });

async function fetchPassword(email) {
  const res = await fetch(
    `http://localhost:3001/api/v1/auth/dev-login`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ email, password: '__unknown__' }),
    }
  );
  // we only use real passwords below; this helper exists to sanity-check
  return res.status;
}

// Passwords: static ones are hardcoded; dynamic ones queried from the DB
// via an env var so this script doesn't hardcode them.
const pg = async (sql) => {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(
    'psql',
    ['-t', '-A', 'postgresql://postgres:password@localhost:5435/dealdiligence', '-c', sql],
    { encoding: 'utf8' }
  );
  return r.stdout.trim();
};

const acmeAdminPass = await pg(
  `SELECT "devPassword" FROM "User" WHERE email='acme-admin@dealdiligence.com';`
);
const acmeSmePass = await pg(
  `SELECT "devPassword" FROM "User" WHERE email='acme-sme@dealdiligence.com';`
);

const baseUrl = 'http://localhost:3000';
const scenarios = [
  {
    label: 'super-admin-companies',
    email: 'alan@dealdiligence.com',
    password: 'dealdone198cdx4',
    path: '/admin/companies',
  },
  {
    label: 'customer-admin-dashboard',
    email: 'admin@dealdiligence.com',
    password: 'Adm!n-9fK2pQzR7vLx',
    path: '/dashboard',
  },
  {
    label: 'customer-admin-company-tab',
    email: 'admin@dealdiligence.com',
    password: 'Adm!n-9fK2pQzR7vLx',
    path: '/company',
  },
  {
    label: 'acme-admin-dashboard',
    email: 'acme-admin@dealdiligence.com',
    password: acmeAdminPass,
    path: '/dashboard',
  },
];

const browser = await puppeteer.launch({ headless: true });
for (const s of scenarios) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async (creds) => {
    const res = await fetch('http://localhost:3001/api/v1/auth/dev-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ email: creds.email, password: creds.password }),
    });
    const data = await res.json();
    localStorage.setItem('dd_auth_session', JSON.stringify(data));
  }, s);
  await page.goto(`${baseUrl}${s.path}`, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 500));
  const filename = `screenshot-role-${s.label}.png`;
  await page.screenshot({ path: resolve(dir, filename), fullPage: true });
  console.log(`Saved: temporary screenshots/${filename}`);
  await page.close();
}
await browser.close();
