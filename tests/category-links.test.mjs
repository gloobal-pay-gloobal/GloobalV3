// tests/category-links.test.mjs
//
//   node --test tests/category-links.test.mjs
//
// CONNECTED CATEGORIES: two people, one payment, two books that agree.
//
// A merchant pays Ramu his wages and files it under "Staff salary". Ramu
// needs the same payment on his own books, as income, under a name he
// chose. Both records already existed — TransactionTag is per viewer
// exactly so two parties can label one payment differently — but the
// second one had to be typed, and the person who forgets is always the one
// being paid.
//
// ── WHAT THESE TESTS ARE FOR ────────────────────────────────────────────
//
// Source-level, because this sandbox has no database. That is a weak test
// of behaviour and a strong test of the things that actually go wrong with
// a feature where one account writes a row that belongs to another:
//
//   WHOSE row gets written, and on whose say-so.
//   WHAT a refusal means, and whether it can be worn down.
//   WHAT one side can see of the other.
//
// Every one of those is a rule that reads as an implementation detail and
// is really the difference between a convenience and a way to put figures
// into a stranger's accounts.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const MODEL = "server/models/CategoryLink.js";
const SERVER = "server/server.js";
const NOTIF = "server/models/Notification.js";

const code = (p) => readSource(p)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

// The tag route's body, which is where the cross-account write happens.
const tagRoute = () => {
  const s = code(SERVER);
  const at = s.indexOf("app.put('/api/transactions/:referenceId/tag'");
  assert.ok(at > 0, "the tag route is gone");
  const end = s.indexOf("app.delete('/api/transactions/:referenceId/tag'", at);
  assert.ok(end > at);
  return s.slice(at, end);
};

describe("a link holds no money and is party to nothing", () => {
  test("the model stores no amount, balance or currency", () => {
    // Category.js opens by stating that a category is not a financial
    // object. A link between two categories inherits that or it quietly
    // becomes a second place where money is written down.
    const model = code(MODEL);
    for (const forbidden of ["amount", "balance", "currency", "total"]) {
      assert.doesNotMatch(model, new RegExp(`\\n\\s*${forbidden}\\s*:`, "i"),
        `the link model has grown a ${forbidden} field`);
    }
  });

  test("ending a link does not touch a single tag", () => {
    const s = code(SERVER);
    const at = s.indexOf("app.delete('/api/category-links/:id'");
    assert.ok(at > 0, "the end route is gone");
    const body = s.slice(at, at + 1600);
    assert.doesNotMatch(body, /TransactionTag/,
      "ending a connection rewrites payments that already happened");
    assert.match(body, /status: 'ended'/);
  });
});

