// tests/project-contributions.test.mjs
//
//   node --test tests/project-contributions.test.mjs
//
// Giving to a Hooman Project, from the app's side.
//
// The server's own checks — whose payment it was, who it went to, whether
// it succeeded, whether it is recent — live in
// server/tests/project-contributions.test.mjs and need a database. This
// file guards the properties that are decided in the CLIENT, and the one
// structural property that holds the whole design up.
//
// ── THE STRUCTURAL ONE ──────────────────────────────────────────────────
//
// There is exactly ONE path to the ledger in this app, and giving did not
// add a second. A contribution is an ordinary payment through
// /api/transactions/send, attributed to a project afterwards. The first
// describe block below is the one that fails the day somebody "simplifies"
// this into a route that takes an amount and a PIN — which would be
// shorter, and would be a second implementation of cross-currency
// corridors, idempotency, the share leg and the receipt.
//
// ── AND THE ONE THAT CANNOT BE UNDONE ───────────────────────────────────
//
// A name published once cannot be unpublished from other people's
// screenshots. The founder's rule is amounts always, names only when the
// giver allowed it — so the default has to be NOT to publish, in the
// model, in the client, and in the sheet that asks.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const UI = "frontend/features/projects/ProjectContributions.jsx";
const API = "backend/services/api/gloobalApi.js";
const APP = "frontend/App.jsx";
const SCREEN = "frontend/screens/Coverage/GloobalCoverageScreen.jsx";
const MODEL = "server/models/Contribution.js";
const SERVER = "server/server.js";
const strip = (s) => s.replace(/(^|[\s{(,])\/\*[\s\S]*?\*\//g, "$1").replace(/^\s*\/\/.*$/gm, "");

const ui = readSource(UI);
const api = readSource(API);
const server = readSource(SERVER);

describe("giving did not add a second way to move money", () => {
  test("no contribution route accepts an amount, a PIN or a balance", () => {
    // The route's body may only name a payment. The moment it takes an
    // amount it is deciding how much money moved, and the moment it takes
    // a PIN it is a second authentication path to somebody's funds.
    const at = server.indexOf("app.post('/api/projects/:id/contributions'");
    assert.ok(at > 0, "the contribution route is gone or renamed");
    const route = strip(server.slice(at, server.indexOf("\n});", at)));
    const body = route.slice(route.indexOf("req.body"), route.indexOf("req.body") + 200);
    assert.doesNotMatch(body, /\bpin\b/i, "the route destructures a PIN out of the body");
    assert.doesNotMatch(body, /\bamount\b/i, "the route takes an amount from the client");
    // The amounts it stores must come off the stored payment.
    assert.match(route, /amount: Number\(payment\.amount\)/,
      "the amount is no longer read from the verified payment");
  });

  test("nothing in the contribution path writes to a balance or a ledger", () => {
    const at = server.indexOf("// ── CONTRIBUTIONS");
    const end = server.indexOf("app.post('/api/transactions/send'", at);
    assert.ok(at > 0 && end > at, "the contributions block moved");
    const block = strip(server.slice(at, end));
    for (const forbidden of ["materialiseBalance", "LedgerEntry", "Posting", "withMongoTransaction", "balance"]) {
      assert.doesNotMatch(block, new RegExp(`\\b${forbidden}\\b`),
        `the contribution routes now touch ${forbidden} — this is the second money path the design exists to avoid`);
    }
  });

  test("the client gives by opening Send Money, not by posting an amount", () => {
    const app = strip(readSource(APP));
    const at = app.indexOf("const openSendToProject");
    assert.ok(at > 0, "openSendToProject is gone");
    const fn = app.slice(at, app.indexOf("\n  };", at));
    assert.match(fn, /openSendToPayee\(/,
      "giving no longer goes through the ordinary Send Money screen");
    assert.doesNotMatch(fn, /sendTransaction|attributeContribution/,
      "the give handler now sends a payment itself instead of handing over to Send Money");
  });

  test("attribution happens only after a payment has really settled", () => {
    const app = strip(readSource(APP));
    const at = app.indexOf("const attributePendingContribution");
    const fn = app.slice(at, app.indexOf("\n  };", at));
    // A locally-simulated payment has no stored row for the project's
    // figures to count, and the figures are counted from stored rows.
    assert.match(fn, /entry\.status === "simulated"/,
      "a payment that never reached the server would be attributed to a project");
    assert.match(fn, /referenceId = entry\.txnId/,
      "the reference is no longer the one the server confirmed");
  });

  test("a failed attribution never claims the money is lost", () => {
    const app = readSource(APP);
    const at = app.indexOf("const attributePendingContribution");
    const fn = app.slice(at, app.indexOf("\n  };", at));
    // By the time this runs the payment has settled. "Something went wrong"
    // here would be the most frightening message this app can show, and it
    // would be false.
    assert.match(fn, /payment went through/,
      "the failure message no longer says the payment went through");
  });
});

describe("a name is published only on purpose", () => {
  test("the model defaults to not publishing", () => {
    const model = strip(readSource(MODEL));
    const field = model.slice(model.indexOf("showName:"), model.indexOf("showName:") + 120);
    assert.match(field, /default:\s*false/, "showName now defaults to true");
  });

  test("the sheet starts with the box unticked", () => {
    const sheet = strip(ui.slice(ui.indexOf("function ProjectGiveSheet")));
    assert.match(sheet, /useState50\(false\)/, "the give sheet pre-ticks 'show my name'");
  });

  test("the client sends a real boolean, never whatever it was handed", () => {
    // `showName: showName` with an undefined would be read by the server's
    // `=== true` as false, which happens to be right — but a client that
    // ships an untyped value is one edit away from shipping a truthy
    // string, and the string "false" is truthy.
    const at = api.indexOf("async attributeContribution");
    const fn = api.slice(at, api.indexOf("\n  },", at));
    assert.match(fn, /showName: Boolean\(showName\)/);
  });

  test("the server trusts only an explicit yes", () => {
    const at = server.indexOf("app.post('/api/projects/:id/contributions'");
    const route = server.slice(at, server.indexOf("\n});", at));
    assert.match(route, /showName === true \|\| String\(showName\) === 'true'/,
      "the server now accepts any truthy value as permission to publish a name");
  });

  test("a stranger is never handed a reference id or a Gloobal ID", () => {
    // Both identify an account or a payment. The list is public; these are
    // not.
    const fn = strip(server.slice(
      server.indexOf("const publicContribution"),
      server.indexOf("// POST /api/projects/:id/contributions")
    ));
    assert.match(fn, /referenceId: viewerIsOwner \|\| viewerIsBacker \? row\.referenceId : null/);
    assert.match(fn, /symbolId: viewerIsOwner \|\| viewerIsBacker \? row\.backerSymbolId : null/);
  });

  test("the UI tells a withheld name apart from a person with no name", () => {
    assert.match(ui, /row\.anonymous \? "Someone"/,
      "the list no longer distinguishes a withheld name from a missing one");
  });
});

describe("the figure and the list cannot disagree", () => {
  test("raised is aggregated, never stored on the project", () => {
    // A counter on Project would be one number maintained in two places,
    // and the first missed or doubled increment makes the headline figure
    // stop being the sum of the rows underneath it — with no way to notice
    // and no way to repair it afterwards.
    const model = strip(readSource("server/models/Project.js"));
    assert.doesNotMatch(model, /^\s*raised:/m, "Project has grown a stored `raised`");
    assert.doesNotMatch(model, /^\s*backers:/m, "Project has grown a stored `backers`");
    assert.match(strip(server), /async function projectTotals\(projectIds\)/);
  });

  test("backers counts people, not rows", () => {
    const at = server.indexOf("async function projectTotals");
    const fn = server.slice(at, server.indexOf("\n}", at));
    assert.match(fn, /\$addToSet: '\$backerId'/,
      "a backer who gives three times would now count as three");
    assert.doesNotMatch(fn, /backers: \{ \$sum: 1 \}/);
  });

  test("one payment can only ever be counted once", () => {
    const model = strip(readSource(MODEL));
    const field = model.slice(model.indexOf("referenceId:"), model.indexOf("referenceId:") + 160);
    assert.match(field, /unique:\s*true/,
      "the same payment could be attributed twice, or to two projects");
  });

  test("a retry reads the existing row rather than failing or doubling", () => {
    const at = server.indexOf("app.post('/api/projects/:id/contributions'");
    const route = server.slice(at, server.indexOf("\n});", at));
    assert.match(route, /error\.code === 11000/,
      "a duplicate-key error is no longer treated as the retry it is");
    assert.match(route, /alreadyRecorded: true/);
  });

  test("the list travels with its own totals, from one read", () => {
    const at = server.indexOf("app.get('/api/projects/:id/contributions'");
    const route = server.slice(at, server.indexOf("\n});", at));
    assert.match(route, /raised: summary\.raised/);
    assert.match(route, /backers: summary\.backers/);
  });

  test("the listing counts a whole page in one aggregate, not one query per project", () => {
    const at = server.indexOf("app.get('/api/projects',");
    const route = server.slice(at, server.indexOf("\n});", at));
    assert.match(route, /await projectTotals\(page\.map/);
    assert.equal((route.match(/await projectTotals/g) || []).length, 1);
  });
});

describe("what the project page does and does not offer", () => {
  const screen = strip(readSource(SCREEN));

  test("the apology under the zeroes is gone", () => {
    // "Zero because Gloobal cannot take contributions yet — not because
    // nobody has given" was the honest line under three zeroes that
    // described a flow which did not exist. It does now.
    assert.doesNotMatch(screen, /cannot take contributions yet/,
      "the project page still says contributions are impossible");
  });

  test("the owner is not offered a Give button, and neither is a draft", () => {
    const button = strip(ui.slice(ui.indexOf("function ProjectGiveButton"), ui.indexOf("function ProjectGiveSheet")));
    assert.match(button, /project\.isOwner \|\| project\.status !== "published"/,
      "the Give button is offered where the server would refuse it");
  });

  test("a draft shows no contribution list at all", () => {
    assert.match(screen, /enabled=\{hoomanProject\.status === "published"\}/);
  });

  test("a goal that is passed reads as passed, and the bar still fits", () => {
    // A goal is a target, not a cap — giving stays open past 100%. The
    // FIGURE tells the truth; the BAR is clamped, because a bar is a
    // container and cannot be more than full.
    assert.match(screen, /const pct = goalMajor > 0 \? Math\.round\(\(raised \/ goalMajor\) \* 100\) : 0;/,
      "the percentage is clamped again, so a passed goal reads as exactly met");
    assert.match(screen, /const barPct = Math\.min\(100, pct\);/);
    assert.match(screen, /width: `\$\{barPct\}%`/, "the bar is drawn from the unclamped figure");
  });

  test("the list formats money the way the rest of the page does", () => {
    // Two renderings of one currency on one screen is the fault this
    // avoids: the page already decided through the GEU lens.
    assert.match(screen, /money=\{\(amount, currency\) => geuLensOwnMoney\(/);
    assert.doesNotMatch(strip(ui), /fmtMoney|fmtCompact|toLocaleString\(\s*\)/,
      "the contribution list now formats money itself");
  });

  test("a failed read is not shown as an empty project", () => {
    // Telling an owner nobody has given, when the truth is that the
    // request failed, is telling them something false about their own
    // project.
    const list = strip(ui.slice(ui.indexOf("function ProjectContributionList")));
    assert.match(list, /feed\.failed/);
    assert.match(list, /Couldn't load the contributions/);
    assert.match(strip(ui), /loading: false, failed: true/);
  });

  test("the api layer reports a failure instead of inventing an empty list", () => {
    const at = api.indexOf("async getProjectContributions");
    const fn = api.slice(at, api.indexOf("\n  },", at));
    assert.match(fn, /return null;/, "a failed read now looks like a project nobody has backed");
  });

  test("the list is in the bundle, ahead of the screen that renders it", () => {
    const build = readSource("build_app.mjs");
    const at = build.indexOf("const FRONTEND_MODULES");
    const modules = build.slice(at, build.indexOf("\n];", at));
    assert.match(modules, /"features\/projects\/ProjectContributions\.jsx"/);
    assert.ok(
      modules.indexOf("ProjectContributions.jsx") < modules.indexOf("Coverage/GloobalCoverageScreen.jsx"),
      "the feature is emitted after the screen that draws it"
    );
  });
});

describe("a goal is money, so it has the currency's own decimals", () => {
  const screen = readSource(SCREEN);

  test("neither call site divides by a hundred any more", () => {
    // Both used to. It was right for the currencies with two decimal
    // places and wrong by a factor of a hundred for the seventeen with
    // none — and invisible, because `raised` was always zero, so the
    // percentage was always zero whatever the goal said. Counting real
    // money against it is what made it matter.
    assert.doesNotMatch(strip(screen), /goal\.minor \/ 100/,
      "a goal is being converted with a hardcoded divisor again");
    assert.equal((strip(screen).match(/projectGoalMajor\(/g) || []).length, 2,
      "the two call sites no longer both go through the helper");
  });

  test("the helper asks the app's existing answer", () => {
    const at = screen.indexOf("const projectGoalMajor");
    const fn = screen.slice(at, screen.indexOf("\n  };", at));
    assert.match(fn, /currencyDecimals\(goal\.currency\)/);
    assert.match(fn, /Math\.pow\(10, places\)/);
  });

  test("a yen goal and a rupee goal do not convert the same way", () => {
    // The arithmetic itself, run rather than read. 500000 minor units is
    // ¥500,000 and ₹5,000, and a screen that showed both as the same
    // number would show a Japanese project as having passed a goal a
    // hundred times smaller than the one it set.
    const at = screen.indexOf("const projectGoalMajor");
    const body = screen.slice(screen.indexOf("=>", at), screen.indexOf("\n  };", at) + 4);
    const helper = new Function("currencyDecimals", `return (goal) ${body}`)(
      (c) => (["JPY", "KRW", "ISK", "VND"].includes(String(c).toUpperCase()) ? 0 : 2)
    );
    assert.equal(helper({ minor: 500000, currency: "INR" }), 5000);
    assert.equal(helper({ minor: 500000, currency: "JPY" }), 500000);
    assert.equal(helper(null), 0);
  });
});
