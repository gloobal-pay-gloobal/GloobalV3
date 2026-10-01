// The attachment route must actually reach its own 3 MB parser.
//
//   node tests/attachment-body-limit.test.mjs
//
// ── The bug this pins (audit finding F6) ────────────────────────────────
//
// A route can mount its own body parser, but it cannot mount one EARLIER
// than an app-level `app.use`. The global parser is 64 KB; the attachment
// route declares 3 MB. The global one ran first and rejected the request
// before the route's was ever reached.
//
// base64 inflates by 4/3, so the real ceiling was about 48 KB of file,
// against a frontend that offers 2 MB. The feature looked implemented, its
// own unit-level checks passed, and it failed for every file anybody would
// actually attach — a 60 KB PDF included.
//
// ── What this file holds to ─────────────────────────────────────────────
//
//   1. a body well over 64 KB reaches the attachment route and is accepted;
//   2. a file over the route's OWN 2 MB cap is still refused, by the route,
//      with the route's own message — the hole is a hole for one path, not
//      a removed limit;
//   3. a body over 3 MB is refused by the route's parser;
//   4. EVERY OTHER PATH still gets 64 KB. This is the one that matters most:
//      the cheap way to make (1) pass is to raise the global limit, and that
//      would let an unauthenticated caller make this process allocate
//      megabytes per request. If anybody ever does that, this fails.
//
// Runs the real server.js against a THROWAWAY database on the cluster
// MONGO_URI points at, dropped when the run ends.

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

const TEST_DB = "gloobal_attachment_body_limit_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5233";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";

const mongoose = require("mongoose");

require(join(BACKEND, "server.js"));

const User = require(join(BACKEND, "models/User"));
const Project = require(join(BACKEND, "models/Project"));
const ProjectAttachment = require(join(BACKEND, "models/ProjectAttachment"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) => Array.from({ length: 12 }, (_, i) => SYMBOLS[(seed + i * 3) % 8]).join("");
const PIN = "135791";
const OWNER = { iso: "IN", id: symbolId(3), mobile: "+919000000601", name: "Project Owner" };

const call = (method, path, body, token) =>
  fetch(`${BASE}${path}`, {
    method,
    headers: Object.assign({ "Content-Type": "application/json" }, token ? { Authorization: `Bearer ${token}` } : {}),
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }));

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failures += 1;
};

const untilConnected = () =>
  new Promise((resolve, reject) => {
    if (mongoose.connection.readyState === 1) return resolve();
    mongoose.connection.once("connected", resolve);
    mongoose.connection.once("error", reject);
    setTimeout(() => reject(new Error("timed out connecting to MongoDB")), 40000);
  });

// A file of exactly `bytes`, as the route receives it: base64 in JSON. The
// bytes are a real PNG header followed by filler, so nothing here depends on
// the route sniffing content it does not sniff.
const fileOf = (bytes) => {
  const buffer = Buffer.alloc(bytes, 0x41);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  return buffer.toString("base64");
};

