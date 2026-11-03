// tests/help-support-0216.test.mjs
//
//   node --test tests/help-support-0216.test.mjs
//
// 0216: Profile → Help & Support stops being a placeholder. Answers first,
// then a chat with a real person on the Support desk. The server side —
// roles, the desk, what each role may see — is checked against a real
// database in server/tests/support.test.mjs.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const code = (p) => readSource(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const d = code("frontend/screens/Dashboard/Dashboard.jsx");
const app = code("frontend/App.jsx");
const sheet = code("frontend/components/dialogs/NotificationsSheet.jsx");
const panel = code("frontend/features/support/helpSupport.jsx");
const api = code("backend/services/api/gloobalApi.js");
const build = readSource("build_app.mjs");

describe("where it lives", () => {
  test("the placeholder is gone", () => {
    assert.ok(!/Full help center coming soon/.test(d));
    assert.ok(!/support@gloobal\.id/.test(d));
  });
  test("Help & Support opens the panel, marked as the shop's on the creator side", () => {
    assert.match(d, /profileDetail === "Help & Support" && <HelpSupportPanel/);
    assert.match(d, /side=\{shareRole === "merchant" \? "shop" : "person"\}/);
  });
  test("bundled, after the creator screens", () => {
    assert.ok(build.indexOf('"features/support/helpSupport.jsx"') > build.indexOf('"features/creator/nameMarket.jsx"'));
  });
});

describe("the screen", () => {
  test("answers before the chat", () => {
    assert.ok(panel.indexOf(">Answers<") < panel.indexOf(">Chat with us<"));
    assert.match(panel, /A payment I sent has not arrived/);
  });
  test("a chat starts from a topic; My shop only on the shop side", () => {
    for (const k of ["payment", "bank", "essentials", "shop", "account", "other"]) assert.match(panel, new RegExp(`\\["${k}", `));
    assert.match(panel, /side === "shop" \|\| k !== "shop"/);
    assert.match(panel, /disabled=\{!ready\}/);
  });
  test("a thread: the team's replies signed, where it stands, a reply box", () => {
    assert.match(panel, /data-testid="help-thread"/);
    assert.match(panel, /<HelpStatusPill status=\{thread\.status\}/);
    assert.match(panel, /Waiting on you/);
    assert.match(panel, /data-testid="help-send"/);
  });
  test("looks for the answer while open, not while hidden", () => {
    assert.match(panel, /if \(!document\.hidden\) loadThread\(threadId\)/);
  });
  test("past chats with unread", () => assert.match(panel, /data-testid="help-chat-row"/) && assert.match(panel, /c\.unread > 0/));
  test("the hook aliases are its own", () => {
    assert.match(readSource("frontend/features/support/helpSupport.jsx"), /useState as useState87, useEffect as useEffect83, useRef as useRef46/);
    for (const f of ["frontend/screens/Dashboard/Dashboard.jsx", "frontend/App.jsx", "frontend/features/creator/creatorShops.jsx"]) assert.ok(!/useState87|useEffect83|useRef46/.test(readSource(f)), f);
  });
});

describe("a question about one payment (0218)", () => {
  test("picking a payment is offered for A payment, and sent with the chat", () => {
    assert.match(panel, /topic === "payment" && <div data-testid="help-payments"/);
    assert.match(panel, /transactionId: topic === "payment" \? picked : null/);
    assert.match(api, /async getSupportPayments\(/);
    assert.match(api, /"\/api\/support\/payments"/);
  });
  test("the figure carries both names", () => assert.match(panel, /<GeuFigure amount=\{p\.amount\} currency=\{p\.currency\} lens=\{lens\}/));
  test("the thread shows the payment it is about", () => assert.match(panel, /data-testid="help-thread-payment"/));
  test("the dashboard hands the lens in", () => assert.match(d, /<HelpSupportPanel[\s\S]{0,200}lens=\{displayLens\}/));
});

describe("a reply finds them", () => {
  test("the API", () => {
    for (const m of ["getSupportChats", "getSupportChat", "startSupportChat", "sendSupportMessage"]) assert.match(api, new RegExp(`async ${m}\\(`));
    assert.match(api, /"\/api\/support\/conversations"/);
  });
  test("a push tap opens the chat", () => {
    assert.match(app, /const supportId = data\.payload && data\.payload\.supportId;/);
    assert.match(app, /setDashboardDeepLink\(\{ support: String\(supportId\) \}\)/);
  });
  test("so does the notice", () => {
    assert.match(sheet, /meta\.event === "support_reply" && meta\.conversationId && onOpenSupport/);
    assert.match(app, /onOpenSupport=\{\(id\) =>/);
  });
  test("the dashboard opens Help & Support on that chat", () => {
    assert.match(d, /deepLinkTarget\.support\) \{\s*setActiveTab\("profile"\);\s*setSupportOpenId\(String\(deepLinkTarget\.support\)\);\s*setProfileDetail\("Help & Support"\);/);
  });
});
