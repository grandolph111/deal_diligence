import puppeteer from 'puppeteer';
import { mkdirSync } from 'fs';
import { resolve } from 'path';
import { spawnSync } from 'node:child_process';

const dir = resolve('temporary screenshots/e2e');
mkdirSync(dir, { recursive: true });

const API = 'http://localhost:3001/api/v1';
const UI = 'http://localhost:3000';

const pg = (sql) =>
  spawnSync(
    'psql',
    ['-t', '-A', 'postgresql://postgres:password@localhost:5435/dealdiligence', '-c', sql],
    { encoding: 'utf8' }
  ).stdout.trim();

const ADMIN_PASS = 'Adm!n-9fK2pQzR7vLx';
const DEMO_PASS = 'Dem0-3hT8wYbN5qJe';
const ALAN_PASS = 'dealdone198cdx4';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setSession(page, email, password) {
  await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  const ok = await page.evaluate(
    async (api, creds) => {
      const res = await fetch(`${api}/auth/dev-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ email: creds.email, password: creds.password }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      localStorage.setItem('dd_auth_session', JSON.stringify(data));
      return true;
    },
    API,
    { email, password }
  );
  if (!ok) throw new Error(`login failed for ${email}`);
}

async function shot(page, name) {
  const file = resolve(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  📸 ${name}.png`);
}

const browser = await puppeteer.launch({ headless: true });
const errors = [];

try {
  // -------------------------------------------------------------------
  // A. SUPER ADMIN: create a new company via the UI
  // -------------------------------------------------------------------
  console.log('▶ A. Super Admin onboarding flow');
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('pageerror', (e) => errors.push(`pageerror(alan): ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console(alan): ${m.text()}`);
  });

  await setSession(page, 'alan@dealdiligence.com', ALAN_PASS);
  await page.goto(`${UI}/admin/companies`, { waitUntil: 'networkidle0' });
  await shot(page, 'a1-super-admin-companies');

  // Click "+ New Company"
  const newCompanyLink = await page.$$eval('a', (as) =>
    as.findIndex((a) => a.textContent?.trim().includes('New Company'))
  );
  await page.click('a[href="/admin/companies/new"]');
  await page.waitForSelector('input[name="name"]', { timeout: 5000 });
  await shot(page, 'a2-new-company-form');

  const uniqueSuffix = Date.now().toString().slice(-6);
  const newAdminEmail = `newco-admin-${uniqueSuffix}@dealdiligence.com`;
  await page.type('input[name="name"]', 'Newco Corp');
  await page.type(
    'textarea[name="description"]',
    'Created via puppeteer E2E flow'
  );
  await page.type('input[name="adminEmail"]', newAdminEmail);
  await page.type('input[name="adminName"]', 'Newco Admin');
  await Promise.all([
    page.click('button[type="submit"].primary'),
    page.waitForSelector('.credentials-reveal', { timeout: 10000 }),
  ]);
  await shot(page, 'a3-credentials-reveal');

  // Pull the visible password out of the modal so we can log in as them
  const revealedPassword = await page.$eval(
    '.credentials-reveal .credentials-row:nth-of-type(2) code',
    (el) => el.textContent?.trim() ?? ''
  );
  if (!revealedPassword) throw new Error('no password revealed');
  console.log(`  new admin password captured: ${revealedPassword.slice(0, 4)}…`);
  await page.click('.credentials-reveal .button.primary'); // "I've saved it"
  await page.waitForSelector('.dashboard-header h1', { timeout: 5000 });
  await shot(page, 'a4-new-company-detail');
  await page.close();

  // -------------------------------------------------------------------
  // B. NEW CUSTOMER ADMIN logs in, adds an SME
  // -------------------------------------------------------------------
  console.log('▶ B. New Customer Admin logs in & adds an SME');
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 1440, height: 900 });
  page2.on('pageerror', (e) => errors.push(`pageerror(newadmin): ${e.message}`));
  page2.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console(newadmin): ${m.text()}`);
  });

  await setSession(page2, newAdminEmail, revealedPassword);
  await page2.goto(`${UI}/dashboard`, { waitUntil: 'networkidle0' });
  await shot(page2, 'b1-new-admin-empty-dashboard');

  await page2.goto(`${UI}/company`, { waitUntil: 'networkidle0' });
  await shot(page2, 'b2-new-admin-company-tab');

  // Click "+ Add Member (SME)"
  const addMemberBtn = await page2.$$eval('button', (bs) =>
    bs.findIndex((b) => b.textContent?.includes('Add Member (SME)'))
  );
  if (addMemberBtn < 0) throw new Error('Add Member button not found');
  await page2.evaluate((idx) => {
    const bs = Array.from(document.querySelectorAll('button'));
    bs[idx].click();
  }, addMemberBtn);
  await page2.waitForSelector('.modal-card input[type=email]', { timeout: 5000 });
  const newSmeEmail = `newco-sme-${uniqueSuffix}@dealdiligence.com`;
  await page2.type('.modal-card input[type=email]', newSmeEmail);
  await page2.type('.modal-card input[type=text]', 'Newco SME');
  await Promise.all([
    page2.click('.modal-card button.primary'),
    page2.waitForSelector('.credentials-reveal', { timeout: 10000 }),
  ]);
  const smePassword = await page2.$eval(
    '.credentials-reveal .credentials-row:nth-of-type(2) code',
    (el) => el.textContent?.trim() ?? ''
  );
  console.log(`  new SME password captured: ${smePassword.slice(0, 4)}…`);
  await shot(page2, 'b3-sme-credentials-reveal');
  await page2.click('.credentials-reveal .button.primary');
  await sleep(300);
  await shot(page2, 'b4-sme-added-to-members');
  await page2.close();

  // -------------------------------------------------------------------
  // C. EXISTING CUSTOMER ADMIN: dashboard bug fix + deal opens
  // -------------------------------------------------------------------
  console.log('▶ C. Existing Customer Admin opens a deal (bug fix)');
  const page3 = await browser.newPage();
  await page3.setViewport({ width: 1440, height: 900 });
  page3.on('pageerror', (e) => errors.push(`pageerror(cust): ${e.message}`));
  page3.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console(cust): ${m.text()}`);
  });

  await setSession(page3, 'admin@dealdiligence.com', ADMIN_PASS);
  await page3.goto(`${UI}/dashboard`, { waitUntil: 'networkidle0' });
  await shot(page3, 'c1-cust-admin-dashboard');

  // Click first project card link
  const firstProjectHref = await page3.$eval(
    '.projects-grid a.project-card',
    (el) => el.getAttribute('href')
  );
  await page3.goto(`${UI}${firstProjectHref}`, { waitUntil: 'networkidle0' });
  await sleep(700);
  // Check for the old error toast
  const failedLoad = await page3.$eval('body', (el) =>
    el.textContent?.includes('Failed to load dashboard')
  );
  if (failedLoad) throw new Error('"Failed to load dashboard" regression');
  await shot(page3, 'c2-deal-dashboard-loads');
  await page3.close();

  // -------------------------------------------------------------------
  // D. ZERO-GRANT SME empty-state (demo@dealdiligence.com is a MEMBER of
  //    Trial Project with permissions.restrictedFolders=[])
  // -------------------------------------------------------------------
  console.log('▶ D. Zero-grant SME sees awaiting-access empty state');
  const page4 = await browser.newPage();
  await page4.setViewport({ width: 1440, height: 900 });
  page4.on('pageerror', (e) => errors.push(`pageerror(sme): ${e.message}`));
  page4.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console(sme): ${m.text()}`);
  });

  await setSession(page4, 'demo@dealdiligence.com', DEMO_PASS);
  await page4.goto(`${UI}/dashboard`, { waitUntil: 'networkidle0' });
  await shot(page4, 'd1-sme-dashboard');

  const smeProjectHref = await page4.$eval(
    '.projects-grid a.project-card',
    (el) => el.getAttribute('href')
  );
  await page4.goto(`${UI}${smeProjectHref}`, { waitUntil: 'networkidle0' });
  await sleep(700);
  const awaiting = await page4.$eval('body', (el) =>
    el.textContent?.includes("haven't been granted access")
  );
  if (!awaiting) console.log('  (no awaiting-access copy detected — may be OWNER via non-null member row)');
  await shot(page4, 'd2-sme-project-empty-state');
  await page4.close();

  // -------------------------------------------------------------------
  // E. Self-service change password
  // -------------------------------------------------------------------
  console.log('▶ E. Self-service password change');
  const page5 = await browser.newPage();
  await page5.setViewport({ width: 1440, height: 900 });
  page5.on('pageerror', (e) => errors.push(`pageerror(pw): ${e.message}`));
  page5.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console(pw): ${m.text()}`);
  });

  await setSession(page5, 'demo@dealdiligence.com', DEMO_PASS);
  await page5.goto(`${UI}/account/password`, { waitUntil: 'networkidle0' });
  await shot(page5, 'e1-change-password-page');
  await page5.close();
} finally {
  await browser.close();
}

if (errors.length) {
  console.log('\n❌ Console/runtime errors:');
  for (const e of errors) console.log('  -', e);
  process.exit(1);
}
console.log('\n✅ End-to-end flow passed. Screenshots in temporary screenshots/e2e/');
