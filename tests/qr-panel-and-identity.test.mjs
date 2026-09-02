// tests/qr-panel-and-identity.test.mjs
//
// Two things that were reported together and turn out to be related: every
// Gloobal QR should be drawn the same way, and there should only be ONE
// identity behind them.
//
// ── The Creator ID ───────────────────────────────────────────────────────
//
// It was `genSuggestedId(12)` — twelve random symbols minted in the browser
// on every load, stored nowhere and registered with nothing. The string
// "creatorId" does not appear in server.js at all. So the code shown in
// Creator mode resolved to no account: scanning it produced "No Gloobal
// account is registered under this ID", the payment could not settle, and
// the identifier was different again next time the app opened.
//
// The split was never needed. Creator Share is a property of the PAYEE'S
// ACCOUNT — the send route reads `receiver.cashbackRate` — so it applies to
// any payment made to that person whichever code was scanned. Splitting the
// identity did not enable Creator Share; it prevented it.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const app = readSource("frontend/App.jsx");
const dash = readSource("frontend/screens/Dashboard/Dashboard.jsx");
const qr = readSource("frontend/components/common/gloobalQRCode.jsx");
const server = readSource("server/server.js");

describe("one identity, both roles", () => {
  test("the Creator ID is the account's own Gloobal ID", () => {
    assert.match(app, /const creatorId = secureId;/);
  });

  test("it is no longer randomly minted in the browser", () => {
    const code = app.replace(/^\s*\/\/.*$/gm, "");
    assert.ok(
      !/const \[creatorId\] = useState19\(\(\) => genSuggestedId\(12\)\)/.test(code),
      "the Creator ID must not be a random client-side value"
    );
  });

  test("the server has never known about a creatorId — which is why it could not be paid", () => {
    // The evidence for the whole change. If a real server-side creator
    // identity is ever introduced, this fails and the merge above should be
    // revisited rather than silently kept.
    assert.equal(server.includes("creatorId"), false, "server.js now references creatorId — revisit this");
  });

  test("Creator Share still works, because it lives on the payee's account", () => {
    assert.match(server, /const payeeCashbackRate = Number\(receiver\.cashbackRate\) \|\| 0;/);
  });

  test("both roles share and display the same id", () => {
    assert.match(dash, /const activeCreatorId = personalGloobalId;/);
    assert.match(dash, /const shareableGloobalId = personalGloobalId;/);
  });

  test("a rename cannot reintroduce a second identity", () => {
    // The override held a local copy for Creator mode. Left in place it would
    // put the divergence straight back after a rename.
    const code = dash.replace(/^\s*\/\/.*$/gm, "");
    assert.ok(
      !/creatorIdOverride \|\|/.test(code),
      "nothing may read creatorIdOverride"
    );
    assert.ok(
      !/if \(isCreatorRename\) setCreatorIdOverride/.test(code),
      "a creator rename must not stash a separate id"
    );
  });
});

