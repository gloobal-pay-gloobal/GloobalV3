// GLOOBAL Bank account opening, end to end against a real server and
// database: the draft that saves as you go, the ID checks, the Aadhaar code,
// the selfie, nominees, declarations, the PIN, one ID per account, and settle
// refusing until there is an account to settle into.
//
//   cd server && node tests/bank.test.mjs      (needs MONGO_URI in server/.env)
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
const TEST_DB = "gloobal_bank_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5224";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";

const mongoose = require("mongoose");
require(join(BACKEND, "server.js"));
const Country = require(join(BACKEND, "models/Country"));
const BankAccount = require(join(BACKEND, "models/BankAccount"));
const { verhoeffValid, validAadhaar, validPan } = require(join(BACKEND, "lib/bank"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) => Number(seed).toString(8).padStart(12, "0").slice(-12).split("").map((d) => SYMBOLS[Number(d)]).join("");
const PIN = "135791";
const A = { id: symbolId(81), mobile: "+919000000981", name: "Asha Opener" };
const B = { id: symbolId(82), mobile: "+971500000982", name: "Bala Dubai", country: "AE" };
const C = { id: symbolId(83), mobile: "+919000000983", name: "Chitra Third" };
const tokens = {};
const call = async (method, path, { body, token } = {}) => {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let parsed = null; try { parsed = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: parsed };
};
let failures = 0;
const check = (label, ok, detail) => { console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? " — " + detail : ""}`); if (!ok) failures += 1; };
const j = (v) => JSON.stringify(v);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = encodeURIComponent;

// A valid Aadhaar: eleven digits and the Verhoeff digit that completes them.
const aadhaarFrom = (eleven) => { for (let d = 0; d < 10; d++) if (verhoeffValid(eleven + d)) return eleven + d; throw new Error("no check digit"); };
const AADHAAR_1 = aadhaarFrom("23456789012");
const AADHAAR_2 = aadhaarFrom("98765432109");

async function register(a, key) {
  await call("POST", "/api/otp/send", { body: { mobileNumber: a.mobile, purpose: "registration" } });
  await call("POST", "/api/otp/verify", { body: { mobileNumber: a.mobile, otp: "123456", purpose: "registration" } });
  const r = await call("POST", "/api/register-symbol", { body: { fullName: a.name, mobileNumber: a.mobile, symbolId: a.id, countryIso: a.country || "IN" } });
  tokens[key] = r.body?.token;
  if (!tokens[key]) throw new Error(`register ${key}: ${j(r.body)}`);
  await call("POST", "/api/pin/set", { body: { symbolId: a.id, pin: PIN }, token: tokens[key] });
}
const goodDetails = { fullName: "Asha Opener", dob: "1992-08-14", email: "asha@example.com", address: { line1: "12 MG Road", city: "Chandigarh", postcode: "160017" }, occupation: "salaried", income: "5_10" };

async function main() {
  for (let i = 0; i < 60 && mongoose.connection.readyState !== 1; i += 1) await sleep(250);
  await sleep(3000);
  await mongoose.connection.db.dropDatabase();
  await sleep(1000);
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).init().catch(() => {})));
  await Country.create([{ iso: "IN", name: "India", dialCode: "+91", localCurrency: "INR" }, { iso: "AE", name: "United Arab Emirates", dialCode: "+971", localCurrency: "AED" }]);
  await register(A, "A");
  await register(B, "B");
  await register(C, "C");

  console.log("\n0. The checks themselves");
  check("a Verhoeff-valid Aadhaar passes", Boolean(validAadhaar(AADHAAR_1)), AADHAAR_1);
  check("one wrong digit fails", !validAadhaar(AADHAAR_1.slice(0, 11) + ((Number(AADHAAR_1[11]) + 1) % 10)));
  check("an Aadhaar starting with 1 fails", !validAadhaar("1" + AADHAAR_1.slice(1)));
  check("an individual's PAN passes", Boolean(validPan("abcpk1234l")));
  check("a company's PAN fails", !validPan("ABCCK1234L"));

  console.log("\n1. Status and the draft");
  let r = await call("GET", `/api/bank/${enc(A.id)}`, { token: tokens.A });
  check("no application yet reads as none, numbered by the GLOOBAL ID", r.status === 200 && r.body?.bank?.status === "none" && r.body.bank.accountNumber === A.id, j(r.body));
  r = await call("GET", `/api/bank/${enc(A.id)}`, { token: tokens.B });
  check("nobody reads another person's account", r.status === 403);
  r = await call("PUT", "/api/bank/draft", { token: tokens.A, body: { symbolId: A.id, step: 4, details: { fullName: "Asha Opener" } } });
  check("a draft cannot jump ahead of what is missing", r.status === 200 && r.body?.bank?.step === 0, j(r.body?.bank?.step));
  r = await call("PUT", "/api/bank/draft", { token: tokens.A, body: { symbolId: A.id, step: 1, details: goodDetails } });
  check("details save and the step moves on", r.status === 200 && r.body?.bank?.step === 1 && r.body.bank.details.email === "asha@example.com", j(r.body?.bank));

  console.log("\n2. ID and the Aadhaar code");
  r = await call("POST", "/api/bank/id", { token: tokens.A, body: { symbolId: A.id, method: "aadhaar", aadhaar: "234567890123", pan: "ABCPK1234L" } });
  check("a bad Aadhaar is refused, naming the field", r.status === 400 && r.body?.field === "aadhaar", j(r.body));
  r = await call("POST", "/api/bank/id", { token: tokens.A, body: { symbolId: A.id, method: "aadhaar", aadhaar: AADHAAR_1, pan: "ABCPK1234" } });
  check("a bad PAN is refused, naming the field", r.status === 400 && r.body?.field === "pan", j(r.body));
  r = await call("POST", "/api/bank/id", { token: tokens.A, body: { symbolId: A.id, method: "aadhaar", aadhaar: AADHAAR_1, pan: "ABCPK1234L" } });
  check("a good pair sends a code, and the code is not in the response", r.status === 200 && r.body?.otpSent === true && !j(r.body).includes("123456"), j(r.body));
  const stored = await BankAccount.findOne({}).lean();
  check("the Aadhaar number is not stored, only its last four", !j(stored).includes(AADHAAR_1) && stored.identity.docs[0].shown === "••" + AADHAAR_1.slice(-4), JSON.stringify(stored.identity.docs[0]));
  check("the country it was proved for is recorded", stored.identity.country === "IN" && stored.identity.method === "aadhaar_pan", stored.identity.country);
  check("the PAN is not stored in full", !j(stored).includes("ABCPK1234L") && stored.identity.docs[1].shown === "ABC•••234L", JSON.stringify(stored.identity.docs[1]));
  r = await call("POST", "/api/bank/selfie", { token: tokens.A, body: { symbolId: A.id } });
  check("no selfie before the ID is checked", r.status === 409, j(r.body));
  r = await call("POST", "/api/bank/id/verify", { token: tokens.A, body: { symbolId: A.id, otp: "000000" } });
  check("a wrong code is counted", r.status === 401 && r.body?.attemptsRemaining === 4, j(r.body));
  r = await call("POST", "/api/bank/id/verify", { token: tokens.A, body: { symbolId: A.id, otp: "123456" } });
  check("the right code verifies the ID", r.status === 200 && r.body?.bank?.identity?.verified === true && r.body.bank.step === 2, j(r.body?.bank?.identity));

  console.log("\n3. Selfie, nominees");
  r = await call("POST", "/api/bank/selfie", { token: tokens.A, body: { symbolId: A.id } });
  check("the selfie is recorded", r.status === 200 && r.body?.bank?.selfie?.taken === true, j(r.body?.bank?.selfie));
  r = await call("PUT", "/api/bank/draft", { token: tokens.A, body: { symbolId: A.id, step: 4, nominees: [{ name: "Priya Sharma", relation: "spouse", sharePct: 60 }, { name: "Ravi", relation: "child", sharePct: 30 }] } });
  r = await call("POST", "/api/bank/open", { token: tokens.A, body: { symbolId: A.id, pin: PIN, declarations: { taxResidentOnly: true, notPep: true, terms: true } } });
  check("shares that do not add up to 100 stop the opening, at the nominee step", r.status === 409 && r.body?.step === 3 && /90%/.test(r.body.message), j(r.body));
  await call("PUT", "/api/bank/draft", { token: tokens.A, body: { symbolId: A.id, nominees: [{ name: "Priya Sharma", relation: "spouse", sharePct: 70 }, { name: "Ravi", relation: "child", sharePct: 30 }] } });

  console.log("\n4. Settle needs the account");
  r = await call("POST", "/api/assets/settle", { token: tokens.A, body: { symbolId: A.id } });
  check("settle before opening is refused with bank_not_open", r.status === 409 && r.body?.code === "bank_not_open", j(r.body));

  console.log("\n5. Opening");
  r = await call("POST", "/api/bank/open", { token: tokens.A, body: { symbolId: A.id, pin: PIN, declarations: { taxResidentOnly: true, notPep: false, terms: true } } });
  check("every declaration must be agreed", r.status === 400 && r.body?.code === "declarations", j(r.body));
  r = await call("POST", "/api/bank/open", { token: tokens.A, body: { symbolId: A.id, pin: "111111", declarations: { taxResidentOnly: true, notPep: true, terms: true } } });
  check("a wrong PIN is refused and counted", r.status === 401 && r.body?.attemptsRemaining === 4, j(r.body));
  r = await call("POST", "/api/bank/open", { token: tokens.A, body: { symbolId: A.id, pin: PIN, declarations: { taxResidentOnly: true, notPep: true, terms: true } } });
  check("the right PIN opens it", r.status === 200 && r.body?.bank?.status === "open" && r.body.bank.accountNumber === A.id && r.body.bank.kycMode === "prototype", j(r.body?.bank));
  r = await call("PUT", "/api/bank/draft", { token: tokens.A, body: { symbolId: A.id, details: { fullName: "Someone Else" } } });
  check("an open account's application cannot be edited", r.status === 409 && r.body?.code === "already_open", j(r.body));
  r = await call("POST", "/api/assets/settle", { token: tokens.A, body: { symbolId: A.id } });
  check("settle now gets past the gate (nothing to settle yet)", r.status === 409 && r.body?.code === "nothing_to_settle", j(r.body));

  console.log("\n6. One ID, one account");
  r = await call("POST", "/api/bank/id", { token: tokens.C, body: { symbolId: C.id, method: "aadhaar_pan", values: { aadhaar: AADHAAR_1, pan: "ZZZPZ9999Z" } } });
  check("another person cannot use the same Aadhaar", r.status === 409 && r.body?.field === "aadhaar", j(r.body));
  r = await call("POST", "/api/bank/id", { token: tokens.C, body: { symbolId: C.id, method: "aadhaar_pan", values: { aadhaar: AADHAAR_2, pan: "ABCPK1234L" } } });
  check("or the same PAN", r.status === 409 && r.body?.field === "pan", j(r.body));

  console.log("\n7. Each country its own ways — never India's outside India");
  r = await call("GET", `/api/bank/${enc(A.id)}`, { token: tokens.A });
  check("an India account is offered Aadhaar and PAN, not a passport", j(r.body?.bank?.kyc?.methods?.map((m) => m.key)) === j(["aadhaar_pan", "digilocker", "ckyc"]), j(r.body?.bank?.kyc?.methods?.map((m) => m.key)));
  r = await call("GET", `/api/bank/${enc(B.id)}`, { token: tokens.B });
  const keysB = r.body?.bank?.kyc?.methods?.map((m) => m.key) || [];
  check("a UAE account is offered Emirates ID, UAE PASS and passport", j(keysB) === j(["emirates_id", "uae_pass", "passport"]), j(keysB));
  check("and nothing Indian at all", !/aadhaar|\bpan\b|digilocker|ckyc|uidai/i.test(j(r.body?.bank?.kyc)), "");
  check("its keep-ready line is its own", r.body?.bank?.kyc?.country === "AE" && j(r.body.bank.kyc.keepReady) === j(["Emirates ID"]), j(r.body?.bank?.kyc?.keepReady));
  r = await call("POST", "/api/bank/id", { token: tokens.B, body: { symbolId: B.id, method: "aadhaar_pan", values: { aadhaar: AADHAAR_2, pan: "ZZZPZ9999Z" } } });
  check("a UAE account cannot submit an Aadhaar, whatever the phone sends", r.status === 409 && r.body?.code === "method_not_for_country", j(r.body));
  r = await call("POST", "/api/bank/id", { token: tokens.B, body: { symbolId: B.id, aadhaar: AADHAAR_2, pan: "ZZZPZ9999Z" } });
  check("not even in the first version's flat shape", r.status === 409 && r.body?.code === "method_not_for_country", j(r.body));
  r = await call("POST", "/api/bank/id", { token: tokens.B, body: { symbolId: B.id, method: "uae_pass", values: {} } });
  check("a coming-soon method is refused", r.status === 409 && r.body?.code === "method_not_live", j(r.body));
  r = await call("POST", "/api/bank/id", { token: tokens.C, body: { symbolId: C.id, method: "passport", values: { passportNumber: "Z1234567", passportExpiry: "2034-01-01" } } });
  check("an India account cannot swap in a passport", r.status === 409 && r.body?.code === "method_not_for_country", j(r.body));
  await call("PUT", "/api/bank/draft", { token: tokens.B, body: { symbolId: B.id, details: { ...goodDetails, dob: "2015-01-01" } } });
  r = await call("POST", "/api/bank/id", { token: tokens.B, body: { symbolId: B.id, method: "emirates_id", values: { emiratesId: "123-1990-1234567-1", emiratesIdExpiry: "2030-01-01" } } });
  check("an Emirates ID must start with 784", r.status === 400 && r.body?.field === "emiratesId", j(r.body));
  r = await call("POST", "/api/bank/id", { token: tokens.B, body: { symbolId: B.id, method: "passport", values: { passportNumber: "Z1234567", passportExpiry: "2020-01-01" } } });
  check("an expired passport is refused", r.status === 400 && r.body?.field === "passportExpiry", j(r.body));
  r = await call("POST", "/api/bank/id", { token: tokens.B, body: { symbolId: B.id, method: "emirates_id", values: { emiratesId: "784-1990-1234567-1", emiratesIdExpiry: "2030-01-01" } } });
  check("a valid Emirates ID verifies without a code", r.status === 200 && r.body?.bank?.identity?.verified === true && r.body.bank.identity.summary === "Emirates ID ••5671", j(r.body?.bank?.identity));
  await call("POST", "/api/bank/selfie", { token: tokens.B, body: { symbolId: B.id } });
  await call("PUT", "/api/bank/draft", { token: tokens.B, body: { symbolId: B.id, nomineeSkipped: true } });
  r = await call("POST", "/api/bank/open", { token: tokens.B, body: { symbolId: B.id, pin: PIN, declarations: { taxResidentOnly: true, notPep: true, terms: true } } });
  check("under 18 cannot open", r.status === 409 && r.body?.step === 0 && /18/.test(r.body.message), j(r.body));
  await call("PUT", "/api/bank/draft", { token: tokens.B, body: { symbolId: B.id, details: { dob: "1990-02-02" } } });
  const User = require(join(BACKEND, "models/User"));
  await User.updateOne({ symbolId: B.id }, { $set: { countryIso: "IN" } });
  r = await call("POST", "/api/bank/open", { token: tokens.B, body: { symbolId: B.id, pin: PIN, declarations: { taxResidentOnly: true, notPep: true, terms: true } } });
  check("an ID proved for the UAE does not open an account that is now in India", r.status === 409 && r.body?.step === 1, j(r.body));
  await User.updateOne({ symbolId: B.id }, { $set: { countryIso: "AE" } });
  r = await call("POST", "/api/bank/open", { token: tokens.B, body: { symbolId: B.id, pin: PIN, declarations: { taxResidentOnly: true, notPep: true, terms: true } } });
  check("back in the UAE, it opens", r.status === 200 && r.body?.bank?.status === "open", j(r.body?.message || r.body?.bank?.status));

  console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
  await mongoose.disconnect();
  process.exit(failures ? 1 : 0);
}
main().catch(async (e) => { console.error(e); process.exit(1); });
