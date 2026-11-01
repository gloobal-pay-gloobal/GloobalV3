// tests/rent-places-0195.test.mjs
//
//   node --test tests/rent-places-0195.test.mjs
//
// 0195: Rent keeps places — a place I live (I pay, by itself or asked) and
// a place I'm creating (rent comes to me) — and the side switch veils the
// screen behind its card.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const code = (p) => readSource(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SCREEN = "frontend/features/rent/RentScreen.jsx";
const LIB = "server/lib/rent.js";
const SERVER = "server/server.js";

describe("Rent, on the screen", () => {
  const s = code(SCREEN);
  test("it is in the bundle and the Rent tile opens it", () => {
    assert.match(readSource("build_app.mjs"), /"features\/rent\/RentScreen\.jsx"/);
    assert.match(code("frontend/screens/Dashboard/Dashboard.jsx"), /showRentChoice && <RentScreen/);
  });

  test("Add a place offers exactly the two kinds, in plain words", () => {
    assert.match(s, /\["live", "A place I live", "I pay rent here"\], \["creating", "A place I'm creating", "Rent comes to me"\]/);
    assert.match(s, /data-testid=\{`rent-add-\$\{k\}`\}/);
  });

  test("no role words: who you pay, who pays you", () => {
    assert.doesNotMatch(readSource(SCREEN), /landlord|tenant/i);
    assert.match(s, /"Who you pay"/);
    assert.match(s, /"Who pays you"/);
  });

  test("the person is found by GLOOBAL ID before the rent is asked", () => {
    assert.match(s, /GloobalApi\.resolveUser\(id\)/);
    assert.match(s, /cta\("Next · the rent", \(\) => setStep\(2\), !who, "rent-next"\)/);
  });

  test("the due day stops at the 28th, so every month has it", () => {
    assert.match(s, /Array\.from\(\{ length: 28 \}, \(_, i\) => i \+ 1\)/);
  });

  test("paying by itself asks for the PIN and says what happens when short", () => {
    assert.match(s, /pin: live && mode === "auto" \? pin : undefined/);
    assert.match(s, /nothing is sent/);
  });

  test("Pay now is the ordinary Send, with the place attached", () => {
    assert.match(s, /prefillAmount: p\.amount, rentPlaceId: p\.id/);
    assert.match(code("frontend/App.jsx"), /rentPlaceId: \(receiver && receiver\.rentPlaceId\) \|\| undefined,/);
    assert.match(code("frontend/screens/SendMoney/SendMoney.jsx"), /rentPlaceId: prefillReceiver\.rentPlaceId \|\| null,/);
  });
});

describe("Rent, on the server", () => {
  test("routes are signed in and per account", () => {
    const l = code(LIB);
    for (const r of ["app.get('/api/rent/places'", "app.post('/api/rent/places'", "app.patch('/api/rent/places/:id'", "app.delete('/api/rent/places/:id'", "app.post('/api/rent/places/:id/remind'"]) {
      assert.ok(l.includes(r), `${r} missing`);
    }
    assert.match(l, /RentPlace\.findOne\(\{ _id: req\.params\.id, userId: req\.authUser\._id \}\)/);
  });

  test("auto-settle goes through the send route, never around it", () => {
    const l = code(LIB);
    assert.match(l, /\/api\/transactions\/send`/);
    assert.doesNotMatch(l, /\$inc: \{ balance/, "rent moves money on its own");
  });

  test("the send route takes a mandate only for the place it was given for", () => {
    const srv = code(SERVER);
    assert.match(srv, /rentMandate = await rent\.readRentMandate\(req\);/);
    assert.match(srv, /if \(!rentMandate && !cleanPin\)/);
    assert.match(srv, /rent\.mandateCovers\(rentMandate, \{ senderId: sender\._id, receiverSymbolId: receiver\.symbolId, amount: amountForMandate \}\)/);
  });

  test("a changed amount, day or payee needs the PIN again", () => {
    assert.match(code(LIB), /const instructionChanged = c\.amount !== place\.amount \|\| c\.dueDay !== place\.dueDay \|\| c\.counterparty !== place\.counterpartySymbolId;/);
  });

  test("short on the day: nothing sent, one note, no retry", () => {
    const l = code(LIB);
    assert.match(l, /outcome = 'short'/);
    assert.match(l, /if \(\(place\.attempts \|\| \[\]\)\.some\(\(a\) => a\.month === month\)\) continue;/);
  });
});

describe("the side switch", () => {
  const t = code("frontend/components/common/themeSwitch.jsx");
  test("the screen behind the card is veiled while it shows", () => {
    assert.match(t, /data-testid="side-flip-veil"/);
    assert.match(t, /backdropFilter: "blur\(10px\)"/);
  });
  test("the Creator card says GLOOBAL बाज़ार, with the OO in colour", () => {
    assert.match(t, /data-testid="side-flip-bazaar"[^>]*><GloobalWordmark \/><span[^>]*>बाज़ार<\/span>/);
  });
});
