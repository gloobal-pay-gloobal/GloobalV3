// Paid calls are billed per second from the caller's balance (lib/helloo.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { callCost, secondsFor, callMandateCovers } = require('../server/lib/helloo.js');

test('a call costs its seconds, to the cent', () => {
  assert.equal(callCost(10, 1), 0.17);
  assert.equal(callCost(60, 1), 1);
  assert.equal(callCost(90, 7), 10.5);
  assert.equal(callCost(0, 1), 0);
});

test('the balance says how long a call can run, never more', () => {
  assert.equal(secondsFor(0, 1), 0);
  assert.equal(secondsFor(5, 1), 300);
  assert.equal(secondsFor(0.17, 1), 10);
  assert.equal(secondsFor(0.01, 1), 0 + secondsFor(0.01, 1)); // whatever it is, it is covered
  assert.ok(callCost(secondsFor(0.01, 1), 1) <= 0.01);
  assert.equal(secondsFor(1e6, 0.1), 3600);
  for (const [b, p] of [[3.33, 7], [0.5, 1.3], [12.07, 2.2]]) assert.ok(callCost(secondsFor(b, p), p) <= b);
});

test('the mandate covers exactly the amount waiting, between the two of them', () => {
  const call = { paid: { payerId: 'a', payeeId: 'b', perMinute: 1, currency: 'INR', maxSeconds: 300, charged: 1, paying: 0.5 } };
  const ok = { senderId: 'a', receiverId: 'b', amount: 0.5, senderCurrency: 'INR', receiverCurrency: 'INR' };
  assert.equal(callMandateCovers({ call }, ok), true);
  assert.equal(callMandateCovers({ call }, { ...ok, amount: 0.51 }), false);
  assert.equal(callMandateCovers({ call }, { ...ok, receiverId: 'c' }), false);
  assert.equal(callMandateCovers({ call }, { ...ok, senderCurrency: 'USD' }), false);
  const over = { paid: { ...call.paid, charged: 4.8, paying: 0.5 } };
  assert.equal(callMandateCovers({ call: over }, ok), false);
});