describe("the other side's copy is written on narrow terms", () => {
  const body = tagRoute();

  test("only when the link is active", () => {
    assert.match(body, /status: 'active'/,
      "a pending or ended link would still file somebody's payment for them");
  });

  test("only for the other party to this very payment", () => {
    // A category with Ramu and Sita both on it files a payment to Sita.
    // Writing Ramu's copy would put money he never received into his
    // earnings — the worst failure this feature can have.
    assert.match(body, /memberId: otherPartyId/,
      "the member is not checked against the payment's own counterparty");
    assert.match(body, /const otherPartyId = transaction\.toUserId/);
  });

  test("only when the person filing is the link's owner", () => {
    // The member re-filing their own copy must not reach back across and
    // relabel the merchant's books.
    assert.match(body, /String\(transaction\.fromUserId \|\| ''\) === String\(userId\)/,
      "a payee tagging their own copy could write the payer's");
  });

  test("and never for a category its owner has retired", () => {
    assert.match(body, /archivedAt/, "a deleted category would still be written to");
  });

  test("the name is read at the time, not copied at accept", () => {
    // The member can rename their side whenever they like. A name copied
    // when the link was accepted goes stale the first time they edit it.
    assert.match(body, /Category\.findOne\(\{\s*_id: link\.memberCategoryId,\s*userId: otherPartyId,/,
      "the member's category is not re-read at filing time");
  });

  test("a failure to file their copy cannot fail the request", () => {
    // Same discipline as the payment notification: a label that does not
    // write leaves a payment untagged, which is a smaller wrong than an
    // error on a payment that really happened.
    const at = body.indexOf("let alsoFiled");
    assert.ok(at > 0, "the cross-account write is gone");
    const section = body.slice(at);
    assert.match(section, /try \{/);
    assert.match(section, /catch \(error\) \{\s*console\.error/);
    assert.doesNotMatch(section.slice(0, section.indexOf("catch")), /return res\./,
      "the linked write can return early and skip the caller's own answer");
  });
});

describe("a refusal sticks", () => {
  const s = code(SERVER);
  const invite = () => {
    const at = s.indexOf("app.post('/api/categories/:id/links'");
    assert.ok(at > 0, "the invite route is gone");
    return s.slice(at, s.indexOf("app.get('/api/category-links'", at));
  };

  test("declining is recorded, not deleted", () => {
    const at = s.indexOf("app.post('/api/category-links/:id/decline'");
    assert.ok(at > 0);
    const body = s.slice(at, at + 1200);
    assert.match(body, /status: 'declined'/);
    assert.doesNotMatch(body, /deleteOne|deleteMany|findOneAndDelete/,
      "a declined invitation is removed, so it can be sent again");
  });

  test("a declined invitation cannot be re-sent", () => {
    // An invitation that can be sent again is a way to pester somebody
    // through an app they trust.
    const body = invite();
    assert.match(body, /existing\.status === 'declined'/,
      "nothing stops the same invitation going out a second time");
    const at = body.indexOf("existing.status === 'declined'");
    assert.match(body.slice(at, at + 220), /return res\.status\(409\)/,
      "a declined invitation is not refused");
  });

  test("but an ended one may be started again", () => {
    // An arrangement that existed and stopped is allowed to restart. Only
    // this case reopens the row, which is also what keeps the unique index
    // on { category, member } honest.
    const body = invite();
    const at = body.indexOf("'ended'") >= 0 ? body.indexOf("'ended'") : body.indexOf("updateOne");
    assert.ok(at > 0);
    assert.match(body, /status: 'pending', memberCategoryId: null/,
      "restarting a connection does not clear the previous answer");
  });

  test("one row per person per category, enforced by the database", () => {
    assert.match(code(MODEL), /index\(\{ ownerCategoryId: 1, memberId: 1 \}, \{ unique: true \}\)/,
      "two races could create two links for one person");
  });

  test("nobody can connect a category to themselves", () => {
    assert.match(invite(), /String\(member\._id\) === String\(ownerId\)/);
  });
});

describe("neither side sees the other's books", () => {
  const s = code(SERVER);
  const shape = () => {
    const at = s.indexOf("const publicCategoryLink");
    assert.ok(at > 0, "the link's public shape is gone");
    return s.slice(at, s.indexOf("const decorateCategoryLinks", at));
  };

  test("the category id sent is always the reader's own", () => {
    assert.match(shape(), /categoryId: mine \? String\(row\.ownerCategoryId\) : \(row\.memberCategoryId/,
      "a member could be told which of the owner's categories they sit under");
  });

  test("no figures travel with a link", () => {
    const body = shape();
    for (const forbidden of ["total", "amount", "balance", "spent", "budget"]) {
      assert.doesNotMatch(body, new RegExp(forbidden, "i"),
        `the link's shape carries ${forbidden}`);
    }
  });

  test("the owner's category name reaches a member only while deciding", () => {
    // Somebody weighing up an invitation should see what they are being
    // asked to join. Once they have their own name for it, the owner's is
    // no longer theirs to read.
    assert.match(shape(), /invitedTo: !mine && row\.status === 'pending'/);
  });
});

describe("the member's side is an ordinary category they own", () => {
  const s = code(SERVER);
  const accept = () => {
    const at = s.indexOf("app.post('/api/category-links/:id/accept'");
    assert.ok(at > 0, "the accept route is gone");
    return s.slice(at, s.indexOf("app.post('/api/category-links/:id/decline'", at));
  };

  test("it is created by the member, under the member", () => {
    assert.match(accept(), /Category\.create\(\{\s*userId: memberId,/,
      "the invited person's category is not created as theirs");
  });

  test("it is income, on the creator side, not negotiable", () => {
    // Money arriving through a link is money this person earned. Filing it
    // as an expense, or on the personal side, puts it in the wrong half of
    // every total they have.
    const body = accept();
    assert.match(body, /kind: 'income'/);
    assert.match(body, /side: 'creator'/);
    assert.doesNotMatch(body, /req\.body\?\.kind|req\.body\?\.side/,
      "the caller can choose which half of their own books this lands in");
  });

  test("they name it themselves, and the name is checked like any other", () => {
    const body = accept();
    assert.match(body, /categoryNameNormalised\(req\.body\?\.name\)/);
    assert.match(body, /categoryNameLength\(name\) > CATEGORY_NAME_MAX_LENGTH/);
  });

  test("nothing is created on their side before they accept", () => {
    // An unasked-for row on somebody's grid is exactly what a handshake
    // exists to prevent.
    const at = s.indexOf("app.post('/api/categories/:id/links'");
    const invite = s.slice(at, s.indexOf("app.get('/api/category-links'", at));
    assert.doesNotMatch(invite, /Category\.create/,
      "inviting somebody creates a category they never agreed to");
    assert.match(invite, /status: 'pending'/);
  });

  test("an invitation that nobody sees is no invitation", () => {
    const at = s.indexOf("app.post('/api/categories/:id/links'");
    const invite = s.slice(at, s.indexOf("app.get('/api/category-links'", at));
    assert.match(invite, /Notification\.create/);
    assert.match(invite, /type: 'link'/);
    // And the type exists where it is validated. A value missing from that
    // enum does not fall back to the default — the write is rejected.
    assert.match(code(NOTIF), /'offer', 'link'\]/,
      "the link notification type was never added to the enum that validates it");
  });
});

describe("either side can walk away", () => {
  test("ending is allowed from owner or member, and says which", () => {
    const s = code(SERVER);
    const at = s.indexOf("app.delete('/api/category-links/:id'");
    const body = s.slice(at, at + 1600);
    assert.match(body, /\$or: \[\{ ownerId: viewerId \}, \{ memberId: viewerId \}\]/,
      "only one side can end the arrangement");
    assert.match(body, /endedBy: String\(link\.ownerId\) === String\(viewerId\) \? 'owner' : 'member'/,
      "who ended it is not recorded");
  });
});
