import puppeteer from "puppeteer";
import { mkdirSync, readdirSync } from "fs";
import { resolve } from "path";

const dir = resolve("temporary screenshots");
mkdirSync(dir, { recursive: true });

const label = process.argv[2] || "nav";
const afterPath = process.argv[3] || null;

const existing = readdirSync(dir).filter((f) => f.startsWith("screenshot-"));
const nextNum = existing.length + 1;
const filename = `screenshot-${nextNum}-${label}.png`;

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

page.on("console", (msg) => {
  if (msg.type() === "error") console.log("BROWSER ERR:", msg.text());
});

// Prime localStorage
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  localStorage.setItem("mock_auth_logged_in", "true");
});

await page.goto("http://localhost:3000/dashboard", { waitUntil: "domcontentloaded" });

// Wait for project cards or error state
let gotCards = false;
for (let i = 0; i < 30; i++) {
  const state = await page.evaluate(() => {
    const cards = document.querySelectorAll("a.project-card").length;
    const err = /Failed to load/i.test(document.body.innerText);
    return { cards, err };
  });
  if (state.cards > 0) { gotCards = true; break; }
  if (state.err) { console.log("error state detected at attempt", i); }
  await new Promise((r) => setTimeout(r, 500));
}
console.log("got cards:", gotCards);

const projectUrl = await page.evaluate(() => {
  const cards = [...document.querySelectorAll("a.project-card")];
  const testCard = cards.find((a) => a.textContent?.includes("Test Project"));
  return testCard ? testCard.getAttribute("href") : null;
});
console.log("projectUrl =", projectUrl);

if (projectUrl) {
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll("a.project-card")];
    const el = cards.find((a) => a.textContent?.includes("Test Project"));
    if (el) el.click();
  });
  await page.waitForFunction(
    () => !window.location.pathname.endsWith("/dashboard"),
    { timeout: 15000 }
  ).catch(() => console.log("nav wait failed"));
  await new Promise((r) => setTimeout(r, 2500));

  if (afterPath) {
    const fullPath = projectUrl + afterPath;
    console.log("navigating further to", fullPath);
    await page.evaluate((p) => {
      window.history.pushState({}, "", p);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, fullPath);
    await new Promise((r) => setTimeout(r, 3000));
  }
}

console.log("final url:", page.url());
await page.screenshot({ path: resolve(dir, filename), fullPage: true });
await browser.close();

console.log(`Saved: temporary screenshots/${filename}`);
