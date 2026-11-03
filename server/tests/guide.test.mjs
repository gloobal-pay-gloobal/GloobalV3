// Ask GLOOBAL (0223): the guide the app answers from, the anonymous counts
// it keeps for the team, and the staff site's editing — with a second person
// for any card about money.
//
//   node tests/guide.test.mjs

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(BACKEND, "server.js"));
require("dotenv").config({ path: join(BACKEND, ".env"), quiet: true });
if (!process.env.MONGO_URI) { console.error("MONGO_URI is not set."); process.exit(1); }

const TEST_DB = "gloobal_guide_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5261";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";
process.env.TRUST_PROXY_HOPS = "1";
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const sid = (seed) => Number(seed).toString(8).padStart(12, "0").slice(-12).split("").map((d) => SYMBOLS[Number(d)]).join("");
const ADMIN_ID = sid(8101);
process.env.ADMIN_SYMBOL_IDS = ADMIN_ID;
process.env.ADMIN_ORIGINS = "https://gloobal-admin.netlify.app";
process.env.ADMIN_SETUP_CODE = "set-me-up-123";
delete process.env.RENDER;
process.env.STAFF_ALERTS = "off";
process.env.GLOOBAL_APP_URL = "http://127.0.0.1:9";
{ const wp = createRequire(join(dirname(fileURLToPath(import.meta.url)), "..", "server.js"))("web-push"); const k = wp.generateVAPIDKeys(); process.env.VAPID_PUBLIC_KEY = k.publicKey; process.env.VAPID_PRIVATE_KEY = k.privateKey; }

const mongoose = require("mongoose");
require(join(BACKEND, "server.js"));
const AuditLog = require(join(BACKEND, "models/AuditLog"));
const Transaction = () => require(join(BACKEND, "models/Transaction"));
const BASE = `http://127.0.0.1:${process.env.PORT}`;
const ADMIN_SITE = "https://gloobal-admin.netlify.app";
const PIN = "246813";

