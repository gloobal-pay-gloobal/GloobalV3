// tests/geu-conversion.test.mjs
//
// Everyone buys GEU in their own currency.
//
// ── The rule ─────────────────────────────────────────────────────────────
//
// One GEU is one unit of the RESERVE currency (INR), for everybody. What
// differs is what you pay with. An account in India pays ₹1 and gets 1 GEU.
// An account in the United States pays $1 and gets about 85.6 GEU, because
// $1 IS about ₹85.6.
//
// ── What was there before ────────────────────────────────────────────────
//
// Both routes moved the typed number into both fields:
//
//     $inc: { balance: -amount, coinBalance: +amount }
//
// Correct for an INR account, where the rate is 1 and the two currencies are
// the same. Wrong for every other account, in the worst available direction:
// a US account paid $100 and received 100 GEU — about ₹100 — losing roughly
// 98% of what it paid. Redeeming was the mirror image: 100 GEU burned and
// $100 credited, minting about ₹8,460 of value out of nothing.
//
// The "fully backed" tick could not see either. `backed` compares reserve,
// issued and heldByAccounts, and all three were incremented by the same
// wrong number, so they agreed perfectly while the reserve held nothing like
// the fiat it claimed. Three numbers that only ever change together cannot
// catch an error made once, before they change.
//
// That is why most of this file is about what must NOT appear in the source
// rather than what must: the failure had no symptom to assert against. It
// balanced. It reconciled. It was just wrong.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const server = readSource("server/server.js");
const coinService = readSource("backend/domain/coin/CoinService.js");
const actions = readSource("frontend/adapters/ledger/useCoinActions.js");
const api = readSource("backend/services/api/gloobalApi.js");
const screen = readSource("frontend/screens/Coin/GloobalCoinScreen.jsx");

// Comments stripped before asserting absence. Every one of these files now
// explains the old 1:1 behaviour in prose in order to say why it was wrong,
// and grepping that prose as code makes the explanation look like the bug.
const code = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const routeBody = (path, until) =>
  code(server.slice(server.indexOf(`app.post('${path}'`), server.indexOf(`app.post('${until}'`)));

const mint = routeBody("/api/coin/mint", "/api/coin/redeem");
const redeem = routeBody("/api/coin/redeem", "/api/coin/send");

