/**
 * assert_screens.mjs — the ONE harness, with assertions that can actually fail.
 *
 * WHAT WENT WRONG BEFORE
 * ---------------------
 * Four previous harnesses printed PASS while the app was broken. Every one of
 * them asserted on a substring that also appeared in the tab bar ("Planner",
 * "Settings"), so the check passed on every screen. A check that cannot fail is
 * worse than no check, because it produces confidence without evidence.
 *
 * THE FIX
 * -------
 * Read the rendered text with the tab bar REMOVED FROM THE DOM, then require the
 * body's FIRST LINE to equal the expected screen's own title. The first line is
 * the ScreenHeader title, which is unique per screen and cannot be satisfied by
 * navigation chrome.
 */
import { chromium } from "playwright";

// RUN:
//   APP_URL=<served web build> \
//   TEST_EMAIL=<account email> TEST_PASSWORD=<account password> \
//   node scripts/assert_screens.mjs
// Requires a Playwright install. Exits non-zero when a tab fails.

const APP_URL = process.env.APP_URL || "http://127.0.0.1:4195";
const TEST_EMAIL = process.env.TEST_EMAIL;
const TEST_PASSWORD = process.env.TEST_PASSWORD;

// Credentials come from the environment and are NEVER hard-coded here. An
// earlier version of this file committed the demo account's real password, which
// is exactly the mistake that had already leaked a credential once in this
// project. A harness is source code; a password is not.
if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error(
    "Set TEST_EMAIL and TEST_PASSWORD. Do not hard-code credentials in this file.",
  );
  process.exit(2);
}

const EXPECTED = [
  { tab: "Home",          first: "Home" },
  { tab: "Planner",       first: "Planner" },
  { tab: "AI Summaries",  first: "AI Summaries" },
  { tab: "Find Materials",first: "Find Materials" },
  { tab: "Settings",      first: "Settings" },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const problems = [];
page.on("console", m => { if (m.type() === "error") problems.push(m.text().slice(0,120)); });
page.on("pageerror", e => problems.push("PAGEERROR " + e.message.slice(0,120)));

await page.route("**/api/v1/**", async route => {
  const h = { ...route.request().headers(), origin: "https://uni-companion.21401284.workers.dev" };
  delete h["referer"];
  const res = await route.fetch({ headers: h });
  await route.fulfill({ response: res, headers: { ...res.headers(), "access-control-allow-origin": APP_URL } });
});

await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(3000);
await page.locator("input").first().fill(TEST_EMAIL);
await page.locator('input[type="password"]').first().fill(TEST_PASSWORD);
await page.locator("button").last().click();
await page.waitForTimeout(75000);

let failures = 0;
for (const { tab, first } of EXPECTED) {
  await page.locator(`[role="tab"][aria-label="${tab}"]`).first().click();
  await page.waitForTimeout(6000);

  // Remove the tab bar from the DOM, then read what is left. This is what makes
  // the assertion meaningful: navigation chrome can no longer satisfy it.
  // HIDE the tab bar rather than removing it: innerText ignores hidden elements,
  // so its labels cannot satisfy the assertion, and the tabs remain clickable for
  // the next iteration.
  const actual = await page.evaluate(() => {
    const bar = document.querySelector('[role="tablist"]');
    const previous = bar ? bar.style.visibility : null;
    if (bar) bar.style.visibility = "hidden";
    const lines = document.body.innerText.split("\n").map(s => s.trim()).filter(Boolean);
    if (bar && previous !== null) bar.style.visibility = previous;
    return lines;
  });

  const ok = actual[0] === first;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${tab.padEnd(15)} expected first line "${first}", got "${actual[0] ?? "(nothing)"}"`);
}

console.log(`\n  ${failures === 0 ? "ALL TABS RENDER CORRECTLY" : `${failures} TAB(S) BROKEN`}`);
console.log("  console errors:", problems.length ? [...new Set(problems)].slice(0,3) : "(none)");
await browser.close();
process.exit(failures === 0 ? 0 : 1);