async function run() {
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(`refusing to run against "${mongoose.connection.name}" — expected ${TEST_DB}`);
  }
  console.log(`db: ${mongoose.connection.name}\n`);

  await Promise.all([User.deleteMany({}), Project.deleteMany({}), ProjectAttachment.deleteMany({})]);

  await call("POST", "/api/otp/send", { mobileNumber: OWNER.mobile, purpose: "registration" });
  await call("POST", "/api/otp/verify", { mobileNumber: OWNER.mobile, otp: "123456", purpose: "registration" });
  const registered = await call("POST", "/api/register-symbol", {
    fullName: OWNER.name, mobileNumber: OWNER.mobile, symbolId: OWNER.id, countryIso: OWNER.iso,
  });
  const token = registered.body?.token;
  if (!token) throw new Error(`could not register: ${JSON.stringify(registered.body)}`);
  await call("POST", "/api/pin/set", { symbolId: OWNER.id, pin: PIN }, token);

  const created = await call("POST", "/api/projects", {
    title: "Body limit project",
    summary: "A project that exists so an attachment has somewhere to go.",
  }, token);
  const projectId = created.body?.project?.id || created.body?.id || created.body?.project?._id;
  check("a project was created to attach to", Boolean(projectId), `status ${created.status}`);
  if (!projectId) return failures;

  const attach = (base64, contentType = "image/png") =>
    call("POST", `/api/projects/${projectId}/attachment`,
      { fileName: "evidence.png", contentType, data: base64 }, token);

  console.log("1. a body well over the GLOBAL 64 KB reaches the route");
  {
    // 600 KB of file ≈ 800 KB of base64 — an order of magnitude past the
    // global parser, comfortably inside the route's own 2 MB.
    const response = await attach(fileOf(600 * 1024));
    check("NOT rejected by the 64 KB global parser", response.status !== 413,
      `status ${response.status} ${JSON.stringify(response.body?.message || "")}`);
    check("accepted", response.status === 200, `status ${response.status}`);
    const stored = await ProjectAttachment.findOne({}).select("byteSize").lean();
    check("stored at its real size", Number(stored?.byteSize) === 600 * 1024, String(stored?.byteSize));
  }

  console.log("\n2. the route's OWN 2 MB cap still applies");
  {
    const response = await attach(fileOf(2 * 1024 * 1024 + 1024));
    check("refused", response.status === 413, `status ${response.status}`);
    check("by the route, with the route's own message",
      /MB/.test(String(response.body?.message || "")), String(response.body?.message));
  }

  console.log("\n3. a body past the route's 3 MB parser is refused");
  {
    // 2.6 MB of file ≈ 3.5 MB of base64: past the parser, so the request is
    // rejected before the handler ever sees it.
    const response = await attach(fileOf(2600 * 1024));
    check("refused", response.status === 413, `status ${response.status}`);
  }

  console.log("\n4. every other path still gets 64 KB");
  {
    // The global limit is what stops an unauthenticated caller making this
    // process allocate megabytes. Raising it is the cheap way to make test 1
    // pass, so this is the guard against that.
    const big = "x".repeat(200 * 1024);
    const onAnotherRoute = await call("POST", "/api/projects", { title: "Too big", summary: big }, token);
    check("a 200 KB body on another route is refused", onAnotherRoute.status === 413,
      `status ${onAnotherRoute.status}`);

    const unauthenticated = await call("POST", "/api/login", { symbolId: OWNER.id, pin: PIN, filler: big });
    check("and on an unauthenticated route too", unauthenticated.status === 413,
      `status ${unauthenticated.status}`);

    // The GET on the attachment path carries no body and must not have been
    // given a hole it does not need.
    const read = await call("GET", `/api/projects/${projectId}/attachment`, undefined, token);
    check("the attachment GET still serves the file", read.status === 200 || read.status === 404,
      `status ${read.status}`);
  }

  console.log("\n5. the profile photo path is unchanged");
  {
    // It had the only hole before this one; it must still have it.
    const photo = "data:image/png;base64," + fileOf(120 * 1024);
    const response = await call("PUT", `/api/profile/${encodeURIComponent(OWNER.id)}/photo`,
      { symbolId: OWNER.id, image: photo }, token);
    check("a 160 KB photo body is not refused by the global parser", response.status !== 413,
      `status ${response.status}`);
  }

  console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) failed`}`);
  return failures;
}

let exitCode = 1;
try {
  exitCode = (await run()) === 0 ? 0 : 1;
} catch (error) {
  console.error("HARNESS ERROR:", error);
} finally {
  try {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === TEST_DB) {
      await mongoose.connection.dropDatabase();
      console.log(`dropped test database ${TEST_DB}`);
    }
    await mongoose.disconnect();
  } catch (error) {
    console.error("cleanup error:", error.message);
  }
  process.exit(exitCode);
}