let ip = "198.51.100.10";
const call = async (method, path, { body, token, origin } = {}) => {
  const headers = { "X-Forwarded-For": ip };
  if (origin) headers.Origin = origin;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let parsed = null; try { parsed = await r.json(); } catch { parsed = null; }
  return { status: r.status, body: parsed, headers: r.headers };
};
let failures = 0;
const check = (label, ok, detail) => { console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? " — " + detail : ""}`); if (!ok) failures += 1; };
const until = () => new Promise((resolve, reject) => {
  if (mongoose.connection.readyState === 1) return resolve();
  mongoose.connection.once("connected", resolve); mongoose.connection.once("error", reject);
  setTimeout(() => reject(new Error("timed out")), 40000);
});
async function register(seed, mobileNumber, fullName) {
  const id = sid(seed);
  ip = `198.51.${seed % 250}.${(seed % 200) + 1}`;
  await call("POST", "/api/otp/send", { body: { mobileNumber, purpose: "registration" } });
  await call("POST", "/api/otp/verify", { body: { mobileNumber, otp: "123456", purpose: "registration" } });
  const r = await call("POST", "/api/register-symbol", { body: { fullName, mobileNumber, symbolId: id } });
  await call("POST", "/api/pin/set", { body: { symbolId: id, pin: PIN }, token: r.body.token });
  return { id, token: r.body.token };
}
// What the server would hand out after a passkey: the same signing, for the
// routes behind it. (The ceremony is the site test's job.)
function adminToken(userId, symbolId, scope = "admin", ttl = 3600000) {
  const payload = Buffer.from(JSON.stringify({ sub: String(userId), symbolId, scope, iat: Date.now(), exp: Date.now() + ttl })).toString("base64url");
  return `${payload}.${crypto.createHmac("sha256", `admin:${process.env.AUTH_TOKEN_SECRET}`).update(payload).digest("base64url")}`;
}





const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  await until();
  if (mongoose.connection.name !== TEST_DB) throw new Error(`refusing to run against "${mongoose.connection.name}"`);
  await mongoose.connection.db.dropDatabase();
  const User = require(join(BACKEND, "models/User"));
  const GuideEvent = require(join(BACKEND, "models/GuideEvent"));
  const SupportConversation = require(join(BACKEND, "models/SupportConversation"));
  const BUILT_IN = require(join(BACKEND, "lib/guideCards.js"));
  const founder = await register(8101, "+919000081010", "Sanjeev Founder");
  const priya = await register(8102, "+919000081020", "Priya Support");
  const ravi = await register(8103, "+919000081030", "Ravi Support");
  const farid = await register(8104, "+919000081040", "Farid Finance");
  const asha = await register(8105, "+919000081050", "Asha India");
  const U = async (id) => User.findOne({ symbolId: id }).lean();
  const S = { origin: ADMIN_SITE };
  const adm = adminToken((await U(founder.id))._id, founder.id);
  for (const [who, role] of [[priya, "support"], [ravi, "support"], [farid, "finance"]]) await call("POST", "/api/admin/team", { ...S, token: adm, body: { symbolId: who.id, role } });
  const [sup, sup2, fin] = await Promise.all([priya, ravi, farid].map(async (p) => adminToken((await U(p.id))._id, p.id)));
  ip = "198.51.210.9";

  console.log("1. the guide, for the app");
  const g = await call("GET", "/api/guide");
  check("anyone can read it — nothing personal in it", g.status === 200 && g.body.cards.length === BUILT_IN.length && g.body.version.length === 12);
  check("every card in four languages", g.body.cards.every((c) => ["en", "hi", "hl", "ta"].every((l) => c.t[l] && c.t[l].q && c.t[l].steps.length)));
  check("money flags stay on the server", g.body.cards.every((c) => !("money" in c)));
  const same = await call("GET", `/api/guide?have=${g.body.version}`);
  check("the same version again: just 'unchanged'", same.body.unchanged === true && !same.body.cards);

  console.log("\n2. what is counted — anonymous");
  check("counting needs a signed-in app", (await call("POST", "/api/guide/events", { body: { events: [{ kind: "none", text: "x" }] } })).status === 401);
  const ev = await call("POST", "/api/guide/events", { token: asha.token, body: { events: [
    { kind: "none", text: "kya main paise wapas mangwa sakta hoon", lang: "hl", screen: "send" },
    { kind: "none", text: "Kya main paise wapas mangwa sakta hoon?", lang: "hl" },
    { kind: "answer", text: "call me on 9876543210 or a@b.com", lang: "en", cardId: "send-how" },
    { kind: "personal", text: "Maine kal Ravi ko 500 bheje the", lang: "hl" },
    { kind: "yes", cardId: "send-how", lang: "en" },
    { kind: "bogus", text: "x" },
  ] } });
  check("five kept, the unknown kind dropped", ev.status === 200 && ev.body.kept === 5);
  const rows = await GuideEvent.find({}).lean();
  check("no user, account or device on any row", rows.every((r) => !("userId" in r) && !("ip" in r)));
  check("phone numbers and e-mail blanked", rows.some((r) => r.text === "call me on # or @"), rows.map((r) => r.text).join(" | "));
  check("a question about their own money: counted, words not kept", rows.some((r) => r.kind === "personal" && r.text === ""));
  check("they go away after 90 days", rows.every((r) => r.expiresAt - r.at > 89 * 86400000));

  console.log("\n3. the staff site sees it");
  check("Finance does not", (await call("GET", "/api/admin/guide", { ...S, token: fin })).status === 403);
  const sv = await call("GET", "/api/admin/guide", { ...S, token: sup });
  check("Support does", sv.status === 200 && sv.body.cards.length === BUILT_IN.length);
  const q = sv.body.questions[0];
  check("the same question twice is one row, unanswered first", q && q.count === 2 && q.none === 2 && /wapas/.test(q.text), JSON.stringify(q));
  check("totals: asked, nothing found, about their own money", sv.body.totals.asked === 4 && sv.body.totals.none === 2 && sv.body.totals.personal === 1);
  check("each card's numbers", sv.body.cards.find((c) => c.id === "send-how").stats.yes === 1 && sv.body.cards.find((c) => c.id === "send-how").stats.shown === 1);
  check("from the app's own site: refused", (await call("GET", "/api/admin/guide", { origin: "https://evil.example", token: sup })).status === 403);

  console.log("\n4. a new card, not about money");
  const draft = { topic: "send", screens: ["send"], money: false, action: { target: "send" }, t: { en: { q: "Can I get money back I sent?", asks: ["paise wapas"], steps: ["Ask the person you paid to send it back."] }, hl: { q: "Kya main paise wapas mangwa sakta hoon?", asks: ["kya main paise wapas mangwa sakta hoon", "galat bande ko bhej diya"], steps: ["Jise bheja, unse kahiye ki woh **Send** se wapas bhej dein."] } } };
  check("a bad name is refused", (await call("PUT", "/api/admin/guide/Bad%20Name/draft", { ...S, token: sup, body: { card: draft, isNew: true } })).status === 400);
  check("English is needed", (await call("PUT", "/api/admin/guide/money-back/draft", { ...S, token: sup, body: { card: { ...draft, t: { hl: draft.t.hl } }, isNew: true } })).status === 400);
  check("a built-in name cannot be taken as new", (await call("PUT", "/api/admin/guide/send-how/draft", { ...S, token: sup, body: { card: draft, isNew: true } })).status === 409);
  const saved = await call("PUT", "/api/admin/guide/money-back/draft", { ...S, token: sup, body: { card: draft, isNew: true } });
  check("saved as a change waiting", saved.status === 200 && saved.body.card.draft && !saved.body.card.live && saved.body.card.draftMine);
  check("not in the app yet", !(await call("GET", "/api/guide")).body.cards.some((c) => c.id === "money-back"));
  const pub = await call("POST", "/api/admin/guide/money-back/publish", { ...S, token: sup, body: {} });
  check("not about money: the writer can send it out", pub.status === 200 && pub.body.card.live && !pub.body.card.draft);
  const g2 = await call("GET", `/api/guide?have=${g.body.version}`);
  check("the app sees a new version with it", !g2.body.unchanged && g2.body.cards.some((c) => c.id === "money-back" && c.t.hl));

  console.log("\n5. a change to a card about money needs a second person");
  const how = BUILT_IN.find((c) => c.id === "send-how");
  const changed = JSON.parse(JSON.stringify(how)); changed.t.en.asks.push("how can i pay my friend today");
  check("Priya saves a change to send-how", (await call("PUT", "/api/admin/guide/send-how/draft", { ...S, token: sup, body: { card: changed } })).status === 200);
  const own = await call("POST", "/api/admin/guide/send-how/publish", { ...S, token: sup, body: {} });
  check("she cannot send her own change out", own.status === 409 && own.body.code === "second_person" && /Priya/.test(own.body.message));
  const turnOff = JSON.parse(JSON.stringify(changed)); turnOff.money = false;
  check("…nor dodge it by unticking money", (await call("PUT", "/api/admin/guide/send-how/draft", { ...S, token: sup, body: { card: turnOff } })).status === 200 && (await call("POST", "/api/admin/guide/send-how/publish", { ...S, token: sup, body: {} })).status === 409);
  const other = await call("POST", "/api/admin/guide/send-how/publish", { ...S, token: sup2, body: {} });
  check("Ravi sends it out", other.status === 200 && other.body.card.changed && other.body.card.publishedByName === "Ravi");
  const live = (await call("GET", "/api/guide")).body.cards.find((c) => c.id === "send-how");
  check("the app has the change", live.t.en.asks.includes("how can i pay my friend today"));
  const audit = await AuditLog.find({ action: "admin.guide.publish", message: /^Guide:/ }).lean();
  check("both sends are in the audit log, naming who wrote it", audit.length === 2 && audit.some((a) => /written by Priya/.test(a.message)));

  console.log("\n6. take out, put back, drop");
  check("taken out of the app", (await call("POST", "/api/admin/guide/geu-what/hidden", { ...S, token: sup, body: { hidden: true } })).status === 200 && !(await call("GET", "/api/guide")).body.cards.some((c) => c.id === "geu-what"));
  check("put back", (await call("POST", "/api/admin/guide/geu-what/hidden", { ...S, token: sup, body: { hidden: false } })).status === 200 && (await call("GET", "/api/guide")).body.cards.some((c) => c.id === "geu-what"));
  const geu = JSON.parse(JSON.stringify(BUILT_IN.find((c) => c.id === "geu-what"))); geu.t.en.q = "What does GEU mean?";
  await call("PUT", "/api/admin/guide/geu-what/draft", { ...S, token: sup, body: { card: geu } });
  const dropped = await call("POST", "/api/admin/guide/geu-what/discard", { ...S, token: sup, body: {} });
  check("a change dropped: the app keeps the original", dropped.status === 200 && !dropped.body.card.draft && (await call("GET", "/api/guide")).body.cards.find((c) => c.id === "geu-what").t.en.q === "What is GEU?");

  console.log("\n7. talking to a person from Ask GLOOBAL");
  const chat = await call("POST", "/api/support/conversations", { token: asha.token, body: { topic: "payment", text: "Maine kal Ravi ko 500 bheje the, abhi tak nahi mile", side: "person", via: "ask", askLang: "hl" } });
  check("the chat starts as usual", chat.status === 201);
  check("they never see the team's line about where it came from", !chat.body.conversation.messages.some((m) => /Ask GLOOBAL/.test(m.text)));
  const c = await SupportConversation.findOne({}).lean();
  check("the desk sees it was from Ask GLOOBAL, in Hinglish", c.messages.some((m) => m.internal && m.text === "Started from Ask GLOOBAL — asked in Hinglish."));
} catch (err) {
  console.error(err);
  failures += 1;
} finally {
  console.log(failures ? `\n${failures} FAILED` : "\nall passed");
  await mongoose.disconnect();
  process.exit(failures ? 1 : 0);
}
