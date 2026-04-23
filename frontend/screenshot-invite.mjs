import puppeteer from "puppeteer";
import { mkdirSync, readdirSync } from "fs";
import { resolve } from "path";

const dir = resolve("temporary screenshots");
mkdirSync(dir, { recursive: true });

const label = process.argv[2] || "invite-modal";

const existing = readdirSync(dir).filter((f) => f.startsWith("screenshot-"));
const nextNum = existing.length + 1;
const filename = `screenshot-${nextNum}-${label}.png`;

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.setItem("mock_auth_logged_in", "true"));

await page.goto("http://localhost:3000/dashboard", { waitUntil: "domcontentloaded" });
await page.waitForFunction(
  () => document.querySelectorAll("a.project-card").length > 0,
  { timeout: 15000, polling: 300 }
);
await new Promise((r) => setTimeout(r, 500));

const projectUrl = await page.evaluate(() => {
  const cards = [...document.querySelectorAll("a.project-card")];
  const c = cards.find((a) => a.textContent?.includes("Test Project"));
  return c?.getAttribute("href") ?? null;
});

// SPA navigate to team settings
await page.evaluate((p) => {
  window.history.pushState({}, "", p);
  window.dispatchEvent(new PopStateEvent("popstate"));
}, projectUrl + "/settings?tab=team");
await new Promise((r) => setTimeout(r, 2000));

// Click "Invite Member"
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Invite Member"));
  if (btn) btn.click();
});
await new Promise((r) => setTimeout(r, 800));

// Toggle "Access Data Room" so the folder picker is visible
const clicked = await page.evaluate(() => {
  const rows = [...document.querySelectorAll(".permission-toggle")];
  const vdrRow = rows.find((r) => r.textContent?.includes("Access Data Room"));
  const input = vdrRow?.querySelector("input[type=checkbox]");
  if (input) { input.click(); return true; }
  return false;
});
console.log("toggled VDR:", clicked);
await new Promise((r) => setTimeout(r, 600));

await page.screenshot({ path: resolve(dir, filename), fullPage: true });
await browser.close();

console.log(`Saved: temporary screenshots/${filename}`);
