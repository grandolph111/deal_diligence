import puppeteer from 'puppeteer';
import { mkdirSync } from 'fs';
import { resolve } from 'path';
import { spawnSync } from 'node:child_process';

const dir = resolve('temporary screenshots/full');
mkdirSync(dir, { recursive: true });

const API = 'http://localhost:3001/api/v1';
const UI = 'http://localhost:3000';

const pg = (sql) =>
  spawnSync(
    'psql',
    ['-t', '-A', 'postgresql://postgres:password@localhost:5435/dealdiligence', '-c', sql],
    { encoding: 'utf8' }
  ).stdout.trim();

const ALAN = { email: 'alan@dealdiligence.com', password: 'dealdone198cdx4' };
const ADMIN = { email: 'admin@dealdiligence.com', password: 'Adm!n-9fK2pQzR7vLx' };
const DEMO = { email: 'demo@dealdiligence.com', password: 'Dem0-3hT8wYbN5qJe' };
const ACME_ADMIN = {
  email: 'acme-admin@dealdiligence.com',
  password: pg(`SELECT "devPassword" FROM "User" WHERE email='acme-admin@dealdiligence.com';`),
};
const ACME_SME = {
  email: 'acme-sme@dealdiligence.com',
  password: pg(`SELECT "devPassword" FROM "User" WHERE email='acme-sme@dealdiligence.com';`),
};