describe("every Gloobal QR is drawn by one panel", () => {
  test("the shared panel exists", () => {
    assert.match(qr, /function GloobalQrPanel\(\{ code, size = QR_PANEL_SIZE/);
  });

  test("it is a hairline frame with the quiet zone as its padding", () => {
    // The padding IS the quiet zone — the decoder uses it to find the code's
    // edge — so it is equal on all four sides rather than eyeballed.
    assert.match(qr, /border: `1px solid \$\{T\.line\}`/);
    assert.match(qr, /padding: QR_PANEL_QUIET/);
    assert.match(qr, /width: size \+ QR_PANEL_QUIET \* 2/);
    assert.match(qr, /height: size \+ QR_PANEL_QUIET \* 2/);
    assert.match(qr, /boxSizing: "border-box"/);
  });

  test("the code is bigger than either panel drew before", () => {
    // Was 230 on the Receive sheet and 264 on My Code.
    const size = Number((qr.match(/var QR_PANEL_SIZE = (\d+);/) || [])[1]);
    assert.ok(size >= 300, `QR_PANEL_SIZE is ${size}, smaller than intended`);
  });

  test("both screens use it, and neither draws its own", () => {
    assert.match(app, /<GloobalQrPanel code=/);
    assert.match(dash, /<GloobalQrPanel code=/);
    for (const [name, src] of [["App.jsx", app], ["Dashboard.jsx", dash]]) {
      const code = src.replace(/^\s*\/\/.*$/gm, "");
      assert.ok(
        !/<GloobalQRCode code=/.test(code),
        `${name} still renders a bare GloobalQRCode instead of the shared panel`
      );
    }
  });

  test("the Receive sheet keeps its countdown", () => {
    // The panel forwards onSecondsLeftChange; losing it would silently stop
    // the "43s" timer on that screen.
    assert.match(qr, /onSecondsLeftChange=\{onSecondsLeftChange\}/);
    assert.match(dash, /onSecondsLeftChange=\{setReceiveQrSecondsLeft\}/);
  });

  test("an unencodable amount says so, and names the ceiling", () => {
    // Refusing to draw is the honest outcome — a silently clamped code would
    // contradict the "Requesting X" caption beside it — but only if the limit
    // is stated, or the number has to be guessed at.
    assert.match(qr, /Amount too large for a code/);
    assert.match(qr, /QR_MAX_AMOUNT_CENTS/);
  });
});

describe("neither screen adds a frame of its own around the panel", () => {
  // Reported as "the QR on My Code is too big, it's breaking the screen".
  //
  // Both screens drew the same 300px panel, but My Code wrapped it in a
  // tinted pad — borderRadius 28, padding 16. That is 356px inside a column
  // with 24px of side padding, so the layout wanted 404px on a 390px phone.
  // The panel itself was never the problem; the second frame around it was,
  // and it took the Creator Share badge off the edge of the screen with it
  // (the screenshot showed it clipped mid-way through "1.77%").
  //
  // Unifying the panel was supposed to have ended per-screen framing. This
  // was the piece that survived it.

  test("My Code no longer pads the panel inside a tinted box", () => {
    const at = app.indexOf('scanScreenTab === "myCode" ?');
    assert.ok(at > 0, "the My Code branch was not found");
    // The wrapper is the styled div immediately before the panel.
    const panelAt = app.indexOf("<GloobalQrPanel", at);
    const wrapper = app.slice(at, panelAt).replace(/^\s*\/\/.*$/gm, "");
    assert.ok(
      !/padding: 16/.test(wrapper),
      "the panel must not sit inside its own padded box"
    );
    assert.ok(
      !/borderRadius: 28/.test(wrapper),
      "nor inside a second rounded frame — the panel carries its own"
    );
  });

  test("both wrappers are the same bare relative box", () => {
    // Same frame, stated the same way, so a change to one is visibly a
    // change to only one.
    for (const [name, src] of [["App.jsx", app], ["Dashboard.jsx", dash]]) {
      const panelAt = src.indexOf("<GloobalQrPanel");
      assert.ok(panelAt > 0, `${name} does not render the panel`);
      const before = src.slice(Math.max(0, panelAt - 700), panelAt);
      assert.match(before, /position: "relative"/, `${name}: wrapper must be the positioning context`);
      assert.match(before, /justifyContent: "center"/, `${name}: wrapper must centre the panel`);
    }
  });
});

describe("the Creator Share badge sits on the top edge, centred", () => {
  // It used to hang off the RIGHT edge, half of it outside the panel's own
  // width. That works only while there is spare width beside the panel to
  // overhang into — and once the panel is as wide as the screen allows,
  // there is none, so the badge is clipped by the viewport.
  //
  // Centred on the top edge it adds nothing to the layout's width at all,
  // so it cannot be pushed off on any device. It sinks half its height into
  // the panel, which is white margin rather than code: the QR carries a
  // 4-module quiet zone (~29px at 300px) and the panel adds 12px of its own,
  // so it stays clear of the first dark module and cannot affect a scan.

  for (const [name, src] of [["My Code", "app"], ["Receive sheet", "dash"]]) {
    test(`${name}: top-centre, not right-edge`, () => {
      const source = src === "app" ? app : dash;
      const panelAt = source.indexOf("<GloobalQrPanel");
      // The badge is the absolutely-positioned block right after the panel.
      const after = source.slice(panelAt, panelAt + 1400).replace(/^\s*\/\/.*$/gm, "");
      const badgeAt = after.indexOf('position: "absolute"');
      assert.ok(badgeAt > 0, `${name}: no absolutely-positioned badge after the panel`);
      const badge = after.slice(badgeAt, after.indexOf("}", badgeAt));

      assert.match(badge, /top: 0/, `${name}: the badge must straddle the top edge`);
      assert.match(badge, /left: "50%"/, `${name}: and be centred horizontally`);
      assert.match(badge, /transform: "translate\(-50%, -50%\)"/);
      assert.ok(
        !/right: 0/.test(badge),
        `${name}: the right-edge overhang is what got clipped off screen`
      );
    });
  }
});
