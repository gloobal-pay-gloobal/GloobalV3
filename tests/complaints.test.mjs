// tests/complaints.test.mjs
//
// Complaints: a wrong payment, raised from the payer's receipt, answered by
// the person who was paid, talked through in a chat on the case, and closed
// by sending the money back, marking it solved, or (after 48 hours) handing
// it to GLOOBAL support.
//
// The server pieces that decide who sees what are run, not just read:
// publicComplaint and closeComplaintByReturn are lifted out of server.js and
// executed against stand-ins for the models.

import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readSource } from "./harness.mjs";

const server = readSource("server/server.js");
const model = readSource("server/models/Complaint.js");
const ui = readSource("frontend/features/complaints/complaints.jsx");
const receipt = readSource("frontend/components/dialogs/ReceiptModal.jsx");
const dash = readSource("frontend/screens/Dashboard/Dashboard.jsx");
const app = readSource("frontend/App.jsx");
const send = readSource("frontend/screens/SendMoney/SendMoney.jsx");
const api = readSource("backend/services/api/gloobalApi.js");
const build = readSource("build_app.mjs");

function lift(name) {
  const start = server.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} not found`);
  const asyncStart = server.lastIndexOf("async ", start) === start - 6 ? start - 6 : start;
  const end = server.indexOf("\n}\n", start);
  return server.slice(asyncStart, end + 2);
}

const id = (n) => ({ toString: () => n, valueOf: () => n });
const REPORTER = "a".repeat(24);
const RECEIVER = "b".repeat(24);

function viewOf(viewer, doc) {
  const ctx = {
    COMPLAINT_ESCALATE_AFTER_MS: 48 * 3600e3,
    notificationDisplayName: (snap, user) => (snap && snap.fullName) || (user && user.fullName) || "",
    accountCountryIso: (u) => u.countryIso || null,
    out: null,
  };
  vm.createContext(ctx);
  vm.runInContext(lift("publicComplaint") + "\nout = publicComplaint;", ctx);
  const txn = {
    amount: 6.02, currency: "USD", createdAt: new Date("2026-10-29T12:00:00Z"),
    metadata: { debitAmount: 500, sourceCurrency: "INR", parties: { sender: { fullName: "Priya Singh", countryIso: "IN" }, receiver: { fullName: "Rahul Verma", countryIso: "US" } } },
  };
  const people = new Map([[REPORTER, { symbolId: "−+×=○□●■−+×=", fullName: "Priya Singh", countryIso: "IN" }], [RECEIVER, { symbolId: "●■−+×=○□●■−+", fullName: "Rahul Verma", countryIso: "US" }]]);
  return JSON.parse(JSON.stringify(ctx.out(doc, viewer, txn, people)));
}

const DOC = {
  _id: "c".repeat(24), ref: "GC-4821", referenceId: "TXN1", reporterId: REPORTER, receiverId: RECEIVER,
  reason: "wrong_person", note: "meant for my brother", status: "open", createdAt: new Date("2026-10-29T12:05:00Z"),
  reporterReadAt: new Date("2026-10-29T12:05:00Z"), receiverReadAt: null,
  messages: [
    { _id: "m1", from: null, text: "Complaint raised · Sent to the wrong person", at: new Date("2026-10-29T12:05:00Z") },
    { _id: "m2", from: REPORTER, text: "meant for my brother", at: new Date("2026-10-29T12:05:00Z") },
  ],
};

test("each side sees its own amount, its own role, and the other person's name", () => {
  const mine = viewOf(REPORTER, DOC);
  assert.equal(mine.myRole, "reporter");
  assert.equal(mine.otherName, "Rahul Verma");
  assert.equal(mine.amount, 500);
  assert.equal(mine.currency, "INR");
  const theirs = viewOf(RECEIVER, DOC);
  assert.equal(theirs.myRole, "receiver");
  assert.equal(theirs.otherName, "Priya Singh");
  assert.equal(theirs.amount, 6.02);
  assert.equal(theirs.currency, "USD");
  // Sending back means returning what the payer paid, in the payer's money.
  assert.equal(theirs.returnAmount, 500);
  assert.equal(theirs.returnCurrency, "INR");
  assert.equal(theirs.otherSymbolId, "−+×=○□●■−+×=");
});

test("messages read as me / them / system from where the viewer stands", () => {
  assert.deepEqual(viewOf(REPORTER, DOC).messages.map((m) => m.from), ["system", "me"]);
  assert.deepEqual(viewOf(RECEIVER, DOC).messages.map((m) => m.from), ["system", "them"]);
});

test("unread: the receiver has never opened it; the reporter wrote the last line", () => {
  assert.equal(viewOf(RECEIVER, DOC).unread, true);
  assert.equal(viewOf(REPORTER, DOC).unread, false);
});

test("escalation unlocks 48 hours after the case was raised", () => {
  const v = viewOf(REPORTER, DOC);
  assert.equal(new Date(v.canEscalateAt) - new Date(v.openedAt), 48 * 3600e3);
});

async function returnRun({ senderId, receiverId, paid, currency, status = "replied" }) {
  const saved = [];
  const notified = [];
  const doc = { ...DOC, status, messages: [], save: async () => { saved.push(true); } };
  const ctx = {
    mongoose: { Types: { ObjectId: { isValid: () => true } } },
    Complaint: { findById: async () => doc, COMPLAINT_MESSAGE_CAP: 200 },
    Transaction: { findById: () => ({ select: () => ({ lean: async () => ({ amount: 6.02, currency: "USD", metadata: { debitAmount: 500, sourceCurrency: "INR" } }) }) }) },
    COMPLAINT_OPEN_STATUSES: ["open", "replied", "escalated"],
    capComplaintMessages: () => {},
    formatNotificationAmount: (n) => String(n),
    notificationDisplayName: (s, u) => u.fullName,
    notifyComplaintParty: async (uid, msg) => { notified.push([String(uid), msg.title]); },
    console,
    out: null,
  };
  vm.createContext(ctx);
  vm.runInContext(lift("closeComplaintByReturn") + "\nout = closeComplaintByReturn;", ctx);
  await ctx.out({
    complaintId: DOC._id,
    transaction: { _id: "t2", amount: paid, currency },
    sender: { _id: senderId, fullName: "Rahul Verma" },
    receiver: { _id: receiverId, fullName: "Priya Singh" },
  });
  return { doc, saved, notified };
}

test("sending the full amount back closes the case as returned and tells the reporter", async () => {
  const { doc, notified } = await returnRun({ senderId: RECEIVER, receiverId: REPORTER, paid: 500, currency: "INR" });
  assert.equal(doc.status, "returned");
  assert.equal(doc.returnTransactionId, "t2");
  assert.ok(doc.closedAt && typeof doc.closedAt.getTime === "function");
  assert.equal(notified[0][0], REPORTER);
  assert.match(notified[0][1], /Money sent back/);
});

test("a smaller amount is recorded but leaves the case open", async () => {
  const { doc, notified } = await returnRun({ senderId: RECEIVER, receiverId: REPORTER, paid: 200, currency: "INR" });
  assert.equal(doc.status, "replied");
  assert.equal(doc.messages.length, 1);
  assert.match(notified[0][1], /Part sent back/);
});

test("a payment between anyone else never touches the case", async () => {
  const stranger = "d".repeat(24);
  for (const [s, r] of [[stranger, REPORTER], [RECEIVER, stranger], [REPORTER, RECEIVER]]) {
    const { doc, saved } = await returnRun({ senderId: s, receiverId: r, paid: 500, currency: "INR" });
    assert.equal(doc.status, "replied");
    assert.equal(saved.length, 0);
  }
});

test("a closed case cannot be closed again", async () => {
  const { saved } = await returnRun({ senderId: RECEIVER, receiverId: REPORTER, paid: 500, currency: "INR", status: "solved" });
  assert.equal(saved.length, 0);
});

test("the model: one case per payment, six reasons, five states", () => {
  assert.match(model, /complaintSchema\.index\(\{ transactionId: 1 \}, \{ unique: true \}\)/);
  assert.match(model, /'wrong_person', 'wrong_amount', 'paid_twice', 'not_received', 'not_me', 'other'/);
  assert.match(model, /'open', 'replied', 'returned', 'solved', 'escalated'/);
});

test("the routes: only the payer raises, only the parties read, only the reporter solves or escalates", () => {
  assert.match(server, /String\(txn\.fromUserId\) !== String\(req\.authUser\._id\)/);
  assert.match(server, /String\(doc\.reporterId\) !== me && String\(doc\.receiverId\) !== me/);
  assert.match(server, /Only the person who raised it can mark it solved\./);
  assert.match(server, /Only the person who raised it can ask support\./);
  assert.match(server, /Date\.now\(\) - new Date\(doc\.createdAt\)\.getTime\(\) < COMPLAINT_ESCALATE_AFTER_MS/);
  for (const route of ["app.post('/api/complaints'", "app.get('/api/complaints'", "app.get('/api/complaints/:id'", "app.post('/api/complaints/:id/messages'", "app.post('/api/complaints/:id/solve'", "app.post('/api/complaints/:id/escalate'"]) {
    const at = server.indexOf(route);
    assert.ok(at > 0, route);
    assert.match(server.slice(at, at + 120), /requireAuth/, `${route} without requireAuth`);
  }
});

test("send-back rides on the ordinary payment and closes the case after it commits", () => {
  const route = server.slice(server.indexOf("app.post('/api/transactions/send'"));
  assert.match(route.slice(0, 6000), /\bcomplaintId,/);
  assert.match(route, /await closeComplaintByReturn\(\{ complaintId, transaction: completedTransaction, sender, receiver \}\)/);
  assert.match(send, /complaintId: prefillReceiver\.complaintId \|\| null/);
  assert.match(app, /complaintId: \(receiver && receiver\.complaintId\) \|\| undefined/);
  assert.match(app, /complaintId: payee\.complaintId \|\| null/);
  assert.match(dash, /prefillAmount: c\.returnAmount,\s*complaintId: c\.id/);
});

test("the receipt: Complain only on payments I sent, with the reason sheet", () => {
  assert.match(receipt, /const canComplain = isSent && receipt\.kind !== "share" && Boolean\(receipt\.txnId\);/);
  assert.match(receipt, /testId="receipt-complain"/);
  assert.match(receipt, /<ComplaintReasonSheet/);
  assert.match(receipt, /GloobalApi\.raiseComplaint\(\{ txnId: receipt\.txnId, reason, note \}\)/);
});

test("the profile row, the map entry and the push all lead to the case", () => {
  assert.match(dash, /\["Complaints & reports"\]/);
  assert.match(dash, /label === "Complaints & reports"\s*\? setShowComplaints\(true\)/);
  assert.match(dash, /deepLinkTarget\.complaint/);
  assert.match(app, /key: "complaints", section: "You"/);
  assert.match(app, /setDashboardDeepLink\(\{ complaint: String\(complaintId\) \}\)/);
  assert.match(app, /readComplaintFromUrl/);
  assert.match(server, /url: `\/\?complaint=\$\{encodeURIComponent\(String\(complaint\._id\)\)\}`/);
});

test("the screens are in the build and the API has every call", () => {
  assert.match(build, /"features\/complaints\/complaints\.jsx"/);
  for (const fn of ["raiseComplaint", "getComplaints", "getComplaint", "complaintAction"]) assert.match(api, new RegExp(`async ${fn}\\(`));
  for (const c of ["ComplaintReasonSheet", "ComplaintRaisedSheet", "ComplaintsScreen", "ComplaintCaseScreen"]) assert.match(ui, new RegExp(`function ${c}\\(`));
  assert.match(ui, /"Something else"/);
  assert.match(ui, /needsNote = reason === "other"/);
});

test("every money figure on the complaint screens carries its GEU pair", () => {
  assert.doesNotMatch(ui, /\bfmt\(|\bfmtMoney\(/);
  assert.match(ui, /amountText: c\.amountText \|\| geuLensBarMoney\(Number\(c\.amount\) \|\| 0, c\.currency \|\| "", lens, ownCurrency\)/);
  assert.match(ui, /returnAmountText: c\.returnAmountText \|\| geuLensBarMoney\(Number\(c\.returnAmount\) \|\| 0, c\.returnCurrency/);
  // Send back returns the PAYER's figure, not the receiver's reading of it.
  assert.match(ui, /`Send back \$\{c\.returnAmountText \|\| c\.amountText\}`/);
  assert.match(receipt, /amountText: geuLensBarMoney\(Number\(paymentAmount\) \|\| 0, paymentCurrency \|\| "", lens, viewerCurrency\)/);
  assert.match(dash, /complaintForScreen\(c, displayLens, ccyCode\)/);
  assert.match(dash, /complaintForScreen\(openComplaint, displayLens, ccyCode\)/);
});
