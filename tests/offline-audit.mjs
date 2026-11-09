// tests/offline-audit.mjs — not a pass/fail test: a report.
//
// Walks the signed-in app the way a person would, once with the server up
// and once with it cut off, and writes down for every screen what it showed
// and which server reads failed without a saved copy on the phone.
//
//   node tests/offline-audit.mjs [out.json]
import fs from "node:fs";
import { buildOnce, openPage, teardown, login, ACCOUNTS, API_ORIGIN } from "./browser-harness.mjs";

const A = ACCOUNTS.india;
const out = process.argv[2] || "offline-audit.json";

const tapText = async (page, re) => {
  const el = page.getByText(re).first();
  await el.waitFor({ timeout: 8000 });
  await el.evaluate((n) => (n.closest("button,[role=button]") || n).click());
};
const tapLabel = async (page, label) => {
  const el = page.getByRole("button", { name: label }).last();
  await el.waitFor({ timeout: 8000 });
  await el.evaluate((n) => n.click());
};
const back = async (page) => {
  const b = page.getByRole("button", { name: "Back", exact: true }).last();
  if (await b.count()) { await b.evaluate((n) => n.click()); await page.waitForTimeout(500); }
};

const SCREENS = [
  ["Home", async (p) => { await tapLabel(p, /^Home$/); }],
  ["Home · balance shown", async (p) => {
    await tapLabel(p, /^Home$/);
    const show = p.getByLabel("Show balance", { exact: true });
    if (await show.count()) {
      await show.click({ force: true });
      await p.getByLabel("Verify with fingerprint and Face ID", { exact: true }).click({ force: true });
      await p.getByLabel("Digit 1", { exact: true }).waitFor({ timeout: 8000 });
      for (const d of A.pin) await p.getByLabel(`Digit ${d}`, { exact: true }).click({ force: true });
    }
  }],
  ["Accounts", async (p) => { await tapLabel(p, /^Accounts$/); }],
  ["Accounts · Gloobal Bank", async (p) => { await tapLabel(p, /^Accounts$/); await p.getByTestId("accounts-bank-card").evaluate((n) => n.click()); }],
  ["Accounts · PayLater", async (p) => { await tapLabel(p, /^Accounts$/); await tapLabel(p, /^PayLater/); }],
  ["Accounts · My Assets", async (p) => { await tapLabel(p, /^Accounts$/); await tapLabel(p, /^My Assets/); }],
  ["Accounts · My Essentials", async (p) => { await tapLabel(p, /^Accounts$/); await tapLabel(p, /^My Essentials/); }],
  ["Accounts · Contributors", async (p) => { await tapLabel(p, /^Accounts$/); await p.getByTestId("accounts-contributors").evaluate((n) => n.click()); }],
  ["Profile", async (p) => { await tapLabel(p, /^Profile$/); }],
  ["Profile · Personal Details", async (p) => { await tapLabel(p, /^Profile$/); await tapLabel(p, "Gloobal ID — open your profile"); }],
  ["Profile · History", async (p) => { await tapLabel(p, /^Profile$/); await tapText(p, /^History$/); }],
  ["Profile · Security", async (p) => { await tapLabel(p, /^Profile$/); await tapText(p, /^Security$/); }],
  ["Profile · Help & Support", async (p) => { await tapLabel(p, /^Profile$/); await tapText(p, /^Help & Support$/); }],
  ["Choices", async (p) => { await tapLabel(p, /^Choices$/); }],
];

const PROBLEM = /couldn.t|could not|unavailable|try again|failed|can.t reach|offline|no connection|error|∆/i;

async function walk(page, api, label) {
  const rows = [];
  for (const [name, go] of SCREENS) {
    const before = api.calls.length;
    const failed = [];
    const onFail = (r) => { if (r.url().startsWith(API_ORIGIN)) failed.push(`${r.method()} ${new URL(r.url()).pathname}`); };
    page.on("requestfailed", onFail);
    let opened = true;
    let why = "";
    try { await go(page); } catch (e) { opened = false; why = String(e.message || e).split("\n")[0].slice(0, 120); }
    await page.waitForTimeout(label === "offline" ? 3500 : 2000);
    page.off("requestfailed", onFail);
    const saved = await page.evaluate(() => !!document.querySelector("[data-testid=saved-copy-banner]"));
    const body = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    const problems = [...new Set((body.match(new RegExp(`[^.!?│]{0,60}(${PROBLEM.source})[^.!?│]{0,60}`, "gi")) || []).map((s) => s.trim()))].slice(0, 4);
    const reads = [...new Set(api.calls.slice(before).filter((c) => c.method === "GET").map((c) => c.path))];
    rows.push({ screen: name, opened, why, savedBanner: saved, reads, failed: [...new Set(failed)], problems });
    await back(page); await back(page);
  }
  return rows;
}

await buildOnce();
const { page, context, api } = await openPage({ account: A });
await login(page, A);
await page.waitForTimeout(3000);
const online = await walk(page, api, "online");
const allReads = [...new Set(api.calls.filter((c) => c.method === "GET").map((c) => c.path))];
// Which of those the phone kept a copy of (the same test localCopy.js uses).
const kept = await page.evaluate((paths) => paths.filter((p) => gloobalLocalCopyWantedProbe(p)), allReads).catch(() => null);
// Cut the server off: every API request now fails like no signal would.
await context.route(`${API_ORIGIN}/**`, (r) => r.abort("internetdisconnected"));
const offline = await walk(page, api, "offline");
fs.writeFileSync(out, JSON.stringify({ allReads, online, offline }, null, 2));
await teardown();
console.log("wrote", out);
