import puppeteer from "puppeteer";
import { mkdirSync, readdirSync } from "fs";
import { resolve } from "path";

const dir = resolve("temporary screenshots");
mkdirSync(dir, { recursive: true });

const url = process.argv[2] || "http://localhost:3000";
const label = process.argv[3] || "";

// Auto-increment screenshot number
const existing = readdirSync(dir).filter((f) => f.startsWith("screenshot-"));
const nextNum = existing.length + 1;
const filename = label
  ? `screenshot-${nextNum}-${label}.png`
  : `screenshot-${nextNum}.png`;

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
// Fast-forward CSS animations so fill-mode:both compositing layers flush before capture
await page.addStyleTag({ content: '*, *::before, *::after { animation-duration: 0.001s !important; animation-delay: 0s !important; transition-duration: 0.001s !important; }' });
await new Promise(r => setTimeout(r, 200));
await page.screenshot({ path: resolve(dir, filename), fullPage: true });
await browser.close();

console.log(`Saved: temporary screenshots/${filename}`);
