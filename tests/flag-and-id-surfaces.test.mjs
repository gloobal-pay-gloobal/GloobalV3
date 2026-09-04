// tests/flag-and-id-surfaces.test.mjs
//
// Every surface that shows a country or a Gloobal ID shows it the same way.
//
// ── The two failure modes ────────────────────────────────────────────────
//
// A flag printed as the emoji CHARACTER looks correct on a Mac and renders
// as two regional-indicator letters — "IN", "GB" — on most Android builds
// and every Windows browser. It is not a broken image anyone would notice
// in review; it is a plausible-looking pair of letters where a flag should
// be, on the machines a good part of this app's users are on.
//
// A Gloobal ID printed as plain text loses the colour-by-position that is
// how a person tells two IDs apart at a glance, when both are rows drawn
// from the same twelve symbols.
//
// Both are invisible to esbuild and invisible in a screenshot taken on the
// wrong machine, which is why they are asserted on the source.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const FILES = [
  "frontend/components/cards/misc.jsx",
  "frontend/components/cards/flags.jsx",
  "frontend/components/dialogs/ReceiptModal.jsx",
  "frontend/components/dialogs/registerLogin.jsx",
  "frontend/screens/Dashboard/Dashboard.jsx",
  "frontend/screens/SendMoney/SendMoney.jsx",
  "frontend/screens/Banks/GloobalBankScreen.jsx",
  "frontend/screens/Banks/AddBankScreen.jsx",
  "frontend/screens/Coin/CoinHoldersScreen.jsx",
  "frontend/screens/Coin/CountryHoldersScreen.jsx",
  "frontend/features/essentials/EssentialsScreen.jsx",
  "frontend/App.jsx"
];

const code = (file) => readSource(file)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("no flag is ever printed as text", () => {
  for (const file of FILES) {
    test(file.split("/").pop(), () => {
      // `>{x.flag}` or `{x.flag}<` — the character rendered as JSX content
      // rather than handed to the flag component as a prop. FlagEmoji's own
      // fallback branch is the one legitimate instance, and it is reached
      // only when the real asset fails to load.
      const src = code(file);
      const offenders = (src.match(/(?:>\s*\{[\w.\[\]?]*\.flag\}|\{[\w.\[\]?]*\.flag\}\s*<)/g) || []);
      assert.deepEqual(
        offenders,
        [],
        `${file} renders a flag as an emoji character: ${offenders.join(", ")}`
      );
    });
  }

  test("the only bare {flag} left is FlagEmoji's own fallback", () => {
    const src = code("frontend/components/cards/flags.jsx");
    const hits = src.match(/>\{flag\}</g) || [];
    assert.equal(hits.length, 1, `expected one fallback render, found ${hits.length}`);
    // And it is inside the branch taken when the image did not load.
    assert.match(src, /showImage \? <img/);
  });

  test("the receipt row's flag prop draws the asset, not the character", () => {
    // Nothing passes this prop today. It is asserted anyway because an
    // unused prop that encodes the wrong pattern, inside the component
    // every receipt row is built from, is a trap rather than dead code.
    assert.match(code("frontend/components/cards/misc.jsx"), /\{flag && <FlagEmoji/);
  });
});

describe("a Gloobal ID is always the coloured one", () => {
  test("the ID history draws both IDs through ColoredGloobalId", () => {
    // This was the one place in the app that showed an ID as flat
    // monospace — and it shows TWO of them stacked as From and To, which
    // is exactly where colour-by-position earns its keep.
    const src = code("frontend/screens/Dashboard/Dashboard.jsx");
    assert.match(src, /<ColoredGloobalId id=\{h\.previousId\} \/>/);
    assert.match(src, /<ColoredGloobalId id=\{h\.id\} \/>/);
    assert.ok(
      !/fontFamily: "monospace", wordBreak: "break-all" \}\}>\{h\./.test(src),
      "an ID in the history is still rendered as monospace text"
    );
  });

  test("the one deliberate exception still says why", () => {
    // GloobalBankScreen prints its ID in white on the dark wallet card:
    // the twelve-colour palette is tuned for a light surface and is
    // illegible on that one. That is a decision, not an oversight, and it
    // has to keep reading as one.
    const raw = readSource("frontend/screens/Banks/GloobalBankScreen.jsx");
    assert.match(raw, /illegible on this one/);
  });
});

describe("dates on a stored record are not the phone's opinion", () => {
  test("nothing on the dashboard formats a date in the device locale", () => {
    // toLocaleDateString(undefined, …) asks the PHONE what a date looks
    // like. Where the string is stored rather than derived — the ID
    // history writes its stamp at the moment of the change — the record
    // carries the format of whichever device made it. Coin Activity had
    // this and was fixed; five sites here were left behind.
    const src = code("frontend/screens/Dashboard/Dashboard.jsx");
    const offenders = src.match(/toLocaleDateString\(void 0/g) || [];
    assert.deepEqual(offenders, [], `${offenders.length} device-locale dates remain`);
  });

  test("and no other screen does either", () => {
    for (const file of FILES) {
      const offenders = code(file).match(/toLocaleDateString\(\s*(?:void 0|undefined)/g) || [];
      assert.deepEqual(offenders, [], `${file} formats a date in the device's locale`);
    }
  });
});