describe("a mint charges fiat and issues coin — two different numbers", () => {
  test("the balance is debited the fiat amount, not the coin amount", () => {
    // The single line that carried the whole bug.
    assert.match(mint, /\$inc:\s*\{\s*balance:\s*-fiatAmount,\s*coinBalance:\s*coinAmount\s*\}/);
    assert.ok(
      !/\$inc:\s*\{\s*balance:\s*-coinAmount/.test(mint),
      "the debit is still the coin figure — a US account pays 85x too little"
    );
  });

  test("the guard checks the balance against the fiat amount too", () => {
    // `balance: { $gte: coinAmount }` would let a US account with $200 spend
    // beyond it, or block an affordable purchase, depending on direction.
    assert.match(mint, /\{\s*_id:\s*user\._id,\s*balance:\s*\{\s*\$gte:\s*fiatAmount\s*\}\s*\}/);
  });

  test("the coin figure is the fiat figure times the rate", () => {
    assert.match(mint, /const coinAmount = toMinorUnit\(fiatAmount \* geuRate, COIN_CURRENCY\);/);
  });

  test("the fiat is rounded in the account's currency, the coin in coin units", () => {
    // A yen account cannot hold ¥0.5, and the coin leg has its own precision.
    // Rounding both at two places was the earlier audit fix (GLB-19); this
    // keeps it true now that the two amounts genuinely differ.
    assert.match(mint, /const fiatAmount = toMinorUnit\(Number\(amount\), accountCurrency\);/);
  });
});

describe("a redeem is the exact inverse", () => {
  test("coin is burned and fiat is credited at the account's rate", () => {
    assert.match(redeem, /\$inc:\s*\{\s*coinBalance:\s*-coinAmount,\s*balance:\s*fiatAmount\s*\}/);
    assert.ok(
      !/\$inc:\s*\{\s*coinBalance:\s*-coinAmount,\s*balance:\s*coinAmount\s*\}/.test(redeem),
      "redeeming still credits the coin figure as fiat — this mints value from nothing"
    );
  });

  test("the rate is looked up in the opposite direction from the mint", () => {
    // getRate(from, to) answers "1 unit of `from` is how many `to`". Mint
    // converts the account's currency INTO the reserve's; redeem converts
    // back. Getting this backwards is a factor-of-7000 error, not a rounding
    // one, and it looks identical in a diff.
    assert.match(mint, /geuRateFor\(accountCurrency, reserveCurrency\)/);
    assert.match(redeem, /geuRateFor\(reserveCurrency, accountCurrency\)/);
  });

  test("the fiat paid out is the coin times that rate", () => {
    assert.match(redeem, /const fiatAmount = toMinorUnit\(coinAmount \* redeemRate, accountCurrency\);/);
  });
});

describe("a missing rate fails closed", () => {
  test("neither route falls back to a rate of 1", () => {
    // 1 is not a neutral default here — it IS the original bug, and it would
    // reappear silently at the exact moment the FX service went down, while
    // moving real balance.
    for (const [name, body] of [["mint", mint], ["redeem", redeem]]) {
      assert.ok(
        !/rate\s*=\s*.*\|\|\s*1[;,)]/.test(body),
        `${name} falls back to a rate of 1 when the lookup fails`
      );
      assert.match(body, /return res\.status\(502\)/, `${name} must refuse, not guess`);
    }
  });

  test("identity is the one case that legitimately uses 1", () => {
    // An INR account converting to INR needs no lookup, and asking an FX
    // service for INR->INR is a network call that can fail and produce ∆ for
    // the reserve's own country.
    assert.match(
      server,
      /const geuRateFor = async \(accountCurrency, reserveCurrency\) => \{\s*if \(accountCurrency === reserveCurrency\) return \{ rate: 1, source: 'identity' \};/
    );
  });

  test("the client refuses to submit without a rate as well", () => {
    // The server fails closed regardless; this means the person is told
    // before they commit rather than after.
    assert.match(screen, /const rateKnown = Number\.isFinite\(geuRate\) && geuRate > 0;/);
    assert.match(screen, /const canSubmit = amountIsValid && !overCeiling && !busy && rateKnown && converted > 0;/);
  });
});

describe("a conversion that rounds to nothing is refused", () => {
  test("a mint that would issue zero coin does not take the fiat", () => {
    assert.match(mint, /if \(!Number\.isFinite\(coinAmount\) \|\| coinAmount <= 0\)/);
    assert.match(mint, /too small to buy any/);
  });

  test("a redeem that would pay out zero does not burn the coin", () => {
    // Worse than the mint case: it destroys value outright.
    assert.match(redeem, /if \(!Number\.isFinite\(fiatAmount\) \|\| fiatAmount <= 0\)/);
  });
});

describe("the rate is recorded, not merely applied", () => {
  test("both routes store the rate and its source on the transaction", () => {
    // A conversion whose rate is not on the record cannot be checked
    // afterwards, and this one decides how much coin somebody got for their
    // money. The send route already does exactly this with fxRate.
    for (const [name, body] of [["mint", mint], ["redeem", redeem]]) {
      assert.match(body, /geuRate/, `${name} must record the rate it used`);
      assert.match(body, /geuRateSource/, `${name} must record where the rate came from`);
    }
  });

  test("the ledger's fiat leg is denominated in the account's own currency", () => {
    // It used to record the coin figure against the reserve currency, which
    // for any non-INR account named neither the right number nor the right
    // unit — the ledger and the balance told different stories.
    assert.match(mint, /amount: fiatAmount,\s*balanceBefore: toMinorUnit\(balanceAfter \+ fiatAmount, accountCurrency\),\s*balanceAfter,\s*currency: accountCurrency,/);
    assert.match(redeem, /amount: fiatAmount,\s*balanceBefore: toMinorUnit\(balanceAfter - fiatAmount, accountCurrency\),\s*balanceAfter,\s*currency: accountCurrency,/);
  });
});

describe("the browser's own ledger posts the same two numbers", () => {
  test("CoinService takes the coin leg and the fiat leg separately", () => {
    // The local double-entry record had the identical 1:1 assumption. A
    // journal entry balances per currency, so posting the coin figure to the
    // fiat line still balanced — it was just a fiat line for 8,560 dollars
    // against a hundred-dollar purchase.
    assert.match(coinService, /mint\(coinAmount, \{ now, meta, fiatAmount = coinAmount \} = \{\}\)/);
    assert.match(coinService, /redeem\(coinAmount, \{ now, meta, fiatAmount = coinAmount \} = \{\}\)/);
    assert.match(coinService, /const fiat = Money\.of\(fiatAmount, this\.reserveCurrency\);/);
    assert.match(coinService, /const coin = Money\.of\(coinAmount, COIN_CURRENCY\);/);
  });

  test("and the caller passes the server's own figures for both", () => {
    // Not recomputed locally. A second conversion with a second rate read at
    // a second moment could disagree with the one that actually moved the
    // money.
    assert.match(actions, /core\.coinService\.mint\(result\.minted, \{\s*fiatAmount: result\.paid,/);
    assert.match(actions, /core\.coinService\.redeem\(result\.redeemed, \{\s*fiatAmount: result\.received,/);
  });

  test("an absent fiat figure stays undefined rather than becoming zero", () => {
    // `Number(undefined) || 0` is 0, and a fiat leg of 0 against a real coin
    // leg is an unbalanced entry the journal rejects — turning a stale
    // server into a crash at the moment money moves.
    assert.match(api, /paid: Number\.isFinite\(Number\(result\.paid\)\) \? Number\(result\.paid\) : void 0,/);
    assert.match(api, /received: Number\.isFinite\(Number\(result\.received\)\) \? Number\(result\.received\) : void 0,/);
  });
});

describe("the screen states the rate instead of asserting a false one", () => {
  test("\"1 GEU = <your currency> 1\" is only said when that is true", () => {
    // The old chip said this to everybody. For a US account it was wrong by
    // a factor of eighty-five, and it was the only statement of the rate
    // anywhere in the app.
    assert.match(screen, /const isPegCurrency = rateKnown && geuRate === 1;/);
    const chip = screen.slice(screen.indexOf("!rateKnown"), screen.indexOf("</span></div>{", screen.indexOf("!rateKnown")));
    assert.match(chip, /isPegCurrency\s*\n?\s*\?\s*`1 \$\{COIN_TICKER\} = \$\{ccy\}1, always`/);
    assert.match(chip, /\$\{ccy\}1 = \$\{fmt\(geuRate\)\} \$\{COIN_TICKER\}/);
  });

  test("the reserve figure is printed in the reserve's currency", () => {
    // Same class of error as the one this whole file is about, made again in
    // the holders row: `supply.reserve` is INR, and formatting it with the
    // ACCOUNT's symbol told a US reader the reserve held $412,000 when it
    // held ₹412,000 — a claim inflated 85-fold.
    assert.match(
      screen,
      /issued against \$\{pegSymbol\}\$\{fmt\(supply\.reserve, pegCode\)\} in reserve/
    );
  });

  test("the conversion is previewed before it is committed to", () => {
    // Someone in the US typed 100 and had no way to know whether that meant
    // 100 units or 8,560 until they looked at their balance afterwards.
    assert.match(screen, /const converted = !amountIsValid \|\| !rateKnown/);
    assert.match(screen, /≈ \$\{fmt\(converted\)\} \$\{COIN_TICKER\}/);
    assert.match(screen, /≈ \$\{ccy\}\$\{fmt\(converted, ccyCode\)\}/);
  });

  test("an unknown rate reads as ∆, never as 1 and never as blank", () => {
    assert.match(screen, /\{!rateKnown\s*\n?\s*\?\s*"∆"/);
    assert.match(screen, /your rate is ∆/);
  });
});

describe("one flag component, everywhere", () => {
  test("no screen prints a flag as bare text", () => {
    // An emoji flag renders as a flag on Apple platforms and as the
    // country's two LETTERS on Windows and most Android builds, which have
    // no flag glyphs. FlagEmoji draws the real image with the emoji as its
    // own fallback, and every other flag in the app already goes through it.
    const files = [
      "frontend/screens/Dashboard/Dashboard.jsx",
      "frontend/screens/Coverage/GloobalCoverageScreen.jsx",
      "frontend/screens/Coin/CoinHoldersScreen.jsx",
      "frontend/screens/Coin/CountryHoldersScreen.jsx",
      "frontend/components/dialogs/registerLogin.jsx",
      "frontend/components/dialogs/ReceiptModal.jsx",
      "frontend/screens/Banks/GloobalBankScreen.jsx"
    ];
    for (const file of files) {
      const src = code(readSource(file));
      // `>{x.flag}<` — an interpolation rendered directly as a text child.
      const bare = src.match(/>\{[a-zA-Z][\w.]*\.flag\}</g) || [];
      assert.equal(
        bare.length,
        0,
        `${file} renders ${bare.join(", ")} as text — that is two letters, not a flag, on Windows and Android`
      );
    }
  });

  test("the shared component is the one the country picker uses", () => {
    // The claim is that there is ONE of these, so this checks the component
    // the registration picker draws through is the same one the new screens
    // do, rather than trusting that they happen to look alike.
    const flags = readSource("frontend/components/cards/flags.jsx");
    assert.match(flags, /function FlagEmoji\(/);
    // FlagCircle is a wrapper around it, not a second implementation.
    const circle = flags.slice(flags.indexOf("function FlagCircle("));
    assert.match(circle.slice(0, circle.indexOf("\nfunction ")), /<FlagEmoji/);
    assert.match(readSource("frontend/components/dialogs/registerLogin.jsx"), /<FlagEmoji/);
    assert.match(readSource("frontend/screens/Coin/CountryHoldersScreen.jsx"), /<FlagCircle/);
  });
});
