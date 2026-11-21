import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { stickerMine } = require('../server/lib/helloo.js');

test('your own Kullu: only the allowed choices, short words, no links or numbers', () => {
  assert.deepEqual(stickerMine({ mood: 'wink', cup: '#d97798', prop: '🎉', words: '  Party  time ' }), { mood: 'wink', cup: '#D97798', prop: '🎉', words: 'Party time' });
  assert.deepEqual(stickerMine({ mood: 'love', cup: '#C97B4A', prop: '', words: 'याद आ रही है' }), { mood: 'love', cup: '#C97B4A', prop: '', words: 'याद आ रही है' });
  assert.equal(stickerMine({ mood: 'angry', cup: '#C97B4A' }), null, 'unknown face');
  assert.equal(stickerMine({ mood: 'smile', cup: '#123456' }), null, 'colour not on the list');
  assert.equal(stickerMine({ mood: 'smile', cup: '#C97B4A', prop: '<img>' }), null, 'only listed props');
  assert.equal(stickerMine({ mood: 'smile', cup: '#C97B4A', words: 'this is far too long for it' }), null);
  assert.equal(stickerMine({ mood: 'smile', cup: '#C97B4A', words: 'www.x.com' }), null);
  assert.equal(stickerMine({ mood: 'smile', cup: '#C97B4A', words: 'call 9876543210' }), null);
  assert.equal(stickerMine(null), null);
});
