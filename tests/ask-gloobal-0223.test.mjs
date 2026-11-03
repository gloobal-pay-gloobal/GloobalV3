// tests/ask-gloobal-0223.test.mjs
//
//   node --test tests/ask-gloobal-0223.test.mjs
//
// 0223: Ask GLOOBAL — questions about how GLOOBAL works, answered from the
// guide in the language they are asked in, with no AI service. The matching
// (frontend/features/support/askEngine.js) runs here for real, against the
// real guide (server/lib/guideCards.js). The server side — the guide, the
// anonymous counts, the staff editing — is in server/tests/guide.test.mjs.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";
import { readSource } from "./harness.mjs";

const require = createRequire(import.meta.url);
const cards = require("../server/lib/guideCards.js");
const E = vm.createContext({});
vm.runInContext(readSource("frontend/features/support/askEngine.js"), E);
const index = E.askBuildIndex(cards);
const ask = (q, screen) => {
  const lang = E.askDetectLang(q, "en");
  const ranked = E.askRank(index, q, { lang: lang.lang, screen });
  return { lang, decision: E.askDecide(ranked), personal: E.askIsPersonal(q) };
};
const answers = (q, id, screen) => {
  const r = ask(q, screen);
  assert.equal(r.decision.kind, "answer", `${q} → ${r.decision.kind} ${r.decision.top.map((x) => x.card.id).join(",")}`);
  assert.equal(r.decision.top[0].card.id, id, q);
};

