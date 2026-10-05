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

// The "Our spending" row, isolated, so a match cannot be satisfied by
// something elsewhere in a thousand-line screen.
function ourSpendingRow() {
  const src = code(SCREEN);
  const at = src.indexOf('Our spending');
  assert.ok(at > 0, 'the Our spending row is gone');
  return src.slice(at - 600, at + 1200);
}

describe('Our spending says what it measures', () => {
  test('the global reading names Gloobal on both sides', () => {
    // "What Gloobal spends on Gloobal Hoomans" — the platform paying
    // people, which is a different quantity from Total spending above it
    // (people paying each other). Without this line the two rows read as
    // one number measured twice.
    assert.match(ourSpendingRow(), /What Gloobal spends on Gloobal H\w*mans/);
  });

  test('the per-country reading names the country on both sides', () => {
    // "What Gloobal India spends on Hoomans in India." Naming both sides is
    // what makes it a statement about one country rather than a global
    // figure with a flag beside it.
    const row = ourSpendingRow();
    assert.match(row, /What Gloobal \$\{country\.name\} spends on H\w*mans in \$\{country\.name\}/);
  });

  test('it follows the selected country rather than being fixed', () => {
    assert.match(ourSpendingRow(), /flipped \?/);
  });

  test('no demonym is invented for any country', () => {
    // countries.js carries no demonym, and adding 194 of them to fill a
    // subtitle would be 194 chances to get someone's nationality wrong.
    // "Hoomans in India", never "Indian Hoomans".
    const row = ourSpendingRow();
    assert.ok(
      !/\$\{country\.demonym\}|\bdemonym\b|\bnationality\b/.test(row),
      'a demonym crept into the subtitle'
    );
  });
});

describe('the figure appears only when a disbursement exists', () => {
  // This file used to hold the ∆ in place, because there was no record type
  // for a platform-funded payout and any number would have been invented.
  // models/Disbursement.js is now that record, so the job changed: the ∆
  // still has to survive the EMPTY case, and the figure that replaces it has
  // to come from disbursements rather than from the row above it.

  test('a figure is shown only when the server says it is available', () => {
    const src = code(SCREEN);
    // `available` rather than `total != null`: once the record type exists, a
    // genuine zero is a real answer — Gloobal has paid nothing — and it must
    // not be confused with "the server could not say".
    assert.match(src, /ourSpending\.available/, 'the screen does not check availability');
    assert.match(src, /ourSpendingShown != null \?/, 'the figure does not branch on being present');
  });

  test('∆ survives the empty case', () => {
    // The load-bearing assertion. If this fails, check what replaced the ∆
    // and where that figure came from before assuming the test is stale.
    assert.match(ourSpendingRow(), /aria-label="No data">∆/);
  });

  test('it does not borrow Total spending’s figure', () => {
    // The temptation this row has always had: a real number sits directly
    // above it, and repeating it would make the screen look complete while
    // asserting something false — that money Hoomans paid each other was
    // money Gloobal spent on them.
    const row = ourSpendingRow();
    assert.ok(!/displaySpend/.test(row), 'Our spending is borrowing Total spending’s figure');
    assert.match(row, /fmtCompact\(ourSpendingShown\)/, 'it formats something other than its own figure');
  });

  test('a country’s figure comes from that country, not the global total', () => {
    const src = code(SCREEN);
    assert.match(src, /ourSpending\.byCountry\[country\.code\]/);
    assert.match(src, /flipped \? ourSpendingHere : ourSpendingTotal/);
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
