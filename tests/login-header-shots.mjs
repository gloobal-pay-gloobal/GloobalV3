// tests/login-header-shots.mjs — pictures of GLOOBAL's Log in, by ID and by
// mobile number, at a phone's size.   SHOT=/path/prefix node tests/login-header-shots.mjs
import { buildOnce, openPage, teardown } from "./browser-harness.mjs";
const SHOT = process.env.SHOT || "/tmp/login";
const W = Number(process.env.W || 360), H = Number(process.env.H || 760);
await buildOnce();
const { page, context, errors } = await openPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
await page.getByRole("button", { name: "I am IN" }).click();
await page.getByLabel("Flip to log in", { exact: true }).click();
await page.getByLabel("Symbol −", { exact: true }).waitFor({ timeout: 10000 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${SHOT}-id.png` });
const box = async (id) => page.getByTestId(id).evaluate((n) => { const r = n.getBoundingClientRect(); return Math.round(r.top); });
const order = { title: await box("gloobal-entry-title"), switch: await box("gloobal-login-mode-id"), line: await box("gloobal-entry-subtitle") };
await page.getByTestId("gloobal-login-mode-mobile").click();
await page.getByTestId("gloobal-phone-step").waitFor({ timeout: 5000 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${SHOT}-mobile.png` });
console.log(JSON.stringify({ order, line: await page.getByTestId("gloobal-entry-subtitle").textContent(), errors }));
await context.close();
await teardown();
