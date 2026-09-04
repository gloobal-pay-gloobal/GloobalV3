// tests/app-map.test.mjs
//
// The app map draws a map.
//
// ── What it was ──────────────────────────────────────────────────────────
//
// The file has always been called appMap.jsx, and it drew a flat list of
// seventeen identical text rows. Every row the same shape, so you had to read
// all of them; half of them under the fold; two groups ("Go to", "Locked")
// that said nothing about what belongs with what; and nothing at all about
// where the person already was — on the one screen somebody opens precisely
// because they are unsure of that.
//
// ── What it is ───────────────────────────────────────────────────────────
//
// A hub for where you are, a spine, and a branch per section with its
// destinations as chips. The whole app on one screen including the locked
// parts, which the list could not do at any length.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { readSource, ROOT } from "./harness.mjs";

// lucide-react is installed under the PREVIEW package, not at the repo root,
// so a bare import from tests/ cannot find it. Resolved from the package that
// actually depends on it rather than by reaching into its dist layout, which
// would break the next time that package restructures.
const requireFromPreview = createRequire(path.join(ROOT, "gloobal-essentials-preview", "package.json"));

const map = readSource("frontend/components/common/appMap.jsx");
const app = readSource("frontend/App.jsx");

const code = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("the sections have one home", () => {
  test("every entry declares the section it belongs to", () => {
    // The section a screen belongs to is navigation information
    // architecture, and it lives with the entries in App.jsx — the one place
    // that actually knows the app's structure.
    const block = app.slice(app.indexOf("const appMapEntries = ["), app.indexOf("\n  ];", app.indexOf("const appMapEntries = [")));
    const keys = block.match(/\{ key: "\w+"/g) || [];
    const sections = block.match(/section: "[^"]+"/g) || [];
    assert.ok(keys.length >= 17, `expected the full entry list, found ${keys.length}`);
    assert.equal(
      sections.length,
      keys.length,
      `${keys.length - sections.length} entr(ies) have no section — they would fall into "Elsewhere"`
    );
  });

  test("the map does not keep a section list of its own", () => {
    // The branches are built from the order the sections first appear in the
    // entries, so a section added in App.jsx shows up without this file being
    // touched — and the two can never disagree about which sections exist.
    assert.match(map, /if \(!sections\.includes\(name\)\) sections\.push\(name\);/);
    const stripped = code(map);
    for (const name of ["Your money", "Move money", "Get started"]) {
      assert.ok(
        !stripped.includes(`"${name}"`),
        `appMap.jsx hardcodes the section "${name}" — it must come from the entries`
      );
    }
  });

  test("the entry order is deliberate, because it decides the branch order", () => {
    // Signed in, the first unlocked entry must be Dashboard so the map reads
    // Your money -> Move money -> You -> Gloobal. Login used to be declared
    // fourth, which put its section ("You") first.
    const block = app.slice(app.indexOf("const appMapEntries = ["));
    const order = (block.match(/\{ key: "(\w+)"/g) || []).map((m) => m.match(/"(\w+)"/)[1]);
    assert.equal(order[0], "dashboard", `the list starts with "${order[0]}" — "You" would lead the map`);
    assert.ok(
      order.indexOf("login") > order.indexOf("aboutus"),
      "Login must be declared after the signed-in entries, or its section leads"
    );
    // ...and on a fresh device, where all of those are locked, the first
    // unlocked entry has to be the start of registration.
    const fresh = order.filter((k) => ["phone", "secureId", "referral", "login"].includes(k));
    assert.equal(fresh[0], "phone", "a signed-out device should read Get started first");
  });
});

describe("the hub only claims what the app actually knows", () => {
  test("it is not drawn at all without a current key", () => {
    // A "You are here" pointing at a guess is worse on a map than no hub,
    // because a map is the one screen consulted precisely when somebody is
    // unsure where they are.
    assert.match(map, /const here = entries\.find\(\(e\) => e\.key === currentKey\) \|\| null;/);
    assert.match(map, /\{here && <div/);
  });

  test("the current key is derived, not assumed", () => {
    assert.match(app, /const appMapCurrentKey = stage !== "dashboard"/);
    assert.match(app, /currentKey=\{appMapCurrentKey\}/);
  });

  test("AddBankScreen is not mistaken for Gloobal Bank", () => {
    // activeScreen "bank" opens AddBankScreen, which is a different screen
    // from the map's gbank entry. Mapping it would have put "You are here:
    // Gloobal Bank" on top of neither.
    const derive = app.slice(app.indexOf("const appMapCurrentKey ="), app.indexOf("const appMapEntries ="));
    assert.ok(
      !/activeScreen === "bank"/.test(code(derive)),
      "activeScreen 'bank' must not resolve to the Gloobal Bank entry"
    );
  });

  test("the screen you are on is findable without reading every label", () => {
    assert.match(map, /current=\{entry\.key === current\}/);
    assert.match(map, /background: current \? color : T\.surface/);
    assert.match(map, /aria-current=\{current \? "page" : void 0\}/);
  });
});

describe("searching drops the map", () => {
  test("a filtered subset renders as a list, not as a map", () => {
    // The spine, the branches and the hub all say something about STRUCTURE,
    // and structure is exactly what a filtered subset no longer has. Three
    // matching chips hanging off a spine would be a map of nothing.
    assert.match(map, /const searching = q\.length > 0;/);
    assert.match(map, /\{searching \? <>/);
    assert.match(map, /<AppMapResults/);
  });

  test("and an empty search still says so", () => {
    assert.match(map, /No screens match/);
  });
});

describe("the drawing holds together", () => {
  test("the locked branch is on the map, marked as locked", () => {
    // The map should show the whole app, not only the part currently
    // reachable — but those nodes are outlined differently because they are
    // not open from here.
    assert.match(map, /title="Locked"/);
    assert.match(map, /dashed/);
    assert.match(map, /border: `2\.5px \$\{dashed \? "dashed" : "solid"\} \$\{color\}`/);
  });

  test("the spine stops at the last node", () => {
    // A line that continues past the last thing on it reads as content that
    // failed to load.
    assert.match(map, /bottom: last \? "calc\(100% - 20px\)" : 0/);
  });

  test("branch colours come from the app's palette, not a new one", () => {
    assert.match(map, /var APP_MAP_BRANCH_COLORS = \[T\.accent, TXN_OUT_COLOR, T\.accent2, T\.positive, T\.inkFaint\];/);
  });

  test("an icon this map has never heard of still renders", () => {
    // Same keyed-with-a-fallback shape as SERVICE_ROW_ICONS: an entry added
    // in App.jsx must not throw on an undefined component.
    assert.match(map, /APP_MAP_ICONS\[entry\.key\] \|\| MapFallbackIcon/);
  });

  test("every icon it names actually exists in this lucide version", () => {
    // esbuild cannot catch this: lucide-react is external to the bundle, so a
    // name that does not exist imports as undefined and fails at render. It
    // has already happened once here (IdCard).
    const lucide = requireFromPreview("lucide-react");
    const named = [...map.matchAll(/^\s+(\w+) as Map\w+,?$/gm)].map((m) => m[1]);
    assert.ok(named.length > 10, `expected the icon imports, found ${named.length}`);
    const missing = named.filter((n) => !lucide[n]);
    assert.deepEqual(missing, [], `not in lucide-react: ${missing.join(", ")}`);
  });
});
