import puppeteer from "puppeteer";
import { mkdirSync, readdirSync } from "fs";
import { resolve } from "path";

const dir = resolve("temporary screenshots");
mkdirSync(dir, { recursive: true });

const path = process.argv[2] || "/dashboard";
const label = process.argv[3] || "authed";
const clickSelector = process.argv[4];

const existing = readdirSync(dir).filter((f) => f.startsWith("screenshot-"));
const nextNum = existing.length + 1;
const filename = `screenshot-${nextNum}-${label}.png`;

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

// Seed mock auth before app code runs
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  localStorage.setItem("mock_auth_logged_in", "true");
});

await page.goto("http://localhost:3000" + path, { waitUntil: "networkidle0", timeout: 30000 });
await new Promise((r) => setTimeout(r, 800));

if (clickSelector) {
  try {
    await page.click(clickSelector);
    await new Promise((r) => setTimeout(r, 800));
  } catch (e) {
    console.log("click failed:", clickSelector, e.message);
  }
}

await page.screenshot({ path: resolve(dir, filename), fullPage: true });
await browser.close();

console.log(`Saved: temporary screenshots/${filename}`);
