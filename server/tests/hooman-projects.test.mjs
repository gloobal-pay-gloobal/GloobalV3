// Checks for the Hooman Projects API — models/Project.js,
// models/ProjectAttachment.js, lib/projectValidation.js and the
// /api/projects routes in server.js.
//
//   node tests/hooman-projects.test.mjs
//
// Runs the real server.js against a THROWAWAY database on the same cluster
// MONGO_URI points at. The run refuses to start if it finds itself
// connected to anything else.
//
// What it guards. This is a brand-new write surface on an app that moves
// money, so the checks that matter most are the ones about who may touch
// what: a project is editable and deletable by its owner ALONE, a draft is
// invisible to everyone else, and an attachment is exactly as private as
// the project it hangs off. The rest is the founder's stated rules — the
// 1000-word summary cap enforced server-side, persistence across a restart
// of the client's session, and a search that queries stored records rather
// than filtering a hardcoded list.

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(BACKEND, "server.js"));

require("dotenv").config({ path: join(BACKEND, ".env"), quiet: true });

if (!process.env.MONGO_URI) {
  console.error("MONGO_URI is not set — this test needs server/.env.");
  process.exit(1);
}

const TEST_DB = "gloobal_projects_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5198";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";

const mongoose = require("mongoose");

require(join(BACKEND, "server.js"));

