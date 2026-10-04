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

describe('the figure stays ∆ until a disbursement record exists', () => {
  test('the row renders ∆, not a number', () => {
    // THE load-bearing assertion in this file. If this fails, check what
    // replaced the ∆ and where that figure came from before assuming the
    // test is stale.
    const row = ourSpendingRow();
    assert.match(row, /aria-label="No data">∆/);
  });

  test('it does not quietly reuse Total spending', () => {
    // The temptation this row has always had: Total spending sits directly
    // above it with a real number, and repeating it here would make the
    // screen look complete while asserting something false — that money
    // Hoomans paid each other was money Gloobal spent on them.
    const row = ourSpendingRow();
    assert.ok(!/displaySpend/.test(row), 'Our spending is borrowing Total spending’s figure');
    assert.ok(!/fmtCompact/.test(row), 'Our spending is formatting a figure of its own');
  });

  test('the server still reports the metric as unavailable, with a reason', () => {
    // The screen is honest because the server is. If the probe ever starts
    // returning a total, this test is the reminder that the screen has to
    // be changed deliberately rather than discovering it by accident.
    const probe = read(PROBE);
    assert.match(probe, /available:\s*false/);
    assert.match(probe, /reason/);
  });

  test('the reason names the missing record type, not just "no data"', () => {
    // "We don't have it" is not a finding. "No record type represents a
    // platform-funded disbursement to a person" is — it says what to build.
    //
    // Asserted against the `reason` STRING the probe returns, not against
    // the comment above it. The comment says the same thing and wraps across
    // several `//` lines, so a regex over the source would be matching prose
    // that never ships; this matches the value an operator actually reads.
    assert.match(
      read(PROBE),
      /'No record type represents a platform-funded disbursement to a person\. '/
    );
  });
});