const code = (p) => readSource(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ui = code("frontend/features/support/askGloobal.jsx");
const help = code("frontend/features/support/helpSupport.jsx");
const app = code("frontend/App.jsx");
const dash = code("frontend/screens/Dashboard/Dashboard.jsx");
const build = readSource("build_app.mjs");

describe("the guide", () => {
  test("every card in English, हिन्दी, Hinglish and தமிழ், with ways of asking and an answer", () => {
    assert.ok(cards.length >= 30);
    for (const c of cards) for (const l of ["en", "hi", "hl", "ta"]) {
      assert.ok(c.t[l] && c.t[l].q && c.t[l].asks.length >= 5 && c.t[l].steps.length >= 1, `${c.id} ${l}`);
    }
  });
  test("names are unique; buttons only go where the app map goes", () => {
    assert.equal(new Set(cards.map((c) => c.id)).size, cards.length);
    const targets = ["send", "bank", "essentials", "myshop", "history", "receive", "scan", "complaints", "security", "referral", "notifications", "help"];
    for (const c of cards) if (c.action) assert.ok(targets.includes(c.action.target), c.id);
  });
  test("each screen with a ? has questions of its own", () => {
    for (const s of ["send", "bank", "essentials", "shop"]) assert.ok(cards.filter((c) => c.screens.includes(s)).length >= 3, s);
  });
});

describe("which language", () => {
  test("by the letters, and Hinglish by its words", () => {
    assert.equal(ask("पैसे कैसे भेजें").lang.lang, "hi");
    assert.equal(ask("பணம் எப்படி அனுப்புவது").lang.lang, "ta");
    assert.equal(ask("paise kaise bheje").lang.lang, "hl");
    assert.equal(ask("how do i send money").lang.lang, "en");
  });
  test("a language we have not written: known as such, answered in English", () => {
    assert.equal(ask("¿cómo envío dinero a México?").lang.known, false);
    assert.equal(ask("كيف أرسل المال").lang.known, false);
  });
});

describe("finding the answer", () => {
  test("the same question, four languages, one card", () => {
    for (const q of ["how do i send money", "paise kaise bheje", "पैसे कैसे भेजें", "பணம் எப்படி அனுப்புவது"]) answers(q, "send-how");
    for (const q of ["how to withdraw money to bank", "bank se paise kaise nikale", "बैंक में पैसे कैसे निकालें", "என் வங்கிக்கு பணம் எடுக்க"]) answers(q, "bank-withdraw");
  });
  test("typos and the spellings people use", () => {
    answers("sned money", "send-how");
    answers("withdrawl", "bank-withdraw");
    answers("paisa kaise bhejna hai", "send-how");
    answers("GEU kya hai", "geu-what");
  });
  test("country names mean another country", () => {
    answers("america paise bhejne hai", "send-abroad");
    answers("dusre desh me paise bhejna", "send-abroad");
  });
  test("the screen it came from tips a close call", () => {
    answers("why do i see two amounts", "send-abroad", "send");
    answers("how long does it take", "send-speed", "send");
  });
  test("as they type, half a word already finds it", () => {
    const r = E.askRank(index, "bank se paise nik", { typing: true, lang: "hl" });
    assert.equal(r[0].card.id, "bank-withdraw");
  });
  test("something it does not cover: says so, no guessing", () => {
    assert.equal(ask("who won the cricket match").decision.kind, "none");
    assert.equal(ask("weather today").decision.kind, "none");
  });
});

describe("their own money goes to a person", () => {
  test("a payment they made that did not arrive — any language", () => {
    for (const q of ["Maine kal Ravi ko 500 bheje the, abhi tak nahi mile", "I sent 200 dollars yesterday and it did not arrive", "मैंने 500 रुपये भेजे लेकिन नहीं मिले", "where is my money"]) assert.ok(ask(q).personal, q);
  });
  test("but a how-to is not, even with 'I' or 'my' in it", () => {
    for (const q of ["how do i send money", "what is my essentials", "how do i add money", "my account is on hold"]) assert.ok(!ask(q).personal, q);
  });
});

describe("the screens", () => {
  test("bundled before Help & Support, engine first", () => {
    const a = build.indexOf('"features/support/askEngine.js"'), b = build.indexOf('"features/support/askGloobal.jsx"'), c = build.indexOf('"features/support/helpSupport.jsx"');
    assert.ok(a > 0 && a < b && b < c);
  });
  test("a ? on Send, GLOOBAL Bank, My Essentials and My shop", () => {
    assert.match(code("frontend/screens/SendMoney/SendMoney.jsx"), /<AskHelpButton screen="send" \/>/);
    assert.match(code("frontend/screens/Banks/GloobalBankScreen.jsx"), /help=\{<AskHelpButton screen="bank" \/>\}/);
    assert.match(code("frontend/features/essentials/EssentialsScreen.jsx"), /<AskHelpButton screen="essentials" \/>/);
    assert.match(code("frontend/features/creator/CreatorPage.jsx"), /isOwner && <AskHelpButton screen="shop" \/>/);
  });
  test("Help & Support opens with Ask GLOOBAL on top", () => {
    assert.ok(help.indexOf("<AskHelpBox />") < help.indexOf(">Answers<"));
  });
  test("one host in App; its buttons go the app map's way; a person gets the question filled in", () => {
    assert.match(app, /stage === "dashboard" && <AskGloobalHost/);
    assert.match(app, /onGo=\{\(target\) => goToDashboardDestination\(/);
    assert.match(app, /onTalk=\{\(p\) => goToDashboardDestination\(\{ supportNew: p \|\| \{\} \}\)\}/);
    assert.match(dash, /deepLinkTarget\.supportNew/);
    assert.match(dash, /prefill=\{supportPrefill\}/);
    assert.match(help, /viaRef\.current = \{ via: "ask", askLang: prefill\.lang \|\| "" \}/);
  });
  test("answers: steps, read in another language, listen, show me, did it help", () => {
    for (const id of ["ask-answer", "ask-show-me", "ask-open", "ask-listen", "ask-yes", "ask-no", "ask-talk", "ask-suggestions", "ask-personal", "ask-choices", "ask-none"]) assert.match(ui, new RegExp(`(data-testid|testid)="${id}"`), id);
    assert.match(ui, /askT\(shown, "readIn"\)/);
  });
  test("show me points; it never taps for them", () => {
    assert.match(ui, /pointerEvents: "none"/);
    assert.ok(!/\.click\(\)/.test(ui));
    assert.match(code("frontend/features/bank/bankOpen.jsx"), /data-guide=\{`bank-\$\{k\}`\}/);
  });
  test("the screen's text is all four languages", () => {
    for (const l of ["en", "hi", "hl", "ta"]) assert.match(ui, new RegExp(`\\n  ${l}: \\{\\n    sub: `));
  });
  test("what is counted carries no account", () => {
    assert.match(ui, /askLog\(\{ kind: "personal", lang: l, screen \}\)/);
    assert.ok(!/userId|symbolId/.test(ui));
  });
});