const PRACTICE = 'f6aec761-e6c4-41c2-9131-30a8248038b5';
const TRIAL = '27865272-761a-46ef-8cc3-8c2b6486ff59';
const ACME_DEAL = '82b2b6c6-2104-4ba4-8b3c-38ba78209253';
const BOARD_ALL = 'd1e7b416-fc36-4fe8-9502-008069d04df9';
const DEMO_COMPANY_ID = 'demo-company';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureSession(page, creds) {
  await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  const ok = await page.evaluate(
    async (api, c) => {
      const res = await fetch(`${api}/auth/dev-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify(c),
      });
      if (!res.ok) return false;
      localStorage.setItem('dd_auth_session', JSON.stringify(await res.json()));
      return true;
    },
    API,
    creds
  );
  if (!ok) throw new Error(`login failed for ${creds.email}`);
}

async function shot(page, name) {
  const file = resolve(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  📸 ${name}.png`);
}

async function capture(browser, label, creds, path, { extraWaitMs = 700, beforeShot } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(`pageerror(${label}): ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push(`console(${label}): ${m.text()}`);
  });
  if (creds) await ensureSession(page, creds);
  await page.goto(`${UI}${path}`, { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(extraWaitMs);
  if (beforeShot) await beforeShot(page);
  await shot(page, label);
  await page.close();
  return errs;
}

const browser = await puppeteer.launch({ headless: true });
const allErrors = [];

try {
  // ============================================
  // Public / pre-login
  // ============================================
  console.log('▶ public pages');
  allErrors.push(...(await capture(browser, '00-login', null, '/login')));

  // ============================================
  // SUPER ADMIN surfaces
  // ============================================
  console.log('▶ super admin');
  allErrors.push(
    ...(await capture(browser, '10-super-companies', ALAN, '/admin/companies'))
  );
  allErrors.push(
    ...(await capture(browser, '11-super-new-company', ALAN, '/admin/companies/new'))
  );
  allErrors.push(
    ...(await capture(browser, '12-super-company-detail-deals', ALAN, `/admin/companies/${DEMO_COMPANY_ID}`))
  );
  // Members tab
  allErrors.push(
    ...(await capture(browser, '13-super-company-detail-members', ALAN, `/admin/companies/${DEMO_COMPANY_ID}`, {
      beforeShot: async (page) => {
        await page.evaluate(() => {
          const btns = [...document.querySelectorAll('.company-detail-tabs .tab')];
          const m = btns.find((b) => b.textContent?.includes('Members'));
          if (m) m.click();
        });
        await sleep(500);
      },
    }))
  );
  // Settings tab
  allErrors.push(
    ...(await capture(browser, '14-super-company-detail-settings', ALAN, `/admin/companies/${DEMO_COMPANY_ID}`, {
      beforeShot: async (page) => {
        await page.evaluate(() => {
          const btns = [...document.querySelectorAll('.company-detail-tabs .tab')];
          const s = btns.find((b) => b.textContent?.includes('Settings'));
          if (s) s.click();
        });
        await sleep(400);
      },
    }))
  );
  // Add Customer Admin modal (open state)
  allErrors.push(
    ...(await capture(browser, '15-super-add-customer-admin-modal', ALAN, `/admin/companies/${DEMO_COMPANY_ID}`, {
      beforeShot: async (page) => {
        await page.evaluate(() => {
          const tabs = [...document.querySelectorAll('.company-detail-tabs .tab')];
          tabs.find((b) => b.textContent?.includes('Members'))?.click();
        });
        await sleep(300);
        await page.evaluate(() => {
          const btns = [...document.querySelectorAll('button')];
          btns.find((b) => b.textContent?.includes('Add Customer Admin'))?.click();
        });
        await sleep(400);
      },
    }))
  );
  // Change password (Super Admin)
  allErrors.push(
    ...(await capture(browser, '16-super-change-password', ALAN, '/account/password'))
  );

  // ============================================
  // CUSTOMER ADMIN (Demo) surfaces
  // ============================================
  console.log('▶ customer admin (demo)');
  allErrors.push(
    ...(await capture(browser, '20-cust-dashboard', ADMIN, '/dashboard'))
  );
  allErrors.push(
    ...(await capture(browser, '21-cust-new-project', ADMIN, '/projects/new'))
  );
  allErrors.push(
    ...(await capture(browser, '22-cust-company-team', ADMIN, '/company'))
  );
  allErrors.push(
    ...(await capture(browser, '23-cust-change-password', ADMIN, '/account/password'))
  );

  // Project-scoped pages (Practice Project 1)
  console.log('▶ project-scoped (customer admin)');
  allErrors.push(
    ...(await capture(browser, '30-proj-overview', ADMIN, `/projects/${PRACTICE}`, { extraWaitMs: 1500 }))
  );
  allErrors.push(
    ...(await capture(browser, '31-proj-brief', ADMIN, `/projects/${PRACTICE}/brief`, { extraWaitMs: 1500 }))
  );
  allErrors.push(
    ...(await capture(browser, '32-proj-boards-index', ADMIN, `/projects/${PRACTICE}/boards`, { extraWaitMs: 1500 }))
  );
  allErrors.push(
    ...(await capture(browser, '33-proj-board-all', ADMIN, `/projects/${PRACTICE}/boards/${BOARD_ALL}`, { extraWaitMs: 1500 }))
  );
  allErrors.push(
    ...(await capture(browser, '34-proj-vdr', ADMIN, `/projects/${PRACTICE}/vdr`, { extraWaitMs: 1500 }))
  );
  allErrors.push(
    ...(await capture(browser, '35-proj-entities', ADMIN, `/projects/${PRACTICE}/entities`, { extraWaitMs: 1500 }))
  );
  allErrors.push(
    ...(await capture(browser, '36-proj-graph', ADMIN, `/projects/${PRACTICE}/graph`, { extraWaitMs: 1500 }))
  );
  allErrors.push(
    ...(await capture(browser, '37-proj-settings', ADMIN, `/projects/${PRACTICE}/settings`, { extraWaitMs: 1500 }))
  );

  // ============================================
  // MEMBER (Demo) — zero-grant SME
  // ============================================
  console.log('▶ member (zero grants)');
  allErrors.push(
    ...(await capture(browser, '40-member-dashboard', DEMO, '/dashboard'))
  );
  allErrors.push(
    ...(await capture(browser, '41-member-deal-empty-state', DEMO, `/projects/${TRIAL}`, { extraWaitMs: 1500 }))
  );
  allErrors.push(
    ...(await capture(browser, '42-member-change-password', DEMO, '/account/password'))
  );

  // ============================================
  // ACME CUSTOMER ADMIN + ACME SME
  // ============================================
  console.log('▶ acme tenant');
  allErrors.push(
    ...(await capture(browser, '50-acme-admin-dashboard', ACME_ADMIN, '/dashboard'))
  );
  allErrors.push(
    ...(await capture(browser, '51-acme-admin-company', ACME_ADMIN, '/company'))
  );
  allErrors.push(
    ...(await capture(browser, '52-acme-admin-deal', ACME_ADMIN, `/projects/${ACME_DEAL}`, { extraWaitMs: 1500 }))
  );
  allErrors.push(
    ...(await capture(browser, '53-acme-sme-dashboard', ACME_SME, '/dashboard'))
  );
} finally {
  await browser.close();
}

if (allErrors.length) {
  console.log(`\n⚠️  ${allErrors.length} console/runtime errors captured:`);
  for (const e of allErrors) console.log('  -', e);
  process.exit(1);
}
console.log('\n✅ All screens captured cleanly. Files in temporary screenshots/full/');
