import puppeteer from '../frontend/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(__dirname, 'walkthrough.html');
const pdfPath = join(__dirname, 'DealDiligence-Codebase-Walkthrough.pdf');

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();

await page.goto('file://' + htmlPath, { waitUntil: 'networkidle0', timeout: 60000 });
// give web fonts a beat to settle
await new Promise(r => setTimeout(r, 1200));

await page.pdf({
  path: pdfPath,
  format: 'Letter',
  printBackground: true,
  preferCSSPageSize: true,
});

// also emit per-page PNGs for visual review
const pages = await page.$$('.page');
for (let i = 0; i < pages.length; i++) {
  await pages[i].screenshot({ path: join(__dirname, `review-${String(i + 1).padStart(2, '0')}.png`) });
}

await browser.close();
console.log(`PDF written: ${pdfPath}`);
console.log(`Pages rendered: ${pages.length}`);
