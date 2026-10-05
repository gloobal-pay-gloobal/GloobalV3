// tests/project-fields.test.mjs
//
//   node --test tests/project-fields.test.mjs
//
// The richer project fields — place, website, email, address, and the
// funding goal. No database: validateProjectInput is a pure function, and
// the rules worth protecting are all in it.
//
// The rule every assertion below is a version of: a malformed value is
// REFUSED, never cleaned up and stored. Silently correcting an input teaches
// nobody that they typed it wrong, and leaves a stored record that disagrees
// with what was submitted.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'server', 'server.js'));
const { validateProjectInput } = require(join(ROOT, 'server/lib/projectValidation'));

const base = { title: 'River footbridge', category: 'Infrastructure', summary: 'Connects two villages' };
const check = (extra) => validateProjectInput({ ...base, ...extra });
const value = (extra) => {
  const result = check(extra);
  assert.equal(result.ok, true, result.message);
  return result.value;
};
const refused = (extra) => {
  const result = check(extra);
  assert.equal(result.ok, false, `expected a refusal, got ${JSON.stringify(result.value)}`);
  return result.message;
};

describe('a funding goal is a target, with a unit', () => {
  test('minor units and a currency, together', () => {
    const v = value({ goalMinor: '2000000', goalCurrency: 'usd' });
    assert.equal(v.goalMinor, 2000000);
    assert.equal(v.goalCurrency, 'USD');
  });

  test('a goal with no currency is refused', () => {
    // A figure with no unit is the ambiguity this codebase has already had
    // to unpick: User.balance has no currency field and its country has to
    // be inferred. Not repeating that here.
    assert.match(refused({ goalMinor: '2000' }), /needs its currency/);
  });

  test('a fraction of a minor unit is refused', () => {
    // 2000.5 minor units is half a cent. The whole point of minor units is
    // that they are exact.
    assert.match(refused({ goalMinor: '2000.5', goalCurrency: 'USD' }), /whole number/);
    assert.match(refused({ goalMinor: 2000.5, goalCurrency: 'USD' }), /whole number/);
  });

  test('zero and negative goals are refused', () => {
    assert.match(refused({ goalMinor: '0', goalCurrency: 'USD' }), /greater than zero/);
    assert.match(refused({ goalMinor: '-5', goalCurrency: 'USD' }), /whole number/);
  });

  test('an absurd goal is refused rather than stored', () => {
    assert.match(refused({ goalMinor: '1000000000000001', goalCurrency: 'USD' }), /too large/);
  });

  test('a currency that is not three letters is refused', () => {
    assert.match(refused({ goalMinor: '2000', goalCurrency: 'DOLLARS' }), /three-letter/);
    assert.match(refused({ goalMinor: '2000', goalCurrency: 'U$' }), /three-letter/);
  });

  test('both can be cleared together', () => {
    const v = value({ goalMinor: null, goalCurrency: '' });
    assert.equal(v.goalMinor, null);
    assert.equal(v.goalCurrency, '');
  });

  test('a project with no goal at all is still valid', () => {
    const v = value({});
    assert.equal('goalMinor' in v, false, 'an untouched goal was written anyway');
  });
});

describe('a website is held to the same rule as a link', () => {
  test('http and https are accepted', () => {
    assert.equal(value({ website: 'https://riverfootbridge.org' }).website, 'https://riverfootbridge.org');
    assert.equal(value({ website: 'http://example.org' }).website, 'http://example.org');
  });

  test('javascript: and data: are refused', () => {
    // These reach an anchor href on the project page. It is the one way a
    // link becomes an exploit, and the existing `link` field already refuses
    // them — a second URL field that did not would be a hole beside a door.
    assert.match(refused({ website: 'javascript:alert(1)' }), /http:\/\/ or https:\/\//);
    assert.match(refused({ website: 'data:text/html,<script>' }), /http:\/\/ or https:\/\//);
  });

  test('nonsense is refused, not stored as typed', () => {
    assert.match(refused({ website: 'riverfootbridge' }), /http:\/\/ or https:\/\//);
  });

  test('an empty string clears it', () => {
    assert.equal(value({ website: '' }).website, '');
  });
});

describe('an email is checked loosely, on purpose', () => {
  test('real addresses survive', () => {
    // Deliberately permissive: plus-tags, long TLDs, subdomains. A stricter
    // pattern rejects valid addresses while still proving nothing — the only
    // way to know an address works is to send to it.
    for (const email of ['a+b@example.co.uk', 'hello@riverfootbridge.org', 'x@y.io']) {
      assert.equal(value({ email }).email, email);
    }
  });

  test('obvious nonsense is refused', () => {
    for (const email of ['not an email', 'a@b', '@example.com', 'a@@b.com', 'a b@c.com']) {
      assert.match(refused({ email }), /does not look right/, email);
    }
  });
});

describe('place and address are text, bounded', () => {
  test('they are kept as typed', () => {
    const v = value({ place: 'Pokhara, Nepal', address: '12 Demo Street, Pokhara' });
    assert.equal(v.place, 'Pokhara, Nepal');
    assert.equal(v.address, '12 Demo Street, Pokhara');
  });

  test('over-long values are refused rather than truncated', () => {
    // Truncation stores something the person did not write.
    assert.match(refused({ place: 'x'.repeat(121) }), /too long/);
    assert.match(refused({ address: 'x'.repeat(301) }), /too long/);
  });
});

describe('what the API hands back', () => {
  const SERVER = readFileSync(join(ROOT, 'server/server.js'), 'utf8');

  test('the goal travels as a pair, or not at all', () => {
    assert.match(SERVER, /goal: project\.goalMinor != null && project\.goalCurrency/);
  });

  test('there is no raised, backers or progress field yet', () => {
    // The honest gap. Nothing can accept a contribution, so a zero beside a
    // goal would say "nobody has given" when the truth is "nobody can".
    // These appear with the flow that fills them, not before.
    const shaper = SERVER.slice(SERVER.indexOf('const publicProject ='), SERVER.indexOf('const publicProject =') + 1800);
    for (const field of ['raised', 'backers', 'contributions', 'progress']) {
      assert.ok(!new RegExp(`\\b${field}:`).test(shaper), `publicProject exposes ${field} with nothing behind it`);
    }
  });

  test('the model carries no raised or backers field either', () => {
    const model = readFileSync(join(ROOT, 'server/models/Project.js'), 'utf8');
    for (const field of ['raised', 'backers', 'contributors']) {
      assert.ok(!new RegExp(`^\\s+${field}:`, 'm').test(model), `Project has a ${field} field nothing writes`);
    }
  });
});
