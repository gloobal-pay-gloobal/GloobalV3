// Starts the real API against a THROWAWAY database, for the browser
// verifiers to drive.
//
//   node tools/frontend/start-test-api.mjs            # port 5212
//   TEST_API_PORT=5210 node tools/frontend/start-test-api.mjs
//
// The server suites each do this inline; the browser verifiers could not,
// because they run in a different process from the API they drive. Same
// rules as those suites, and the same refusal: the database name is
// REPLACED with a throwaway one before server.js is loaded, so nothing here
// can reach a real collection even if MONGO_URI points at the production
// cluster.
//
// Credentials are read by dotenv from server/.env and never printed.

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BACKEND = join(ROOT, "server");
const require = createRequire(join(BACKEND, "server.js"));

require("dotenv").config({ path: join(BACKEND, ".env"), quiet: true });

if (!process.env.MONGO_URI) {
  console.error("MONGO_URI is not set — this needs server/.env.");
  process.exit(1);
}

const TEST_DB = process.env.TEST_API_DB || "gloobal_receipt_ui_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_API_PORT || "5212";
process.env.PROTOTYPE_TRANSACTION_MAX_AMOUNT = process.env.PROTOTYPE_TRANSACTION_MAX_AMOUNT || "1000000";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";
process.env.ALLOWED_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173";

const mongoose = require("mongoose");

require(join(BACKEND, "server.js"));

mongoose.connection.once("connected", async () => {
  if (mongoose.connection.name !== TEST_DB) {
    console.error(`refusing to serve from "${mongoose.connection.name}" — expected ${TEST_DB}`);
    process.exit(1);
  }
  // A verifier seeds its own accounts and payments; it should find the
  // database as empty as a first run would.
  await mongoose.connection.dropDatabase();
  console.log(`test API on :${process.env.PORT}, database ${TEST_DB} (dropped and empty)`);
});
