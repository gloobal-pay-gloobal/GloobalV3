// Reply from a notification: a token for one chat, one side, two days.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const h = require('../server/lib/helloo.js');

test('a reply token opens one chat for one side, and nothing forged or old', () => {
  h.configureHellooMoney({ AUTH_TOKEN_SECRET: 'x'.repeat(40), PORT: 1, issueAuthToken: () => 't' });
  const tok = h.replyTokenFor('acct1', 'chat9', 'self');
  const t = h.readReplyToken(tok);
  assert.equal(t.u, 'acct1'); assert.equal(t.c, 'chat9'); assert.equal(t.a, 'self');
  assert.ok(t.e > Date.now() + 47 * 3600e3);
  const [body, sig] = tok.split('.');
  const other = Buffer.from(JSON.stringify({ u: 'acct1', c: 'chat10', a: 'self', e: t.e })).toString('base64url');
  assert.equal(h.readReplyToken(`${other}.${sig}`), null, 'another chat with the same signature');
  assert.equal(h.readReplyToken(`${body}.${sig.slice(0, -2)}xx`), null, 'a changed signature');
  assert.equal(h.readReplyToken(''), null);
  h.configureHellooMoney({ AUTH_TOKEN_SECRET: 'y'.repeat(40), PORT: 1, issueAuthToken: () => 't' });
  assert.equal(h.readReplyToken(tok), null, 'signed with another secret');
});
