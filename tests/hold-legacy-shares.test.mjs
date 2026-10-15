// tests/hold-legacy-shares.test.mjs
//
//   node --test tests/hold-legacy-shares.test.mjs
//
// The migration that moves legacy Creator Share principal out of the
// spendable balance and into custody.
//
// ── Why this is a SOURCE test and not a behavioural one ────────────────
//
// The script needs MONGO_URI and a live database; this suite has neither,
// and the three server suites that do have never run in the sandbox. So
// these read the script's text.
//
// That is a weak test of behaviour and a strong test of the thing that
// actually goes wrong with a migration: ORDER. Money has to move before the
// flag that says it moved; the flag has to be inside the same transaction;
// accounts that cannot cover the debit have to be excluded before anything
// is attempted. Each of those is visible in the source and each of them,
// got wrong, costs somebody real money.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const SRC = "server/scripts/hold-legacy-shares.mjs";
const src = readSource(SRC);
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("it refuses to run itself by accident", () => {
  test("dry run is the default and --execute is opt-in", () => {
    assert.match(code, /const EXECUTE = process\.argv\.includes\("--execute"\)/);
    // The dry-run branch returns before any write path is reached.
    const at = code.indexOf("if (!EXECUTE)");
    assert.ok(at > 0, "there is no dry-run branch");
    assert.ok(code.indexOf("LedgerEntry.create") > at,
      "a write happens before the dry-run branch can return");
  });

  test("it needs MONGO_URI and says so rather than connecting to nothing", () => {
    assert.match(code, /if \(!process\.env\.MONGO_URI\)/);
    assert.match(code, /process\.exit\(1\)/);
  });
});

describe("the order of writes is the whole safety property", () => {
  // AssetSeed.js: "There is no backfill and there must not be one — the flag
  // is a statement about what happened at payment time". Setting
  // principalHeld alone pays the principal out TWICE: once from the balance
  // it is already in, once from custody that never received it.
  //
  // This script is allowed to set it only because it makes the claim true
  // first. Which means the order is not a style preference.
  const exec = code.slice(code.indexOf("for (const group of covered)"));

  test("the balance is debited BEFORE the flag is set", () => {
    const debit = exec.indexOf("user.save(");
    const flag = exec.indexOf("principalHeld: true");
    assert.ok(debit > 0 && flag > 0, "could not find both writes");
    assert.ok(debit < flag, "principalHeld is set before the money leaves the balance");
  });

  test("custody is credited BEFORE the flag is set", () => {
    const custody = exec.indexOf("$inc: { balance: group.total }");
    const flag = exec.indexOf("principalHeld: true");
    assert.ok(custody > 0 && custody < flag,
      "the flag is set before custody has the money it claims is there");
  });

  test("and the custody write is checked, not assumed", () => {
    // If the debit applies and the credit does not, the principal has left
    // the account and gone nowhere. performTransfer throws on exactly this;
    // so does this.
    assert.match(exec, /if \(!held\.modifiedCount\) throw/);
  });

  test("all of it is inside ONE transaction per account", () => {
    assert.match(exec, /await session\.withTransaction\(async \(\) => \{/);
    for (const write of ["user.save(", "PlatformAccount.updateOne", "LedgerEntry.create", "AssetSeed.updateMany"]) {
      const at = exec.indexOf(write);
      assert.ok(at > exec.indexOf("withTransaction"),
        `${write} is outside the transaction, so it can half-apply`);
      assert.ok(/\{ session/.test(exec.slice(at, at + 400)) || /session \}/.test(exec.slice(at, at + 400)),
        `${write} does not join the session, so it commits on its own`);
    }
  });

  test("the balance is re-read inside the transaction, not trusted from the scan", () => {
    // The dry run's reading is a snapshot. A payment between the scan and
    // the write would make it stale, and the only check that counts is the
    // one holding the lock.
    assert.match(exec, /if \(running < group\.total\)/);
  });
});

describe("what it deliberately leaves alone", () => {
  test("a seed with no transaction link is filtered out BEFORE grouping", () => {
    // Its ledger line would have nothing to hang off —
    // LedgerEntry.transactionId is required — and the founder chose to
    // leave those rather than add a Transaction type for one historical
    // run.
    //
    // Before grouping, and that ordering is load-bearing: excluding a seed
    // shrinks its owner's total, which can turn an account that could not
    // cover its whole set into one that can cover the part being moved.
    const filter = code.indexOf("allSeeds.filter((s) => s.transactionId)");
    const group = code.indexOf("const byOwner");
    assert.ok(filter > 0, "unlinked seeds are not filtered out");
    assert.ok(filter < group, "the filter runs after grouping, so the totals are wrong");
  });

  test("only `covered` is written to — the short accounts are never touched", () => {
    const exec = code.slice(code.indexOf("if (!covered.length)"));
    assert.match(exec, /for \(const group of covered\)/);
    assert.ok(!/for \(const \w+ of short\)/.test(exec),
      "the loop walks the short accounts, which cannot cover the debit");
  });

  test("and they are named on every run rather than silently dropped", () => {
    assert.match(code, /THE SHORTFALL LIST/);
    assert.match(code, /SHORT \$\{money/);
  });
});

describe("the arithmetic", () => {
  test("every figure is rounded in its OWN currency", () => {
    // A yen figure carried to two decimals and a rupee one carried to zero
    // are both wrong, and comparing an unrounded sum against a stored
    // balance is where a one-paisa shortfall comes from.
    assert.match(code, /const places = decimalsFor\(currency\)/);
    assert.match(code, /round\(group\.total \+|round\(running - amount, group\.currency\)/);
  });

  test("owners are grouped by currency as well as by identity", () => {
    // A person with seeds in two currencies is two debits against two
    // custody accounts. Summing across them is the bare-number arithmetic
    // this codebase keeps finding.
    assert.match(code, /const key = `\$\{String\(seed\.userId\)\}::\$\{currency\}`/);
  });

  test("the ledger line records both sides of the balance it changed", () => {
    // balanceBefore > balanceAfter here, where the live hold writes them
    // equal — because today's share is held before it ever lands, and this
    // one is being taken back out months later. Both are true statements.
    assert.match(code, /balanceBefore: before/);
    assert.match(code, /balanceAfter: running/);
    assert.match(code, /entryType: "debit"/);
  });

  test("and it is findable afterwards as a hold, and as a migration", () => {
    assert.match(code, /heldInCustody: true/);
    assert.match(code, /custodyKey: `platform:custody:\$\{group\.currency\}`/);
    assert.match(code, /migration: "hold-legacy-shares"/);
  });
});