const User = require(join(BACKEND, "models/User"));
const Pin = require(join(BACKEND, "models/Pin"));
const Project = require(join(BACKEND, "models/Project"));
const ProjectAttachment = require(join(BACKEND, "models/ProjectAttachment"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) => Array.from({ length: 12 }, (_, i) => SYMBOLS[(seed + i * 3) % 8]).join("");

const OWNER = symbolId(2);
const STRANGER = symbolId(5);
const PIN = "417382";

const untilConnected = () =>
  new Promise((resolve, reject) => {
    if (mongoose.connection.readyState === 1) return resolve();
    mongoose.connection.once("connected", resolve);
    mongoose.connection.once("error", reject);
    setTimeout(() => reject(new Error("timed out connecting to MongoDB")), 40000);
  });

const call = (method, path, body, token) =>
  fetch(`${BASE}${path}`, {
    method,
    headers: Object.assign(
      body === undefined ? {} : { "Content-Type": "application/json" },
      token ? { Authorization: `Bearer ${token}` } : {}
    ),
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async (response) => ({
    status: response.status,
    headers: response.headers,
    body: await response.json().catch(() => null),
  }));

const post = (path, body, token) => call("POST", path, body, token);
const patch = (path, body, token) => call("PATCH", path, body, token);
const del = (path, token) => call("DELETE", path, undefined, token);
const get = (path, token) => call("GET", path, undefined, token);

async function registerAccount(symbol, mobileNumber, name, countryIso) {
  await post("/api/otp/send", { mobileNumber, purpose: "registration" });
  await post("/api/otp/verify", { mobileNumber, otp: "123456", purpose: "registration" });
  const payload = { fullName: name, mobileNumber, symbolId: symbol };
  if (countryIso) payload.countryIso = countryIso;
  const registered = await post("/api/register-symbol", payload, null);
  const token = registered.body?.token;
  await post("/api/pin/set", { symbolId: symbol, pin: PIN }, token);
  return token;
}

let ownerToken = null;
let strangerToken = null;

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failures += 1;
};

const words = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

async function run() {
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(`refusing to run against "${mongoose.connection.name}" — expected ${TEST_DB}`);
  }
  console.log(`db: ${mongoose.connection.name}\n`);

  await Promise.all([
    User.deleteMany({}), Pin.deleteMany({}),
    Project.deleteMany({}), ProjectAttachment.deleteMany({}),
  ]);
  ownerToken = await registerAccount(OWNER, "+919000000201", "Project Owner", "IN");
  strangerToken = await registerAccount(STRANGER, "+12025550188", "Project Stranger", "US");

  // ── 1 ──────────────────────────────────────────────────────────────────
  console.log("1. a project can be created and is really persisted");
  const created = await post("/api/projects", {
    title: "Bridge over the Yamuna",
    category: "Infrastructure",
    summary: "A footbridge connecting the two banks.",
    link: "https://example.org/bridge",
  }, ownerToken);
  check("create accepted", created.status === 201, `status=${created.status} ${JSON.stringify(created.body)}`);
  const projectId = created.body?.project?.id;
  check("an id came back", Boolean(projectId), `id=${projectId}`);
  check("category is a real stored value", created.body?.project?.category === "Infrastructure",
    created.body?.project?.category);
  check("the word count was recorded", created.body?.project?.summaryWordCount === 6,
    `count=${created.body?.project?.summaryWordCount}`);
  check("owner is marked", created.body?.project?.isOwner === true);

  const stored = await Project.findById(projectId).lean();
  check("the row exists in MongoDB, not just in the response", Boolean(stored));
  check("country came from the creator's resolved account country", stored?.countryIso === "IN",
    stored?.countryIso);
  check("owner is the token's account, never the body's", String(stored?.ownerSymbolId) === OWNER);

  // ── 2 ──────────────────────────────────────────────────────────────────
  // Persistence across a session, which is the founder's "viewable again
  // after reload / after logout and login" requirement. A fresh
  // unauthenticated read is the strongest form of that: no token, no
  // client state, and the project is still there.
  console.log("\n2. it survives a reload, a sign-out and a different client");
  const anonymous = await get(`/api/projects/${projectId}`);
  check("readable with no token at all", anonymous.status === 200, `status=${anonymous.status}`);
  check("same content", anonymous.body?.project?.title === "Bridge over the Yamuna");
  check("but not marked as owned by an anonymous reader", anonymous.body?.project?.isOwner === false);

  // ── 3 ──────────────────────────────────────────────────────────────────
  // The founder's hard rule, enforced where it has to be: on the server.
  console.log("\n3. the 1000-word summary limit is enforced server-side");
  const tooLong = await post("/api/projects", {
    title: "Too long", category: "Research", summary: words(1001),
  }, ownerToken);
  check("1001 words is refused", tooLong.status === 400, `status=${tooLong.status}`);
  check("the message says how many and what the limit is",
    /1001 words/.test(tooLong.body?.message || "") && /1000/.test(tooLong.body?.message || ""),
    tooLong.body?.message);

  const atLimit = await post("/api/projects", {
    title: "Exactly at the limit", category: "Research", summary: words(1000),
  }, ownerToken);
  check("exactly 1000 words is accepted", atLimit.status === 201, `status=${atLimit.status}`);
  check("and the stored count is 1000", atLimit.body?.project?.summaryWordCount === 1000,
    `count=${atLimit.body?.project?.summaryWordCount}`);

  // A single enormous "word" passes a word count of 1. The character
  // backstop is what stops it.
  const oneHugeWord = await post("/api/projects", {
    title: "One huge word", category: "Research", summary: "x".repeat(30000),
  }, ownerToken);
  check("one 30,000-character word is refused by the character backstop",
    oneHugeWord.status === 400, `status=${oneHugeWord.status}`);

  // ── 4 ──────────────────────────────────────────────────────────────────
  console.log("\n4. input validation refuses what it should");
  const badCategory = await post("/api/projects", {
    title: "T", category: "Nonsense", summary: "s",
  }, ownerToken);
  check("an unknown category is refused", badCategory.status === 400, `status=${badCategory.status}`);
  const badLink = await post("/api/projects", {
    title: "T", category: "Art", summary: "s", link: "javascript:alert(1)",
  }, ownerToken);
  check("a javascript: link is refused", badLink.status === 400, `status=${badLink.status}`);
  const noTitle = await post("/api/projects", { category: "Art", summary: "s" }, ownerToken);
  check("a missing title is refused", noTitle.status === 400, `status=${noTitle.status}`);

  // ── 5 ──────────────────────────────────────────────────────────────────
  // The check that matters most on a new write surface.
  console.log("\n5. only the owner can change or delete a project");
  const unauth = await patch(`/api/projects/${projectId}`, { title: "Hijacked" });
  check("no token cannot edit", unauth.status === 401, `status=${unauth.status}`);
  const strangerEdit = await patch(`/api/projects/${projectId}`, { title: "Hijacked" }, strangerToken);
  check("another account cannot edit", strangerEdit.status === 403, `status=${strangerEdit.status}`);
  const strangerDelete = await del(`/api/projects/${projectId}`, strangerToken);
  check("another account cannot delete", strangerDelete.status === 404, `status=${strangerDelete.status}`);

  const stillThere = await Project.findById(projectId).lean();
  check("the project is untouched after both attempts",
    stillThere?.title === "Bridge over the Yamuna", stillThere?.title);

  const ownerEdit = await patch(`/api/projects/${projectId}`, { title: "Bridge over the Yamuna II" }, ownerToken);
  check("the owner can edit", ownerEdit.status === 200, `status=${ownerEdit.status}`);
  check("the edit landed", ownerEdit.body?.project?.title === "Bridge over the Yamuna II");

  // ── 6 ──────────────────────────────────────────────────────────────────
  console.log("\n6. a draft is private to its owner");
  const draft = await post("/api/projects", {
    title: "Unpublished idea", category: "Startup", summary: "Still thinking.", status: "draft",
  }, ownerToken);
  check("draft created", draft.status === 201, `status=${draft.status}`);
  const draftId = draft.body?.project?.id;

  const strangerSeesDraft = await get(`/api/projects/${draftId}`, strangerToken);
  check("a stranger gets 404, not 403 (403 would confirm it exists)",
    strangerSeesDraft.status === 404, `status=${strangerSeesDraft.status}`);
  const ownerSeesDraft = await get(`/api/projects/${draftId}`, ownerToken);
  check("the owner can read their own draft", ownerSeesDraft.status === 200, `status=${ownerSeesDraft.status}`);

  const publicList = await get("/api/projects");
  const publicIds = (publicList.body?.projects || []).map((p) => p.id);
  check("the draft is absent from the public listing", !publicIds.includes(draftId));
  const mineList = await get("/api/projects?mine=1", ownerToken);
  const mineIds = (mineList.body?.projects || []).map((p) => p.id);
  check("the draft is present in the owner's own listing", mineIds.includes(draftId));
  const mineNoToken = await get("/api/projects?mine=1");
  check("?mine=1 without a token is refused", mineNoToken.status === 401, `status=${mineNoToken.status}`);

  // ── 7 ──────────────────────────────────────────────────────────────────
  // Search over stored records — NOT a filter over hardcoded category
  // names, which is what the Coverage screen's category picker does and
  // keeps doing.
  console.log("\n7. search queries stored projects");
  await post("/api/projects", {
    title: "Solar microgrid", category: "Environment", summary: "Panels for a village school.",
  }, ownerToken);

  const byWord = await get("/api/projects?q=microgrid");
  check("a title word finds it", (byWord.body?.projects || []).some((p) => p.title === "Solar microgrid"),
    JSON.stringify((byWord.body?.projects || []).map((p) => p.title)));
  const byPrefix = await get("/api/projects?q=micro");
  check("a partial word finds it too (search-as-you-type)",
    (byPrefix.body?.projects || []).some((p) => p.title === "Solar microgrid"));
  const bySummary = await get("/api/projects?q=village");
  check("a summary word finds it", (bySummary.body?.projects || []).some((p) => p.title === "Solar microgrid"));
  const byCategory = await get("/api/projects?category=Infrastructure");
  check("category filter works and Infrastructure is a real category",
    (byCategory.body?.projects || []).every((p) => p.category === "Infrastructure") &&
    (byCategory.body?.projects || []).length === 1,
    JSON.stringify((byCategory.body?.projects || []).map((p) => p.category)));
  const byCountry = await get("/api/projects?country=IN");
  check("country filter works", (byCountry.body?.projects || []).length >= 1);

  // A regex metacharacter must be a literal, not a pattern.
  const regexy = await get("/api/projects?q=" + encodeURIComponent(".*"));
  check("a regex metacharacter is searched literally, not executed",
    regexy.status === 200 && (regexy.body?.projects || []).length === 0,
    `status=${regexy.status} count=${(regexy.body?.projects || []).length}`);
  const unbalanced = await get("/api/projects?q=" + encodeURIComponent("("));
  check("an unbalanced paren does not throw", unbalanced.status === 200, `status=${unbalanced.status}`);

  check("per-category counts come back", typeof publicList.body?.counts?.Infrastructure === "number",
    JSON.stringify(publicList.body?.counts));
  check("the counts respect the draft rule (Startup draft not counted publicly)",
    publicList.body?.counts?.Startup === 0, JSON.stringify(publicList.body?.counts));

  // ── 8 ──────────────────────────────────────────────────────────────────
  console.log("\n8. file upload stores real bytes, and refuses what it should");
  const pdfBytes = Buffer.from("%PDF-1.4 a tiny pretend pdf", "utf8");
  const upload = await post(`/api/projects/${projectId}/attachment`, {
    filename: "../../etc/brief.pdf",
    contentType: "application/pdf",
    data: pdfBytes.toString("base64"),
  }, ownerToken);
  check("upload accepted", upload.status === 201, `status=${upload.status} ${JSON.stringify(upload.body)}`);
  // "../../etc/brief.pdf" -> separators become underscores, then the LEADING
  // dots are stripped so the result cannot become a dotfile. Both traversal
  // segments are neutralised; what is left is inert text.
  check("the filename was stripped of path separators and leading dots",
    upload.body?.project?.attachment?.filename === "_.._etc_brief.pdf",
    upload.body?.project?.attachment?.filename);
  check("the byte size is the real one",
    upload.body?.project?.attachment?.byteSize === pdfBytes.length,
    `${upload.body?.project?.attachment?.byteSize} vs ${pdfBytes.length}`);

  const download = await fetch(`${BASE}/api/projects/${projectId}/attachment`);
  const downloaded = Buffer.from(await download.arrayBuffer());
  check("the bytes come back byte-for-byte", downloaded.equals(pdfBytes),
    `${downloaded.length} bytes`);
  check("served as an attachment, never inline",
    /^attachment;/.test(download.headers.get("content-disposition") || ""),
    download.headers.get("content-disposition"));
  check("nosniff is set", download.headers.get("x-content-type-options") === "nosniff");

  const strangerUpload = await post(`/api/projects/${projectId}/attachment`, {
    filename: "evil.pdf", contentType: "application/pdf", data: pdfBytes.toString("base64"),
  }, strangerToken);
  check("a stranger cannot attach a file to someone else's project",
    strangerUpload.status === 404, `status=${strangerUpload.status}`);

  const svg = await post(`/api/projects/${projectId}/attachment`, {
    filename: "x.svg", contentType: "image/svg+xml", data: Buffer.from("<svg/>").toString("base64"),
  }, ownerToken);
  check("an SVG is refused (it is a script container, not just an image)",
    svg.status === 415, `status=${svg.status}`);
  const html = await post(`/api/projects/${projectId}/attachment`, {
    filename: "x.html", contentType: "text/html", data: Buffer.from("<script>").toString("base64"),
  }, ownerToken);
  check("text/html is refused", html.status === 415, `status=${html.status}`);

  const tooBig = await post(`/api/projects/${projectId}/attachment`, {
    filename: "big.pdf", contentType: "application/pdf",
    data: Buffer.alloc(2 * 1024 * 1024 + 1024, 0x41).toString("base64"),
  }, ownerToken);
  check("a file over the 2 MB cap is refused", tooBig.status === 413, `status=${tooBig.status}`);

  // The draft's file must be as private as the draft.
  const draftUpload = await post(`/api/projects/${draftId}/attachment`, {
    filename: "secret.txt", contentType: "text/plain", data: Buffer.from("hush").toString("base64"),
  }, ownerToken);
  check("the owner can attach to their draft", draftUpload.status === 201, `status=${draftUpload.status}`);
  const draftFileAnon = await fetch(`${BASE}/api/projects/${draftId}/attachment`);
  check("a stranger cannot fetch a draft's file", draftFileAnon.status === 404,
    `status=${draftFileAnon.status}`);

  // ── 9 ──────────────────────────────────────────────────────────────────
  console.log("\n9. deleting a project takes its file with it");
  const attachmentsBefore = await ProjectAttachment.countDocuments({});
  check("attachments exist before the delete", attachmentsBefore === 2, `count=${attachmentsBefore}`);
  const removed = await del(`/api/projects/${draftId}`, ownerToken);
  check("owner delete accepted", removed.status === 200, `status=${removed.status}`);
  check("the project row is gone", (await Project.findById(draftId).lean()) === null);
  check("its attachment row went with it",
    (await ProjectAttachment.countDocuments({ projectId: draftId })) === 0);
  check("the other project's file is untouched",
    (await ProjectAttachment.countDocuments({})) === 1);

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

run().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch (e) { /* already down */ }
  process.exit(1);
});
