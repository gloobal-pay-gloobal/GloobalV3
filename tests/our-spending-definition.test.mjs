// tests/our-spending-definition.test.mjs
//
//   node --test tests/our-spending-definition.test.mjs
//
// "Our spending" now says what it means. This file holds that meaning in
// place, and — more importantly — holds the ∆ in place beneath it.
//
// The risk this guards against is specific. A labelled row with a subtitle
// explaining what it measures looks finished, and an empty figure under a
// finished-looking label is the exact shape of thing somebody fills in. The
// number is not available: server/lib/coverageAggregation.js's
// ourSpendingProbe checked every candidate record and found that no record
// type represents a platform-funded disbursement to a person. The seed
// interest bonus is the only money Gloobal actually pays out, and it writes
// no Transaction and no LedgerEntry, so there is nothing to attribute to a
// country.
//
// Agreeing on the definition did not create the data. Until a disbursement
// record exists, a figure here would be invented, and these tests fail if
// one appears.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCREEN = 'frontend/screens/Coverage/GloobalCoverageScreen.jsx';
const PROBE = 'server/lib/coverageAggregation.js';

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
// Comments stripped, so no assertion below can be satisfied by prose that
// merely describes the behaviour instead of implementing it.
const code = (p) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

// Coverage v2 (0186) replaced the "Our spending" row with a line on the
// "Where every ₹100 goes" screen: "GLOOBAL paid out on top". It is the same
// quantity — what the platform itself pays people (interest, referral
// rewards) — and the same two dangers apply: borrowing the figure of money
// people paid each other, and inventing one where no record exists.
const DASH = 'frontend/features/coverage/CoverageDashboard.jsx';
const VIEW = 'server/lib/coverageView.js';

describe('Extra GLOOBAL gave people says what it measures', () => {
  test('the line is named for what GLOOBAL pays, apart from the split', () => {
    const src = code(DASH);
    // 0188 put it in plain words: "Extra GLOOBAL gave people".
    assert.match(src, /Extra GLOOBAL gave people/);
    // It is shown beside the split, never inside the bands that add up to 100.
    assert.match(src, /Extra GLOOBAL gave people" v=\{money\(view\.split\.payoutsOnTop\)\}/);
  });

  test('the screen says it never comes out of a payment', () => {
    assert.match(code(DASH), /never comes out of a/);
  });
});

describe('the figure comes from disbursements, never from payments', () => {
  test('payoutsOnTop is summed from Disbursement rows', () => {
    const v = code(VIEW);
    assert.match(v, /payoutGroups = await Disbursement\.aggregate/);
    assert.match(v, /payoutsOnTop: round2\(payouts\)/);
  });

  test('it does not borrow the money people paid each other', () => {
    // The temptation this figure has always had: a real number (money
    // moved) sits right next to it.
    const v = code(VIEW);
    assert.ok(!/payoutsOnTop: round2\(cur\.money\)/.test(v), 'paid out on top is borrowing money moved');
    assert.ok(!/payouts \+= [^;]*cur\.money/.test(v), 'paid out on top adds payments in');
  });

  test('the split that adds up to 100 holds no payout', () => {
    // gloobal and fees are zero by rule: no fees, nothing kept.
    assert.match(code(VIEW), /gloobal: 0, fees: 0, per100/);
  });

  test('the server funds every payout from an account, in one transaction', () => {
    // What makes the number reportable at all. A credit with no debit is an
    // inflation of the ledger, which is exactly why the old probe refused to
    // call the seed interest bonus "spending".
    const lib = read('server/lib/disbursement.js');
    assert.match(lib, /PlatformAccount\.forCurrency/, 'nothing is debited');
    assert.match(lib, /\$inc:[\s\S]{0,120}balance: -paid/, 'the funding account is not debited');
    assert.match(lib, /session_required/, 'it can be written outside a transaction');
  });

  test('the historical seed totals are reported separately, never added in', () => {
    // They carry no date and no recorded country, so folding them into the
    // figure would mean guessing both — and they could then never appear in
    // any per-period view.
    const probe = read(PROBE);
    assert.match(probe, /seedInterestPaid/);
    assert.match(probe, /NOT added[\s\S]{0,40}to the figure above/);
  });

  test('the empty reason says nothing has been paid, not that it cannot be known', () => {
    assert.match(read(PROBE), /'No disbursement has been recorded yet\. /);
  });

  test('a payout that could not be converted is reported, not dropped silently', () => {
    const probe = read(PROBE);
    assert.match(probe, /unconvertibleCurrencies/);
    assert.match(probe, /skipped/);
  });
});
