// src/App.jsx
import { useState as useState19, useEffect as useEffect15, useRef as useRef13, useCallback as useCallback11, useEffect as useEffect30, useRef as useRef22, useRef as useRef29 } from "react";
import {
  ChevronLeft as ChevronLeft4,
  Lock as Lock7,
  History as History8,
  RefreshCw as RefreshCw6,
  Fingerprint as Fingerprint2,
  ImageIcon,
  ArrowUpRight as ArrowUpRight5,
  Store as Store4,
  Eye as EyeScan,
  EyeOff as EyeOffScan
} from "lucide-react";


// The decorative white circle on the registration/phone screen read as a
// ghost sitting behind the REGISTRATION badge and the phone input card,
// so it is switched off. Kept behind a flag rather than deleted because
// it is a real interactive element (handleHeroCircleTap), not just art —
// flip this to true to bring it back.
var SHOW_PHONE_HERO_CIRCLE = false;

// The way out of the scanner for a payment that has no code behind it.
//
// It sits where a dead "Enter Mobile Number to Pay" field used to: a div
// dressed as a text input that took no typing and had no handler. Paying
// somebody without scanning them is a real need, and the screen used to
// gesture at it without serving it.
//
// Two grounds, because it appears on both a white permission page and on
// top of live video, and a control that is legible on one is invisible on
// the other.
function ScanSendButton({ onClick, overVideo = false }) {
  return <button
    onClick={onClick}
    className="v2-tap"
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 9,
      width: "100%",
      border: "none",
      borderRadius: 999,
      padding: "15px 20px",
      // ── IT USED TO GO WHITE OVER THE CAMERA ──────────────────────────
      //
      // A near-white pill with violet type, which read as the system's
      // button rather than as part of the screen it was on. The scan
      // screen now carries one colour — the ring, the zoom rail and the
      // two round controls are all the same violet — and the single
      // largest object on it was the one thing opting out.
      //
      // It is the brand gradient in both places now. Over video it takes
      // a glow instead of a drop shadow, because a shadow needs a surface
      // underneath to fall on and a camera picture is not one.
      background: T.gradButton,
      color: "#fff",
      fontSize: 14.5,
      fontWeight: 800,
      cursor: "pointer",
      boxShadow: overVideo
        ? "0 10px 34px rgba(124,58,237,0.55), inset 0 1px 0 rgba(255,255,255,0.3)"
        : "0 8px 20px rgba(124,58,237,0.28)"
    }}
  ><ArrowUpRight5 size={17} />Send</button>;
}

// The local CACHE of the profile picture, keyed by Gloobal ID. The photo
// itself now has one home: the server (PUT /api/profile/:symbolId/photo),
// which is what lets somebody scanning this account's QR see it — see
// syncOwnProfilePhoto below. The copy here is so a restored session can show
// the name and photo without waiting on a network round trip; the backend
// remains the authority on both.
var GLOOBAL_PROFILE_KEY_PREFIX = "gloobal.profile.";

// Every localStorage access is guarded: it throws outright in Safari
// private mode and when storage is disabled, and a profile picture is
// never worth crashing a registration over.
function persistLocalProfile(symbolId, name, photo) {
  if (!symbolId) return;
  try {
    window.localStorage.setItem(
      GLOOBAL_PROFILE_KEY_PREFIX + symbolId,
      JSON.stringify({ name: name || "", photo: photo || "", savedAt: Date.now() })
    );
  } catch (e) {
    // No storage — the name still reached the backend at registration, and
    // the photo falls back to the Gloobal mark on the next load.
  }
}

function loadLocalProfile(symbolId) {
  if (!symbolId) return null;
  try {
    const raw = window.localStorage.getItem(GLOOBAL_PROFILE_KEY_PREFIX + symbolId);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// ── The account's own photo, on the server ─────────────────────────────────
//
// One copy per account lives on the server; the localStorage profile above is
// a cache of it. Nothing here ever blocks a sign-in or a screen, and nothing
// here signs anyone out by itself: a failed read or write (Render cold start,
// offline, 5xx — status 0 or otherwise) is swallowed and retried at the next
// sign-in. Only a 401 ends a session, and that is httpClient's decision about
// the token, not this code's about a photo.
//
// "Pending" = the person's latest choice (a photo, or no photo) has not yet
// been confirmed by the server. While it is set, the local choice wins over
// whatever the server holds; once the server accepts it, the server copy is
// the one every device adopts.
var GLOOBAL_PROFILE_PHOTO_PENDING_PREFIX = "gloobal.profilePhotoPending.";
// symbolId → in-flight upload promise, so a sync never races a write.
var OWN_PROFILE_PHOTO_PUSHES = new Map();

function ownProfilePhotoPending(symbolId) {
  if (!symbolId) return false;
  try {
    return window.localStorage.getItem(GLOOBAL_PROFILE_PHOTO_PENDING_PREFIX + symbolId) === "1";
  } catch (e) {
    return false;
  }
}

function setOwnProfilePhotoPending(symbolId, pending) {
  if (!symbolId) return;
  try {
    if (pending) window.localStorage.setItem(GLOOBAL_PROFILE_PHOTO_PENDING_PREFIX + symbolId, "1");
    else window.localStorage.removeItem(GLOOBAL_PROFILE_PHOTO_PENDING_PREFIX + symbolId);
  } catch (e) {
    // No storage: the upload below is still attempted; it just is not
    // remembered for a retry.
  }
}

// A real photo, or null. The Gloobal logo placeholder is "no photo".
function ownRealProfilePhoto(photo) {
  return profileAvatarIsPhoto(photo) ? photo : null;
}

// Write of the account's photo (or its removal, for null).
//
// Resolves to an OUTCOME and never rejects. It used to resolve a bare
// `false` for every kind of failure, which is why a save that never reached
// the server was indistinguishable — to the caller and to the person — from
// one that did: the screen had already been changed optimistically and
// nothing ever contradicted it.
//
//   { ok: true }                     the server has it
//   { ok: false, reason: "unprepared" }  this image cannot be sent at all
//   { ok: false, reason: "offline" }     no token to send it with
//   { ok: false, reason: "failed" }      the server could not be reached
//
// "unprepared" is the one that is NOT worth retrying, and it is the one the
// caller must undo rather than leave on screen. The other two are transient,
// stay pending, and are retried.
function pushOwnProfilePhoto(symbolId, photo) {
  if (!symbolId) return Promise.resolve({ ok: false, reason: "offline" });
  const real = ownRealProfilePhoto(photo);
  // A picture that could not be downscaled under the cap would only ever be
  // refused. This used to clear the pending flag and resolve false, which
  // read as "nothing more to do" — so the picture stayed in the local cache,
  // on screen, and on this device only, for good. It is reported instead,
  // and the caller puts the confirmed photo back.
  if (real && !profilePhotoUploadable(real)) {
    setOwnProfilePhotoPending(symbolId, false);
    return Promise.resolve({ ok: false, reason: "unprepared" });
  }
  setOwnProfilePhotoPending(symbolId, true);
  // No token yet (or any more): left pending for the next signed-in sync.
  if (typeof gloobalAuthToken !== "function" || !gloobalAuthToken()) {
    return Promise.resolve({ ok: false, reason: "offline" });
  }
  const push = Promise.resolve()
    .then(() => GloobalApi.setProfilePhoto(symbolId, real))
    .then(
      () => {
        if (OWN_PROFILE_PHOTO_PUSHES.get(symbolId) === push) setOwnProfilePhotoPending(symbolId, false);
        // Surfaces that read this account's photo through the counterparty
        // cache see the new one at once rather than after a reload.
        COUNTERPARTY_PHOTO_CACHE.set(symbolId, real);
        return { ok: true };
      },
      // A cold Render instance takes 20-50s to wake and this is where that
      // lands. The flag stays set, so the next sync sends it again.
      () => ({ ok: false, reason: "failed" })
    )
    .finally(() => {
      if (OWN_PROFILE_PHOTO_PUSHES.get(symbolId) === push) OWN_PROFILE_PHOTO_PUSHES.delete(symbolId);
    });
  OWN_PROFILE_PHOTO_PUSHES.set(symbolId, push);
  return push;
}

// Once per signed-in session: reconcile the local cache with the server.
// Resolves to a photo the screen should now show, or null for "leave it".
// Rejects only when the server could not be read, so the caller can retry.
async function syncOwnProfilePhoto(symbolId) {
  if (!symbolId) return null;
  if (OWN_PROFILE_PHOTO_PUSHES.has(symbolId)) await OWN_PROFILE_PHOTO_PUSHES.get(symbolId);
  const local = loadLocalProfile(symbolId);
  const localPhoto = ownRealProfilePhoto(local && local.photo);
  // The person's own latest choice has not reached the server yet: send it.
  // A failure here is thrown rather than swallowed, so the caller clears its
  // "already synced" mark and tries again on the next arrival — this used to
  // resolve null either way, which retired the retry for the whole session
  // after a single failed attempt.
  if (ownProfilePhotoPending(symbolId)) {
    const outcome = await pushOwnProfilePhoto(symbolId, localPhoto);
    if (!outcome.ok && outcome.reason !== "unprepared") {
      throw new Error("The profile photo could not be saved.");
    }
    return null;
  }
  const serverPhoto = await GloobalApi.getUserPhoto(symbolId);
  // A change made while that read was in flight wins over it.
  if (ownProfilePhotoPending(symbolId) || OWN_PROFILE_PHOTO_PUSHES.has(symbolId)) return null;
  if (serverPhoto) {
    // The server copy is the photo: adopt it and cache it locally.
    if (!local || local.photo !== serverPhoto) {
      persistLocalProfile(symbolId, (local && local.name) || "", serverPhoto);
    }
    COUNTERPARTY_PHOTO_CACHE.set(symbolId, serverPhoto);
    return serverPhoto;
  }
  if (!localPhoto) return null;
  // A photo that only ever lived on this device (chosen before the server
  // held photos): upload it, shrinking it first if it predates downscaling.
  let fitted = localPhoto;
  if (!profilePhotoUploadable(fitted)) {
    fitted = await fitProfilePhotoForUpload(localPhoto);
    if (fitted !== localPhoto && profilePhotoUploadable(fitted)) {
      persistLocalProfile(symbolId, (local && local.name) || "", fitted);
    }
  }
  await pushOwnProfilePhoto(symbolId, fitted);
  return fitted !== localPhoto ? fitted : null;
}

// The payee's photo on the scan confirm card. Read from the server by the
// Gloobal ID the SERVER resolved — never from anything in the QR — and drawn
// with the fallback straight away, so neither the card nor Pay waits on it.
function ScanPayeeAvatar({ gloobalId, name }) {
  const { photo } = useCounterpartyPhoto(gloobalId);
  return <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><ProfileAvatar photo={photo} name={name} size={72} /></div>;
}

// Turns one row of GET /api/transactions/:symbolId into the shape this
// app's history list renders. The backend's projection is already
// per-viewer — `direction` and `counterparty` are computed relative to the
// symbolId that was asked for — so nothing here has to work out which side
// of the transaction the person was on.
//
// Fields with no server equivalent get honest defaults rather than
// invented values: `method` is not recorded server-side (the backend has
// no concept of PayLater vs bank), and cashback is withheld per
// transaction but not returned on this projection, so shareRate is 0
// rather than a guess.
// A figure the server recorded, or null. `Number(null)` is 0, which is
// finite — so a plain isFinite check would turn "the server did not say"
// into "the server said zero".
function gloobalRecordedFigure(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// WHAT A HISTORY ROW IS, AND WHICH CHIP IT BELONGS UNDER.
//
// ── The one line this replaced ──────────────────────────────────────────
//
//     kind:   row.type === "share" ? "share" : "payment",
//     method: row.type === "share" ? "share" : "bank",
//
// Binary. Every row that was not a Creator Share leg was stamped "bank",
// including all three coin movements, and `currency` was never consulted. Two
// consequences, both of which shipped:
//
//   1. The History screen's Coin chip has been DEAD since it was added. Its
//      filter is `col.rows.filter((t) => t.method === "coin")` and no server
//      row has ever carried that value, so the chip was a button that
//      produced an empty list for every account.
//
//   2. A buy or a sell opened the PAYMENT receipt — method "Bank", a
//      counterparty of "Gloobal User", and none of the exchange's own facts:
//      no fiat cost, no rate, no reserve. The one movement in this app that
//      is literally a currency exchange had a receipt describing a bank
//      transfer that did not happen.
//
// ── Why two fields and not one ─────────────────────────────────────────
//
// They answer different questions, and for a coin movement the answers
// differ:
//
//   `kind`   WHICH RECEIPT opens — see rowReceipt.js. "coin" builds
//            coinReceiptFrom (holder, reserve, rate, both legs); "payment"
//            builds buildHistoryReceipt; "share" the Creator Share form.
//   `method` WHICH CHIP it files under on the History screen, and the
//            "Payment method" line on a payment receipt.
//
// So a BUY is kind "coin" (it needs the exchange receipt) and method "bank"
// (the money left the bank balance, and that is the screen it is listed on).
// A GEU TRANSFER between two people is the reverse: method "coin", because it
// is a coin transfer and belongs with the Coin screen's ledger — but kind
// "payment", because it is a person paying a person and should open exactly
// the receipt a rupee payment opens. That is the split the founder asked for,
// stated once, here, rather than inferred at four call sites.
//
// NOT keyed on currency, deliberately. Gloobal Coin and the GEU growth
// prototype are both denominated "GEU" (COIN_CURRENCY and
// GEU_PROTOTYPE_CURRENCY are the same string), so currency cannot tell a coin
// movement from a prototype one, and `type` can.
var HISTORY_ROW_SHAPE_BY_TYPE = {
  share: { kind: "share", method: "share" },
  // Buy and sell: the fiat side moved through the bank balance.
  coin_mint: { kind: "coin", method: "bank" },
  coin_redeem: { kind: "coin", method: "bank" },
  // A transfer: coin to coin, no fiat leg at all.
  coin_send: { kind: "payment", method: "coin" }
};

// An unrecognised type is a PAYMENT, not a coin row.
//
// This is the safe direction for a default. A new transaction type arriving
// from the server lands here, and reading it as a payment shows a row with a
// name, a figure and a receipt built from fields every row has. Defaulting to
// "coin" would send it to coinReceiptFrom, which would find no fiat leg and
// no rate and draw an exchange that never happened.
var HISTORY_ROW_SHAPE_DEFAULT = { kind: "payment", method: "bank" };

function historyRowShape(type) {
  return HISTORY_ROW_SHAPE_BY_TYPE[String(type || "")] || HISTORY_ROW_SHAPE_DEFAULT;
}

// WHO A ROW WITH NO COUNTERPARTY RECORD IS WITH.
//
// A buy and a sell write `toUserId: null` — not because anything was lost,
// but because the other side of them is the reserve that backs the coin, and
// the reserve is not an account. So the server resolves no counterparty, and
// the fallback that filled the gap said "Gloobal User": a row reading
//
//     Gloobal User        +1,200.00 GEU
//
// which names nobody, and reads as a payment from a stranger rather than as
// a purchase. It is the same placeholder a genuinely unnamed PAYMENT gets,
// and for a payment it is at least honest — somebody really is on the other
// end and the app does not know their name.
//
// Here it is just wrong, and the right answer was already written down:
// coinReceipt.js has named this party "Gloobal Reserve" since the coin
// receipt was built, and the receipt the row opens says "From Gloobal
// Reserve" on exactly this movement. The row said one thing and the document
// behind it another.
//
// Only mint and redeem. A coin SEND has two real accounts and resolves a
// name like any payment; if it ever arrives without one, "Gloobal User" is
// the truthful answer there, because a person is who it was with.
function coinPartyName(type) {
  return type === "coin_mint" || type === "coin_redeem" ? COIN_RESERVE_NAME : "GLOOBAL User";
}

function mapServerTransaction(row, viewerSymbolId) {
  // The server's own record of when this happened — the instant every list
  // sorts by (transactionOrder.js) and the instant the row's date and time
  // are printed from, so the order a person sees and the times they read are
  // the same fact. It was only ever turned into those two display strings
  // and then dropped, so no list had anything finer than "Aug 13" to sort
  // on. No `createdAt` means no instant: it used to fall back to `new
  // Date()`, stamping a record with whenever it happened to be read.
  const createdParsed = row.createdAt ? new Date(row.createdAt) : null;
  const created = createdParsed && !Number.isNaN(createdParsed.getTime()) ? createdParsed : null;
  const counterparty = row.counterparty || {};
  // fullName is the mobile number on accounts made before the name step
  // existed, so a "name" that is just the number is not worth showing.
  const counterpartyName =
    counterparty.fullName && counterparty.fullName !== counterparty.symbolId
      ? counterparty.fullName
      : counterparty.symbolId || coinPartyName(row.type);
  // WHOSE money this row is about.
  //
  // A payment has two sides and they are not the same number. The server
  // stores `amount`/`currency` as the RECEIVER's face value — ₹478,000, INR
  // — and the sender's own debit separately (`debitAmount`/`senderCurrency`
  // — $5,000, USD). This used to take `amount` and drop `currency`
  // altogether, leaving a bare figure that the row then rendered with
  // whatever symbol the logged-in account happens to use. A US sender saw
  // −$478,000.00 for a $5,000 payment: the rupee number wearing a dollar
  // sign. Same shape in every corridor — ¥5,000 to the UK came back as ¥545.
  //
  // So each side is shown its own money. The receiver keeps the face value,
  // which is genuinely theirs; the sender gets the debit that actually left
  // their balance.
  const isReceived = row.direction === "received";
  const debit = Number(row.debitAmount);
  const senderSideKnown = !isReceived && Number.isFinite(debit) && row.senderCurrency;
  // Where the sender's side was never recorded (rows predating it), the
  // receiver-currency figure is kept AND labelled as such. Mislabelling it
  // is exactly the bug; showing it honestly in a foreign currency is not.
  const ownAmount = senderSideKnown ? debit : Number(row.amount) || 0;
  const ownCurrency = senderSideKnown ? row.senderCurrency : row.currency || null;
  // WHO the other party is, carried whole.
  //
  // This mapper used to take `counterparty.fullName` and nothing else. The
  // Gloobal ID and the country were both dropped on the floor, so every row
  // restored from the server reached the receipt with `id` undefined and
  // `flag` undefined — and ReceiptModal renders each of those only `&&` they
  // exist, so a reopened receipt silently showed a name and no identity at
  // all. It read as a rendering bug and was a mapping one: the fields were
  // never asked for from the server (they are now — see counterpartyFor) and
  // never copied out of the response here.
  //
  // The flag is derived from the ISO code rather than sent as an emoji, and
  // through the same COUNTRY_BY_ISO table every other flag in the app comes
  // from — no country is named here, and an unknown code falls back to
  // isoToFlag's regional-indicator pair rather than to a default country.
  // Is this row the Creator Share leg itself, rather than a payment that
  // carried one? Read from the server's own `type`, which exists for this.
  const isShareLeg = row.type === "share";
  // Whether this row can state both recorded sides of its conversion — see
  // senderAmount/receiverAmount below.
  // Local rather than gloobalRecordedFigure: this function is also evaluated
  // on its own, sliced out of this file, by tests/cross-border-history.
  const recordedFigureKnown = (value) => value != null && value !== "" && Number.isFinite(Number(value));
  const recordedSidesKnown =
    !isShareLeg &&
    recordedFigureKnown(row.debitAmount) &&
    recordedFigureKnown(row.amount) &&
    Boolean(row.senderCurrency) &&
    Boolean(row.currency);
  const counterpartyIso = String(counterparty.countryIso || "").toUpperCase();
  const counterpartyFlag = counterpartyIso
    ? (COUNTRY_BY_ISO[counterpartyIso] && COUNTRY_BY_ISO[counterpartyIso].flag) || isoToFlag(counterpartyIso)
    : "";

  return {
    // A payment TO a shop is listed under the shop's creator name
    // (rasoi.ghar), not the owner's own name — that is what was paid.
    name: row.creatorHandle && row.direction !== "received" ? row.creatorHandle : counterpartyName,
    personName: counterpartyName,
    // The counterparty's own Gloobal ID — the "To"/"From" identity on the
    // receipt. Never the viewer's: the server picks the opposite side by the
    // transaction's own fromUserId (counterpartyFor), and this only carries
    // that answer through.
    id: counterparty.symbolId || "",
    flag: counterpartyFlag,
    counterpartyIso: counterpartyIso || null,
    // ISO, from the server's createdAt; null when the row has none.
    occurredAt: created ? created.toISOString() : null,
    date: created ? created.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "",
    time: created ? formatClockTime(created) : "",
    amount: ownAmount,
    // Carried on the row so nothing downstream has to guess. A row with an
    // amount and no currency is what made this bug possible.
    currency: ownCurrency,
    // Kept for the receipt, which shows both sides of a cross-border payment.
    counterpartyAmount: Number(row.amount) || 0,
    counterpartyCurrency: row.currency || null,
    // recordedFigureKnown, not Number.isFinite(Number(...)): Number(null) is
    // 0, so a row with no recorded rate came through as a rate of ZERO and a
    // cross-border receipt printed "1 INR = 0.000000 EUR" — a figure that
    // exists nowhere. Absent stays absent.
    fxRate: recordedFigureKnown(row.fxRate) ? Number(row.fxRate) : null,
    // ── Both sides of the conversion, as the server recorded them ─────────
    //
    // For the receipt's conversion block, which buildHistoryReceipt reads
    // under exactly these names. Nothing was mapped here before, so every
    // receipt reopened from history reached ReceiptModal with four nulls and
    // the block could never draw — a cross-border payment reopened later
    // looked domestic.
    //
    // Sender side: debitAmount/senderCurrency. Receiver side: amount/currency
    // (the receiver's face value). Both are carried for EITHER viewer — the
    // payee's receipt of a cross-border payment shows the same two recorded
    // facts the payer's does.
    //
    // Null, not guessed, when the row cannot state them: a row written before
    // debitAmount was stored gets no conversion block at all, and neither does
    // a Creator Share leg, which is a movement of its own figure in one
    // currency and not a conversion of the payment it came from.
    senderAmount: Number.isFinite(Number(row.debitAmount)) && recordedSidesKnown ? Number(row.debitAmount) : null,
    senderSideCurrency: row.senderCurrency || null,
    receiverAmount: Number.isFinite(Number(row.amount)) && recordedSidesKnown ? Number(row.amount) : null,
    receiverSideCurrency: row.currency || null,
    // ── Both sides of the Creator Share, as the server recorded them ─────
    //
    // The share runs the other way from the payment: the payee gives it, in
    // their currency, and the payer gets it, in theirs. The server stores
    // both. On a PAYMENT row they are `cashback` (payee's side, in the
    // payment's receiving currency) and `cashbackCredit` (payer's side, in
    // senderCurrency); on a SHARE LEG they are debitAmount/senderCurrency
    // (the payee who gave it) and amount/currency (the payer who got it).
    //
    // Only `shareAmount` below — the viewer's own side — was carried before,
    // so every Creator Share tab showed one currency of a movement that had
    // two. Null where the row does not record a side; nothing is converted.
    shareSenderAmount: isShareLeg
      ? (recordedFigureKnown(row.debitAmount) ? Number(row.debitAmount) : null)
      : (recordedFigureKnown(row.cashback) ? Number(row.cashback) : null),
    shareSenderCurrency: (isShareLeg ? row.senderCurrency : row.currency) || null,
    shareReceiverAmount: isShareLeg
      ? (recordedFigureKnown(row.amount) ? Number(row.amount) : null)
      : (recordedFigureKnown(row.cashbackCredit) ? Number(row.cashbackCredit) : null),
    shareReceiverCurrency: (isShareLeg ? row.currency : row.senderCurrency) || null,
    status: row.status || "completed",
    direction: row.direction === "received" ? "received" : "sent",
    // A Creator Share leg is a real movement, not a payment.
    //
    // These rows used to be filtered out of the history endpoint entirely,
    // on the reading that a share "moves no balance" — see the query in
    // server.js. It does: the payee is credited the payment minus their
    // share, and the share goes back to the payer. So a payee who received
    // 1,000 at 2% saw +1,000 in their history against a balance that rose by
    // 980, with no row anywhere for the 20.
    //
    // Now that the row exists, it has to say what it is. It carries the same
    // shape as any other row — its own currency, its own side's figure, the
    // counterparty's name — and `kind` is what lets a list label it rather
    // than showing a second, unexplained payment to the same person on the
    // same day.
    // Which receipt this row opens, and which chip it files under. One table,
    // keyed on the server's `type` — see historyRowShape above for what the
    // two words mean and for the binary line this replaced.
    kind: historyRowShape(row.type).kind,
    method: historyRowShape(row.type).method,
    // The server's own word for what this is, carried through unchanged.
    //
    // `kind` and `method` are both lossy on purpose — they answer "which
    // receipt" and "which chip", and two different types can share an answer
    // (coin_mint and coin_redeem are both kind "coin"). A reader that needs
    // to tell a buy from a sell needs the type itself, and until now the only
    // copy of it on this side was consumed by the ternary above and dropped.
    txnType: row.type || null,
    // THE EXCHANGE, where there was one.
    //
    // The fiat a buy cost or a sell paid out, the rate it converted at, and
    // which way that rate points — the fields GET /api/coin/:symbolId/history
    // has always sent and the main history projection has only just started
    // to (server/lib/coinHistoryRow.js). Null on a payment and on a coin
    // transfer, which moves no fiat.
    //
    // Passed through whole rather than flattened into this row: it is the
    // exact shape coinReceiptFrom already reads, so the receipt behind a
    // History row and the receipt behind the same movement on the Coin screen
    // are built by one function from one object. Flattening it here would be
    // a second mapping to keep in step with the first.
    coin: row.coin || null,
    txnId: row.referenceId || row.id || "",
    // The Creator Share this payment carried, as the server recorded it.
    //
    // Hardcoded 0 before, which is why the receipt's Creator Share tab
    // vanished on reopen: a payment with a real 1% share came back claiming
    // it had none. The server stores the rate as a decimal (1% = 0.01) and
    // every consumer on this side works in percent, so it is converted once,
    // here at the boundary — the same conversion GloobalApi.resolveUser's
    // cashbackRate already goes through.
    // A SHARE ROW CARRIES NO SHARE OF ITS OWN.
    //
    // This was `row.cashbackRate * 100` for every row, and a share leg is a
    // row like any other: merchantShareFlow writes the payment's rate into
    // its metadata so the leg can say which rate produced it. So a Creator
    // Share arrived on this side claiming a Creator Share rate of its own,
    // and ReceiptModal treats any shareRate > 0 as "this movement carried a
    // share" — which grew a Creator Share tab on the Creator Share itself,
    // recomputing the rate against the share amount and presenting the
    // result as a release. It is what "it's releasing twice on the same
    // transaction" looks like from the outside.
    //
    // The reported payment, read back from the production records: 10,000
    // INR at the payee's 7%, one share leg of 700 INR (6.31 EUR to the
    // payer), three ledger lines. The receipt then offered a second release
    // of 7% of the 700 — 49.00 — that exists in no transaction, no ledger
    // entry and no balance. Across all 194 payments and 153 share legs there
    // are 153 cashback ledger lines, no share leg descended from another,
    // and the payer's own rate was never applied to anything.
    //
    // So no money ever moved for it. The fabrication was entirely in the
    // reading, and it stops here at the boundary rather than in the one
    // component that happened to render it, so no other consumer of these
    // rows can rediscover it.
    //
    // `isShareLeg` is the server's own `type`, the field it added precisely
    // so a client "cannot keep it out of a payments count".
    shareRate: isShareLeg || !Number.isFinite(Number(row.cashbackRate)) ? 0 : Number(row.cashbackRate) * 100,
    // What the share was actually worth, in whichever currency this row is
    // shown in: the payer sees their own credit back, the payee sees the
    // figure withheld from their side. Zero on a share leg, for the reason
    // above — the leg IS the share, it does not carry one.
    shareAmount: isShareLeg
      ? 0
      : isReceived
        ? Number(row.cashback) || 0
        : Number(row.cashbackCredit) || Number(row.cashback) || 0,
    // The share leg's own reference, so the receipt's share tab can name the
    // movement it is describing instead of reusing the payment's id.
    shareTxnId: isShareLeg ? "" : row.shareReferenceId || "",
    // WHERE THE SHARE WENT, as the server recorded it at the time.
    //
    // "assets" means it was placed in My Assets and has to be claimed
    // before it can be spent. "" means the payment predates that and the
    // share was credited straight into the Gloobal balance — which is what
    // the receipt said then, and what it must keep saying for that payment.
    // The receipt reads this instead of naming a destination from today's
    // behaviour, because a receipt is a record rather than a description of
    // how the app currently works.
    shareDestination: row.cashbackDestination || "",
    // The reference of the payment this row is attached to.
    //
    // On a PAYMENT that carried a share: its own reference, which is what the
    // share leg points back at. On a SHARE LEG: the payment it came from,
    // which the server writes into the leg's metadata and now surfaces as
    // `paymentReferenceId` — it was dropped before, so a share leg reached
    // this side with no way back to its payment and the Creator Share
    // receipt had nothing to show on its Payment tab.
    shareSourceTxnId: isShareLeg
      ? row.paymentReferenceId || ""
      : row.shareReferenceId ? row.referenceId || row.id || "" : "",
    // The short handles the two receipt links are addressed by, as the
    // server minted them. Not references and not ids — see
    // Transaction.receiptCode. A row restored without one shares the long
    // link, exactly as it did before these existed.
    receiptCode: row.receiptCode || "",
    shareReceiptCode: isShareLeg ? "" : row.shareReceiptCode || "",
    // The shop's creator name when this payment was made TO a shop — the
    // name a paid row is listed under, and the store its receipt opens.
    creatorHandle: row.creatorHandle || null,
    memo: row.note || "",
    ledgerRecordId: null,
    // Server rows predate this device's Personal/Creator split and carry
    // no role of their own; they belong to the personal book.
    role: "user",
    // Marks rows that came from MongoDB rather than this session's local
    // ledger, so the two can never be confused when reconciling.
    remote: true
  };
}

// Bug fix: a referral link (Dashboard.jsx's referralLink, resolved through
// the backend's GET /r/:symbolId route) redirects a new visitor here as
// https://gloobalv3.netlify.app/?ref=<encoded Gloobal ID> — but nothing
// ever read that query param back out. The redirect worked, the person
// landed on the right app, and then the referral code they'd followed a
// link specifically to use was nowhere: not pre-filled, not applied,
// gone. This reads it once on load so the referral dial pad already has
// it by the time someone reaches that step of registration; it's still
// editable and still optional (the referral stage has its own "Skip for
// now"), exactly as if they'd typed it in themselves.
// The other half of a shared receipt (see GET /t/:referenceId and the share
// handler in ReceiptModal): the app is opened at /?txn=<reference>.
//
// It is looked up in the viewer's OWN history and nowhere else. That is the
// privacy design: a receipt link travels through WhatsApp and gets forwarded,
// so anything that fetched the transaction by reference would let whoever
// ends up holding the link read a stranger's payment. Both people who were
// part of it already have the row; nobody else does.
// ?complaint=<id> — where a complaint's push notification lands when the
// app was closed. Read once; consumed when the dashboard opens it.
function readComplaintFromUrl() {
  if (typeof window === "undefined") return "";
  try {
    const raw = new URLSearchParams(window.location.search).get("complaint");
    return raw ? decodeURIComponent(raw).trim() : "";
  } catch (e) {
    return "";
  }
}

function readSharedTxnFromUrl() {
  if (typeof window === "undefined") return "";
  try {
    const raw = new URLSearchParams(window.location.search).get("txn");
    return raw ? decodeURIComponent(raw).trim() : "";
  } catch (e) {
    return "";
  }
}

// The floating map button hides itself for anything that fires this, and
// the camera already fires it — but the camera unmounts the moment a code
// resolves, so the map came straight back over the confirm card: the
// founder's screenshot has it sitting on the card's top-right corner.
// Fired for the whole overlay instead, camera and card alike.
function ScanOverlayBlocksMap() {
  useEffect15(() => {
    if (typeof window === "undefined") return undefined;
    const fire = (on) => window.dispatchEvent(new CustomEvent("gloobal:blockingOverlay", { detail: { active: on } }));
    fire(true);
    return () => fire(false);
  }, []);
  return null;
}

// A Gloobal QR opened by a phone's own camera app lands here as
// /p/<12 digits> (see backend/utils/gloobalPayLink.js). Read once on load;
// acted on once the person is signed in. Returns null when the path is not a
// pay link at all, or { gloobalId } where gloobalId is null for a malformed one.
function readPayLinkFromUrl() {
  if (typeof window === "undefined") return null;
  try {
    const path = window.location.pathname || "";
    // /p/, /u/ and /s/ — see gloobalPayLink.js for what the letter means.
    if (!/^\/[pus](\/|$)/.test(path)) return null;
    const read = readGloobalPayFromPath(path);
    return read || { gloobalId: null };
  } catch (e) {
    return null;
  }
}

function readReferralCodeFromUrl() {
  if (typeof window === "undefined") return "";
  try {
    const raw = new URLSearchParams(window.location.search).get("ref");
    return raw ? decodeURIComponent(raw).trim() : "";
  } catch (e) {
    return "";
  }
}
// The permissions gate (PermissionsGateScreen) is a once-ever onboarding
// screen, not something a returning visitor should see again on every
// page load — so whether it's been shown lives in localStorage rather
// than component state. Guarded the same way every other localStorage
// access in this app is: a private-mode throw or a disabled store just
// means "treat it as not yet seen" rather than crashing the app before
// it has even rendered anything.
var GLOOBAL_PERMISSIONS_GATE_KEY = "gloobal.permissionsGateSeen.v1";
function hasSeenPermissionsGate() {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(GLOOBAL_PERMISSIONS_GATE_KEY) === "1";
  } catch (e) {
    return true;
  }
}
function markPermissionsGateSeen() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GLOOBAL_PERMISSIONS_GATE_KEY, "1");
  } catch (e) {
    // No storage — the gate will simply show again next load, which is a
    // minor repeat, not a broken app.
  }
}
// Feature: the app map (the floating draggable icon + searchable screen
// list, see components/common/appMap.jsx) shows every registration-flow
// screen and every post-login destination in one list, with the ones that
// don't apply yet greyed out as "Locked." Which half is locked depends on
// whether this device has EVER finished registration — not whether
// someone happens to be signed in right now, since signing out again
// shouldn't hide Dashboard/Bank/Coin behind a lock the person already
// cleared once. So this needs its own persisted flag, independent of
// gloobalSessionSave/gloobalSessionClear (session identity, cleared on
// sign-out) — same "own localStorage key, guarded against a private-mode
// throw" shape as GLOOBAL_PERMISSIONS_GATE_KEY just above.
var GLOOBAL_HAS_REGISTERED_KEY = "gloobal.hasEverRegistered.v1";
function hasEverRegistered() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(GLOOBAL_HAS_REGISTERED_KEY) === "1";
  } catch (e) {
    return false;
  }
}
function markEverRegistered() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GLOOBAL_HAS_REGISTERED_KEY, "1");
  } catch (e) {
    // No storage — the app map will simply treat every future visit as
    // "not yet registered" on this device, which just re-locks a few map
    // entries; it doesn't block using the app itself.
  }
}
// src/App.jsx
function GloobalId() {
  const stageRef = useRef13(null);
  const particlesRef = useRef13([]);
  const elsRef = useRef13({});
  const rafRef = useRef13(null);
  const dimsRef = useRef13({ w: 0, h: 0 });
  const frameRef = useRef13(0);
  const [, forceRender] = useState19(0);
  const [verifying, setVerifying] = useState19(false);
  // Root-level toast — used by flows that complete above any single
  // screen (Scan & Pay, the business "Pay" sheet) after those screens
  // have already closed, so there's no longer a screen-local toast to
  // borrow. Same visual language as every other screen's toast pill.
  const [rootToast, setRootToast] = useState19(null);
  const showToast = (msg) => {
    setRootToast(msg);
    setTimeout(() => setRootToast(null), 1800);
  };
  const [heroCircleColors, setHeroCircleColors] = useState19(() => [
    randomLogoFlipColor(),
    randomLogoFlipColor(),
    randomLogoFlipColor(),
    randomLogoFlipColor()
  ]);
  useEffect15(() => {
    const interval = setInterval(() => {
      const i = Math.floor(Math.random() * 4);
      setHeroCircleColors((prev) => {
        const next = [...prev];
        next[i] = randomLogoFlipColor(prev[i]);
        return next;
      });
    }, 1200);
    return () => clearInterval(interval);
  }, []);
  const [heroCircleTapped, setHeroCircleTapped] = useState19(false);
  const handleHeroCircleTap = () => {
    setHeroCircleTapped(true);
    setTimeout(() => setHeroCircleTapped(false), 1400);
  };
  // accountCreatedAt is declared further down, right after registeredUser
  // (see there for why) — this used to be its own useState(() => new
  // Date()) sitting here with no connection to the account at all.
  const accountCreatedAtFallbackRef = useRef13(null);
  const [essentialsIHaveEnough, setEssentialsIHaveEnough] = useState19(false);
  const handleToggleEssentialsIHaveEnough = () => setEssentialsIHaveEnough((v) => !v);
  const [sendMoneyHistory, setSendMoneyHistory] = useState19(SEND_MONEY_HISTORY_SEED);

  // Bumped whenever something happened that could move a Gloobal Coverage
  // figure. GloobalCoverageScreen refetches on it; nothing else reads it.
  //
  // This is the entire live-update mechanism, and it is a counter rather
  // than a poll on purpose. Coverage's figures used to be derived in the
  // browser from sendMoneyHistory, which is refreshed by the 30-second
  // dashboard poll and merged APPEND-ONLY — so a row recorded wrong stayed
  // wrong for the whole session, and a Scan & Pay never moved the total at
  // all until a full reload. Now the figures come from the server, and this
  // says when to ask again: after a payment, and on an account change. No
  // new interval anywhere.
  const [coverageRefreshToken, setCoverageRefreshToken] = useState19(0);
  const bumpCoverage = () => setCoverageRefreshToken((n) => n + 1);
  const { openComplaint, submitLocationObservation } = useProvenanceAndDisputes();
  // Best-effort, fire-and-forget location report for a transaction
  // that has ALREADY completed. This is deliberately the only
  // fire-and-forget piece left anywhere in the transaction flow — by
  // design, since location must never gate or delay financial
  // validity. It calls the same submitLocationObservation() interface
  // a real receiver device would call with its own reading; here it's
  // this device reporting its own (sender-role) observation.
  // Which payment, if any, is currently stopped for want of a location.
  // `retry` is the exact action that was blocked, so the modal's retry
  // button resumes THAT payment rather than dumping the person back on a
  // screen to start again.
  const [locationGate, setLocationGate] = useState19(null);
  const [locationGateBusy, setLocationGateBusy] = useState19(false);
  // The reading captured by the gate, handed to reportSenderLocation so the
  // observation submitted to provenance is the SAME one the payment was
  // authorised against — not a second fix taken moments later, which could
  // legitimately differ and would make the record disagree with the check.
  const gatedLocationRef = useRef13(null);

  // Every payment funnels through this. Returns true to proceed.
  //
  // On a block it opens the modal and remembers `retry`, so the person
  // resumes the same payment instead of navigating back to it.
  const passesLocationGate = async ({ retry, isRetry = false } = {}) => {
    const gate = await ensurePaymentLocation({ retry: isRetry });
    if (gate.ok) {
      gatedLocationRef.current = gate.observation;
      setLocationGate(null);
      return true;
    }
    gatedLocationRef.current = null;
    setLocationGate({ reason: gate.reason, retry: retry || null });
    return false;
  };

  const handleLocationGateRetry = async () => {
    if (locationGateBusy) return;
    setLocationGateBusy(true);
    try {
      const pending = locationGate;
      // `isRetry` asks for the longer timeout — the retry case is usually
      // someone who allowed and needs the extra seconds for a fix.
      const ok = await passesLocationGate({ retry: pending && pending.retry, isRetry: true });
      if (ok && pending && pending.retry) pending.retry();
    } finally {
      setLocationGateBusy(false);
    }
  };

  // Location report for a transaction that has already completed.
  //
  // The capture no longer happens here. The gate above takes the reading
  // BEFORE the payment (see hooks/usePaymentLocation.js for why that
  // reversed the previous "never gate financial validity" design), and this
  // submits that same reading. The fallback capture stays for the one path
  // that can reach here without having gone through the gate — a history
  // entry replayed from an older record — so provenance still gets an
  // honest status rather than nothing.
  const reportSenderLocation = (txnId) => {
    (async () => {
      const observation = gatedLocationRef.current
        || await captureBrowserGeo().catch(() => new LocationObservation({ status: LOCATION_STATUS.UNAVAILABLE }));
      submitLocationObservation({ txnId, role: "sender", observation });
    })();
  };
  const handleSendMoneyComplete = (entry) => {
    // Confirmation in the tray, then the one-and-only notification ask.
    // Order matters: notifyPaymentSent is a no-op until permission exists,
    // so the FIRST payment gets no tray entry and only the offer — asking
    // and firing in the same breath would show a notification before the
    // person had answered the prompt about notifications.
    // The figure and the currency come off the ROW, through the same choice
    // the receipt makes (gloobalOwnMoneyOf). They used to be `entry.amount`
    // — this device's pre-settlement estimate — formatted in whatever
    // currency the dial country happened to be set to. Both were wrong, and
    // wrong differently: paying £20 from India put "−2,396.05₹" in the tray
    // over a payment the receipt, the notification card and the server's own
    // push all called ₹2,105.20.
    const sentMoney = gloobalOwnMoneyOf(entry, COUNTRY_CURRENCY[dialCountry.iso] || "USD");
    notifyPaymentSent({
      txnId: entry.txnId,
      amount: sentMoney.amount,
      currencySymbol: CURRENCY_SYMBOL[sentMoney.currency] || "",
      currencyCode: sentMoney.currency,
      to: entry.name,
      occurredAt: entry.occurredAt || null
    });
    offerPaymentNotificationsAfterPayment();
    // Tags which side of the account (Personal/Creator) this
    // transaction belongs to, for the role-separated history/chart
    // split in DashboardScreen — not to be confused with the
    // sender/receiver location role used just above.
    setSendMoneyHistory((h) => sortTransactionsNewestFirst([{ ...entry, role: activeShareRole }, ...h]));
    // Money moved, so Gloobal Coverage's figures have. Send Money.
    bumpCoverage();
    // Posting + completion + provenance + complaint window + asset-seed
    // eligibility already happened atomically inside executeTransaction
    // (called from SendMoneyScreen.completePayment, via
    // onExecuteTransaction) before this history entry ever existed.
    // Nothing financial is fired-and-forgotten here — only the location
    // report, which is independent by design (see reportSenderLocation).
    reportSenderLocation(entry.txnId);
    // And, if this payment was a gift to a Hooman Project, tell the project
    // which payment it was. Nothing financial here either: the money has
    // already settled, and this only decides whether a list knows about it.
    // Unobserved on purpose, exactly as the location report above is.
    attributePendingContribution(entry);
  };
  // POST /api/transactions/send — the authoritative leg of a payment.
  // Runs before the local ledger posts (see SendMoneyScreen.completePayment),
  // so a server rejection means nothing is posted anywhere.
  //
  // Returns { ok } | { ok: false, reason } | { ok: true, skipped: true }.
  // `skipped` is deliberate and not a failure: a payment can only be
  // recorded server-side when BOTH parties are real registered accounts.
  // This build's receiver pickers are local placeholders, so anything
  // aimed at one of those has no counterparty in MongoDB to credit and
  // stays a local simulation. Scan & Pay against a real scanned Gloobal
  // ID, or any receiver carrying a resolvable symbolId, goes remote.
  const handleRemoteSend = async ({
    txnId,
    amount,
    currency,
    // The explicit corridor, passed straight through to the server, which
    // recomputes whichever side was not typed and refuses the payment if its
    // own arithmetic disagrees. A caller that sends none of these still works
    // — the legacy `amount`/`currency` pair below is read as the receiver's
    // face value, which is what it has always meant.
    amountBasis,
    sourceAmount,
    sourceCurrency,
    destinationAmount,
    destinationCurrency,
    receiver,
    pin: sendPin,
    payMethodLabel,
    memo,
    clientRequestId
  }) => {
    // No payment of nothing, from any caller. Checked before the location
    // gate and before the skipped/local-simulation exits, so a zero or
    // negative amount never reaches the server, the local ledger, History or
    // a receipt. The server refuses it again; this is not the authority.
    const typedLegAmount = amountBasis === "source"
      ? (sourceAmount ?? amount)
      : (destinationAmount ?? amount);
    if (!isPositivePaymentAmount(typedLegAmount)) {
      return { ok: false, reason: "Enter an amount greater than zero." };
    }
    // Before anything else, including the skipped/local-simulation exits
    // below — a simulated send still writes a history row, and a gate with
    // an exception is not a gate.
    if (!(await passesLocationGate({ retry: null }))) {
      return { ok: false, reason: "Location is needed before this payment can go through." };
    }
    const senderSymbolId = registeredUser && registeredUser.symbolId;
    const receiverSymbolId = receiver && (receiver.gloobalId || receiver.symbolId || receiver.id);
    if (!senderSymbolId) return { ok: true, skipped: true, reason: "not signed in against the backend" };
    if (!receiverSymbolId) return { ok: true, skipped: true, reason: "receiver has no GLOOBAL ID" };
    try {
      const result = await GloobalApi.sendTransaction({
        senderSymbolId,
        receiverSymbolId,
        amountBasis,
        sourceAmount,
        sourceCurrency,
        destinationAmount,
        destinationCurrency,
        amount,
        // No longer defaulted to rupees. A missing currency is now simply
        // absent, and the server derives both sides from the two accounts'
        // own countries — claiming INR for an account that is not Indian is
        // how a mislabelled leg used to get through.
        currency,
        note: memo || "",
        pin: sendPin,
        payMethod: payMethodLabel || "",
        // Paid at the receiver's SHOP (their creator name), not at them as a
        // person. The server checks the receiver really has a creator name
        // and records it on the payment; history and receipts read it back.
        toCreator: Boolean(receiver && receiver.creatorHandle),
        // Set only when this payment sends a complaint's money back.
        complaintId: (receiver && receiver.complaintId) || undefined,
        // The ID this device already minted for the payment, so the record
        // MongoDB stores is the same one the sender's receipt, complaint
        // window and location report are keyed by — and, because the
        // receiver reads their history from that record, the same one the
        // other side sees. The backend validates it and mints its own if it
        // is malformed or already taken, so this is a request, not a claim.
        referenceId: txnId || "",
        // The backend also runs a 15-second identical-resend guard; this
        // makes the dedup explicit rather than time-based.
        idempotencyKey: clientRequestId || ""
      });
      // The server just moved money, so its balance is now ahead of the
      // local ledger's own view of the same payment. Re-read and reconcile
      // rather than assuming the two arrived at the same number: the
      // backend also withholds cashback and can apply its own adjustments
      // this client never sees.
      setRefreshBalanceToken((n) => n + 1);
      // What the server actually recorded, handed back so the receipt can
      // quote the stored reference rather than assuming its own was kept,
      // and can show the Creator Share the payee's account really charged.
      const transaction = (result && result.transaction) || {};
      // The Creator Share's own transaction, minted server-side alongside
      // the payment with its own referenceId. Passed up so the share
      // receipt can quote ITS id instead of reusing the payment's — the two
      // are different movements between different pairs of parties and must
      // not be identifiable by the same reference.
      const share = (result && result.shareTransaction) || null;
      return {
        ok: true,
        transactionId: transaction.referenceId || txnId || "",
        // The short handle the payment's receipt link is addressed by (see
        // GET /t/ and Transaction.receiptCode). Carried alongside the
        // reference, never instead of it: the reference is what the receipt
        // shows and what history is matched on, and this is only what goes
        // in the path of a shared URL. Empty when the payment stayed local,
        // where there is no server row to address.
        receiptCode: transaction.receiptCode || "",
        shareTransactionId: (share && share.referenceId) || "",
        // The Creator Share leg's own handle, which is a different link to a
        // different movement.
        shareReceiptCode: (share && share.receiptCode) || "",
        shareAmount: Number(share && share.amount) || 0,
        shareCurrency: (share && share.currency) || "",
        // The share's OTHER side — what the payee gave, in their currency —
        // as the server stored it on the share leg. shareAmount/shareCurrency
        // above are the payer's side. Null when the server did not say, and
        // the receipt then shows the share's one known side rather than a
        // figure worked out from the payment.
        sharePayeeAmount: gloobalRecordedFigure(share && share.payeeAmount),
        sharePayeeCurrency: (share && share.payeeCurrency) || null,
        cashback: Number(result && result.cashback) || 0,
        cashbackRate: Number(result && result.cashbackRate) || 0,
        // What actually left this account, in this account's own currency,
        // as the SERVER computed it. The local history row records these
        // rather than the typed figure: on a cross-border payment the typed
        // figure is the receiver's side, and a row holding it without a
        // currency is what made a ₹200 request appear as −£200.00 in a UK
        // account's history.
        debitAmount: gloobalRecordedFigure(result && result.debitAmount),
        senderCurrency: (result && result.senderCurrency) || null,
        // The rest of what the server recorded, passed through untouched for
        // the RECEIPT (see buildTransactionSnapshot's `recorded`): the
        // receiver's credited face value, its currency, and the rate in the
        // direction it was stored — 1 unit of destinationCurrency =
        // fxRate units of senderCurrency. Null when the server did not say,
        // and the receipt then shows no conversion rather than inventing one.
        destinationAmount: gloobalRecordedFigure(result && result.destinationAmount),
        destinationCurrency: (result && result.destinationCurrency) || null,
        fxRate: gloobalRecordedFigure(result && result.fxRate),
        fxRateSource: (result && result.fxRateSource) || null,
        payeeReceives: gloobalRecordedFigure(result && result.payeeReceives)
      };
    } catch (err) {
      return { ok: false, reason: err.message };
    }
  };
  const handleReportTransactionIssue = (txnId, reason) => openComplaint({ txnId, raisedBy: "sender", reason });
  const bankBalance = useBankBalance();
  const { executeTransaction, settleEssentialsToBank, settleReferralToBank, applyEssentialsPoolSubsidy, reconcileBankBalance, reconcilePaylaterDue, hydrateGrantsFromServer, resetForAccountSwitch } = useTransactionActions();
  const [showScanScreen, setShowScanScreen] = useState19(false);
  // Backdrop color behind the QR/scan area — same "pick one random
  // hero color per session" pattern as the Bank/Coin/About Us info
  // screens, so the scanner isn't locked to a single fixed tint.
  const [scanHeroColor] = useState19(() => randomLogoFlipColor());
  const [scanCameraAccessGranted, setScanCameraAccessGranted] = useState19(false);

  // ── A GRANT ALREADY ON RECORD SKIPS THE ASK ─────────────────────────
  //
  // The browser remembers "granted" across visits, so somebody who allowed
  // the camera last week should be handed the camera, not asked a second
  // time for permission they have already given. Without this, the ask was
  // the first thing on screen every single time the scanner opened, which
  // is a tap and a half-second between the person and the code they are
  // standing in front of.
  //
  // Checked when the screen OPENS rather than once at mount: the answer can
  // change while the app is running, since site settings are reachable
  // without a reload.
  //
  // Silent when the browser will not answer. cameraPermissionState returns
  // null for an engine with no Permissions API or no "camera" descriptor,
  // and null means "ask" — exactly the behaviour this replaces, so nothing
  // regresses on a browser that cannot say.
  useEffect15(() => {
    if (!showScanScreen) return undefined;
    let alive = true;
    cameraPermissionState().then((state) => {
      if (alive && state === "granted") setScanCameraAccessGranted(true);
    });
    return () => { alive = false; };
  }, [showScanScreen]);
  // The account a scanned Gloobal QR resolved to, as the SERVER named it.
  // A Gloobal QR is a static pay link (see backend/utils/gloobalPayLink.js):
  // it names an account and nothing else — no amount, no name, no session —
  // so the only thing to do with one is confirm who it is and open Send Money.
  const [scanPayee, setScanPayee] = useState19(null);
  // A shop's scan card shows its name; the eye beside the name reveals the
  // account details behind it — the GLOOBAL ID and the shop's number.
  // Hidden again for every new scan.
  const [scanDetailsShown, setScanDetailsShown] = useState19(false);
  useEffect15(() => { setScanDetailsShown(false); }, [scanPayee]);
  const [scanError, setScanError] = useState19(null);
  // Set after a lookup failed. The camera stays paused until the person taps
  // the button, because unpausing resets the scanner's dedupe and the same
  // code, still in frame, would otherwise be looked up again instantly and
  // forever. `retry` is the label: "Try again" for a network failure, "Scan
  // again" for an answer (not found, own code).
  const [scanRetry, setScanRetry] = useState19(null);
  const [scanResolving, setScanResolving] = useState19(false);
  // Guards re-entry synchronously: BarcodeDetector and jsQR can both hand a
  // code up before React has re-rendered with scanResolving set.
  const scanBusyRef = useRef13(false);
  // The gallery path. Same handler as the live camera, so a code that reads
  // from an image behaves identically to one held up to the lens.
  const scanGalleryInputRef = useRef13(null);
  const handleScanGalleryFile = async (event) => {
    const file = event.target.files && event.target.files[0];
    // Clearing the value is what lets the same picture be chosen twice in a
    // row: without it the input's change event never fires again.
    event.target.value = "";
    if (!file) return;
    setScanError(null);
    setScanRetry(null);
    let payload = null;
    try {
      payload = await decodeGloobalQrFromImageFile(file);
    } catch (e) {
      setScanError("That image could not be read.");
      return;
    }
    if (!payload) {
      setScanError("No QR code found in that image.");
      return;
    }
    // Move into the scan view before resolving: the resolving state, the
    // confirm card and any error are all rendered on that side.
    setScanCameraAccessGranted(true);
    await handleQrScanned(payload);
  };

  // One lookup for every way into paying a Gloobal QR — the camera, the
  // gallery, and a /p/<digits> link opened from a phone's own camera app.
  // Resolves to { ok: true, payee } or { ok: false, error, retryable }.
  const resolveGloobalPayee = async (gloobalId) => {
    let user = null;
    try {
      user = await GloobalApi.resolveUser(gloobalId);
    } catch (err) {
      // Only a definite "nobody" is an answer about the QR. A cold start,
      // timeout or 5xx says nothing about the account behind it.
      const notFound =
        (err instanceof GloobalApiError && err.status === 404) ||
        (!(err instanceof GloobalApiError) && err && err.message === "No user found.");
      if (notFound) return { ok: false, error: "No GLOOBAL account uses this QR." };
      return { ok: false, retryable: true, error: (err && err.message) || "Couldn't look this QR up. Check your connection." };
    }
    if (!user || !user.symbolId) return { ok: false, error: "No GLOOBAL account uses this QR." };
    const myId = (registeredUser && registeredUser.symbolId) || secureId;
    if (myId && (user.symbolId === myId || gloobalId === myId)) {
      return { ok: false, error: "This is your own GLOOBAL QR." };
    }
    return {
      ok: true,
      payee: {
        // The ID the backend holds NOW, not the one printed in the QR.
        gloobalId: user.symbolId,
        // fullName is the mobile number on accounts created before the name
        // step existed; `nameIsMobile` is the server's own answer to that
        // (GET /api/users/resolve masks the number it returns).
        name: user.fullName && !user.nameIsMobile ? user.fullName : "GLOOBAL User",
        mobileNumber: user.mobileNumber || "",
        // The payee's OWN registered country — never inferred from the payer's.
        countryIso: user.countryIso || null,
        // As a percent, the unit the rest of the app carries it in.
        shareRate: (Number(user.cashbackRate) || 0) * 100
      }
    };
  };
  // Hands a resolved payee to Send Money, which opens past its search step on
  // the amount. Nothing is sent from here; the amount is entered there.
  const [sendPrefillReceiver, setSendPrefillReceiver] = useState19(null);
  // The category the Send screen should open with already picked, when it
  // was opened from a "Pay for X" rather than from the Send button. Null
  // for an ordinary send — the strip then opens with nothing chosen, which
  // is what "optional" has to mean.
  const [sendPrefillChoiceId, setSendPrefillChoiceId] = useState19(null);
  const openSendToPayee = (payee) => {
    const payeeCountry = COUNTRY_BY_ISO[String(payee.countryIso || "").toUpperCase()] || dialCountry;
    setSendPrefillReceiver({
      country: payeeCountry.name,
      flag: payeeCountry.flag,
      iso: payeeCountry.iso,
      id: payee.gloobalId,
      // The name on the Send screen has to match the card the person just
      // tapped Pay on. Scanning a shop and then being asked to confirm a
      // payment to somebody's given name reads as the wrong recipient,
      // which on a payment screen is the one doubt worth never creating.
      name: (payee.creator && creatorDisplayName(payee.creator)) || payee.name,
      // Paid at the shop: history and the receipt name the shop by its
      // handle and offer its store (0138).
      creatorHandle: (payee.creator && payee.creator.handle) || null,
      mobileNumber: payee.mobileNumber,
      currency: COUNTRY_CURRENCY[payeeCountry.iso] || "USD",
      shareRate: payee.shareRate,
      registered: true,
      // A complaint's "Send back": the amount is already decided, and the
      // case it closes rides along to the server.
      prefillAmount: Number(payee.prefillAmount) > 0 ? String(Number(payee.prefillAmount).toFixed(2)) : "",
      complaintId: payee.complaintId || null
    });
    setShowScanScreen(false);
    setScanPayee(null);
    setScanError(null);
    setScanRetry(null);
    setScanCameraAccessGranted(false);
    setActiveScreen("send");
  };

  // ── GIVING TO A HOOMAN PROJECT ────────────────────────────────────────
  //
  // Which project the payment now being made is FOR, and whether the giver
  // allowed their name to be printed. Set when they tap Continue on the
  // Coverage screen's give sheet, read once the payment lands, cleared
  // either way.
  //
  // A ref rather than state, and that is not an optimisation. Send Money
  // opens over Coverage and the completion handler fires from inside it, by
  // which point several renders have gone by; a state value captured in a
  // closure at the moment the sheet closed would be the value from before
  // the sheet existed. The ref is read at the moment it is needed.
  const contributionTargetRef = useRef29(null);

  // Opens Send Money with the project's owner already resolved and filled
  // in, exactly as scanning their QR would.
  //
  // THE PAYMENT IS AN ORDINARY PAYMENT. There is no project-payment path:
  // the money goes to the owner's account through the same route, gate,
  // ledger and receipt as everything else, and the project is told about it
  // afterwards. See server/models/Contribution.js for why it is built that
  // way round.
  const openSendToProject = async ({ project, showName }) => {
    if (!project || !project.ownerSymbolId) {
      showToast("This project has no account to pay.");
      return;
    }
    const result = await resolveGloobalPayee(project.ownerSymbolId);
    if (!result.ok) {
      // resolveGloobalPayee words its failures for a scanned QR ("No
      // Gloobal account uses this QR"), which is not what happened here.
      // The retryable case keeps its own message, since "check your
      // connection" is true in both.
      showToast(result.retryable
        ? result.error
        : "This project's account could not be found.");
      return;
    }
    contributionTargetRef.current = {
      projectId: project.id,
      title: project.title,
      showName: Boolean(showName)
    };
    requestCloseActiveScreen();
    openSendToPayee(result.payee);
  };

  // Called once a payment has completed, from handleSendMoneyComplete.
  //
  // Everything here is best-effort and nothing in it can lose money: by the
  // time it runs the payment has already settled. A failure means the gift
  // arrived but the project does not yet know it was a gift, which the
  // person is told plainly rather than left to discover from a list that
  // does not mention them.
  const attributePendingContribution = async (entry) => {
    const target = contributionTargetRef.current;
    if (!target) return;
    contributionTargetRef.current = null;
    // A payment that never reached the server has no stored row to point
    // at, and the project's figures are counted from stored rows. Saying so
    // beats a failed call whose message would be about a reference id.
    if (!entry || entry.status === "simulated") {
      showToast("That payment stayed on this device, so the project wasn't updated.");
      return;
    }
    // confirmedTxnId — the reference the SERVER kept, not the one this
    // device minted, which the send route is free to replace.
    const referenceId = entry.txnId;
    if (!referenceId) return;
    try {
      await GloobalApi.attributeContribution(target.projectId, {
        referenceId,
        showName: target.showName
      });
      announceProjectContribution(target.projectId);
      bumpCoverage();
      showToast(`Your gift to ${target.title} is recorded.`);
    } catch (err) {
      // Deliberately specific. "Something went wrong" after a payment has
      // left the account is the most frightening message this app could
      // show, and it would be false: the money arrived.
      showToast("Your payment went through, but we couldn't add it to the project yet.");
    }
  };

  // ── DRAWING ON THE ESSENTIALS POOL ────────────────────────────────
  //
  // THIS WAS DEAD CODE. applyEssentialsPoolSubsidy has been exposed by
  // useTransactionActions and destructured here for a long time, and the
  // orchestrator's own comment says "a caller (currently Scan & Pay)
  // applies this once" — but no such caller exists anywhere in the
  // frontend. Grep it: the destructure above was the only reference. So
  // the Essentials baseline has been computed, displayed and masked all
  // this time without ever being spendable.
  //
  // This is the caller. It runs BEFORE the payment, tops the account's
  // own bank balance up by whatever the pool still has today, and then
  // gets out of the way — the payment that follows is an ordinary
  // payment from an ordinary bank balance, through the same route and
  // the same ledger as every other one.
  //
  // That is the whole reason it is built this way rather than as a
  // fourth account to deduct from. Both produce the same split on screen
  // (Essentials covers what it can, the bank covers the rest); only this
  // one leaves /api/transactions/send with exactly one source of funds
  // to reason about.
  const drawEssentialsForPayment = async (amount) => {
    const typed = Number(amount);
    if (!Number.isFinite(typed) || typed <= 0) return { applied: 0 };
    const iso = dialCountry && dialCountry.iso;
    const baseline = computeEssentialsBaseline(iso);
    const currency = COUNTRY_CURRENCY[iso] || "USD";
    try {
      const result = applyEssentialsPoolSubsidy({
        // Never more than the payment: a subsidy larger than what is
        // being paid for would be a standing top-up, which is a
        // different product and not what was asked for.
        requestedAmount: typed,
        dailyLimit: Number(baseline.dailyTotal) || 0,
        currency
      });
      const applied = Number(result && result.subsidyAmount) || 0;
      // The balance moved underneath the dashboard, so re-read it rather
      // than assuming this device's arithmetic matches the server's.
      if (applied > 0) setRefreshBalanceToken((n) => n + 1);
      return { applied, code: result && result.code };
    } catch (err) {
      // A failed subsidy is not a failed payment. The pool is untouched
      // (the orchestrator rolls its own snapshot back), and the payment
      // that follows simply draws entirely on the bank.
      return { applied: 0, code: "SUBSIDY_FAILED" };
    }
  };

  const handleQrScanned = async (rawCode) => {
    if (scanBusyRef.current || scanRetry) return;
    setScanError(null);
    const parsed = parseGloobalPayPayload(rawCode);
    if (!parsed) {
      // Never opened or followed — a QR's text is only ever parsed.
      setScanError(
        /^upi:/i.test(String(rawCode || "").trim())
          ? "This is a UPI QR. GLOOBAL can't pay UPI codes."
          : "This isn't a GLOOBAL QR code."
      );
      return;
    }
    scanBusyRef.current = true;
    setScanResolving(true);
    try {
      const result = await resolveGloobalPayee(parsed.gloobalId);
      if (result.ok) {
        // ── IS THIS A SHOP OR A PERSON? ─────────────────────────────────
        //
        // A Gloobal QR carries an ID and nothing else, so the card has
        // always drawn whatever the account lookup returned — a profile
        // photo and a person's name. For an account that is also a
        // creator that is the wrong half of their identity: somebody who
        // scanned a sticker on a tea stall got the owner's face and the
        // owner's given name, with no sign of the shop they were standing
        // in front of.
        //
        // One extra lookup, and only to decide what the card SAYS. A
        // failure here leaves the person's own details, which is what the
        // card showed before and is never wrong, only less specific.
        //
        // ── THE CODE SAYS WHICH SIDE IT IS, AND THE CARD BELIEVES IT ───
        //
        // That lookup used to be the whole decision: an account with a
        // creator name was shown as its shop whichever code had been
        // scanned — because both codes were the same bytes and there was
        // nothing else to go on. So the personal code showed the shop too.
        //
        // The code now carries a side (gloobalPayLink.js). A personal
        // code is never looked up as a shop at all: the person's own name
        // and ID are what they chose to show, and a lookup that could
        // only overrule them is a lookup not worth making. A shop code
        // and an unmarked old code still look the shop up, and the old
        // code keeps its old behaviour so no printed sticker changes.
        let creator = null;
        if (parsed.side !== "person") {
          try {
            creator = await GloobalApi.getCreatorProfile(parsed.gloobalId);
          } catch (e) {
            creator = null;
          }
        }
        const named = creator && typeof creator.handle === "string" && creator.handle.trim();
        // A scan of a shop's code counts for that shop's owner insights.
        if (named) GloobalApi.creatorEvent(parsed.gloobalId, "scan");
        setScanPayee(named ? { ...result.payee, creator } : result.payee);
      } else {
        setScanError(result.error);
        setScanRetry(result.retryable ? "Try again" : "Scan again");
      }
    } finally {
      scanBusyRef.current = false;
      setScanResolving(false);
    }
  };
  const handleSendToScanned = () => {
    if (scanPayee) openSendToPayee(scanPayee);
  };
  // Business/travel "Pay" flow (Dashboard's More sheet) also runs
  // through executeTransaction — the same one canonical lifecycle as
  // Send Money and Scan & Pay. No separate ledger-posting path is left
  // anywhere in the app; an Essentials grant can only ever come from a
  // real, first-time completion inside executeTransaction.
  // Async now: it consults the location gate before posting, like every
  // other payment path. Its callers fire it from an onClick and ignore the
  // return value, so the promise is unobserved by design.
  const handlePayBusiness = async ({ key, label, chip, amount, cashbackRate, payMethodLabel = null }) => {
    const payBusinessArgs = { key, label, chip, amount, cashbackRate, payMethodLabel };
    if (!(await passesLocationGate({ retry: () => handlePayBusiness(payBusinessArgs) }))) return;
    if (amount <= 0) return;
    const txnId = genTxnId();
    const now = /* @__PURE__ */ new Date();
    const methodKey = !payMethodLabel ? "bank" : payMethodLabel.includes("PayLater") ? "paylater" : "bank";
    const result = executeTransaction({
      txnId,
      amount,
      payMethodLabel,
      memo: `Pay ${label}`,
      name: label,
      shareRatePercent: (cashbackRate || 0) * 100,
      time: formatClockTime(now),
      now,
      clientRequestId: generateRequestId()
    });
    if (!result.ok) {
      showToast(result.reason || "Insufficient balance");
      return;
    }
    const historyEntry = {
      name: label,
      // A business paid from the More sheet is a merchant on this account's
      // own ground: the flow carries no country of its own (see the argument
      // list above — key, label, chip, amount, cashbackRate, method), so the
      // account's country is the only country there is to name, and it is the
      // right one for a merchant paid locally. Recorded rather than left
      // undefined so this row's receipt carries a flag like every other
      // receipt; without it a Pay-a-Business receipt showed a name and no
      // flag at all.
      flag: dialCountry.flag,
      counterpartyIso: dialCountry.iso,
      date: now.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      amount,
      // The currency that amount is in. Pay a Business settles in the
      // account's own currency, and saying so is what stops TransactionRow
      // falling back to the dial country's unit and sumHistoryAmount
      // treating the figure as already converted — the same gap the Send
      // Money row had.
      currency: COUNTRY_CURRENCY[dialCountry.iso] || "USD",
      status: "completed",
      method: methodKey,
      time: formatClockTime(now),
      // The instant this payment happened — what every list sorts by.
      occurredAt: now.toISOString(),
      txnId,
      shareRate: (cashbackRate || 0) * 100,
      ledgerRecordId: result.ledgerRecordId,
      role: activeShareRole
    };
    setSendMoneyHistory((h) => sortTransactionsNewestFirst([historyEntry, ...h]));
    // Money moved, so Gloobal Coverage's figures have. Pay business — the
    // other path whose rows the old client-side total silently dropped.
    bumpCoverage();
    reportSenderLocation(txnId);
  };
  const assetSeeds = useEssentialsGrants();
  const paylaterHistory = usePaylaterHistory();
  const handleSettleAssetsToBank = (amount) => {
    if (amount <= 0) return;
    settleEssentialsToBank(amount);
  };
  const handleSettleReferralToBank = (amount) => {
    if (amount <= 0) return;
    settleReferralToBank(amount);
  };
  const handleExecuteTransaction = executeTransaction;
  const [stage, setStage] = useState19(() => hasSeenPermissionsGate() ? "phone" : "permissions");
  // Backs the app map's lock state (see the comment on hasEverRegistered
  // above) — mirrored into React state, rather than read straight from
  // localStorage each render, purely so the map's "Dashboard/Bank/Coin…"
  // section re-renders unlocked the instant registration or login first
  // succeeds, without needing a remount to notice the flag changed.
  const [everRegistered, setEverRegistered] = useState19(hasEverRegistered);
  const handleContinueFromPermissionsGate = () => {
    markPermissionsGateSeen();
    setStage("phone");
  };
  const [flipping, setFlipping] = useState19(false);
  const [secureId, setSecureId] = useState19("");
  // A second, separate Gloobal ID for the Creator side of the account
  // — scanning/showing "your code" while in Creator mode now shares a
  // real, different identifier than Personal mode, not the same
  // secureId reused for both. Generated once per account, stably, the
  // same way suggestedRegId is.
  // The Creator ID IS the account's Gloobal ID.
  //
  // It used to be `genSuggestedId(12)` — a fresh random twelve symbols minted
  // in the browser on every load, stored nowhere and registered with nothing.
  // The string "creatorId" does not appear in server.js at all. So the code
  // shown in Creator mode resolved to no account: scanning it produced "No
  // Gloobal account is registered under this ID", the payment could not
  // settle against the backend, and the identifier was different again the
  // next time the app opened.
  //
  // The separate identifier was not needed even in principle. Creator Share
  // is a property of the PAYEE'S ACCOUNT — the send route reads
  // `receiver.cashbackRate` — so it already applies to any payment made to
  // this person, whichever code was scanned. Splitting the identity did not
  // enable Creator Share; it prevented it, by pointing payers at an ID that
  // belonged to nobody.
  const creatorId = secureId;
  // Mirrors DashboardScreen's own shareRole (that component owns the
  // toggle and all of its UI) up to this level, so history rows written
  // here record which role the payment was made as.
  const [activeShareRole, setActiveShareRole] = useState19("user");
  const [suggestedRegId] = useState19(() => genSuggestedId(12));
  // Which explain-this-screen sheet is open: null, "symbols", or
  // "referral". One piece of state rather than two booleans, because the
  // two sheets are mutually exclusive by construction — they belong to
  // different stages, so there is no state in which both should be open,
  // and two booleans would let one exist.
  const [helpSheet, setHelpSheet] = useState19(null);
  const [referralCode, setReferralCode] = useState19(readReferralCodeFromUrl);
  // The ?ref= param has done its job once it's been read into state above —
  // left in place it would keep re-seeding referralCode (clobbering an edit
  // or a deliberate clear) on every remount, and it would sit in the address
  // bar and browser history indefinitely. Same cleanup shape as
  // closeDiagnostics' hash removal below: strip the one param this app
  // added, leave everything else in the URL untouched.
  useEffect15(() => {
    if (typeof window === "undefined" || !window.location.search.includes("ref=")) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("ref");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, []);
  const [pin, setPin] = useState19("");
  const [otp, setOtp] = useState19("123456");
  const [dialCountry, setDialCountry] = useState19(() => TOP_COUNTRIES.find((c) => c.iso === "IN") || TOP_COUNTRIES[0]);
  // dialCountry starts on India because registration has to start SOMEWHERE
  // before anyone has said where they are. For a signed-in account that is no
  // longer a guess — the backend returns countryIso on every response that
  // carries a user (login, registration, profile) — and leaving the initial
  // guess in place is what made a British or Kenyan account show an Indian
  // flag and ₹ on its own dashboard. It also fed Send Money: `sender` (built
  // from dialCountry, below) is the last-resort fallback for a receiver whose
  // own country cannot be read, so a wrong sender country propagated into the
  // receiver card too.
  //
  // Applied wherever a real user object arrives. Unknown or unlisted codes are
  // ignored rather than defaulted over the top, since the existing value is
  // already the honest "we don't know" answer.
  const applyAccountCountry = (user) => {
    const iso = user && String(user.countryIso || "").trim().toUpperCase();
    if (!iso) return;
    const match = COUNTRY_BY_ISO[iso];
    if (match) setDialCountry(match);
  };
  const [phoneNumber, setPhoneNumber] = useState19("");
  const [showPicker, setShowPicker] = useState19(false);
  const [phoneDialOpen, setPhoneDialOpen] = useState19(false);
  const [showLoginFace, setShowLoginFace] = useState19(false);
  const [isLoginAttempt, setIsLoginAttempt] = useState19(false);
  const [loginEntryMode, setLoginEntryMode] = useState19("id");
  const [loginMobileBuffer, setLoginMobileBuffer] = useState19("");
  const [loginMobileCountry, setLoginMobileCountry] = useState19(null);
  const [showLoginPicker, setShowLoginPicker] = useState19(false);
  const [loginCountrySearch, setLoginCountrySearch] = useState19("");
  const [countrySearch, setCountrySearch] = useState19("");
  const [activeScreen, setActiveScreen] = useState19(null);
  const requestCloseActiveScreen = useBackClose(activeScreen !== null, () => setActiveScreen(null));
  // A receipt's Store button: whatever screen the receipt sat on (Send,
  // history) steps aside so the dashboard can show the shop's store.
  useEffect15(() => {
    const leave = () => setActiveScreen(null);
    window.addEventListener("gloobal:openShop", leave);
    // A complaint opened from a receipt (its "Open chat") lives on the
    // dashboard, so whatever screen the receipt was over steps aside.
    window.addEventListener("gloobal:openComplaint", leave);
    return () => {
      window.removeEventListener("gloobal:openShop", leave);
      window.removeEventListener("gloobal:openComplaint", leave);
    };
  }, []);
  // A scanned or linked payee belongs to the Send Money visit it opened.
  // However Send Money is left — its close button, the back button, a
  // session expiry — the payee must not reappear on the next visit.
  const activeScreenRef = useRef13(activeScreen);
  activeScreenRef.current = activeScreen;
  useEffect15(() => {
    if (activeScreen !== "send") setSendPrefillReceiver(null);
  }, [activeScreen]);
  // "Pay again", from the foot of a receipt.
  //
  // The receipt is mounted from three different places — Send Money, History
  // and the Coin screen — and none of them knows how to open Send Money on a
  // payee; only this component does. So the button announces the payee and
  // this listens, rather than a callback being threaded through three screens
  // that have no other reason to carry one.
  //
  // The name, number and country come off the transaction. The GLOOBAL ID
  // does not, any more: a receipt records what was true when the money
  // moved, and an ID can be changed after it. The receipt asks
  // /api/payees/current before it fires this, and — where the ID has moved —
  // shows the payer the old one and the new one and waits to be told to go
  // ahead. So whatever arrives here has already been resolved and agreed to;
  // this only has to open the screen on it.
  //
  // The AMOUNT is deliberately not carried — a second payment to somebody is
  // rarely the same size as the first, and a form that opens holding a
  // figure is a form that gets sent holding it.
  useEffect15(() => {
    const onPayAgain = (event) => {
      const payee = event && event.detail;
      if (!payee || !payee.gloobalId) return;
      openSendToPayee(payee);
    };
    window.addEventListener("gloobal:payAgain", onPayAgain);
    return () => window.removeEventListener("gloobal:payAgain", onPayAgain);
  }, [dialCountry]);
  // A creator on the Send screen, from their own page or from Pay again on
  // a shop's receipt (which has already read the shop as it is now).
  const openSendToCreator = (creator, amount) => {
    if (!creator) return;
    const iso = String(creator.countryIso || "").toUpperCase();
    const creatorCountry = COUNTRY_BY_ISO[iso] || dialCountry;
    setSendPrefillChoiceId(null);
    setSendPrefillReceiver({
      country: creatorCountry.name,
      flag: creatorCountry.flag,
      iso: creatorCountry.iso,
      id: creator.symbolId,
      name: creatorDisplayName(creator),
      creatorHandle: creator.handle || null,
      mobileNumber: "",
      currency: COUNTRY_CURRENCY[creatorCountry.iso] || "USD",
      registered: true,
      prefillAmount: Number(amount) > 0 ? String(Number(amount).toFixed(2)) : ""
    });
    setActiveScreen("send");
  };
  const openSendToCreatorRef = useRef13(openSendToCreator);
  openSendToCreatorRef.current = openSendToCreator;
  useEffect15(() => {
    const onPayAgainCreator = (event) => {
      const creator = event && event.detail && event.detail.creator;
      if (creator && creator.symbolId) openSendToCreatorRef.current(creator);
    };
    window.addEventListener("gloobal:payAgainCreator", onPayAgainCreator);
    return () => window.removeEventListener("gloobal:payAgainCreator", onPayAgainCreator);
  }, []);
  const [showDiagnostics, setShowDiagnostics] = useState19(() => typeof window !== "undefined" && window.location.hash === "#diagnostics");
  useEffect15(() => {
    const onHashChange = () => setShowDiagnostics(window.location.hash === "#diagnostics");
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  const closeDiagnostics = () => {
    setShowDiagnostics(false);
    if (typeof window !== "undefined" && window.location.hash === "#diagnostics") {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  };
  const [dashboardHistoryDirection, setDashboardHistoryDirection] = useState19(null);
  // Which Dashboard sub-screen the app map should open once Dashboard.jsx
  // is actually mounted — "bank" | "coin" | "assets" | "paylater" |
  // "aboutus" | null. Dashboard.jsx watches this prop and opens the
  // matching internal show* screen itself; App.jsx only owns the request,
  // not the screen state, since each of those booleans is local to
  // Dashboard.jsx. "send" and "coverage" don't go through this — they're
  // App.jsx's own activeScreen instead (see goToDashboardDestination).
  const [dashboardDeepLink, setDashboardDeepLink] = useState19(null);
  // A complaint link (?complaint=) opens its case once the dashboard is up,
  // then leaves the address bar so a reload doesn't open it again.
  const complaintLinkRef = useRef29(readComplaintFromUrl());
  useEffect15(() => {
    if (stage !== "dashboard" || !complaintLinkRef.current) return;
    const id = complaintLinkRef.current;
    complaintLinkRef.current = "";
    setDashboardDeepLink({ complaint: id });
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("complaint");
      window.history.replaceState({}, "", url.toString());
    } catch (e) {
      // The case still opens.
    }
  }, [stage]);
  // A receipt link someone was sent. Read once here; acted on further down,
  // below the history it has to search.
  const [sharedTxnRef, setSharedTxnRef] = useState19(() => readSharedTxnFromUrl());
  // The receipt that link opened, if it named a payment in this account's own
  // history. Never fetched by reference; see the effect that sets it.
  const [linkedReceipt, setLinkedReceipt] = useState19(null);
  // The Gloobal ID whose history has been read at least once this session, so
  // a link that matches nothing can be told apart from one whose history has
  // simply not arrived yet.
  const sharedTxnHistorySettledRef = useRef13("");
  // A /p/<digits> link the app was opened at. Read once here; acted on
  // below, once the person reaches the dashboard.
  const [payLink, setPayLink] = useState19(() => readPayLinkFromUrl());
  // Where the app map wanted to go when it was tapped from a screen that
  // isn't Dashboard and the person isn't currently signed in (e.g. they
  // signed out after registering once, and tap "Send Money" from the
  // map). goToDashboardDestination sends them to Login instead of failing
  // silently, and this remembers the original destination so it opens the
  // moment they actually land on Dashboard rather than dropping them on
  // the plain Dashboard home with no explanation.
  const [pendingMapDestination, setPendingMapDestination] = useState19(null);
  useEffect15(() => {
    if (stage !== "dashboard" || !pendingMapDestination) return;
    applyDashboardDestination(pendingMapDestination);
    setPendingMapDestination(null);
    // applyDashboardDestination is defined below and is stable across
    // renders in everything it closes over that matters here (it only
    // calls other setters), so it's intentionally left out of the
    // dependency array rather than hoisted above this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, pendingMapDestination]);
  // GLOOBAL_SESSION_EXPIRED_EVENT fires (see httpClient.js) the moment any
  // authenticated call comes back 401 and its bearer token gets dropped —
  // a Render restart invalidating the token, a genuine expiry, whatever
  // the cause. This is the one place that reacts to it: closing whatever
  // App.jsx-level overlay was open (Send Money, Add Bank, Coverage — any
  // of which could be the screen that was mid-call when the token died),
  // dropping any dashboard deep-link that no longer applies, and sending
  // the person to Login rather than leaving them stuck on a screen that's
  // quietly stopped working. goToLogin/showToast are defined further down
  // this component but are already assigned by the time this effect's
  // callback actually runs (mount, not render), same as
  // applyDashboardDestination above.
  useEffect15(() => {
    const onSessionExpired = () => {
      setActiveScreen(null);
      setDashboardDeepLink(null);
      setPendingMapDestination(null);
      showToast("Your session expired. Please sign in again.");
      goToLogin();
    };
    window.addEventListener(GLOOBAL_SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(GLOOBAL_SESSION_EXPIRED_EVENT, onSessionExpired);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The in-app notification list, over whatever screen is showing. Opened
  // from the Profile tab's "Notifications" row, and by tapping a
  // promotional or system push.
  // Back-button handling belongs to the sheet itself (it calls useBackClose
  // internally, like LocationRequiredModal) — registering a second entry
  // here would push two history states for one overlay and take two backs
  // to dismiss it.
  const [showNotifications, setShowNotifications] = useState19(false);
  useEffect15(() => {
    const onOpenNotifications = () => setShowNotifications(true);
    window.addEventListener("gloobal:openNotifications", onOpenNotifications);
    return () => window.removeEventListener("gloobal:openNotifications", onOpenNotifications);
  }, []);
  // --- Web Push ----------------------------------------------------------
  //
  // Three separate concerns, deliberately not merged, because each is
  // triggered by something different and getting the ORDER wrong between
  // them is how a subscription ends up pointing at the wrong account.
  //
  // 1. Reconcile once per signed-in session. A PushSubscription belongs to
  //    the browser profile, not the person, and the browser can rotate it
  //    while the app is closed — an event nothing in the page can observe
  //    after the fact. Re-POSTing on arrival is the only way the server's
  //    row stays true. It never prompts (see useWebPush.js) and tolerates
  //    a cold Render without touching the session.
  //    The signed-in ID is read straight from the session store rather than
  //    from `registeredUser`: that state is declared further down this
  //    component, and a dependency array is evaluated on EVERY render,
  //    before the consts below it exist (the same trap the shared-receipt
  //    effect's comment documents). gloobalCurrentSymbolId() is a plain
  //    read of the stored session and has no such ordering problem.
  const pushSyncedForRef = useRef13("");
  // What the last reconcile concluded: "ok" | "default" | "denied" |
  // "unsupported" | "unreachable". NotificationsSheet renders an Enable
  // row off this, which is the only route an EXISTING account has — someone
  // who onboarded before the Alerts card existed never saw a prompt, and
  // nothing else in the app offers one outside the post-payment fallback.
  const [pushState, setPushState] = useState19("");
  useEffect15(() => {
    if (stage !== "dashboard") return;
    const signedInId = gloobalCurrentSymbolId() || "";
    if (!signedInId || pushSyncedForRef.current === signedInId) return;
    pushSyncedForRef.current = signedInId;
    gloobalPushSyncOnStart().then((r) => setPushState(r && r.ok ? "ok" : (r && r.reason) || ""));
    // The installed app's home-screen badge, from the server's own unread
    // count — the same number NotificationsSheet shows, so the icon and
    // the list can never disagree. A no-op on any browser without the
    // Badging API, and silent when the server cannot be reached: a badge
    // is not worth a toast.
    GloobalApi.getUnreadNotificationCount()
      .then(gloobalPushSetAppBadge)
      .catch(() => {});
    // `secureId` (declared above, unlike registeredUser) is in the deps so
    // this re-runs if the dashboard renders a beat before the session ID
    // has landed, rather than giving up for the whole session.
  }, [stage, secureId]);
  // 1b. The same reconcile again whenever the tab comes back to the front.
  //     Granting notifications in browser site settings fires no event the
  //     page can hear, so without this the permission is "granted" and the
  //     device stays unsubscribed until the next cold load — which is
  //     exactly how it fails for someone who turns it on in Chrome's own UI
  //     while Gloobal is open. The once-per-session ref is cleared first so
  //     the reconcile actually runs; gloobalPushSubscribe() reuses a valid
  //     subscription and the subscribe route upserts on the endpoint, so a
  //     visibility flip costs one idempotent POST and never a second row.
  //     It still cannot prompt: syncOnStart returns early unless permission
  //     is already granted.
  useEffect15(() => {
    if (stage !== "dashboard") return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!gloobalCurrentSymbolId()) return;
      pushSyncedForRef.current = "";
      gloobalPushSyncOnStart().then((r) => setPushState(r && r.ok ? "ok" : (r && r.reason) || ""));
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [stage]);
  // 2. Messages from the service worker. `gloobal:push-click` is a tap on a
  //    notification while a tab was already open — the worker focused this
  //    one rather than cold-booting a second copy of the app, so the
  //    routing has to happen here. A payment goes down the SAME deep link a
  //    "?txn=" URL uses: set the shared reference and let the effect further
  //    down find it in this account's own history and open the read-only
  //    receipt. Anything else opens the notification list.
  //    `gloobal:push-resubscribe` is the browser having rotated this
  //    device's subscription; the worker cannot re-register it (no access
  //    to the bearer token), so it asks the page to.
  useEffect15(() => {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return undefined;
    const onWorkerMessage = (event) => {
      const data = (event && event.data) || {};
      if (data.type === "gloobal:push-resubscribe") {
        pushSyncedForRef.current = "";
        gloobalPushSyncOnStart().then((r) => setPushState(r && r.ok ? "ok" : (r && r.reason) || ""));
        return;
      }
      if (data.type !== "gloobal:push-click") return;
      // A complaint: straight to its case.
      const complaintId = data.payload && data.payload.complaintId;
      if (complaintId) {
        setActiveScreen(null);
        setDashboardDeepLink({ complaint: String(complaintId) });
        return;
      }
      const txnId = data.payload && data.payload.transactionId;
      if (txnId && data.payload.category !== "promotional") {
        setSharedTxnRef(String(txnId));
        return;
      }
      setShowNotifications(true);
    };
    navigator.serviceWorker.addEventListener("message", onWorkerMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onWorkerMessage);
  }, []);
  // 3. A different account is now signed in on this device. The
  //    subscription itself is unchanged — same browser, same endpoint — but
  //    the server row naming it still points at the previous account, and
  //    leaving it there would push one person's payments to another
  //    person's notification tray. Unsubscribe then re-subscribe, in that
  //    order, so there is never a moment with two live rows for one
  //    endpoint.
  useEffect15(() => {
    const onAccountSwitch = () => {
      pushSyncedForRef.current = "";
      // The result is captured for the same reason the startup reconcile
      // captures it: pushState drives the Enable row, and the account that
      // just arrived may be in a different state from the one that left.
      // Leaving it stale would offer Enable to an account already
      // subscribed, or hide it from one that needs it.
      gloobalPushUnsubscribe()
        .then(() => gloobalPushSyncOnStart())
        .then((r) => setPushState(r && r.ok ? "ok" : (r && r.reason) || ""));
    };
    window.addEventListener(GLOOBAL_ACCOUNT_SWITCH_EVENT, onAccountSwitch);
    return () => window.removeEventListener(GLOOBAL_ACCOUNT_SWITCH_EVENT, onAccountSwitch);
  }, []);
  const [pendingOpenMyShare, setPendingOpenMyShare] = useState19(false);
  const [secureIdRevealed, setSecureIdRevealed] = useState19(false);
  const [referralRevealed, setReferralRevealed] = useState19(false);
  const [otpRevealed, setOtpRevealed] = useState19(false);
  const [pinRevealed, setPinRevealed] = useState19(false);
  const [loginMobileRevealed, setLoginMobileRevealed] = useState19(false);
  const [regBiometricScanning, setRegBiometricScanning] = useState19(false);
  const [profilePhoto, setProfilePhoto] = useState19(G_LOGO_DATA_URI);
  // Changing the photo has to WRITE it, not just show it.
  //
  // This was `onChangeProfilePhoto={setProfilePhoto}` — state only. The very
  // first photo appeared to persist because the documentation step happens to
  // call persistLocalProfile straight after it; every later change lived in
  // memory and was gone on the next load, which is exactly the "first one
  // saves, updates don't" report. Same storage the first one used, so an
  // updated photo is no more special than the original.
  // Returns what happened, so the screen can SAY it. The push used to be
  // fired and not awaited: the new picture went up the moment it was picked
  // and nothing ever took it back down, so a save that never reached the
  // server looked exactly like one that did — which is the whole of the
  // "photo doesn't save" report that no amount of retrying could explain.
  //
  // The picture is still shown immediately; what changed is that a failure
  // now contradicts it.
  const handleChangeProfilePhoto = async (photo) => {
    const previous = profilePhoto;
    setProfilePhoto(photo);
    const symbolId = (registeredUser && registeredUser.symbolId) || secureId;
    if (!symbolId) return { ok: false, reason: "offline" };
    // Written before the push so a reload mid-flight still shows the attempt,
    // and so the retry below has the bytes to send.
    persistLocalProfile(symbolId, documentedName.trim(), photo);
    const outcome = await pushOwnProfilePhoto(symbolId, photo);
    if (outcome.ok) return outcome;
    // This image can never be sent. Leaving it would be a photo that is this
    // account's everywhere on this device and nowhere else — so the confirmed
    // one goes back, on screen and in the cache.
    if (outcome.reason === "unprepared") {
      setProfilePhoto(previous);
      persistLocalProfile(symbolId, documentedName.trim(), previous);
      return outcome;
    }
    // Transient. The choice stays on screen and stays pending; clearing the
    // synced mark is what gets it retried on the next arrival at the
    // dashboard rather than only at the next sign-in.
    ownPhotoSyncedForRef.current = null;
    return outcome;
  };
  const [docType, setDocType] = useState19(null);
  const [documentedName, setDocumentedName] = useState19("");
  const [loginAuthPin, setLoginAuthPin] = useState19("");
  const [loginAuthRevealed, setLoginAuthRevealed] = useState19(false);
  const [loginBiometricScanning, setLoginBiometricScanning] = useState19(false);
  const SECURE_ID_LENGTH = 12;
  const REFERRAL_LENGTH = 12;
  const PIN_LENGTH = 6;
  const OTP_LENGTH2 = 6;

  // --- Real backend (Express + MongoDB Atlas, on Render) ----------------
  //
  // Identity is server-owned from here down. Every stage below calls the
  // real API in backend/services/api/ instead of the setTimeout mocks it
  // used to, so an account created here exists in MongoDB and can be
  // logged into from any other Gloobal frontend against the same backend.
  //
  // authError carries the backend's own message rather than a rewritten
  // one — it already says useful things like "PIN must be 4 to 6 digits"
  // and "Please verify OTP before registration".
  const [authError, setAuthError] = useState19(null);
  const [authBusy, setAuthBusy] = useState19(false);
  // True once an auth call has been in flight long enough that the API is
  // asleep rather than slow — see LoginAuthScreen's `waking`. Derived from
  // authBusy rather than set by each handler, so every auth path gets it and
  // none can forget to clear it.
  const [authSlow, setAuthSlow] = useState19(false);
  // What the backend returned for this account. The whole app keys off
  // registeredUser.symbolId once past registration.
  const [registeredUser, setRegisteredUser] = useState19(null);
  // Reconcile this account's photo with the server once per signed-in
  // session: on reaching the dashboard (after a PIN login, a passkey login or
  // a finished registration — the only ways there, and all of them leave a
  // token behind). Keyed by Gloobal ID so a changed ID syncs again. Never
  // blocks the dashboard; a failed read is retried on the next arrival.
  const ownPhotoSyncedForRef = useRef22(null);
  const ownPhotoSymbolId = (registeredUser && registeredUser.symbolId) || secureId;
  useEffect30(() => {
    if (stage !== "dashboard" || !ownPhotoSymbolId) return undefined;
    if (ownPhotoSyncedForRef.current === ownPhotoSymbolId) return undefined;
    if (typeof gloobalAuthToken !== "function" || !gloobalAuthToken()) return undefined;
    const symbolId = ownPhotoSymbolId;
    ownPhotoSyncedForRef.current = symbolId;
    let alive = true;
    syncOwnProfilePhoto(symbolId).then(
      (photo) => {
        if (alive && photo) setProfilePhoto(photo);
      },
      () => {
        if (ownPhotoSyncedForRef.current === symbolId) ownPhotoSyncedForRef.current = null;
      }
    );
    return () => {
      alive = false;
    };
  }, [stage, ownPhotoSymbolId]);
  // Bug fix: accountCreatedAt used to be its own useState(() => new Date())
  // — a client-side "now" with no connection to the account at all. It
  // looked fine as long as nothing ever remounted GloobalId, but the
  // backend already tracks the real join date (User.createdAt, sent back
  // as createdAt/joinedDate on every register-symbol, login and profile
  // response — see publicUserPayload in Backend/server.js) and this never
  // read it. So Personal Details' "Joined" date was always just "whenever
  // this browser tab happened to load," and it visibly reset to "now"
  // every time something remounted GloobalId — most noticeably right
  // after Update Gloobal ID, before that remount was fixed at its own
  // source (see gloobalSessionSave's account-switch notice in
  // sessionStore.js).
  //
  // The real value is read straight from registeredUser once the backend
  // has answered, which is why this sits here rather than up with the
  // other early useState calls. accountCreatedAtFallbackRef (declared up
  // there, since it needs no data from registeredUser) only covers the
  // brief window during registration before the account exists
  // server-side at all, and is itself computed once — not on every
  // render — so it does not drift.
  // Coverage refetches on an account change. Placed HERE, below
  // registeredUser and secureId rather than beside the counter it bumps,
  // for the reason this file has already been bitten by twice: a hook's
  // dependency array is evaluated on EVERY render, before the `const`s
  // further down the component body exist. Declared up with
  // coverageRefreshToken, this threw "Cannot access 'secureId' before
  // initialization" and the app rendered a blank white page.
  //
  // The figures are platform-wide, so a new account does not invalidate
  // them — but it changes the currency they should be read in, and a fresh
  // session has no answer at all until something asks.
  useEffect15(() => {
    bumpCoverage();
  }, [secureId, registeredUser]);

  // ── The Security screen's two switches, applied ────────────────────────
  //
  // Both used to be component-local state in Dashboard.jsx, read at exactly
  // one place — the line that drew the switch. They are stored on the
  // account now (User.securitySettings) and arrive on every response that
  // carries a user; these are the two places that make them mean something.
  const securitySettings = (registeredUser && registeredUser.securitySettings) || null;
  // Absent settings default to the server's own defaults rather than to
  // "off": an account that has never touched the Security screen should
  // behave exactly as it did before this existed.
  const biometricLoginOn = securitySettings ? securitySettings.biometricLogin !== false : true;
  const appLockOn = securitySettings ? securitySettings.appLock === true : false;

  // Biometric login: hands the preference to the gate every screen calls.
  // Switching it off routes requireBiometric to the PIN, it does not
  // switch a check off — see the comment at that branch in useBiometric.js.
  useEffect15(() => {
    gloobalSetBiometricLoginEnabled(biometricLoginOn);
  }, [biometricLoginOn]);

  // Writes a Security switch to the account and adopts whatever the server
  // says the account now holds. Returns a boolean so the switch can roll
  // itself back rather than sitting in a state the account does not share.
  //
  // registeredUser is replaced with the server's own user object rather
  // than patched locally: the setting has exactly one home, and a client
  // that edits its copy has quietly created a second.
  const handleUpdateSecuritySettings = async (settings) => {
    const symbolId = (registeredUser && registeredUser.symbolId) || secureId;
    if (!symbolId) return false;
    try {
      const updated = await GloobalApi.updateSecuritySettings(symbolId, settings);
      if (!updated) return false;
      setRegisteredUser(updated);
      // And into the stored session, which is what seeds registeredUser on the
      // next page load. Without this the account had the new value and this
      // device's saved copy had the old one, and the copy is the one the
      // biometric gate reads before a sign-in completes — a disagreement the
      // person could not see and had no way to correct.
      GloobalApi.saveSession(updated, phoneNumber);
      return true;
    } catch (e) {
      return false;
    }
  };

  // The real PIN change. The server verifies the CURRENT PIN, applies the
  // same lockout budget as any other PIN check, and revokes this account's
  // other sessions — the replacement token it returns is saved by
  // GloobalApi.changePin so this device stays signed in through its own
  // revocation.
  //
  // The server's message is passed straight back rather than replaced with
  // a generic one: it is the only thing that can say "3 attempts remaining"
  // or how long a lockout has left.
  const handleChangePin = async (currentPin, newPin) => {
    const symbolId = (registeredUser && registeredUser.symbolId) || secureId;
    if (!symbolId) return { ok: false, message: "You're not signed in." };
    try {
      const result = await GloobalApi.changePin(symbolId, currentPin, newPin);
      if (result && result.user) {
        setRegisteredUser(result.user);
        // Same reason as handleUpdateSecuritySettings: the stored copy is what
        // the next load re-enters as, so it must not be left describing the
        // account as it was before the change.
        GloobalApi.saveSession(result.user, phoneNumber);
      }
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        message: GloobalApi.isUnreachable(err)
          ? GLOOBAL_API_WAKING_MESSAGE
          : (err && err.message) || "Couldn't change your PIN."
      };
    }
  };

  // App lock: re-lock when the app comes back to the foreground.
  //
  // Worth being exact about what this does and does not control, because
  // the switch's old description ("Ask for your PIN every time the app
  // opens") described something that ALREADY happens unconditionally: a
  // restored session lands on the PIN stage, never on the dashboard (see
  // the session-restore effect above). Making that optional would have
  // been the only way to give the switch that meaning, and it would have
  // meant shipping a setting whose "on" state was the status quo and whose
  // "off" state removed a credential check. A switch is not worth
  // weakening authentication for.
  //
  // So it owns the gap that genuinely existed: nothing re-locked the app
  // after it had been left open and backgrounded. With this on, returning
  // to a session that has been away goes back through the same PIN stage a
  // cold open already uses — no new lock screen, no second code path, and
  // no way for it to resolve to "unlocked" without a real verification.
  // Remember when the app was left, on this device, whatever the lock
  // setting: if the phone restarts the app while it is away, the restore
  // above reads this to tell a quick trip from a cold open.
  useEffect15(() => {
    if (stage !== "dashboard" || typeof document === "undefined") return undefined;
    const onHide = () => { if (document.visibilityState === "hidden") gloobalMarkAway(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", gloobalMarkAway);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", gloobalMarkAway);
    };
  }, [stage]);
  useEffect15(() => {
    if (!appLockOn || stage !== "dashboard") return undefined;
    if (typeof document === "undefined") return undefined;
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      // A grace period, because switching to the camera roll to pick a
      // photo, or answering a notification, backgrounds the tab for a
      // moment. Locking on every such flicker would make the app unusable
      // and teach people to turn the setting off, which is worse for them
      // than not having it.
      if (!hiddenAt || Date.now() - hiddenAt < GLOOBAL_APP_LOCK_GRACE_MS) return;
      hiddenAt = 0;
      setIsLoginAttempt(true);
      setStage("secureId");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [appLockOn, stage]);

  const registeredCreatedAtRaw = registeredUser && (registeredUser.createdAt || registeredUser.joinedDate);
  let accountCreatedAt = null;
  if (registeredCreatedAtRaw) {
    const parsedCreatedAt = new Date(registeredCreatedAtRaw);
    if (!Number.isNaN(parsedCreatedAt.getTime())) accountCreatedAt = parsedCreatedAt;
  }
  if (!accountCreatedAt) {
    if (!accountCreatedAtFallbackRef.current) accountCreatedAtFallbackRef.current = /* @__PURE__ */ new Date();
    accountCreatedAt = accountCreatedAtFallbackRef.current;
  }
  // Set when /api/otp/send answers 409. Kept apart from authError because
  // it is not a transient failure to retry — it is a dead end for
  // registration, and the card renders it with a "Log in instead" action.
  const [phoneAlreadyRegistered, setPhoneAlreadyRegistered] = useState19(false);
  // Login only: set once GET /api/users/resolve has confirmed the entered
  // Gloobal ID belongs to somebody. Drives the "Account found" chip and is
  // the gate on advancing to the PIN step.
  const [loginIdResolved, setLoginIdResolved] = useState19(false);
  // What the PIN step signs in with — a Gloobal ID or a full mobile number,
  // whichever the person entered. Held separately from `secureId` because on
  // the mobile path there is no Gloobal ID to put there yet: the backend
  // resolves the number behind the PIN, which is what stopped that resolution
  // being an unauthenticated lookup anyone could run.
  const [loginIdentifier, setLoginIdentifier] = useState19("");
  // Registration only: the biometric step's own message, so a device with
  // no sensor (or a declined prompt) explains itself on that screen rather
  // than through the root error banner.
  const [biometricNotice, setBiometricNotice] = useState19(null);

  // The backend normalises 10/11/12-digit forms server-side, but sending
  // the full international number means non-India dial codes survive
  // instead of being assumed to be +91.
  // (The login-side equivalent is built inside handleSubmitSecureId —
  // effectiveLoginCountry is declared further down this component.)
  const fullMobileNumber = `${dialCountry.dialCode || ""}${phoneNumber.replace(/\D/g, "")}`;

  // THE NUMBER THE ACCOUNT IS REGISTERED AGAINST, as opposed to the one
  // being typed.
  //
  // `fullMobileNumber` above is assembled out of two pieces of FORM state:
  // the country in the picker and the digits in the phone dial pad. That is
  // right for registration, which is the only place it is used to address
  // anything — the OTP goes to the number being entered.
  //
  // It is wrong for displaying the account's own number, which is what
  // Personal Details does. Signing in with a Gloobal ID and a PIN never
  // touches the phone pad, so `phoneNumber` is "" on that path and the
  // assembly produces a bare dial code: Personal Details read
  //
  //     Mobile      +91
  //
  // The server has had the real one all along — publicUserPayload returns
  // `mobileNumber` on every response that carries a user, and Send Money's
  // sender card has been preferring it for exactly this reason. This is
  // that preference, stated once, so the two places cannot drift.
  //
  // The digits check is not paranoia: publicUserPayload falls back to
  // `user.fullName` when mobileNumber is empty. On an account made before
  // the name step existed those are the same string and the fallback is
  // harmless — but on any other, it would print somebody's NAME under a
  // label that says Mobile. A value with no digits in it is not a phone
  // number, whatever field it arrived in.
  const storedMobileNumber = (registeredUser && registeredUser.mobileNumber) || "";
  const accountMobileNumber = /\d/.test(storedMobileNumber)
    ? storedMobileNumber
    // No stored number means this is mid-registration, where the typed one
    // IS the account's. Still nothing rather than a bare dial code.
    : (/\d/.test(fullMobileNumber) ? fullMobileNumber : "");

  // The PIN fallback behind the biometric gate, hosted once at the root so
  // every guarded action anywhere in the tree can reach it (see
  // gloobalRegisterPinFallbackHost). Held as { reason, resolve }: `resolve`
  // is the promise requireBiometric() is waiting on, and the modal is the
  // only thing that settles it.
  const [pinFallbackRequest, setPinFallbackRequest] = useState19(null);
  useEffect15(() => {
    gloobalRegisterPinFallbackHost(
      (opts) =>
        new Promise((resolve) => {
          setPinFallbackRequest({
            reason: (opts && opts.pinReason) || "Confirm it's you with your PIN.",
            resolve
          });
        })
    );
    // Unregistering on unmount matters: a stale host would resolve into a
    // component that no longer exists, hanging the caller forever.
    return () => gloobalRegisterPinFallbackHost(null);
  }, []);
  // Resolved outside the state updater on purpose — an updater has to stay
  // pure, and React calls it twice under StrictMode.
  const resolvePinFallback = (verified) => {
    if (pinFallbackRequest) pinFallbackRequest.resolve(verified);
    setPinFallbackRequest(null);
  };

  // Render's free tier sleeps when idle and takes 20-50s to wake. Firing
  // one throwaway request at mount means the backend is already booting
  // while the person picks a country and types their number, instead of
  // that wait landing inside the OTP call's own timeout.
  useEffect15(() => {
    GloobalApi.warmUp();
  }, []);

  // Restore whose account this device last used. Not a security token and
  // not a login: it only pre-fills the identity, and reaching the
  // dashboard still costs the PIN check below.
  useEffect15(() => {
    const restored = GloobalApi.loadSession();
    if (!restored) return;
    setRegisteredUser(restored.user);
    // The country this account is registered in, as the backend reported it
    // on the response this session was saved from.
    applyAccountCountry(restored.user);
    if (restored.user.symbolId) setSecureId(restored.user.symbolId);
    if (restored.phoneNumber) setPhoneNumber(restored.phoneNumber);
    // The ID came from a session this device already authenticated once,
    // so it needs no fresh resolve to be trusted as an existing account —
    // it just skips straight to the PIN when submitted.
    if (restored.user.symbolId) setLoginIdResolved(true);
    if (restored.user.symbolId) setLoginIdentifier(restored.user.symbolId);
    // Name and photo come back with it, so a returning person sees their
    // own account rather than a placeholder while the dashboard loads.
    const storedProfile = loadLocalProfile(restored.user.symbolId);
    if (storedProfile) {
      if (storedProfile.name) setDocumentedName(storedProfile.name);
      if (storedProfile.photo) setProfilePhoto(storedProfile.photo);
      // storedProfile.name is not guaranteed non-empty (persistLocalProfile
      // writes "" when nothing was typed), so a stored-but-empty name still
      // falls through to the server's real name below rather than leaving
      // documentedName blank when the backend actually has one.
    }
    if ((!storedProfile || !storedProfile.name) && restored.user.fullName && restored.user.fullName !== restored.user.mobileNumber) {
      // fullName is the mobile number on accounts made before the name step
      // existed (see mapServerTransaction above for the same guard) — never
      // show a phone number as someone's name.
      setDocumentedName(restored.user.fullName);
    }
    gloobalSetBiometricSymbolId(restored.user.symbolId || null);
    setIsLoginAttempt(true);
    // Resume straight into the dashboard when this device still holds a
    // live bearer token for the account (24 September 2026).
    //
    // This effect used to send EVERY restored session to the PIN stage.
    // Nothing was deleted — the session and its token were sitting intact
    // in localStorage — but closing the tab, the browser or the installed
    // app and reopening it always landed on a sign-in screen, which is
    // indistinguishable from being logged out. The founder reported it as
    // exactly that, and it also meant a tap on a closed-app notification
    // opened onto Login instead of the account it was about.
    //
    // Resuming on the token does not skip a check: the token was minted
    // only in exchange for a real credential (PIN, verified OTP or passkey)
    // and is what every request already rides on while the app stays open.
    // The server still verifies it on each call; the first dashboard read
    // (hydrateAccount's getProfile) comes back 401 if it has been
    // revoked or has expired, and GLOOBAL_SESSION_EXPIRED_EVENT sends the
    // person to Login — the same path an open app takes when its token dies.
    //
    // Falls back to the PIN stage, as before, when:
    //   - there is no token, or it has visibly passed its expiry;
    //   - the account has App lock on. That switch reads "Lock again when
    //     you come back after leaving the app", and a cold reopen is the
    //     plainest case of coming back — honouring it here keeps the
    //     stricter setting strictly stricter.
    const appLockOnRestore = Boolean(
      restored.user.securitySettings && restored.user.securitySettings.appLock === true
    );
    // ...unless the phone itself restarted the app within the grace time
    // (gloobalAwayRecently): that is a quick trip to another app, not a
    // cold open, and App lock gives it the same grace a warm return gets.
    if (restored.user.symbolId && gloobalAuthTokenLooksLive(restored.token) && (!appLockOnRestore || gloobalAwayRecently())) {
      setStage("dashboard");
      return;
    }
    setStage("secureId");
  }, []);

  // Any stage change clears a stale error so a fixed problem doesn't keep
  // showing the message from the previous attempt.
  useEffect15(() => {
    setAuthError(null);
  }, [stage]);

  // Real transaction history, once there is a dashboard to show it on.
  //
  // GloobalApi.getTransactionSummary existed and was never called from
  // anywhere, so the history list only ever held what this session had
  // sent — sign in on a new device and your entire payment history was
  // gone. It is loaded once on reaching the dashboard.
  //
  // Server rows are seeded UNDER anything this session already added
  // rather than replacing the list: a payment made moments ago is in local
  // state, and may not be in the fetched page yet, so overwriting would
  // make a just-completed payment disappear. Rows are keyed by txnId so a
  // transaction present in both is not listed twice.
  //
  // A failure is silent by design. History is a read: the dashboard is
  // fully usable without it, and an error banner over a working screen
  // because a list is a few seconds late helps nobody.
  // The account's real balance, pulled from the server and reconciled into
  // the local ledger.
  //
  // These were unrelated numbers: the ledger opened at a fixed 5,000 and
  // tracked only this browser session, while POST /api/transactions/send
  // debited the balance MongoDB holds. The dashboard could show 5,000 for
  // an account the server knew was empty — and since the local figure is
  // what executeTransaction's risk check reads, spending was authorised
  // against a number the backend did not share.
  //
  // GET /api/profile/:symbolId is the read (publicUserPayload carries
  // `balance`), and reconcileBankBalance posts the difference as a real
  // double-entry adjustment rather than assigning to a derived value.
  //
  // `refreshBalanceToken` re-runs it: it is bumped after every successful
  // remote send, because that send changed the server's number and the
  // local ledger has only applied its own view of the same event.
  const [refreshBalanceToken, setRefreshBalanceToken] = useState19(0);
  // Whether the figure on screen has actually been confirmed against the
  // server, rather than being whatever the local ledger happens to hold.
  // The local ledger always has *a* number, so on its own it can never say
  // "I don't know" — and that same number is what the risk check reads.
  // "loading" until the first read resolves, so a fresh dashboard never
  // flashes an error before it has had a chance to succeed.
  // Three states, never two. "loading" is not a balance and neither is an
  // error, and the screen has to be able to say which it is looking at.
  //
  // This used to be read as a single boolean — `balanceStatus ===
  // "unavailable"` — which meant "loading" and "confirmed" rendered
  // IDENTICALLY: as a hard currency figure taken from the local ledger. The
  // local ledger always has a number (it opens at a fixed float and is
  // rebuilt from empty on every page load), so a first login against a cold
  // Render instance showed a confident, correctly-formatted, entirely
  // fictional balance for as long as the read took — €10,000.00 to a
  // Netherlands account whose real balance was €3,120.55 — and then either
  // corrected itself or flipped to "Balance unavailable". That is the
  // "first login shows the wrong balance" report, and the fix is that a
  // figure is only ever shown once the server has confirmed it.
  const [balanceStatus, setBalanceStatus] = useState19("loading");

  // The identity this hydration cycle belongs to. Compared on the way back
  // in, so a response for the account someone just signed out of can never
  // land on the account they signed in to.
  const hydratedForRef = useRef13(null);

  // ONE hydration cycle for the whole account: the authoritative balance,
  // the asset seeds and the PayLater due. It is a function rather than an
  // effect body so the effect, the refresh button and pull-to-refresh can
  // all call the SAME code path instead of maintaining three copies of it.
  //
  // Returns a promise that settles when the cycle is done, which is what
  // lets pull-to-refresh hold its spinner for exactly as long as the work
  // actually takes rather than a guessed interval.
  const hydrateAccount = useCallback11(async () => {
    const symbolId = (registeredUser && registeredUser.symbolId) || secureId;
    if (!symbolId) return false;
    hydratedForRef.current = symbolId;

    // Only the FIRST read for an account announces itself as loading. A
    // pull-to-refresh on a screen already showing a confirmed figure must
    // not blank it back to "Loading balance…" — the number on screen is
    // still the last thing the server said, and replacing it with a
    // spinner every few seconds is worse than leaving it there.
    setBalanceStatus((current) => (current === "ready" ? "ready" : "loading"));

    // All three together, retried as a set while the server is still waking.
    //
    // The backend sits on a Render free instance that spins down after about
    // fifteen minutes idle, and the coldest moment it ever sees is exactly
    // this one: someone opening the app after not using it. A single attempt
    // meant a cold start was indistinguishable from a broken server, which is
    // the "sometimes it fails to load balance on first login" report.
    //
    // The profile read is the probe. Rethrowing its unreachable failure is
    // what asks gloobalApiWithWakeRetry for another pass — and because the
    // whole triple is inside the attempt, the assets and PayLater reads get
    // retried with it instead of being quietly lost to the same cold start.
    //
    // A profile that comes back REJECTED but reachable (a 401, a 500) is not
    // rethrown: that is a real answer from an awake server, and it falls
    // through to the `confirmed` check below exactly as it always has.
    const outcome = await gloobalApiWithWakeRetry(
      async () => {
        const results = await Promise.allSettled([
          GloobalApi.getProfile(symbolId),
          GloobalApi.getAssets(symbolId),
          GloobalApi.getPaylater(symbolId)
        ]);
        const profile = results[0];
        if (profile.status === "rejected" && gloobalApiIsUnreachable(profile.reason)) {
          throw profile.reason;
        }
        return results;
      },
      {
        // The same account guard used below, so a wake-up that outlives the
        // account it was started for stops waiting instead of finishing.
        isCancelled: () => hydratedForRef.current !== symbolId,
        // Distinct from "loading": the server is starting, not failing, and
        // the screen is allowed to say so rather than sit on a spinner that
        // never changes for half a minute.
        onWaking: () => setBalanceStatus("waking")
      }
    );

    // The account changed while this was in flight. Everything below would
    // be writing one person's money onto another person's screen.
    if (hydratedForRef.current !== symbolId) return false;

    // Unreachable through every retry. That is a genuine failure now, not a
    // cold start, and it is reported as one.
    if (!outcome.ok) {
      if (outcome.cancelled) return false;
      setBalanceStatus("error");
      return false;
    }

    const [profileResult, assetsResult, paylaterResult] = outcome.value;
    const profile = profileResult.status === "fulfilled" ? profileResult.value : null;

    // Passed through as-is rather than coerced: reconcileBankBalance is the
    // one place that decides what counts as a real balance, and
    // Number(null) === 0 would otherwise sneak a "zero the account" past
    // this guard. It no-ops on anything that is not a number.
    if (profile) reconcileBankBalance(profile.balance);

    // Only a profile carrying a genuinely numeric balance counts as
    // confirmed — the same bar reconcileBankBalance itself applies. Anything
    // else is an error, and says so, rather than being shown as a figure.
    const confirmed = Boolean(profile) && Number.isFinite(Number(profile.balance));
    setBalanceStatus(confirmed ? "ready" : "error");

    // Seeds before dues: the PayLater LIMIT is derived from the seed list,
    // so reconciling the due first would briefly compute a negative
    // availability against an empty limit.
    const assets = assetsResult.status === "fulfilled" ? assetsResult.value : null;
    const paylater = paylaterResult.status === "fulfilled" ? paylaterResult.value : null;
    if (assets && Array.isArray(assets.seeds)) hydrateGrantsFromServer(assets.seeds);
    // A null is skipped rather than reconciled — reconciling "I couldn't
    // read it" to 0 would clear a real PayLater due, which is the same
    // mistake as fabricating a balance, in the opposite direction.
    if (paylater) reconcilePaylaterDue(paylater.pendingDues);

    return confirmed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registeredUser, secureId]);

  // Kept in a ref so the pull-to-refresh handler and the refresh control can
  // reach the current cycle without being re-bound on every identity change.
  const hydrateAccountRef = useRef13(hydrateAccount);
  useEffect15(() => {
    hydrateAccountRef.current = hydrateAccount;
  }, [hydrateAccount]);

  // THE refresh. Pull-to-refresh and any refresh control both call this and
  // nothing else, so there is exactly one definition of what "refresh this
  // account" means and no way for two entry points to drift apart.
  //
  // Awaits the hydration cycle rather than firing and forgetting, because
  // the gesture needs to know when the work is actually finished — a
  // spinner that stops on a timer is lying about the same thing the balance
  // used to lie about.
  const handleRefreshAccount = useCallback11(async () => {
    // Arrivals are polled on their own interval; a deliberate refresh should
    // pick them up too rather than leaving money that landed a minute ago
    // invisible until the next tick.
    setReceivedPollToken((n) => n + 1);
    try {
      return await hydrateAccountRef.current();
    } catch (e) {
      // hydrateAccount already records the failure in balanceStatus. This
      // only stops a rejected promise escaping into the gesture handler.
      return false;
    }
  }, []);

  // A new account must never inherit the previous one's verdict. Without
  // this, signing out of an account whose read had failed and into one that
  // works showed "Balance unavailable" on the new account until its own read
  // landed — and the reverse leaked a stale "ready" over the previous
  // account's number. handleStartOver resets around twenty-five pieces of
  // identity state and this was not among them.
  const lastHydratedIdRef = useRef13(null);
  useEffect15(() => {
    const symbolId = (registeredUser && registeredUser.symbolId) || secureId || null;
    if (symbolId === lastHydratedIdRef.current) return;
    lastHydratedIdRef.current = symbolId;
    setBalanceStatus("loading");
  }, [registeredUser, secureId]);

  useEffect15(() => {
    if (stage !== "dashboard") return;
    const symbolId = (registeredUser && registeredUser.symbolId) || secureId;
    // No identity yet. The effect re-runs the moment one arrives, because
    // BOTH sources are watched below — the id lands in `secureId` on some
    // paths and in `registeredUser` on others, and watching only one of them
    // is what made a first login miss its read entirely.
    if (!symbolId) return;
    hydrateAccount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, registeredUser, secureId, refreshBalanceToken, hydrateAccount]);

  // My Assets and PayLater, restored from the server on arriving at the
  // dashboard.
  //
  // Neither of these was ever read. Both screens are projections of the
  // local ledger, which is rebuilt from empty on every page load, so every
  // re-login presented a brand new account: no seeds, no accrued interest,
  // and — the part that actually mattered — ₹0 owed on PayLater with the
  // full limit available, to somebody who owed money. RiskEngine reads
  // paylaterAvailable off that same balance, so it would have authorised
  // spending against credit that had already been used.
  //
  // Runs on the same trigger as the balance reconcile above, including
  // refreshBalanceToken, so a completed payment refreshes all three
  // together rather than leaving the seeds a payment just planted invisible
  // until the next reload.
  //
  // Both calls fail soft (null on a failed read, never a fabricated zero),
  // and a null is skipped rather than reconciled — reconciling "I couldn't
  // read it" to 0 would clear a real PayLater due, which is the same
  // mistake in the opposite direction.
  // (The separate My Assets / PayLater effect that used to sit here has been
  // folded into hydrateAccount above. It ran on exactly the same trigger and
  // read the id exactly the same two ways, so keeping it apart meant two
  // copies of the same identity handling and two chances to get it wrong —
  // and pull-to-refresh would have had to know about both.)

  // Arrivals are only noticed if something asks. The summary fetch below
  // ran once per dashboard entry, so money landing while the app sat open
  // went unseen until an unrelated refresh happened to fire.
  const [receivedPollToken, setReceivedPollToken] = useState19(0);
  // Whether the dedupe list has been primed for this session, and since when
  // this session has been watching (see gloobalReceivedBaselineSplit).
  //
  // Without this the first poll would notify for the ENTIRE received
  // history at once — every payment ever received, all in the tray, the
  // moment someone turns notifications on. The first successful pass
  // therefore marks what already exists as seen WITHOUT showing anything,
  // and only genuinely new arrivals notify.
  const receivedBaselineRef = useRef13({ primed: false, since: null });
  useEffect15(() => {
    if (stage !== "dashboard") return;
    const interval = setInterval(() => {
      // Nothing to gain from polling a backgrounded tab, and a phone on
      // battery has plenty to lose. A notification the person would only
      // see on returning is one the freshly-woken poll will raise anyway.
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      setReceivedPollToken((n) => n + 1);
    }, GLOOBAL_RECEIVED_POLL_MS);
    return () => clearInterval(interval);
  }, [stage]);
  // A sign-out must re-prime for whoever signs in next.
  useEffect15(() => {
    if (stage !== "dashboard") receivedBaselineRef.current = { primed: false, since: null };
  }, [stage]);

  // Money this account RECEIVED, kept apart from what it sent.
  //
  // Every server row used to be appended to sendMoneyHistory regardless of
  // which side of it this account was on, and the dashboard's Paid list is
  // built from that state — so a payment somebody made TO you appeared in
  // your Paid history, as money you had spent. The backend has always said
  // which it is (`direction`, computed per viewer); the client was throwing
  // the answer away.
  const [receivedMoneyHistory, setReceivedMoneyHistory] = useState19([]);

  // THE RECEIPT BEHIND A ROW, from this level of the tree.
  //
  // Two callers: the shared-link effect just below (a receipt somebody was
  // sent) and Send Money's Recent list, which had no way to build one at all
  // — it is rendered from here, not from the Dashboard, so it cannot reach
  // the Dashboard's own opener.
  //
  // The decision of WHICH receipt is not made here. receiptForRow makes it,
  // once, for every list in the app: a Gloobal Coin buy or sell builds the
  // exchange receipt, and a payment, a Creator Share leg or a GEU transfer
  // builds the payment receipt. This used to be an inline buildHistoryReceipt
  // call with the share-source ternary spelled out, which is exactly how the
  // two copies of that logic could have drifted.
  //
  // Returns null when the row has no server reference to be a receipt OF, so
  // every caller can decide not to offer the tap rather than opening an empty
  // one.
  const buildRowReceipt = (t, direction) => {
    const localCurrency = COUNTRY_CURRENCY[dialCountry.iso] || "USD";
    return receiptForRow(t, direction, {
      dialCountry,
      ccy: CURRENCY_SYMBOL[localCurrency] || localCurrency,
      sendHistory: sendMoneyHistory,
      receiveHistory: receivedMoneyHistory,
      // The account holder, for a buy or sell receipt — the one movement
      // whose counterparty is the reserve rather than a person, and which
      // therefore has to name the holder or name nobody.
      viewer: receiptViewer({
        name: documentedName,
        symbolId: secureId,
        countryName: dialCountry && dialCountry.name,
        countryFlag: dialCountry && dialCountry.flag
      })
    });
  };

  // Placed HERE, below sendMoneyHistory and receivedMoneyHistory, not beside
  // the state it reads. A hook's dependency array is evaluated on EVERY
  // render - before the `const`s further down the component body exist.
  // Declared earlier, this threw "Cannot access 'receivedMoneyHistory' before
  // initialization" during mount and the app rendered a blank white page.
  useEffect15(() => {
    if (!sharedTxnRef || stage !== "dashboard") return;
    const found =
      sendMoneyHistory.find((t) => t.txnId === sharedTxnRef) ||
      receivedMoneyHistory.find((t) => t.txnId === sharedTxnRef);
    const consumeSharedTxnLink = () => {
      setSharedTxnRef("");
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("txn");
        window.history.replaceState({}, "", url.toString());
      } catch (e) {
        // A browser that refuses replaceState still gets the receipt.
      }
    };
    if (!found) {
      // The history fetch may not have landed yet, so this stays armed and
      // re-runs when it does (the fetch always hands both lists a new array).
      // Once THIS account's history has actually been read and the reference
      // is still not in it, the link is for a payment this account was no
      // part of: it quietly does nothing — no lookup by reference, no Send
      // Money, nothing prefilled — and the parameter is cleared so it cannot
      // fire later against a different account.
      const viewerId = (registeredUser && registeredUser.symbolId) || secureId || "";
      if (viewerId && sharedTxnHistorySettledRef.current === viewerId) consumeSharedTxnLink();
      return;
    }
    consumeSharedTxnLink();
    const inSent = sendMoneyHistory.some((t) => t.txnId === found.txnId);
    setDashboardHistoryDirection(inSent ? "sending" : "receiving");
    // And open that transaction's receipt, READ-ONLY, built exactly the way
    // tapping its History row builds it (buildHistoryReceipt, with the share's
    // source payment looked up by reference in the same two lists). Nothing
    // here posts, sends, prefills or fetches: the row is already this
    // viewer's own, and a receipt has no action that moves money.
    const built = buildRowReceipt(found, inSent ? "sent" : "received");
    if (built) setLinkedReceipt(built);
  }, [sharedTxnRef, stage, sendMoneyHistory, receivedMoneyHistory]);
  // The receipt a shared link opened (see just above), shown over the
  // dashboard until closed. Back closes it like any other overlay.
  const requestCloseLinkedReceipt = useBackClose(!!linkedReceipt, () => setLinkedReceipt(null));
  // The pay link, handled exactly like a scanned QR: the same lookup, then
  // Send Money prefilled. Never sends anything by itself.
  useEffect15(() => {
    if (!payLink || stage !== "dashboard") return;
    const link = payLink;
    setPayLink(null);
    try {
      window.history.replaceState(null, "", "/");
    } catch (e) {
      // Still handled; only the address bar keeps the link.
    }
    if (!link.gloobalId) {
      showToast("That GLOOBAL pay link isn't valid.");
      return;
    }
    (async () => {
      const result = await resolveGloobalPayee(link.gloobalId);
      if (!result.ok) {
        showToast(result.error);
      } else if (activeScreenRef.current !== null) {
        // The lookup outlived a cold start and the person has already moved
        // on to another screen — never swap a payee under them.
        showToast("Pay link ignored — you'd already opened another screen.");
      } else {
        openSendToPayee(result.payee);
      }
    })();
    // resolveGloobalPayee/openSendToPayee are per-render closures; this runs
    // once per link, on the render that first has both a link and a session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payLink, stage]);
  useEffect15(() => {
    if (stage !== "dashboard") return;
    const symbolId = (registeredUser && registeredUser.symbolId) || secureId;
    if (!symbolId) return;
    let cancelled = false;
    const baseline = receivedBaselineRef.current;
    const attemptStartedAt = gloobalReceivedBaselineBegin(baseline, Date.now());
    (async () => {
      try {
        const { transactions } = await GloobalApi.getTransactionSummary(symbolId, "all");
        if (cancelled || !Array.isArray(transactions)) return;
        const mapped = transactions.map((row) => mapServerTransaction(row, symbolId));
        const sent = mapped.filter((entry) => entry.direction !== "received");
        const received = mapped.filter((entry) => entry.direction === "received");
        // Both lists seed UNDER whatever this session already holds, keyed by
        // txnId, for the same reason: a payment made moments ago is in local
        // state and may not be in the fetched page yet.
        //
        // Then ONE newest-first sort (transactionOrder.js). This used to be a
        // bare concat, so a row that arrived on a later poll — a payment
        // received after the first load — landed at the END of its list,
        // under rows hours older than it.
        //
        // A local row the server has now recorded takes the SERVER's instant
        // (and the date and time printed from it): the local one is this
        // device's clock, the server's is the record, and sorting one list
        // on two clocks is how two rows can swap places on a reload.
        const seedUnder = (local, rows) => {
          const serverByTxn = new Map(rows.filter((entry) => entry.txnId).map((entry) => [entry.txnId, entry]));
          const reconciled = local.map((entry) => {
            const server = entry.txnId ? serverByTxn.get(entry.txnId) : null;
            return server && server.occurredAt
              ? { ...entry, occurredAt: server.occurredAt, date: server.date, time: server.time }
              : entry;
          });
          const seen = new Set(local.map((entry) => entry.txnId).filter(Boolean));
          return sortTransactionsNewestFirst(
            reconciled.concat(rows.filter((entry) => !entry.txnId || !seen.has(entry.txnId)))
          );
        };
        // Set before the lists, so the shared-receipt effect re-running on
        // them knows this account's history is now in.
        sharedTxnHistorySettledRef.current = symbolId;
        setSendMoneyHistory((local) => seedUnder(local, sent));
        setReceivedMoneyHistory((local) => seedUnder(local, received));
        // First successful pass for this session: what was already there is
        // history, marked seen in silence. If earlier attempts failed, rows
        // created since this session started watching are news instead of
        // history — see gloobalReceivedBaselineSplit. A response that arrives
        // after this run was superseded returns at `cancelled` above, so it
        // never primes the baseline.
        const receivedRows = mapped
          .map((entry, i) => ({ entry, createdAtMs: transactions[i] && transactions[i].createdAt ? new Date(transactions[i].createdAt).getTime() : NaN }))
          .filter((row) => row.entry.direction === "received");
        const { news, history } = gloobalReceivedBaselineSplit(baseline, attemptStartedAt, receivedRows);
        history.forEach((entry) => markPaymentNotified(entry.txnId));
        // The row's own currency, not the device's. These rows come from
        // mapServerTransaction, which carries one precisely so nothing
        // downstream has to guess — and this was guessing.
        news.forEach((entry) => {
          const got = gloobalOwnMoneyOf(entry, COUNTRY_CURRENCY[dialCountry.iso] || "USD");
          notifyPaymentReceived({
            txnId: entry.txnId,
            amount: got.amount,
            currencySymbol: CURRENCY_SYMBOL[got.currency] || "",
            currencyCode: got.currency,
            from: entry.name,
            occurredAt: entry.occurredAt || null
          });
        });
      } catch (e) {
        /* read-only; the dashboard works without it */
      }
    })();
    return () => {
      cancelled = true;
    };
    // secureId — same missing dependency as the two effects above.
    // receivedPollToken re-runs this on the poll tick, which is what makes
    // an arrival visible (and notifiable) while the app is simply open.
  }, [stage, registeredUser, secureId, receivedPollToken]);

  // Login, ID mode: check the Gloobal ID the moment it is complete rather
  // than waiting for submit, so the card can show "Account found" before
  // the PIN screen is ever reached.
  //
  // The IN button is deliberately NOT gated on this. An unclear answer —
  // a cold Render start, a 5xx — is not evidence that the ID is wrong,
  // and disabling the only way forward on one would lock somebody out of
  // their own account over a slow network. handleSubmitSecureId re-checks
  // and is the real gate; this is the early, advisory half.
  //
  // `cancelled` guards the usual out-of-order finish: someone who
  // backspaces and retypes has two lookups in flight, and the slower one
  // must not overwrite the newer answer.
  useEffect15(() => {
    if (!isLoginAttempt || loginEntryMode !== "id" || stage !== "secureId") return;
    if (secureId.length !== SECURE_ID_LENGTH) {
      setLoginIdResolved(false);
      return;
    }
    let cancelled = false;
    (async () => {
      // Asks only whether the ID is taken, not who has it. This used to call
      // GET /api/users/resolve, which hands back a name and a mobile number —
      // before anybody had signed in, so typing twelve symbols into the login
      // screen was a way to read a stranger's contact details. The chip only
      // ever needed the boolean.
      const { available } = await GloobalApi.checkSymbolAvailability(secureId);
      if (cancelled) return;
      if (available === false) {
        setLoginIdResolved(true);
        setAuthError(null);
        return;
      }
      setLoginIdResolved(false);
      // Only a definite answer is reported. `null` means the lookup could not
      // tell — a cold start or a 5xx — and saying "no account found" over one
      // would be telling somebody their own account does not exist.
      if (available === true) setAuthError("No account found for this GLOOBAL ID.");
    })();
    return () => {
      cancelled = true;
    };
  }, [secureId, isLoginAttempt, loginEntryMode, stage]);
  const flipTo = (next) => {
    // Every path that ever reaches "dashboard" — registration finishing,
    // a fresh login, a restored session's PIN check — funnels through
    // here, so this is the one place that needs to know about it to keep
    // hasEverRegistered accurate (see its own comment above).
    if (next === "dashboard" && !everRegistered) {
      markEverRegistered();
      setEverRegistered(true);
    }
    setFlipping(true);
    setTimeout(() => {
      setStage(next);
      setFlipping(false);
    }, 220);
  };
  // App-map navigation. These are deliberately plain "go there" helpers —
  // no confirmation, no attempt to preserve whatever the person was mid-
  // way through — because that's what a map is for. The four functions
  // below cover every way a map entry can be reached:
  //   - a pre-registration entry (Mobile Number / Create Gloobal ID /
  //     Referral Code) → straight to that registration stage;
  //   - the Login entry → straight to the login form;
  //   - an unlocked post-registration destination while already on
  //     Dashboard → open it immediately;
  //   - the same destination from anywhere else (including signed out on
  //     a device that has registered before) → send them to Login first,
  //     remembering the destination so it opens the moment they land.
  const goToRegistrationStart = () => {
    setIsLoginAttempt(false);
    flipTo("phone");
  };
  const goToLogin = () => {
    setIsLoginAttempt(true);
    setLoginEntryMode("id");
    flipTo("secureId");
  };
  // Applies a Dashboard-level destination that is already safe to open —
  // either because Dashboard is already mounted (stage === "dashboard"),
  // or because pendingMapDestination's effect above is calling this the
  // instant it becomes true. "send" and "coverage" are App.jsx's own
  // activeScreen overlays; everything else is a Dashboard-internal show*
  // screen, requested via dashboardDeepLink and opened by Dashboard.jsx
  // itself (see its deepLinkTarget prop).
  const applyDashboardDestination = (target) => {
    if (!target) return;
    if (target === "send") {
      setActiveScreen("send");
      return;
    }
    if (target === "coverage") {
      setActiveScreen("coverage");
      return;
    }
    // Three that live in App itself rather than inside the Dashboard:
    // the scanner, the notification list, and the GLOOBAL ID explainer.
    if (target === "scan") {
      setShowScanScreen(true);
      return;
    }
    if (target === "notifications") {
      setShowNotifications(true);
      return;
    }
    if (target === "history") {
      // Same mechanism the dashboard's own "Paid" history link already
      // uses (see the SendMoney onOpenPaidHistory callback below) — any
      // truthy value opens history; "sending" is the value already
      // proven to work end-to-end.
      setDashboardHistoryDirection("sending");
      return;
    }
    setDashboardDeepLink(target);
  };
  const goToDashboardDestination = (target) => {
    if (stage === "dashboard") {
      applyDashboardDestination(target);
      return;
    }
    // Not on Dashboard right now (mid-flow elsewhere, or signed out on a
    // device that has registered before) — get them signed in first, and
    // remember where they actually wanted to go.
    setPendingMapDestination(target);
    goToLogin();
  };
  // What tapping a LOCKED map entry does: jump to whichever screen
  // actually unlocks it, rather than doing nothing or just explaining why
  // it's locked. Pre-registration entries lock once the device has
  // registered before, and the only thing that could still make sense of
  // tapping one then is signing back in; post-registration entries lock
  // until that first registration happens, so the fix is the start of
  // registration itself.
  const handleAppMapLockedPress = (entry) => {
    if (entry.group === "pre") {
      goToLogin();
    } else {
      goToRegistrationStart();
    }
  };
  // Where the person is right now, as far as THIS component can honestly
  // tell — which is not always to the screen.
  //
  // `stage` and `activeScreen` are App.jsx's own; the Dashboard's internal
  // screens (My Assets, PayLater, GH Score and the rest) are opened through
  // dashboardDeepLink and owned by Dashboard.jsx, so from here they all read
  // as "dashboard". That is coarse but true — those screens ARE inside the
  // dashboard — and a map that named the wrong screen would be worse than
  // one that names the right area.
  //
  // activeScreen "bank" is deliberately NOT mapped to the gbank entry: that
  // value opens AddBankScreen, which is a different screen from Gloobal Bank
  // and would have put "You are here: Gloobal Bank" on top of neither.
  const appMapCurrentKey = stage !== "dashboard"
    ? (["phone", "secureId", "referral", "login"].includes(stage) ? stage : null)
    : activeScreen === "send" ? "send"
    : activeScreen === "coverage" ? "coverage"
    : showScanScreen ? "scan"
    : showNotifications ? "notifications"
    : "dashboard";
  // ── ORDER MATTERS HERE ──────────────────────────────────────────────
  //
  // The map builds its branches in the order the SECTIONS first appear in
  // this array, so that a section added here shows up on the map without
  // appMap.jsx being touched and the two can never disagree about which
  // sections exist. The cost of that is this array's order is now a design
  // decision rather than a filing convenience.
  //
  // It is arranged so both states come out right. Signed in, the unlocked
  // entries begin with Dashboard, so the map reads Your money -> Move money
  // -> You -> Gloobal. Signed out on a fresh device, everything above is
  // locked and the first unlocked entry is Mobile Number, so it reads
  // Get started -> You. Login sits last precisely because its section ("You")
  // must not be the one that leads — which is what happened when it was
  // declared fourth.
  //
  // The app map's full entry list. "pre" entries are the registration
  // flow's own checkpoints (locked once this device has registered
  // before — there's nothing left to do there); "post" entries are the
  // main, signed-in destinations (locked until that first registration
  // happens). Login is the one pre-registration entry that's never
  // locked — it's still the right place to go on a device that has
  // registered before but is currently signed out.
  const appMapEntries = [
    { key: "dashboard", section: "Your money", group: "post", label: "Dashboard", locked: !everRegistered, onPress: () => goToDashboardDestination(null) },
    { key: "gbank", section: "Your money", group: "post", label: "GLOOBAL Bank", locked: !everRegistered, onPress: () => goToDashboardDestination("bank") },
    { key: "assets", section: "Your money", group: "post", label: "My Assets", locked: !everRegistered, onPress: () => goToDashboardDestination("assets") },
    { key: "send", section: "Move money", group: "post", label: "Send Money", locked: !everRegistered, onPress: () => goToDashboardDestination("send") },
    { key: "paylater", section: "Move money", group: "post", label: "PayLater", locked: !everRegistered, onPress: () => goToDashboardDestination("paylater") },
    { key: "history", section: "Move money", group: "post", label: "Transaction History", locked: !everRegistered, onPress: () => goToDashboardDestination("history") },
    { key: "share", section: "Move money", group: "post", label: "Creator Share", locked: !everRegistered, onPress: () => goToDashboardDestination("share") },
    // ── THE TWO THE MAP DID NOT KNOW ABOUT ─────────────────────────────
    //
    // My Choices is a whole tab of the app and was on no branch of this
    // map; My Essentials was reachable only from inside Accounts. A map
    // that omits a tab is not a map of this app, and both of these are
    // screens a person would look for by name — which is what the
    // search box at the top of the map searches.
    //
    // "Your money" rather than "Move money": neither of them moves any.
    // Choices is a reading of where it went, Essentials is what an
    // account is for.
    //
    // Choices opens through the Dashboard's own gate, not straight into
    // the tab — see the deep-link effect there. A map entry that walked
    // past a check would be a hole in it.
    { key: "choices", section: "Your money", group: "post", label: "My Choices", locked: !everRegistered, onPress: () => goToDashboardDestination("choices") },
    { key: "essentials", section: "Your money", group: "post", label: "My Essentials", locked: !everRegistered, onPress: () => goToDashboardDestination("essentials") },
    // ── NEW SINCE THE MAP WAS LAST DRAWN ───────────────────────────────
    //
    // Pay & Services (GLOOBAL बाज़ार lives inside it), Scan & Pay and the
    // Receive QR are how money moves now, so they sit with Send. The shop
    // got its own branch: a creator's store and the screen that names it.
    // Security holds the App lock that decides how long a person stays
    // signed in, and the GLOOBAL ID explainer is the one screen that
    // answers "what is this ID?" — it opens without going anywhere else.
    { key: "payservices", section: "Move money", group: "post", label: "Pay & Services", locked: !everRegistered, onPress: () => goToDashboardDestination("payservices") },
    { key: "scan", section: "Move money", group: "post", label: "Scan & Pay", locked: !everRegistered, onPress: () => goToDashboardDestination("scan") },
    { key: "receive", section: "Move money", group: "post", label: "Receive (My QR)", locked: !everRegistered, onPress: () => goToDashboardDestination("receive") },
    { key: "myshop", section: "Your shop", group: "post", label: "My Shop", locked: !everRegistered, onPress: () => goToDashboardDestination("myshop") },
    { key: "creatorSetup", section: "Your shop", group: "post", label: "Shop Setup & Name", locked: !everRegistered, onPress: () => goToDashboardDestination("creatorSetup") },
    { key: "ghscore", section: "You", group: "post", label: "Hooman Score", locked: !everRegistered, onPress: () => goToDashboardDestination("ghscore") },
    { key: "updateId", section: "You", group: "post", label: "Update GLOOBAL ID", locked: !everRegistered, onPress: () => goToDashboardDestination("updateId") },
    { key: "referralnet", section: "You", group: "post", label: "Referral Network", locked: !everRegistered, onPress: () => goToDashboardDestination("referral") },
    { key: "complaints", section: "You", group: "post", label: "Complaints & Reports", locked: !everRegistered, onPress: () => goToDashboardDestination("complaints") },
    { key: "security", section: "You", group: "post", label: "Security & App Lock", locked: !everRegistered, onPress: () => goToDashboardDestination("security") },
    { key: "notifications", section: "You", group: "post", label: "Notifications", locked: !everRegistered, onPress: () => goToDashboardDestination("notifications") },
    { key: "coverage", section: "GLOOBAL", group: "post", label: "GLOOBAL Coverage", locked: !everRegistered, onPress: () => goToDashboardDestination("coverage") },
    { key: "aboutus", section: "GLOOBAL", group: "post", label: "About Us", locked: !everRegistered, onPress: () => goToDashboardDestination("aboutus") },
    { key: "phone", section: "Get started", group: "pre", label: "Mobile Number", locked: everRegistered, onPress: goToRegistrationStart },
    { key: "secureId", section: "Get started", group: "pre", label: "Create GLOOBAL ID", locked: everRegistered, onPress: () => { setIsLoginAttempt(false); flipTo("secureId"); } },
    { key: "referral", section: "Get started", group: "pre", label: "Referral Code", locked: everRegistered, onPress: () => { setIsLoginAttempt(false); flipTo("referral"); } },
    { key: "login", section: "You", group: "pre", label: "Login", locked: false, onPress: goToLogin },
    // Last, for the same reason as Login: it is never locked, so it must not
    // be the entry that decides which section leads on a fresh device.
    { key: "idGuide", section: "You", group: "post", label: "How the GLOOBAL ID Works", locked: false, onPress: () => setHelpSheet("symbols") }
  ];
  const effectiveLoginCountry = loginMobileCountry || dialCountry;
  const [loginMinLen, loginMaxLen] = mobileDigitRange(effectiveLoginCountry.iso);
  const loginMobileComplete = loginMobileBuffer.length >= loginMinLen;
  const handleSubmitSecureId = async () => {
    // Login by mobile number: resolve it to the Secure ID behind it, so
    // the PIN step that follows has a real symbolId to authenticate.
    if (isLoginAttempt && loginEntryMode === "mobile") {
      if (!loginMobileComplete || authBusy) return;
      // Carried to the PIN step as-is. It used to be resolved to a Gloobal ID
      // here, through GET /api/users/resolve, which meant an unauthenticated
      // caller could map any phone number to the account behind it. POST
      // /api/login now accepts the number itself and does that resolution
      // behind the PIN, so there is nothing to look up first.
      setLoginIdentifier(`${effectiveLoginCountry.dialCode || ""}${loginMobileBuffer.replace(/\D/g, "")}`);
      setAuthError(null);
      flipTo("loginAuth");
      return;
    }
    if (secureId.length !== SECURE_ID_LENGTH || authBusy) return;
    // Login by Gloobal ID: the ID has to resolve to a real account before
    // the PIN step, not after. Sending an unknown ID into /api/login only
    // produces a generic failure that reads as "wrong PIN", and burns an
    // attempt against the backend's 5-strike lockout for a mistake that
    // was never about the PIN.
    if (isLoginAttempt) {
      // The background effect above already resolved this exact ID and it
      // came back as a real account — no reason to spend a second
      // GET /api/users/resolve (and a second 45s cold-start timeout) on
      // the same question.
      setLoginIdentifier(secureId);
      if (loginIdResolved) {
        flipTo("loginAuth");
        return;
      }
      setAuthBusy(true);
      setAuthError(null);
      try {
        // Existence only — the account's details come back from /api/login,
        // after the PIN. A `null` answer (cold start, 5xx) is not evidence the
        // ID is wrong and must not block the one way forward.
        const { available } = await GloobalApi.checkSymbolAvailability(secureId);
        if (available === true) {
          setLoginIdResolved(false);
          setAuthError("No account found for this GLOOBAL ID.");
          return;
        }
        setLoginIdResolved(available === false);
        flipTo("loginAuth");
      } finally {
        setAuthBusy(false);
      }
      return;
    }
    // Registration: warn early if this ID is already somebody's. Only an
    // explicit "taken" blocks — an unclear answer (cold start, 5xx) lets
    // the person continue, because POST /api/register-symbol is the real
    // uniqueness authority and a flaky lookup must not lock anyone out.
    setAuthBusy(true);
    setAuthError(null);
    try {
      const { available } = await GloobalApi.checkSymbolAvailability(secureId);
      if (available === false) {
        // No second set of alternatives here — the Suggested-for-you row
        // above the dial already offers one, and its own refresh control
        // generates another. Showing a second, different pair on top of
        // that was redundant and made "taken" look like a bigger dead end
        // than it is.
        setAuthError("That GLOOBAL ID is already taken. Try another.");
        return;
      }
      flipTo("referral");
    } finally {
      setAuthBusy(false);
    }
  };
  // The referral code is only carried here; it is submitted as part of
  // registration at the PIN step. Skipping leaves it empty, which the
  // backend accepts.
  const handleSubmitReferral = async () => {
    if (referralCode.length !== REFERRAL_LENGTH || authBusy) return;
    // Check the code belongs to somebody before carrying it forward.
    // GloobalApi.referralCodeExists existed and was called from nowhere,
    // so a mistyped code travelled all the way to registration, where the
    // backend silently drops it — the person believed they had credited a
    // friend and nobody found out.
    //
    // Only a definite `false` (an explicit 404) blocks. Null means the
    // lookup could not tell — a cold start or a 5xx — and rejecting a
    // probably-genuine code over that would be worse than letting
    // registration proceed, which is also why the backend never fails a
    // registration over a bad code.
    setAuthBusy(true);
    setAuthError(null);
    try {
      const exists = await GloobalApi.referralCodeExists(referralCode);
      if (exists === false) {
        setAuthError("No GLOOBAL account uses that referral ID. Check it, or skip this step.");
        return;
      }
      flipTo("profile");
    } finally {
      setAuthBusy(false);
    }
  };
  // The account is actually created here — this is the one write that
  // matters. Two calls in order: register-symbol creates the User in
  // MongoDB, then pin/set stores its bcrypt PIN hash. If the PIN call
  // fails the user exists without a PIN, which /api/pin/set can retry, so
  // the error is surfaced rather than rolled back.
  const handleSubmitPin = async () => {
    if (pin.length !== PIN_LENGTH || authBusy) return;
    setAuthBusy(true);
    setAuthError(null);
    try {
      const result = await GloobalApi.register({
        // The real name, collected at the profile step just before this
        // one. It used to be the phone number: fullName was set to
        // fullMobileNumber because the name had not been asked for yet at
        // this point in the flow, so every account created here was stored
        // with its own mobile number as its display name.
        fullName: documentedName.trim(),
        mobileNumber: fullMobileNumber,
        symbolId: secureId,
        // The country picked on the phone-code step. POST /api/register-symbol
        // has always read this out of the body and stored it, but nothing ever
        // sent it — so the route's `undefined` fallback ran on every single
        // registration and wrote 'IN'. Every account in the database is
        // recorded as India-registered as a result, which is the root of the
        // wrong receiver flag and currency on Send Money: an American payee
        // resolved to countryIso 'IN' and was drawn with an Indian flag and ₹
        // on the sender's screen, and the FX conversion used INR as the
        // receiving currency. Sending it is what makes the stored country
        // real; server/scripts/backfill-country-iso.mjs repairs the accounts
        // written before this line existed.
        countryIso: dialCountry.iso,
        referredBy: referralCode || ""
      });
      setRegisteredUser(result.user);
      // Normally the same country that was just sent; read back from the
      // response so the client agrees with whatever the server actually
      // stored rather than with what it asked for.
      applyAccountCountry(result.user);
      const newSymbolId = result.user.symbolId || secureId;
      await GloobalApi.setPin(newSymbolId, pin);
      // The photo has no home on the backend (PUT /api/profile takes
      // fullName and email only), so it is written locally against the ID
      // that now exists. Done here rather than at the profile step because
      // that step runs before the account does.
      persistLocalProfile(newSymbolId, documentedName.trim(), profilePhoto);
      // The token exists from the register call, so the photo chosen at the
      // profile step can now become the account's server copy. Best-effort
      // and not awaited: a registration never waits on, or fails over, a
      // photo. Anything that does not land is retried at the next sign-in.
      pushOwnProfilePhoto(newSymbolId, profilePhoto);
      // This — not the register call above — is what actually sets the
      // name. POST /api/register-symbol destructures `fullName` out of the
      // body and then throws it away: it does
      // `cleanFullName = cleanMobileNumber` and stores that, so every
      // account it creates is named after its own phone number regardless
      // of what was sent. (Confirmed against live data: resolving an
      // existing account returns fullName "+2528685888888".) PUT
      // /api/profile/:symbolId is the only route that honours a real name,
      // so it is awaited rather than fired and forgotten — an earlier
      // version let it fail silently, which meant the name quietly stayed
      // as the phone number and nothing said so.
      //
      // It still must not fail the registration. The account and its PIN
      // both exist by now; a name that did not reach the server is worth a
      // warning and a retry, not throwing the whole thing away.
      try {
        await GloobalApi.updateProfile(newSymbolId, { fullName: documentedName.trim() });
      } catch (err) {
        setAuthError("Your name couldn't be saved to your profile just now — we'll retry next time you sign in.");
      }
      // The passkey has to be enrolled against an account that exists, so
      // the gate is told who it is working for only now.
      gloobalSetBiometricSymbolId(newSymbolId);
      // A bad referral code never fails the registration, so this is the
      // only place it can be reported.
      if (result.referralWarning) setAuthError(result.referralWarning);
      flipTo("biometric");
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthBusy(false);
    }
  };
  // Registration's biometric step: a real WebAuthn enrolment, not a timed
  // animation. On a phone this is the Face ID / Touch ID / fingerprint
  // prompt, and what it leaves behind is a passkey the backend verified
  // and stored — which is what every later gate checks against.
  //
  // Failure here never blocks the dashboard. Someone whose device has no
  // sensor, or who declines the prompt, still has a working account
  // protected by the PIN they just set; they are told it can be turned on
  // later rather than being held at a screen they cannot pass.
  const handleRegBiometricVerify = async () => {
    if (regBiometricScanning) return;
    setRegBiometricScanning(true);
    setBiometricNotice(null);
    const symbolId = (registeredUser && registeredUser.symbolId) || secureId;
    const result = await gloobalEnrolBiometric(symbolId);
    setRegBiometricScanning(false);
    if (registeredUser) GloobalApi.saveSession(registeredUser, phoneNumber, result.ok);
    if (!result.ok) {
      setBiometricNotice(`${result.reason} You can set this up later in Settings.`);
      return;
    }
    flipTo("dashboard");
  };
  // Skipping biometric setup. Kept explicit so declining is a decision the
  // person makes rather than something they have to fail their way past.
  const handleSkipRegBiometric = () => {
    if (registeredUser) GloobalApi.saveSession(registeredUser, phoneNumber, false);
    flipTo("dashboard");
  };
  // Name and photo, both mandatory, collected before the PIN so the
  // account is created with a real name on it.
  const handleSubmitProfile = () => {
    if (!docType || documentedName.trim().length < 2 || profilePhoto === G_LOGO_DATA_URI) return;
    // Written against the chosen Gloobal ID now and re-written against the
    // confirmed one after registration — the backend can hand back a
    // different symbolId, and this keeps the local copy findable either way.
    persistLocalProfile(secureId, documentedName.trim(), profilePhoto);
    flipTo("pin");
  };
  // POST /api/login — Secure ID + PIN, verified server-side against the
  // bcrypt hash. The backend locks the account for 10 minutes after 5 bad
  // attempts and says so in its message, which is surfaced as-is.
  // ── THREE SECONDS, THEN SAY SO ────────────────────────────────────────
  //
  // Long enough that a healthy request (a few hundred ms against a warm
  // service) never trips it, short enough that nobody is left staring at an
  // unresponsive PIN pad wondering whether their tap registered.
  //
  // The wait itself is Render's free plan spinning the service back up —
  // 20 to 50 seconds — and nothing here shortens it. This only stops it
  // looking like a fault.
  useEffect15(() => {
    if (!authBusy) {
      setAuthSlow(false);
      return undefined;
    }
    const t = setTimeout(() => setAuthSlow(true), 3000);
    return () => clearTimeout(t);
  }, [authBusy]);

  const handleSubmitLoginAuth = async () => {
    if (loginAuthPin.length !== PIN_LENGTH || authBusy) return;
    setAuthBusy(true);
    setAuthError(null);
    try {
      const symbolId = loginIdentifier || (registeredUser && registeredUser.symbolId) || secureId;
      const result = await GloobalApi.login(symbolId, loginAuthPin);
      setRegisteredUser(result.user);
      // Signing in on a new device: the country picker still holds whatever
      // was guessed at the phone step, and the account's own country is
      // authoritative over it.
      applyAccountCountry(result.user);
      // The backend resolved a mobile number to its account, so this is the
      // first point the Gloobal ID is known on that path.
      if (result.user && result.user.symbolId) setSecureId(result.user.symbolId);
      GloobalApi.saveSession(result.user, phoneNumber);
      gloobalSetBiometricSymbolId(result.user.symbolId || symbolId);
      setLoginAuthPin("");
      const loggedInSymbolId = result.user.symbolId || symbolId;
      const localProfile = loadLocalProfile(loggedInSymbolId);
      // Restore the name and photo for THIS login, not just the one at
      // page-mount (see the session-restore effect above, which only ever
      // runs once). handleStartOver blanks documentedName/profilePhoto back
      // to "" and the Gloobal placeholder on sign-out; nothing repopulated
      // them here, so anyone who signed out and back in during the same
      // browser tab saw "Gloobal ID Member" instead of their real name even
      // though it was safely stored both locally and on the backend the
      // whole time. The backend is the authority (per persistLocalProfile's
      // comment) except when its fullName is really just the account's own
      // mobile number — true of accounts created before the name step
      // existed, or before the register-symbol fix that stopped discarding
      // a real name at signup — in which case the locally cached name, if
      // there is one, is shown instead of a phone number.
      const serverName =
        result.user.fullName && result.user.fullName !== result.user.mobileNumber
          ? result.user.fullName
          : null;
      if (serverName) {
        setDocumentedName(serverName);
      } else if (localProfile && localProfile.name) {
        setDocumentedName(localProfile.name);
      }
      if (localProfile && localProfile.photo) setProfilePhoto(localProfile.photo);
      // The retry the registration step promises when PUT /api/profile
      // fails. The local copy is the one the person actually typed; if the
      // server still disagrees, push it again. Cheap, silent, and harmless
      // when it is already in sync (the condition is false). Never
      // awaited — a sign-in must not wait on a display name.
      if (localProfile && localProfile.name && localProfile.name !== result.user.fullName) {
        GloobalApi.updateProfile(loggedInSymbolId, { fullName: localProfile.name }).catch(() => {});
      }
      // Whatever the local session claims, the server knows whether this
      // account actually has a passkey. Asked once, here, so the next
      // screen already knows whether it is verifying or offering setup.
      const hasPasskey = await gloobalBiometricEnrolledRemote(result.user.symbolId || symbolId);
      if (hasPasskey !== null) GloobalApi.saveSession(result.user, phoneNumber, hasPasskey);
      // A device with no sensor at all cannot be asked for one. The PIN
      // just verified server-side is the whole check on that device, and
      // holding it at a prompt it can never satisfy would lock the person
      // out of their own account.
      if (!(await gloobalPlatformAuthenticatorAvailable())) {
        flipTo("dashboard");
        return;
      }
      // The account's own "Biometric login" setting, read from the user the
      // server just returned rather than from registeredUser — setRegisteredUser
      // above has not been applied to this render yet, so the state variable
      // still holds the previous account's answer (or none at all on a fresh
      // device), which is exactly the value not to decide a login on.
      //
      // ── Why this check is here (11 September 2026) ──────────────────────
      //
      // The switch is labelled "Use Face ID or fingerprint to log in" and it
      // did not do that. Turning it off set gloobalBiometricLoginEnabled,
      // which only requireBiometric reads — the in-app gates. This line, the
      // one login screen the label actually describes, consulted nothing and
      // sent every sensor-equipped device to the biometric step regardless.
      // So the setting was honoured everywhere except the thing it names.
      //
      // Skipping the step does NOT skip a check: POST /api/login has already
      // verified this account's PIN against its bcrypt hash one call ago, and
      // that is the same credential the no-sensor branch immediately above
      // relies on. An account with biometric login switched off is authorised
      // exactly as strictly as a device with no fingerprint reader.
      if (result.user && result.user.securitySettings &&
          result.user.securitySettings.biometricLogin === false) {
        flipTo("dashboard");
        return;
      }
      setBiometricNotice(null);
      flipTo("loginBiometric");
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthBusy(false);
    }
  };
  // Mandatory on every re-login, after the PIN. Enrolled accounts get a
  // real WebAuthn assertion; accounts that have never enrolled get the
  // offer here instead, so the second login is the last one without it.
  const handleLoginBiometricVerify = async () => {
    if (loginBiometricScanning) return;
    setLoginBiometricScanning(true);
    setBiometricNotice(null);
    const symbolId = (registeredUser && registeredUser.symbolId) || secureId;
    const enrolled = gloobalBiometricEnrolled();
    const result = enrolled ? await gloobalVerifyBiometric(symbolId) : await gloobalEnrolBiometric(symbolId);
    if (result.ok) {
      setLoginBiometricScanning(false);
      flipTo("dashboard");
      return;
    }
    // Failing the device check cannot be a dead end, and this is where it
    // used to become one. The enrolment flag stored at login is the
    // *account's* (the server answers "does this account have a passkey"),
    // but the assertion is the *device's* — so signing in on a second
    // phone reported "enrolled", ran a verify that can only fail because
    // the credential lives on the first phone, and got a NotAllowedError
    // rather than the 404 that would have offered enrolment. With no skip
    // shown for an enrolled account, the dashboard was unreachable on that
    // device, permanently. (Enrolling the second device is not an option
    // either: /api/passkey/register/options 409s once the account has one.)
    //
    // requireBiometric gives the device one more try — a misread finger is
    // the common case and deserves it — and then falls to the PIN, checked
    // server-side by POST /api/pin/verify. That is the same credential the
    // login one step ago was verified against, so this is still a real
    // check rather than a way past the gate.
    const verifiedByPin = await requireBiometric({
      symbolId,
      pinReason: "Confirm it's you with your PIN to finish signing in."
    });
    setLoginBiometricScanning(false);
    if (verifiedByPin) {
      flipTo("dashboard");
      return;
    }
    setBiometricNotice(
      result.notEnrolled
        ? "Set up Face ID or fingerprint, or confirm with your PIN, to finish signing in."
        : `${result.reason} Try again, or confirm with your PIN.`
    );
  };
  // Continue without biometrics. Only offered when there is nothing
  // enrolled to verify against — an account that HAS a passkey has to
  // satisfy the gate above (device check, or the PIN behind it), which is
  // what makes it mandatory rather than advisory.
  const handleSkipLoginBiometric = () => {
    if (gloobalBiometricEnrolled()) return;
    flipTo("dashboard");
  };
  const handleBackFromSecureId = () => {
    if (isLoginAttempt) {
      setIsLoginAttempt(false);
      setLoginEntryMode("id");
      setLoginMobileBuffer("");
      setLoginMobileCountry(null);
      setShowLoginFace(false);
      flipTo("phone");
    } else {
      flipTo("otp");
    }
  };
  const requestBackFromSecureId = useBackClose(stage === "secureId", handleBackFromSecureId);
  const requestBackFromReferral = useBackClose(stage === "referral", () => flipTo("secureId"));
  // Registration order is phone → OTP → Gloobal ID → referral → name and
  // photo → PIN → biometric, so these three walk back along that same
  // chain. The name/photo step moved ahead of the PIN so that the account
  // POST /api/register-symbol creates at the PIN step already carries the
  // person's real name.
  const requestBackFromProfile = useBackClose(stage === "profile", () => flipTo("referral"));
  const requestBackFromPin = useBackClose(stage === "pin", () => flipTo("profile"));
  // Registration's biometric step is terminal: the account exists and its
  // PIN is set, so there is nothing behind it to go back to — walking back
  // to the PIN would re-run POST /api/register-symbol for an account that
  // already exists.
  //
  // So Back does nothing here rather than being wired to the skip handler,
  // which made both the hardware Back gesture and the on-screen chevron
  // navigate *forward* into the dashboard — pressing Back signed you in.
  // Moving on without biometrics is the explicit "Set this up later"
  // button instead, which is a decision rather than a side effect.
  const requestBackFromRegBiometric = useBackClose(stage === "biometric", () => {});
  const requestBackFromLoginAuth = useBackClose(stage === "loginAuth", () => {
    setLoginAuthPin("");
    flipTo("secureId");
  });
  const requestBackFromLoginBiometric = useBackClose(stage === "loginBiometric", () => flipTo("loginAuth"));
  useEffect15(() => {
    const stage2 = stageRef.current;
    dimsRef.current = { w: stage2.clientWidth, h: stage2.clientHeight };
    for (let i = 0; i < 8; i++) {
      const p = makeParticle(dimsRef.current.w, dimsRef.current.h);
      p.y = Math.random() * dimsRef.current.h;
      p.spawnY = p.y + dimsRef.current.h * 0.5;
      p.scale = 1;
      p.opacity = 0.15 + Math.random() * 0.5;
      particlesRef.current.push(p);
    }
    forceRender((n) => n + 1);
    const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;
    const tick = () => {
      frameRef.current += 1;
      const { w, h } = dimsRef.current;
      const arr = particlesRef.current;
      for (const p of arr) {
        p.x += p.vx;
        p.y += p.vy;
        p.twinklePhase += p.twinkleSpeed;
      }
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = arr[i];
          const b = arr[j];
          const ra = Math.max(a.pw, a.ph) * a.scale / 2;
          const rb = Math.max(b.pw, b.ph) * b.scale / 2;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1e-4;
          const minDist = (ra + rb) * 0.9;
          if (dist < minDist) {
            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = minDist - dist;
            a.x -= nx * overlap * 0.5;
            a.y -= ny * overlap * 0.5;
            b.x += nx * overlap * 0.5;
            b.y += ny * overlap * 0.5;
            const push = 0.18;
            a.vx -= nx * push;
            a.vy -= ny * push * 0.25;
            b.vx += nx * push;
            b.vy += ny * push * 0.25;
            a.vx = Math.max(-1.3, Math.min(1.3, a.vx));
            b.vx = Math.max(-1.3, Math.min(1.3, b.vx));
            a.vy = Math.max(-1.6, Math.min(-0.15, a.vy));
            b.vy = Math.max(-1.6, Math.min(-0.15, b.vy));
          }
        }
      }
      for (const p of arr) {
        const distFromBottom = h - p.y;
        if (distFromBottom < 60) {
          p.opacity = Math.min(0.9, distFromBottom / 60);
        } else {
          p.opacity = 0.35 + Math.abs(Math.sin(p.twinklePhase)) * 0.55;
        }
        const traveled = p.spawnY - p.y;
        const growthRatio = Math.min(1, traveled / (h * 0.5));
        const eased = 1 - Math.pow(1 - growthRatio, 3);
        p.scale = GROWTH_START_SCALE + (1 - GROWTH_START_SCALE) * eased;
        const el = elsRef.current[p.id];
        if (el) {
          el.style.transform = `translate(${p.x}px, ${p.y}px) scale(${p.scale})`;
          el.style.opacity = p.opacity;
        }
      }
      let changed = false;
      particlesRef.current = arr.filter((p) => {
        const alive = p.y > -30 && p.x > -30 && p.x < w + 30;
        if (!alive) changed = true;
        return alive;
      });
      if (frameRef.current % 10 === 0 && particlesRef.current.length < MAX_PARTICLES) {
        particlesRef.current.push(makeParticle(w, h));
        changed = true;
      }
      if (changed) forceRender((n) => n + 1);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);
  // POST /api/otp/send. The backend records an Otp document against this
  // number; register-symbol later refuses (403) unless it finds a verified
  // one, so this step is what makes registration possible at all.
  const handleVerify = async () => {
    if (verifying || stage !== "phone") return;
    const digits = phoneNumber.replace(/\D/g, "");
    const [minLen, maxLen] = mobileDigitRange(dialCountry.iso);
    if (digits.length < minLen || digits.length > maxLen) return;
    setVerifying(true);
    setAuthError(null);
    setPhoneAlreadyRegistered(false);
    try {
      await GloobalApi.sendOtp(fullMobileNumber, "registration");
      flipTo("otp");
    } catch (err) {
      // 409 — the backend found an account on this number and deliberately
      // sent no OTP (see /api/otp/send). Registration cannot continue, so
      // this is shown inline on the phone card with a way straight into
      // login rather than as the generic error banner: the person's next
      // move is obvious and should be one tap, not a re-read of the form.
      if (err instanceof GloobalApiError && err.status === 409) {
        setPhoneAlreadyRegistered(true);
      } else {
        setAuthError(err.message);
      }
    } finally {
      setVerifying(false);
    }
  };
  // Switches the same phone number straight into the login flow. The
  // number is kept — it is the one thing already known to be correct.
  const handleSwitchToLogin = () => {
    setPhoneAlreadyRegistered(false);
    setAuthError(null);
    setShowLoginFace(true);
    setIsLoginAttempt(true);
    setLoginEntryMode("mobile");
    setLoginMobileBuffer(phoneNumber.replace(/\D/g, ""));
    setLoginMobileCountry(dialCountry);
    flipTo("secureId");
  };
  const [otpVerifying, setOtpVerifying] = useState19(false);
  // POST /api/otp/verify. On success the backend marks the OTP verified;
  // nothing is created yet — the account itself is written at the PIN step.
  const handleSubmitOtp = async () => {
    if (otp.length !== OTP_LENGTH2 || otpVerifying) return;
    setOtpVerifying(true);
    setAuthError(null);
    try {
      await GloobalApi.verifyOtp(fullMobileNumber, otp, "registration");
      flipTo("secureId");
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setOtpVerifying(false);
    }
  };
  // The account's Gloobal ID changed server-side (Dashboard → Update
  // Gloobal ID → PATCH /api/profile/change-symbol-id succeeded). Every
  // copy of the old one has to follow it in the same breath: React state,
  // the persisted session, the local profile blob, and the biometric
  // gate's idea of who it is checking. Any one left behind points the app
  // at an ID the backend no longer has.
  const handleGloobalIdChanged = (newSymbolId) => {
    if (!newSymbolId) return;
    const updatedUser = Object.assign({}, registeredUser || {}, { symbolId: newSymbolId });
    setRegisteredUser(updatedUser);
    setSecureId(newSymbolId);
    GloobalApi.saveSession(updatedUser, phoneNumber);
    // Writes the new ID into the stored session — the single source every
    // screen reads through useCurrentSymbolId — and fires
    // gloobal:symbolIdChanged so anything already on screen re-renders
    // with it. Without the event the Receive QR, the share card, Personal
    // Details and the referral link would each keep whatever they last
    // rendered until a reload.
    gloobalSessionSetSymbolId(newSymbolId);
    gloobalSetBiometricSymbolId(newSymbolId);
    // Re-keyed rather than moved: the name and photo are looked up by
    // Gloobal ID, so under the old key they would simply stop being found.
    persistLocalProfile(newSymbolId, documentedName.trim(), profilePhoto);
    // An upload still owed to the server follows the account to its new ID.
    const previousSymbolId = registeredUser && registeredUser.symbolId;
    if (previousSymbolId && previousSymbolId !== newSymbolId && ownProfilePhotoPending(previousSymbolId)) {
      setOwnProfilePhotoPending(newSymbolId, true);
      setOwnProfilePhotoPending(previousSymbolId, false);
    }
  };
  const handleStartOver = () => {
    // Web Push FIRST, before anything below clears the token.
    //
    // Dropping the server's subscription row is an authenticated call, and
    // the order is not cosmetic: run it after clearSession() and it comes
    // back 401, the row survives, and this device goes on receiving the
    // signed-out person's payment notifications — on a shared phone, into
    // somebody else's hands. It is deliberately not awaited (sign-out must
    // not wait on a cold Render) and cannot throw; see useWebPush.js.
    pushSyncedForRef.current = "";
    gloobalPushUnsubscribe();
    // The badge is the previous account's unread count. Left on the icon
    // it would be the one piece of their state still visible to whoever
    // signs in next.
    gloobalPushSetAppBadge(0);
    // Explicit sign-out: drop the remembered identity too, or the mount
    // effect restores it straight back to the lock screen.
    GloobalApi.clearSession();
    // The location fix this device captured belongs to whoever was signed
    // in when it was taken. Carrying it across a sign-out would attach one
    // person's whereabouts to another person's first payment.
    forgetPaymentLocation();
    // Same reasoning: the next person's first real arrival must not be
    // swallowed as "already notified".
    forgetPaymentNotifications();
    // My Choices is per account. Left in memory, the next person to sign
    // in on this device would see the previous one's spending labels —
    // "Baby", "Health" — which say more about somebody than most of what
    // this sign-out is careful to clear.
    choicesReset();
    // Money state first, before any of the identity state below is torn down.
    // This ledger lives in a useRef in LedgerProvider and survives sign-out,
    // so without this the next account to sign in inherits this one's seeds —
    // and hydrateGrantsFromServer refuses to restore into a non-empty grant
    // list, so the server's real seeds for the new account were never fetched
    // in. My Assets kept showing the previous person's cashback, and the
    // PayLater limit derived from it kept extending their credit.
    resetForAccountSwitch();
    setRegisteredUser(null);
    setAuthError(null);
    // The previous account's verdict about its own balance. Carrying it
    // across a sign-out told the NEXT person "Balance unavailable" — or,
    // worse, "ready" — about an account this app had not read yet.
    setBalanceStatus("loading");
    hydratedForRef.current = null;
    lastHydratedIdRef.current = null;
    // Everything the previous identity left behind. The biometric gate in
    // particular has to forget who it was working for, or the next
    // person's first guarded action would be checked against the signed-
    // out account's passkey.
    gloobalSetBiometricSymbolId(null);
    setPhoneAlreadyRegistered(false);
    setLoginIdResolved(false);
    setLoginIdentifier("");
    setBiometricNotice(null);
    setDocumentedName("");
    setDocType(null);
    setProfilePhoto(G_LOGO_DATA_URI);
    // Other people's photos were read under this account's token, and the
    // next account's own photo must be reconciled afresh.
    clearCounterpartyPhotoCache();
    ownPhotoSyncedForRef.current = null;
    setVerifying(false);
    setPhoneNumber("");
    setPhoneDialOpen(false);
    setShowLoginFace(false);
    setIsLoginAttempt(false);
    setLoginEntryMode("id");
    setLoginMobileBuffer("");
    setLoginMobileCountry(null);
    setShowLoginPicker(false);
    setLoginCountrySearch("");
    setSecureId("");
    setReferralCode("");
    setPin("");
    setOtp("123456");
    setLoginAuthPin("");
    setLoginBiometricScanning(false);
    flipTo("phone");
  };
  return <div
    ref={stageRef}
    style={{
      position: "fixed",
      inset: 0,
      width: "100%",
      height: "100%",
      background: "#ffffff",
      overflow: "hidden",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    }}
  >{particlesRef.current.map((p) => <div
    key={p.id}
    ref={(el) => {
      if (el) elsRef.current[p.id] = el;
      else delete elsRef.current[p.id];
    }}
    style={{
      position: "absolute",
      top: -(p.ph / 2),
      left: -(p.pw / 2),
      width: p.pw,
      height: p.ph,
      userSelect: "none",
      pointerEvents: "none",
      willChange: "transform, opacity",
      opacity: p.opacity
    }}
  ><FlagSignShape sign={p.sign} flag={p.flag} box={p.box} /></div>)}{
    /* Center focal circle — fills the previously-empty middle of
       this background. Outer wrapper is static (fixes true
       centering — an earlier version baked translate into the spin
       keyframe itself, which could drift). Center stays plain white;
       the boundary always has a subtle low-opacity colored glow, and
       tapping the circle boosts that same glow to a higher opacity
       briefly before it settles back down. Rotation shows as a
       subtle white shine sweeping around the ring. */
  }{SHOW_PHONE_HERO_CIRCLE && stage === "phone" && !phoneNumber && !phoneDialOpen && <button
    onClick={handleHeroCircleTap}
    aria-label="Gloobal ID"
    style={{
      position: "absolute",
      top: "38%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: 176,
      height: 176,
      borderRadius: "50%",
      background: "#fff",
      border: "none",
      padding: 0,
      cursor: "pointer",
      boxShadow: heroCircleTapped ? `0 0 0 1px rgba(0,0,0,0.04), 0 0 30px 8px ${heroCircleColors[0]}70, 0 0 55px 16px ${heroCircleColors[2]}55` : `0 0 0 1px rgba(0,0,0,0.04), 0 0 22px 4px ${heroCircleColors[0]}28, 0 0 40px 8px ${heroCircleColors[2]}1c`,
      transition: "box-shadow 0.4s ease",
      overflow: "hidden",
      zIndex: 0
    }}
  ><div
    style={{
      position: "absolute",
      inset: -20,
      background: "conic-gradient(rgba(255,255,255,0) 0deg, rgba(255,255,255,0.9) 25deg, rgba(255,255,255,0) 70deg, rgba(255,255,255,0) 360deg)",
      animation: "pureSpin 4s linear infinite",
      pointerEvents: "none"
    }}
  /></button>}{
    /* Back — sits in the same top-left corner regardless of stage,
       separate from the flipping card itself so it never overlaps or
       shifts the card's own corner controls (eye toggles, flip icons).
       The Secure ID / Referral corner tab used to sit left-aligned here
       too and could collide with this button on shorter screens; it's
       now centered on the card instead, so the two can never overlap.
       Covers the steps that had no way back: registration's Secure ID
       (→ OTP), login's Secure ID (→ phone), and Referral (→ Secure ID). */
  }{(stage === "secureId" || stage === "referral") && <NavBackButton onClick={stage === "referral" ? requestBackFromReferral : requestBackFromSecureId} style={{
      position: "absolute",
      top: "calc(18px + env(safe-area-inset-top, 0px))",
      left: "calc(18px + env(safe-area-inset-left, 0px))",
      zIndex: 25
     }} />}{
    /* Explain this screen — the mirror of the Back chevron above, in the
       opposite corner, on the two screens that ask for something the
       person has never seen before: twelve symbols off a pad with no
       letters on it, and somebody else's twelve with no statement of what
       handing it over does. Shown on Secure ID whether creating or
       logging in — the symbol glossary is what makes an existing ID
       readable too, not only a new one. Nothing else occupies this corner
       at screen level: the card's own controls (eye toggles, the
       flip-to-mobile button) live on the card, which starts ~74px lower. */
  }{(stage === "secureId" || stage === "referral") && <HelpCornerButton
    onClick={() => setHelpSheet(stage === "referral" ? "referral" : "symbols")}
    label={stage === "referral" ? "How the referral network works" : "What the GLOOBAL ID symbols mean"}
  />}{
    /* Mounted only while their own stage is active, so leaving the stage
       unmounts the sheet and useBackClose's cleanup pops its history
       entry — rather than leaving an open sheet, or a stranded back-stack
       entry, behind on a screen it does not belong to. */
  }{(stage === "secureId" || helpSheet === "symbols") && <SymbolIdHelpSheet open={helpSheet === "symbols"} onClose={() => setHelpSheet(null)} />}{stage === "referral" && <ReferralHelpSheet open={helpSheet === "referral"} onClose={() => setHelpSheet(null)} />}{
    /* "Gloobal ID" wordmark — now shown on every early registration/
       login screen: phone entry, Secure ID (creating a new one,
       logging in with an existing one, or logging in by phone), and
       referral — not just the very first phone screen. */
  }{(stage === "phone" || stage === "secureId" || stage === "referral") && <div
    style={{
      position: "absolute",
      top: "calc(22px + env(safe-area-inset-top, 0px))",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 20,
      fontSize: 22,
      fontWeight: 800,
      letterSpacing: 0.5,
      color: T.ink,
      fontFamily: T.fontDisplay
    }}
  ><GloobalWordmark suffix=" ID" withSymbols /></div>}<div
    style={{
      position: "absolute",
      top: "calc(74px + env(safe-area-inset-top, 0px))",
      left: "50%",
      bottom: "6%",
      transform: "translateX(-50%)",
      // The card is still exactly 92% / 340px wide: the extra 48px here is
      // padding, not card. See the overflow note below for why it exists.
      width: "calc(92% + 48px)",
      maxWidth: 340 + 48,
      padding: "0 24px",
      boxSizing: "border-box",
      zIndex: 20,
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-end",
      // No horizontal scrollbar, ever — this is where the dark line under
      // the symbol/digit row came from.
      //
      // This was `overflowY: "auto"` with overflow-x left at its `visible`
      // default, which CSS does not allow: when one axis is not `visible`,
      // the other computes to `auto`. So the column was silently
      // horizontally scrollable — and the cards inside deliberately hang
      // controls outside their own box, the flip-to-login /
      // flip-to-mobile button most of all at `right: -18`. Those 18px gave
      // the column a horizontal scroll range, and Chrome paints a scroll
      // range as a track: the dark line, on exactly the REGISTRATION and
      // LOGIN cards (the two with that button) and not on OTP, whose
      // controls all sit inside the card's width.
      //
      // Pinning overflow-x to hidden on its own would clip 18px off that
      // button. The 24px of horizontal padding above is what makes that
      // safe: the overhang now falls inside the column's own padding box
      // rather than past its edge, so there is no horizontal overflow left
      // to scroll and nothing gets cut. Vertical scrolling is kept —
      // the dial pad genuinely does not fit on a short screen, and
      // dropping it there would strand the card off the top.
      overflowY: "auto",
      overflowX: "hidden",
      WebkitOverflowScrolling: "touch"
    }}
  ><div style={{ perspective: 800, position: "relative", flexShrink: 0, maxWidth: "100%" }}><div
    style={{
      position: "relative",
      width: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      transform: flipping ? "rotateY(90deg)" : "rotateY(0deg)",
      transition: "transform 0.22s ease"
    }}
  >{
    /* The Secure ID / Referral card itself — unmoved, unchanged:
       same shadows, border radius, corner label, and counter as
       before. Just the card; the dial and button now live below
       it instead of inside it. */
  }<div
    style={{
      position: "relative",
      zIndex: 1,
      width: "100%",
      minHeight: stage === "phone" ? 96 : 100,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "18px 14px",
      borderRadius: T.radiusLg,
      boxShadow: T.shadowFloat,
      border: `1px solid ${T.line}`,
      background: T.surface,
      boxSizing: "border-box",
      overflow: "visible"
    }}
  >{
    /* Corner shine — soft, low-opacity colored glows at each
       corner, clipped to their own inset wrapper so the
       card's own overflow:visible (needed for the corner
       label/counter) stays untouched. Center stays plain
       white — this is decoration at the edges only. */
  }<div style={{ position: "absolute", inset: 0, borderRadius: T.radiusLg, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}><div style={{ position: "absolute", top: -30, left: -30, width: 100, height: 100, borderRadius: "50%", background: `radial-gradient(circle, ${POSITION_COLORS[0]}22, transparent 70%)` }} /><div style={{ position: "absolute", top: -30, right: -30, width: 100, height: 100, borderRadius: "50%", background: `radial-gradient(circle, ${POSITION_COLORS[2]}22, transparent 70%)` }} /><div style={{ position: "absolute", bottom: -30, left: -30, width: 100, height: 100, borderRadius: "50%", background: `radial-gradient(circle, ${POSITION_COLORS[3]}1c, transparent 70%)` }} /><div style={{ position: "absolute", bottom: -30, right: -30, width: 100, height: 100, borderRadius: "50%", background: `radial-gradient(circle, ${POSITION_COLORS[1]}1c, transparent 70%)` }} /></div>{stage === "phone" && <PhoneConnector
    country={dialCountry}
    phoneNumber={phoneNumber}
    onOpenPicker={() => setShowPicker(true)}
    onOpenDial={() => setPhoneDialOpen(true)}
    dialOpen={phoneDialOpen}
    onActivate={handleVerify}
    verifying={verifying}
    showLogin={showLoginFace}
    onLoginTap={() => {
      setIsLoginAttempt(true);
      setLoginEntryMode("id");
      setLoginMobileBuffer("");
      setLoginMobileCountry(null);
      flipTo("secureId");
    }}
  />}{
    /* Number already has an account. Shown inside the card, under the
       number it is about, rather than in the root error banner: this
       is not a failure to retry, it is a fork in the flow, and the
       way out of it is the tap directly below the message. */
  }{stage === "phone" && phoneAlreadyRegistered && <div style={{ width: "100%", marginTop: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}><span role="alert" style={{ fontSize: 12, fontWeight: 700, color: T.negative, textAlign: "center", lineHeight: 1.4 }}>
                  This number is already registered.
                </span><button
    onClick={handleSwitchToLogin}
    className="v2-tap"
    style={{
      border: "none",
      background: "none",
      padding: "4px 6px",
      color: T.accent,
      fontSize: 12.5,
      fontWeight: 800,
      cursor: "pointer"
    }}
  >
                  Log in instead →
                </button></div>}{
    /* Flip to log in — on the card's own boundary now, not on
       the call button, same treatment as the Secure ID card's
       flip icon. Keeps a slow, continuous spin on its own (not
       tied to being tapped) so it reads as "this can be flipped"
       at a glance instead of sitting there looking static. */
  }{stage === "phone" && <button
    onClick={() => {
      setShowLoginFace(true);
      setIsLoginAttempt(true);
      setLoginEntryMode("id");
      setLoginMobileBuffer("");
      setLoginMobileCountry(null);
      flipTo("secureId");
    }}
    aria-label="Flip to log in"
    className="v2-tap"
    style={{
      position: "absolute",
      top: -20,
      right: -18,
      width: 48,
      height: 48,
      borderRadius: "50%",
      border: `1.5px solid ${T.line}`,
      background: T.surface,
      color: T.accent,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      boxShadow: T.shadowRaised,
      zIndex: 3
    }}
  ><RefreshCw6 size={22} style={{ animation: "iconAttention 2s linear infinite" }} /></button>}{stage === "phone" && <span
    style={{
      position: "absolute",
      top: -11,
      left: 16,
      background: T.surface,
      border: `1px solid ${T.line}`,
      borderRadius: 7,
      padding: "3px 9px",
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: T.accent,
      boxShadow: T.shadowCard,
      minWidth: 44,
      textAlign: "center",
      whiteSpace: "nowrap"
    }}
  ><CyclingBadge words={["Registration", <GloobalWordmark key="g" withSymbols />, "Id"]} intervalMs={2600} /></span>}{stage === "secureId" && <span
    style={{
      position: "absolute",
      top: -11,
      left: 16,
      transform: "none",
      background: T.surface,
      border: `1px solid ${T.line}`,
      borderRadius: 7,
      padding: "3px 9px",
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: T.accent,
      boxShadow: T.shadowCard,
      minWidth: 44,
      textAlign: "center",
      whiteSpace: "nowrap"
    }}
  >{isLoginAttempt ? <CyclingBadge words={["Login", <GloobalWordmark key="g" withSymbols />, "Id"]} intervalMs={2600} /> : <CyclingBadge words={["Create", "Secure", <GloobalWordmark key="g" withSymbols />, "Id"]} intervalMs={2600} />}</span>}{stage === "referral" && <span
    style={{
      position: "absolute",
      top: -11,
      left: 16,
      transform: "none",
      background: T.surface,
      border: `1px solid ${T.line}`,
      borderRadius: 7,
      padding: "3px 9px",
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: T.accent,
      boxShadow: T.shadowCard,
      whiteSpace: "nowrap"
    }}
  >
                  Referral ID
                </span>}{stage === "otp" && <span
    style={{
      position: "absolute",
      top: -11,
      left: 16,
      background: T.surface,
      border: `1px solid ${T.line}`,
      borderRadius: 7,
      padding: "3px 9px",
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: T.accent,
      boxShadow: T.shadowCard
    }}
  >
                  Verify OTP
                </span>}{
    /* Edit number — flips back to the phone step, same corner
       spot the flip-to-login icon uses on that step. */
  }{stage === "otp" && <button
    onClick={() => flipTo("phone")}
    aria-label="Edit phone number"
    className="v2-tap"
    style={{
      position: "absolute",
      top: -11,
      right: 16,
      background: "none",
      border: "none",
      color: T.accent2,
      fontSize: 10.5,
      fontWeight: 700,
      cursor: "pointer",
      padding: "3px 4px"
    }}
  >
                  Edit number
                </button>}{
    /* Eye toggle: mask/reveal the code — same on both
       registration and login, but only relevant in ID mode.
       Shifted left of its usual spot on login so it doesn't
       collide with the bigger flip-to-mobile icon in the
       top-right corner. */
  }{
    /* Eye toggle for OTP — shifted left of "Edit number" so the
       two controls don't collide in the same top-right corner. */
  }{stage === "otp" && <button
    onClick={() => setOtpRevealed((v) => !v)}
    aria-label={otpRevealed ? "Hide OTP" : "Show OTP"}
    className="v2-tap"
    style={{
      position: "absolute",
      top: -11,
      right: 90,
      width: 24,
      height: 24,
      borderRadius: "50%",
      border: `1px solid ${T.line}`,
      background: T.surface,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      boxShadow: T.shadowCard,
      zIndex: 2
    }}
  ><MaskEyeIcon open={otpRevealed} color={T.inkSoft} /></button>}{stage === "secureId" && (!isLoginAttempt || loginEntryMode === "id") && <button
    onClick={() => setSecureIdRevealed((v) => !v)}
    aria-label={secureIdRevealed ? "Hide Secure ID" : "Show Secure ID"}
    className="v2-tap"
    style={{
      position: "absolute",
      top: -11,
      right: isLoginAttempt ? 68 : 16,
      width: 24,
      height: 24,
      borderRadius: "50%",
      border: `1px solid ${T.line}`,
      background: T.surface,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      boxShadow: T.shadowCard,
      zIndex: 2
    }}
  ><MaskEyeIcon open={secureIdRevealed} color={T.inkSoft} /></button>}{
    /* Eye toggle for the mobile login number — same boundary
       spot the Secure ID eye uses in ID mode (right: 68, clear
       of the bigger flip-to-mobile icon in the corner). */
  }{stage === "secureId" && isLoginAttempt && loginEntryMode === "mobile" && <button
    onClick={() => setLoginMobileRevealed((v) => !v)}
    aria-label={loginMobileRevealed ? "Hide mobile number" : "Show mobile number"}
    className="v2-tap"
    style={{
      position: "absolute",
      top: -11,
      right: 68,
      width: 24,
      height: 24,
      borderRadius: "50%",
      border: `1px solid ${T.line}`,
      background: T.surface,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      boxShadow: T.shadowCard,
      zIndex: 2
    }}
  ><MaskEyeIcon open={loginMobileRevealed} color={T.inkSoft} /></button>}{
    /* Flip to mobile — login only. Fixed to the card's top-right
       corner (not tied to the card's height, which changes
       between ID and mobile content) so it's always in the same
       reachable spot in both modes. Twice the size of the eye
       toggle, and visibly rotates on tap. */
  }{stage === "secureId" && isLoginAttempt && <button
    onClick={() => setLoginEntryMode((m) => m === "id" ? "mobile" : "id")}
    aria-label={`Switch to ${loginEntryMode === "id" ? "mobile number" : "Gloobal ID"}`}
    className="v2-tap"
    style={{
      position: "absolute",
      top: -20,
      right: -18,
      width: 48,
      height: 48,
      borderRadius: "50%",
      border: `1.5px solid ${T.line}`,
      background: T.surface,
      color: T.accent,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      boxShadow: T.shadowRaised,
      zIndex: 3
    }}
  ><RefreshCw6
    size={22}
    style={{
      transform: loginEntryMode === "mobile" ? "rotate(180deg)" : "rotate(0deg)",
      transition: "transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)"
    }}
  /></button>}{stage === "referral" && <button
    onClick={() => setReferralRevealed((v) => !v)}
    aria-label={referralRevealed ? "Hide Referral ID" : "Show Referral ID"}
    className="v2-tap"
    style={{
      position: "absolute",
      top: -11,
      right: 16,
      width: 24,
      height: 24,
      borderRadius: "50%",
      border: `1px solid ${T.line}`,
      background: T.surface,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      boxShadow: T.shadowCard
    }}
  ><MaskEyeIcon open={referralRevealed} color={T.inkSoft} /></button>}{stage === "secureId" && (!isLoginAttempt || loginEntryMode === "id") && <SymbolChipRow length={SECURE_ID_LENGTH} value={secureId} masked={!secureIdRevealed} />}{stage === "secureId" && isLoginAttempt && loginEntryMode === "mobile" && <div style={{ position: "relative", display: "flex", alignItems: "center", width: "100%", gap: 10 }}><button
    onClick={() => setShowLoginPicker(true)}
    aria-label={`Country: ${effectiveLoginCountry.name}. Tap to change`}
    style={{ flexShrink: 0, width: 46, height: 40, borderRadius: 13, border: `1px solid ${T.line}`, background: T.surface, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
  ><FlagEmoji flag={effectiveLoginCountry.flag} width={38} height={32} radius={6} dropShadow="drop-shadow(0 4px 10px rgba(76,29,149,0.18))" /></button>{
    /* Masked by default, revealed with the eye toggle that
       now sits on the card's boundary (top-right corner)
       instead of inline here — same spot the Secure ID eye
       uses in ID mode. */
  }<div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", background: T.surfaceAlt, border: `1px solid ${T.line}`, borderRadius: T.radiusMd, padding: "9px 13px" }}><span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, letterSpacing: loginMobileRevealed ? 0 : 2, color: loginMobileBuffer ? T.ink : T.inkFaint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{loginMobileBuffer ? loginMobileRevealed ? loginMobileBuffer.replace(/(\d{3})(?=\d)/g, "$1 ") : loginMobileBuffer.replace(/\d/g, "\u2022").replace(/(.{3})(?=.)/g, "$1 ") : "Mobile number"}</span></div></div>}{stage === "referral" && <SymbolChipRow length={REFERRAL_LENGTH} value={referralCode} masked={!referralRevealed} />}{stage === "otp" && <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, width: "100%" }}><span style={{ fontSize: 11.5, color: T.inkFaint, fontWeight: 600, textAlign: "center" }}>
                    Enter the code sent to {dialCountry.dialCode} {phoneNumber}</span><SymbolChipRow length={OTP_LENGTH2} value={otp} masked={!otpRevealed} boxSize={34} justify="center" /></div>}</div>{
    /* Symbol dial pad — same compact grid-button pattern as
       PhoneDialPad, sized down so the card, dial, and button all
       stay fully visible together on one screen. */
  }{stage === "secureId" && (!isLoginAttempt || loginEntryMode === "id") && <div style={{ marginTop: 32, position: "relative", zIndex: 1, width: "100%" }}><SymbolDialPad value={secureId} onChange={setSecureId} length={SECURE_ID_LENGTH} /></div>}{
    /* Two ready-made IDs — creation only, never shown while
       logging in, since login needs the person's existing ID,
       not a fresh suggestion.
       (This comment has always said "Two"; the row actually
       rendered one. It renders two now, so the two finally agree.
       Someone meeting the symbol alphabet for the first time has no
       basis on which to judge a single arbitrary string — a pair
       side by side is a choice they can actually make. The Update
       Gloobal ID screen still passes no count and still gets one:
       replacing an ID you already have is a different, more
       considered decision.) */
  }{stage === "secureId" && !isLoginAttempt && <SuggestedIdRow id={suggestedRegId} onPick={setSecureId} />}{
    /* Login only: proof the ID resolves to a real account, shown before
       the PIN screen rather than after a sign-in that would have failed
       for a reason the person could not see. */
  }{stage === "secureId" && isLoginAttempt && loginEntryMode === "id" && loginIdResolved && <div style={{ width: "100%", display: "flex", justifyContent: "center", marginTop: 12 }}><span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "6px 12px",
      borderRadius: 999,
      background: T.accentSoft,
      border: `1px solid ${T.line}`,
      color: T.positive,
      fontSize: 11.5,
      fontWeight: 800
    }}
  >
                  ✓ Account found
                </span></div>}{stage === "secureId" && isLoginAttempt && loginEntryMode === "mobile" && <div style={{ marginTop: 28, position: "relative", zIndex: 1, width: "100%" }}><PhoneDialPad
    value={loginMobileBuffer}
    onChange={setLoginMobileBuffer}
    minLength={loginMinLen}
    maxLength={loginMaxLen}
    onSubmit={handleSubmitSecureId}
  /></div>}{stage === "referral" && <div style={{ marginTop: 32, position: "relative", zIndex: 1, width: "100%" }}><SymbolDialPad value={referralCode} onChange={setReferralCode} length={REFERRAL_LENGTH} /></div>}{stage === "phone" && phoneDialOpen && <div style={{ marginTop: 28, position: "relative", zIndex: 1, width: "100%" }}><PhoneDialPad
    value={phoneNumber}
    onChange={(next) => {
      // Editing the number retracts the "already registered" verdict —
      // it was about the previous digits, not these.
      setPhoneAlreadyRegistered(false);
      setPhoneNumber(next);
    }}
    minLength={mobileDigitRange(dialCountry.iso)[0]}
    maxLength={mobileDigitRange(dialCountry.iso)[1]}
    onSubmit={handleVerify}
  /></div>}{
    /* OTP dial pad — the numeric code is 6 digits, entered with
       the exact same dial pad as the mobile number step, not the
       symbol dial used for the 12-character Secure/Referral ID. */
  }{stage === "otp" && <div style={{ marginTop: 28, position: "relative", zIndex: 1, width: "100%" }}><PhoneDialPad value={otp} onChange={setOtp} minLength={OTP_LENGTH2} maxLength={OTP_LENGTH2} onSubmit={handleSubmitOtp} processing={otpVerifying} /></div>}{stage === "secureId" && !isLoginAttempt && <div style={{ marginTop: 20 }}><SubmitButton
    onClick={handleSubmitSecureId}
    disabled={secureId.length !== SECURE_ID_LENGTH || authBusy}
    label={authBusy ? (authSlow ? "Waking the server…" : "Checking…") : "Submit"}
  /></div>}{stage === "secureId" && isLoginAttempt && loginEntryMode === "id" && <div style={{ marginTop: 20, display: "flex", justifyContent: "center" }}><CircularInButton
    onClick={handleSubmitSecureId}
    disabled={secureId.length !== SECURE_ID_LENGTH || authBusy}
    size={44}
  /></div>}{stage === "referral" && <div style={{ marginTop: 20, display: "flex", flexDirection: "column", alignItems: "center" }}><SubmitButton
    onClick={handleSubmitReferral}
    disabled={referralCode.length !== REFERRAL_LENGTH || authBusy}
    label={authBusy ? (authSlow ? "Waking the server…" : "Checking…") : void 0}
  /><button
    onClick={() => flipTo("profile")}
    style={{
      marginTop: 10,
      border: "none",
      background: "none",
      color: T.accent2,
      fontSize: 12,
      fontWeight: 700,
      cursor: "pointer",
      padding: "6px 8px"
    }}
  >
                  Skip for now
                </button></div>}{stage === "otp" && <div style={{ marginTop: 20, display: "flex", flexDirection: "column", alignItems: "center" }}><button
    onClick={() => setOtp("")}
    style={{
      border: "none",
      background: "none",
      color: T.accent2,
      fontSize: 12,
      fontWeight: 700,
      cursor: "pointer",
      padding: "6px 8px"
    }}
  >
                  Resend code
                </button></div>}</div></div></div>{stage === "phone" && !phoneDialOpen && <div style={{ position: "absolute", left: "50%", bottom: "3%", transform: "translateX(-50%)", zIndex: 20, width: "100%", padding: "0 16px", display: "flex", justifyContent: "center" }}><span
    style={{
      fontSize: 9.5,
      fontWeight: 700,
      letterSpacing: 0.4,
      color: T.inkFaint,
      textTransform: "uppercase",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      maxWidth: "100%"
    }}
  >
            Cashless · Taxless · Borderless · Limitless
          </span></div>}{stage === "permissions" && <PermissionsGateScreen onContinue={handleContinueFromPermissionsGate} />}{stage === "pin" && <PinScreen
    value={pin}
    length={PIN_LENGTH}
    onChange={setPin}
    onSubmit={handleSubmitPin}
    onBack={requestBackFromPin}
    revealed={pinRevealed}
    onToggleReveal={() => setPinRevealed((v) => !v)}
    busy={authBusy}
  />}{stage === "biometric" && <BiometricVerifyScreen
    // No back chevron: this step is terminal (see
    // requestBackFromRegBiometric). A control that cannot go anywhere is
    // worse than no control.
    onBack={null}
    onVerify={handleRegBiometricVerify}
    scanning={regBiometricScanning}
    notice={biometricNotice}
    // The account and its PIN both exist by this point, so declining is a
    // real choice rather than an abandoned registration.
    onSkip={handleSkipRegBiometric}
    skipLabel="Set this up later"
  />}{stage === "profile" && <ProfileSetupScreen
    onBack={requestBackFromProfile}
    onSubmit={handleSubmitProfile}
    photo={profilePhoto}
    onChangePhoto={setProfilePhoto}
    docType={docType}
    onSelectDocType={setDocType}
    name={documentedName}
    onChangeName={setDocumentedName}
  />}{stage === "loginAuth" && <LoginAuthScreen
    value={loginAuthPin}
    length={PIN_LENGTH}
    onChange={setLoginAuthPin}
    onSubmit={handleSubmitLoginAuth}
    onBack={requestBackFromLoginAuth}
    revealed={loginAuthRevealed}
    onToggleReveal={() => setLoginAuthRevealed((v) => !v)}
    waking={authBusy && authSlow}
    busy={authBusy}
  />}{stage === "loginBiometric" && <BiometricVerifyScreen
    onBack={requestBackFromLoginBiometric}
    onVerify={handleLoginBiometricVerify}
    scanning={loginBiometricScanning}
    notice={biometricNotice}
    // No skip once a passkey exists — that is what makes this mandatory
    // on every re-login rather than a suggestion. An account with nothing
    // enrolled is offered setup here instead, and may defer it.
    onSkip={gloobalBiometricEnrolled() ? null : handleSkipLoginBiometric}
    skipLabel="Not now"
  />}{stage === "dashboard" && <Dashboard_default
    dialCountry={dialCountry}
    onLogout={handleStartOver}
    onOpenSend={(opts) => {
      setSendPrefillChoiceId((opts && opts.choiceId) || null);
      setActiveScreen("send");
    }}
    // ── PAYING A CREATOR FROM THEIR OWN PAGE ──────────────────────────
    //
    // The basket decided WHO and HOW MUCH; everything after that is the
    // ordinary Send screen — same resolve, same PIN, same ledger, same
    // receipt. A creator page must not grow a second way to move money.
    //
    // The amount is carried as a prefill rather than paid outright,
    // because the founder's rule for this button is that the payer still
    // sees the figure on the Send screen and confirms it there.
    onPayCreator={({ creator, amount }) => openSendToCreator(creator, amount)}
    // The dashboard's quick-pay box: a person it found and checked goes to
    // Send exactly as a scanned QR does — same prefill, same confirm.
    onPayPerson={(payee) => {
      if (!payee || !payee.gloobalId) return;
      setSendPrefillChoiceId(null);
      openSendToPayee(payee);
    }}
    onOpenBank={() => setActiveScreen("bank")}
    onOpenCoverage={() => setActiveScreen("coverage")}
    onOpenScan={() => setShowScanScreen(true)}
    myGloobalId={secureId}
    creatorId={creatorId}
    myName={documentedName}
    openHistoryDirection={dashboardHistoryDirection}
    onConsumeOpenHistory={() => setDashboardHistoryDirection(null)}
    deepLinkTarget={dashboardDeepLink}
    onConsumeDeepLink={() => setDashboardDeepLink(null)}
    pendingOpenMyShare={pendingOpenMyShare}
    onConsumePendingMyShare={() => setPendingOpenMyShare(false)}
    profilePhoto={profilePhoto}
    onChangeProfilePhoto={handleChangeProfilePhoto}
    // The account's own number, for Personal Details. Held in this session
    // since registration and restored with the session on login.
    // The ACCOUNT's number, not the one in the phone pad — see
    // accountMobileNumber. This was fullMobileNumber, which is assembled
    // from form state and reads as a bare dial code after any sign-in that
    // did not go through the phone step.
    mobileNumber={accountMobileNumber}
    // Every Gloobal ID this account has ever used, from the server. The
    // Update History screen used to show only renames made in THIS session,
    // so it was empty again after every login — see idUpdateHistory there.
    idHistory={(registeredUser && registeredUser.symbolIdHistory) || []}
    // The short handle the invite link uses instead of the Gloobal ID. Comes
    // back on every response that carries a user, so it is already here by
    // the time the share sheet can be opened. Empty until the server has
    // answered once — Dashboard falls back to the long link for that window,
    // which is exactly what it did before this existed.
    referralCode={(registeredUser && registeredUser.referralCode) || ""}
    securitySettings={securitySettings}
    onUpdateSecuritySettings={handleUpdateSecuritySettings}
    onChangePin={handleChangePin}
    sendHistory={sendMoneyHistory}
    receivedHistory={receivedMoneyHistory}
    bankBalance={bankBalance}
    balanceStatus={balanceStatus}
    balanceUnavailable={balanceStatus === "error"}
    onRefreshAccount={handleRefreshAccount}
    assetSeeds={assetSeeds}
    onPayBusiness={handlePayBusiness}
    paylaterHistory={paylaterHistory}
    accountCreatedAt={accountCreatedAt}
    onSettleAssetsToBank={handleSettleAssetsToBank}
    onSettleReferralToBank={handleSettleReferralToBank}
    essentialsIHaveEnough={essentialsIHaveEnough}
    onToggleEssentialsIHaveEnough={handleToggleEssentialsIHaveEnough}
    onShareRoleChange={setActiveShareRole}
    onGloobalIdChange={handleGloobalIdChanged}
  />}{
    /* Scan to pay. The camera reads a Gloobal QR (a static pay link), the
       server names the account behind it, and Send Money takes the amount.
       Nothing is paid from this screen. */
  }{showScanScreen && (() => {
    const closeScanScreen = () => {
      setShowScanScreen(false);
      setScanPayee(null);
      setScanError(null);
      setScanRetry(null);
      setScanCameraAccessGranted(false);
    };
    // The camera is the screen, not a picture on it, whenever it is actually
    // scanning — not before permission, and not once a code has resolved and
    // there is a confirm card to look at.
    const scanLive = scanCameraAccessGranted && !scanPayee;
    return <><ScanOverlayBlocksMap /><div style={{
      position: "fixed", inset: 0, zIndex: 400,
      // ── BLACK WHILE AIMING, LIGHT ONCE IT LANDS ─────────────────────
      //
      // A dark frame is what lets somebody see the picture they are
      // pointing at a code, so the camera keeps its black. The moment a
      // code resolves, a white confirmation card floating on a black
      // field reads as an error dialog — which is the one thing a
      // payment card must not read as.
      //
      // The page then goes to WHITE with a trace of the payee's hue in
      // it, and the colour itself goes on the card. The first build had
      // that the other way round, and the founder inverted it: the field
      // is the biggest thing on screen and the card is the only thing
      // anybody reads, so colouring the field spent all that area in the
      // place nobody looks.
      //
      // The hue is derived from the scanned ID and nothing else: no
      // setting, no shop's own colour, nobody choosing. See
      // scanBackdrop.js for why that also makes it impossible for the
      // colour to shift under somebody mid-payment.
      background: scanPayee ? scanPageTint(scanPayee.gloobalId) : "#000",
      transition: "background 0.45s ease",
      display: "flex", flexDirection: "column", overflow: "hidden"
    }}>{
    /* The camera layer. A direct child of the overlay rather than an item
       in the column below, which is what lets it run edge to edge behind
       the back button. Paused while a lookup runs and after a failed one,
       until the person taps to go again. */
  }{scanLive && <QrCameraScanner
    fullScreen
    active={showScanScreen}
    paused={scanResolving || Boolean(scanRetry)}
    onDetected={handleQrScanned}
    // Every control off the picture while the screen is saying
    // something. The scanner is paused in exactly those moments anyway.
    quiet={Boolean(scanResolving || scanError || scanRetry)}
    onUploadRequested={() => {
      setScanError(null);
      setScanRetry(null);
      if (scanGalleryInputRef.current) scanGalleryInputRef.current.click();
    }}
  />}<div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><NavBackButton onClick={closeScanScreen} />{
    /* ── ONE TITLE, CENTRED, AND IT NAMES THE THING ──────────────────────
       It was a two-line block pinned beside the back button: "Scan QR"
       over "Point at any Gloobal code". Two faults in that.
       "Scan QR" names the ACTION, and the action is already obvious from
       a camera with a square drawn on it. What is not obvious is WHICH
       codes this reads — it is not a general QR scanner, it will only
       resolve a Gloobal code — so the title is the name of the thing.
       And a subtitle in the header is an instruction printed where the
       eye is not: somebody holding a phone up at a code is looking at
       the square, not at a caption above it. It moved under the camera,
       below. */
  }<span style={{
    flex: 1, textAlign: "center", fontSize: 17, fontWeight: 800, fontFamily: T.fontDisplay,
    // White over the camera, where it needs a shadow to survive whatever
    // the lens is pointed at. Ink once the page goes light, where white
    // would simply be gone — the title is the same title either way and
    // only the ground under it changed.
    color: scanPayee ? T.ink : "#FFFFFF",
    textShadow: scanPayee ? "none" : "0 1px 8px rgba(0,0,0,0.5)"
  }}>
          <GloobalWordmark /> QR
        </span>{
    /* The back button's own width, so the title is centred on the SCREEN
       rather than on the space left over beside it. Without this it sits
       27px right of centre, which is just enough to read as a mistake
       and not enough to read as a decision. */
  }{scanPayee ? <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>{
    /* ── THE CORNER, ONCE A CODE HAS LANDED ───────────────────────────
       Both of these lived inside the card: the scan mark under the Pay
       button, and nothing at all for "show me what this shop sells".
       Under Pay is the wrong place for either — it is the row a thumb is
       already heading for, and a control there is a control somebody
       reaches past or hits by accident on the screen where a mistake
       costs money.

       In the corner they are where every other secondary control in this
       app lives, and the card below holds only the thing it is for. */
  }{scanPayee.creator ? <NavIconButton
    onClick={() => {
      const creator = scanPayee.creator;
      closeScanScreen();
      setActiveScreen("home");
      setDashboardDeepLink({ creator });
    }}
    label={`See what ${creatorDisplayName(scanPayee.creator)} sells`}
  ><Store4 size={NAV_GLYPH_SIZE} color={T.ink} /></NavIconButton> : null}<NavScanButton
    onClick={() => setScanPayee(null)}
    label="Scan another code"
  /></div> : <span aria-hidden="true" style={{ width: 42, flexShrink: 0 }} />}</div>{
    /* ── AND THE WORDS WENT BACK UNDER THE CAMERA ────────────────────────
       They were under it once, moved above the frame, and have now moved
       back. The history is worth keeping because the reason changed.
       They were moved UP because the band under the square held the
       control row, the zoom arc and any message the screen had to say,
       all at once — the founder photographed the arc drawn through the
       instruction line and "This is your own QR" behind the flashlight.
       The arc is gone: the zoom is drawn inside the square now, on its
       right-hand edge. That band holds the control row and nothing else,
       so there is room again, and under the picture is where an
       instruction about aiming belongs — it is the last thing read on
       the way from the square to the thumb.
       Anchored at 160: the control row sits at 96 and is 52 tall, so
       this clears it by 12, and one line of 12.5px type reaches about
       180 against a square whose lower edge is never nearer than ~281.
       A MESSAGE still replaces it rather than joining it — same
       condition as before — because two sentences in one band is the
       fault this screen already had once. */
  }{scanLive && !scanPayee && !scanError && !scanRetry && !scanResolving && <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      bottom: "calc(160px + env(safe-area-inset-bottom, 0px))",
      zIndex: 1,
      display: "flex",
      justifyContent: "center",
      padding: "0 24px",
      pointerEvents: "none"
    }}
  ><div
    style={{ fontSize: 12.5, color: "rgba(255,255,255,0.92)", textAlign: "center", lineHeight: 1.5, fontWeight: 600, textShadow: "0 1px 6px rgba(0,0,0,0.6)" }}
  >
      Point at any <GloobalWordmark /> code
    </div></div>}<input
      ref={scanGalleryInputRef}
      type="file"
      accept="image/*"
      onChange={handleScanGalleryFile}
      style={{ display: "none" }}
    />{!scanCameraAccessGranted ? (
    // ── ONE SCREEN, NOT TWO ──────────────────────────────────────────────
    //
    // This was a separate white page: an ambient background, a 200px circle
    // with a scan mark in it, a headline, and a button. Granting replaced
    // the whole thing with a black screen and a square. The founder asked
    // for the two to be one — "build that permission screen upon the real
    // camera".
    //
    // The live camera cannot literally be behind this: no browser hands
    // over pixels before consent, so on a first run there is nothing to
    // show. Everything else is shared. Same black ground, same title, same
    // framing square from QrFrameGuide in the same place at the same size,
    // same Send button at the bottom. Granting fills the square that is
    // already on screen; nothing moves, and there is no white-to-black
    // flash between the two.
    //
    // "Allow Access" still only flips this flag — the real request happens
    // when QrCameraScanner mounts and calls getUserMedia, which is what
    // puts the browser's own prompt up. Keeping our ask in front of it is
    // deliberate: a prompt somebody taps away without reading is a denial
    // that takes a trip into browser settings to undo.
    <><QrFrameGuide><ScannerIcon size={52} animated color="#FFFFFF" /><div
      style={{ fontSize: 16, fontWeight: 800, color: "#FFFFFF", fontFamily: T.fontDisplay, marginTop: 14 }}
    >
                  Allow camera access
                </div><div
      style={{ fontSize: 12.5, color: "rgba(255,255,255,0.78)", lineHeight: 1.45, marginTop: 6 }}
    >
                  Your browser will ask you to confirm.
                </div><button
      onClick={() => setScanCameraAccessGranted(true)}
      className="v2-tap"
      style={{
        marginTop: 18,
        border: "none",
        borderRadius: 999,
        padding: "12px 32px",
        background: T.gradButton,
        color: "#fff",
        fontSize: 14,
        fontWeight: 800,
        cursor: "pointer",
        boxShadow: "0 8px 20px rgba(124,58,237,0.35)"
      }}
    >
                  Allow Access
                </button>{scanError && <div
      role="alert"
      style={{ fontSize: 12, color: "#fff", background: T.negative, borderRadius: 10, padding: "7px 12px", textAlign: "center", fontWeight: 700, marginTop: 14, lineHeight: 1.4 }}
    >{scanError}</div>}</QrFrameGuide>{
    /* Where the scanner's own control row sits, so the gallery picker does
       not move when the camera comes up. It stays reachable here because a
       code that arrived as a screenshot never needs the camera at all. */
  }<div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: "calc(132px + env(safe-area-inset-bottom, 0px))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2
      }}
    ><button
      onClick={() => {
        // Opens the picker. This used to set scanCameraAccessGranted and
        // nothing else — a control labelled "Upload from gallery" that
        // revealed the camera view instead, decoding nothing, leaving no
        // route in for a device whose camera is blocked or for a code that
        // arrived as a screenshot.
        setScanError(null);
        if (scanGalleryInputRef.current) scanGalleryInputRef.current.click();
      }}
      className="v2-tap"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        border: "1px solid rgba(255,255,255,0.35)",
        borderRadius: 999,
        padding: "10px 18px",
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(6px)",
        color: "#fff",
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer"
      }}
    ><ImageIcon size={16} />
                  Upload from gallery
                </button></div><div
      style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "0 24px calc(26px + env(safe-area-inset-bottom, 0px))" }}
    >{
    /* Was a div reading "Enter Mobile Number to Pay" that was styled to
       look like a text field but was not one — no input, no handler, no
       tap target. It could not be typed into and it did nothing, which is
       the worst kind of control: it advertised a way to pay someone
       without a code and then refused to take it.

       This is that promise kept. It opens the real Send flow, where a
       number or a Gloobal ID can actually be entered. */
  }<ScanSendButton onClick={() => { closeScanScreen(); setActiveScreen("send"); }} /></div></>
  ) : <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: scanLive ? "flex-end" : "center", padding: "0 24px calc(26px + env(safe-area-inset-bottom, 0px))", gap: 16 }}>{!scanPayee ? <>{
    /* Upload moved into the scanner's own control row, beside the torch and
       the zoom. */
  }{(scanResolving || scanError || scanRetry) && <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      // The band the torch and the picker sit in when there is nothing to
      // say. They are hidden whenever this is showing — see `quiet` on
      // QrCameraScanner — so the two can never be here at once, which is
      // the collision the founder photographed.
      bottom: "calc(96px + env(safe-area-inset-bottom, 0px))",
      zIndex: 2,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 11,
      padding: "0 24px"
    }}
  >{scanResolving && <div
    style={{ fontSize: 12.5, color: "rgba(255,255,255,0.92)", textAlign: "center", lineHeight: 1.5, fontWeight: 600, textShadow: "0 1px 6px rgba(0,0,0,0.6)" }}
  >
      Looking this QR up…
    </div>}{scanError && <div
    role="alert"
    style={{ fontSize: 12.5, color: "#fff", background: T.negative, borderRadius: 12, padding: "9px 15px", textAlign: "center", fontWeight: 700, maxWidth: 300, lineHeight: 1.4 }}
  >{scanError}</div>}{scanRetry && <button
    onClick={() => {
      setScanError(null);
      setScanRetry(null);
    }}
    className="v2-tap"
    style={{ border: "none", borderRadius: 999, padding: "10px 24px", background: "rgba(255,255,255,0.94)", color: T.accent, fontSize: 13.5, fontWeight: 800, cursor: "pointer" }}
  >{scanRetry}</button>}</div>}<ScanSendButton overVideo onClick={() => { closeScanScreen(); setActiveScreen("send"); }} /></> : <div style={{
    width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", alignItems: "center"
  }}><div style={{
    width: "100%", borderRadius: T.radiusXl,
    // The payee's own hue, derived from the code that was scanned.
    background: scanBackdropCss(scanPayee.gloobalId),
    boxShadow: "0 18px 44px rgba(20,18,43,0.28)",
    border: "none",
    padding: "26px 22px", textAlign: "center", position: "relative",
    // ── THE CARD WAS 44px WIDER THAN IT ASKED TO BE ──────────────────
    //
    // Found by measuring, while checking that the ribbon hangs the right
    // amount off each side: the wrapper came back 340 and the card
    // inside it 384 — its own horizontal padding, added on top, because
    // nothing here had declared a box model.
    //
    // There IS a `* { box-sizing: border-box }` in the app, but it lives
    // in a style tag inside SendMoney, so the width of this card
    // depended on whether that screen had ever mounted. Declared here,
    // where it is relied on.
    boxSizing: "border-box"
  }}>{
    /* ── TWO CORNERS ───────────────────────────────────────────────────
       Top left, the GH2H hallmark the Receive QR card carries in the
       same corner; top right, the payee's country flag in a circle. Both
       sit in the card's padding, level with the title, so neither covers
       the name or the mark below it. */
  }<span style={{ position: "absolute", top: 18, left: 16, zIndex: 1 }}><GH2HFlipCircle size={30} /></span>{(() => {
    const iso = String((scanPayee.creator && scanPayee.creator.countryIso) || scanPayee.countryIso || "").toUpperCase();
    const c = iso && typeof COUNTRY_BY_ISO !== "undefined" ? COUNTRY_BY_ISO[iso] : null;
    return c ? <span title={c.name} style={{ position: "absolute", top: 18, right: 16, zIndex: 1, display: "flex" }}><FlagEmoji flag={c.flag} shape="circle" size={30} border="inset 0 0 0 2px rgba(255,255,255,0.9)" /></span> : null;
  })()}<div style={{ fontSize: 19, fontWeight: 700, color: "rgba(255,255,255,0.92)", letterSpacing: 0.2, margin: "2px 40px 14px", lineHeight: "30px" }}>{
    /* "Gloobal बाजार" for a shop — the brand in bold, the word for market
       in Devanagari, as asked. Not upper-cased: Devanagari has no case,
       and a transform that shouts one half of a two-word name and cannot
       touch the other makes the pair look like two labels. */
    scanPayee.creator
      ? <><b style={{ fontWeight: 900, color: "#FFFFFF" }}><GloobalWordmark /></b> {"\u092C\u093E\u091C\u093E\u0930"}</>
      : <><b style={{ fontWeight: 900, color: "#FFFFFF" }}><GloobalWordmark /></b> ID</>
  }</div>{
    /* ── A SHOP IS SHOWN AS ITS SHOP ──────────────────────────────────
       Scanning a sticker on a tea stall used to give the owner's face and
       the owner's given name — true, and not what anybody standing in
       front of the stall is trying to pay. When the account behind the
       code has a creator name, the card leads with the shop's own mark
       and the shop's own name, and the person's details stay on the
       account they belong to.
       The mark falls back to the generated one, so a shop that has not
       uploaded a logo still looks like itself rather than like a gap. */
  }{scanPayee.creator
    ? <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>{scanPayee.creator.logo
      ? <img
        src={scanPayee.creator.logo}
        alt=""
        style={{ width: 72, height: 72, borderRadius: 22, objectFit: "cover", display: "block" }}
      />
      : <span style={{
        width: 72, height: 72, borderRadius: 22,
        background: businessMarkInk(scanPayee.creator.handle || "").bg,
        color: businessMarkInk(scanPayee.creator.handle || "").fg,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 25, fontWeight: 800, fontFamily: T.fontDisplay
      }}>{businessMarkInitials(scanPayee.creator.handle || "")}</span>
    }</div>
    : <ScanPayeeAvatar gloobalId={scanPayee.gloobalId} name={scanPayee.name} />
  }{
    /* The name the server returned for this account — a QR carries no name,
       so nothing printed on a sticker can put one here. */
  }<div style={{
    fontSize: 16, fontWeight: 800, color: "#FFFFFF",
    // 6 for everybody again, now that nothing is drawn between the name
    // and the Gloobal ID. It was tightened to 2 to make room for the
    // handle line; left at 2 it would sit the name on top of the ID.
    marginBottom: 10,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8
  }}><span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{
    scanPayee.creator ? creatorDisplayName(scanPayee.creator) : scanPayee.name
  }</span>{
    /* ── THE EYE ─────────────────────────────────────────────────────
       On a shop's card the name is what you pay; the account behind it
       — the GLOOBAL ID and the shop's number — is one tap away rather
       than always on show. */
    scanPayee.creator ? <button
      type="button"
      data-testid="scan-reveal-details"
      onClick={() => setScanDetailsShown((v) => !v)}
      aria-pressed={scanDetailsShown}
      aria-label={scanDetailsShown ? "Hide the shop's details" : "Show the shop's details"}
      className="v2-tap"
      style={{
        width: 32, height: 32, flexShrink: 0, borderRadius: "50%", border: "none", padding: 0, cursor: "pointer",
        background: scanDetailsShown ? "#FFFFFF" : "rgba(255,255,255,0.18)",
        color: scanDetailsShown ? scanBackdropFor(scanPayee.gloobalId).from : "#FFFFFF",
        display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.2s ease"
      }}
    >{scanDetailsShown ? <EyeOffScan size={16} /> : <EyeScan size={16} />}</button> : null
  }</div>{
    /* The handle used to go here, under the name. It was the same word
       again — `रसोई Ghar` over `रसोई.ghar` — on the card somebody reads
       in the half-second before they pay, which is the worst screen in
       the app to spend a line on nothing. The Gloobal ID below already
       says this is an account money can reach. */
  }{(() => {
    // A person's card always shows the ID. A shop's shows it, with the
    // shop's number, only when the eye beside the name is open.
    if (scanPayee.creator && !scanDetailsShown) return <div style={{ height: 8 }} />;
    const contacts = (scanPayee.creator && ((scanPayee.creator.shop && scanPayee.creator.shop.contacts) || scanPayee.creator.contacts)) || {};
    const number = scanPayee.creator ? (contacts.phone || contacts.whatsapp || scanPayee.mobileNumber || "") : "";
    return <>{number ? <div data-testid="scan-shop-number" style={{
      display: "inline-flex", alignItems: "center", gap: 6, maxWidth: "100%",
      background: "rgba(255,255,255,0.18)", color: "#FFFFFF", borderRadius: 999,
      padding: "6px 14px", marginBottom: 8, fontSize: 13, fontWeight: 800, letterSpacing: 0.3
    }}>{number}</div> : null}{number ? <br /> : null}<div style={{
    // ── THE ID KEEPS ITS OWN WHITE GROUND ────────────────────────────
    //
    // ColoredGloobalId draws every symbol in a different colour from a
    // rotating rainbow. Those are chosen to read on the app's white
    // surface, and half of them — the blues, the deep violet — would
    // disappear into a dark card. So the ID sits on a white pill
    // instead of on the colour, which also gives the one piece of data
    // on this card a frame of its own.
    display: "inline-flex", maxWidth: "100%",
    background: "#FFFFFF", borderRadius: 999,
    padding: "7px 14px", marginBottom: 18,
    fontSize: 13, color: T.inkSoft
  }}><ColoredGloobalId id={scanPayee.gloobalId} /></div></>;
  })()}<button
    onClick={handleSendToScanned}
    className="v2-tap"
    style={{
      // White on the hue, not the app's violet gradient on it. A violet
      // button on a teal card is two unrelated colours arguing over the
      // most important control on the screen; white is the hue's own
      // highest contrast and reads as the primary action on all twelve.
      width: "100%", border: "none", borderRadius: T.radiusMd, padding: "15px 0",
      background: "#FFFFFF", color: scanBackdropFor(scanPayee.gloobalId).from,
      fontSize: 15, fontWeight: 800, cursor: "pointer",
      boxShadow: "0 4px 14px rgba(0,0,0,0.18)"
    }}
  >Pay</button></div>{
    /* ── WHAT THE CODE ITSELF SAYS ────────────────────────────────────
       A line the creator wrote for whoever scans them, and the only
       place it appears. "Cash only after 9pm", "Order number on the
       slip please" — the things a counter says out loud, said by the
       code instead.

       It was a panel INSIDE the card, under the Pay button. It is a
       ribbon hanging BELOW the card now — "like a two side hanging and
       little flowing" — and the move is right for a reason the first
       version missed: inside, it was one more thing in the box somebody
       is reading to decide whether to pay, which is exactly where a
       shopkeeper's aside does not belong. Hanging off the bottom it is
       plainly attached to them and plainly not part of the decision.

       Below the button either way, never above: above, it would sit
       between the name and the button and push Pay down the screen on
       every card that has one.

       A little WIDER than the card, by fifteen pixels on each side, so
       both ends show — which is what makes it read as a band strung
       under the card rather than as a second card that happens to be
       bigger. The two triangles at the ends are the folds; a fold is in
       shadow, which is why they are darker than the band.

       Capped at 120 characters by the server, so it cannot grow into a
       notice board under somebody's thumb. */
  }{scanPayee.creator && scanPayee.creator.scanNote ? <ScanNoteStrip
    text={scanPayee.creator.scanNote}
    seed={scanPayee.gloobalId}
    // The shape the creator picked — ribbon, tag, ticker, bubble, slip,
    // note, pill or bunting. The colour is still the code's, not the
    // style's; see scanNoteStrip.jsx.
    styleKey={scanPayee.creator.scanNoteStyle}
    speaker={creatorDisplayName(scanPayee.creator)}
  /> : null}</div>}</div>}</div></>;
  })()}{
    /* A shared receipt link, opened on a payment in this account's own
       history. The same read-only document History shows. */
  }{stage === "dashboard" && linkedReceipt && <ReceiptModal receipt={linkedReceipt} onClose={requestCloseLinkedReceipt} />}{
    /* The server-held notification list. Tapping a payment row hands the
       transaction reference straight to the shared-receipt state above, so
       it opens through the same lookup a "?txn=" link uses rather than a
       second receipt path of its own. */
  }<NotificationsSheet
    open={showNotifications}
    onClose={() => setShowNotifications(false)}
    onOpenTransaction={(txnId) => setSharedTxnRef(txnId)}
    pushState={pushState}
  /><LocationRequiredModal
    open={Boolean(locationGate)}
    reason={locationGate && locationGate.reason}
    busy={locationGateBusy}
    onRetry={handleLocationGateRetry}
    // Dismissing IS cancelling the payment — nothing was posted, so there
    // is nothing to undo, and the modal only ever appears in place of a
    // payment that did not happen.
    onClose={() => setLocationGate(null)}
  />{activeScreen === "send" && <div style={{ position: "fixed", inset: 0, zIndex: 190, overflowY: "auto", WebkitOverflowScrolling: "touch" }}><SendMoney_default
    onClose={() => {
      setSendPrefillReceiver(null);
      requestCloseActiveScreen();
    }}
    // The signed-in account itself: the sender card shows these, not
    // placeholders.
    sender={{ ...dialCountry, phoneNumber, fullName: documentedName, symbolId: secureId, mobileNumber: (registeredUser && registeredUser.mobileNumber) || fullMobileNumber }}
    prefillReceiver={sendPrefillReceiver}
    prefillChoiceId={sendPrefillChoiceId}
    history={sendMoneyHistory}
    // Tapping a row in Send Money's Recent list opens that payment's
    // receipt. A BUILDER rather than a handler: Send Money owns the modal
    // (it already has one for the payment it just made, so a second one
    // hosted from here would stack two modals in two stacking contexts),
    // while the decision of which receipt to build needs this level's two
    // full history lists and the viewer's country.
    onBuildRowReceipt={buildRowReceipt}
    onSendComplete={handleSendMoneyComplete}
    onExecuteTransaction={handleExecuteTransaction}
    onRemoteSend={handleRemoteSend}
    onDrawEssentials={drawEssentialsForPayment}
    essentialsDailyLimit={computeEssentialsBaseline(dialCountry.iso).dailyTotal}
    onOpenPaidHistory={() => {
      requestCloseActiveScreen();
      setDashboardHistoryDirection("sending");
    }}
    onOpenScan={() => {
      requestCloseActiveScreen();
      setShowScanScreen(true);
    }}
  /></div>}{activeScreen === "bank" && <ScreenErrorBoundary name="Add bank" onClose={requestCloseActiveScreen}><AddBankScreen onClose={requestCloseActiveScreen} country={dialCountry} /></ScreenErrorBoundary>}{activeScreen === "coverage" && <ScreenErrorBoundary name="Gloobal Coverage" onClose={requestCloseActiveScreen}><GloobalCoverageScreen
    onClose={requestCloseActiveScreen}
    dialCountry={dialCountry}
    sendHistory={sendMoneyHistory}
    isFullyRegistered={stage === "dashboard"}
    coverageRefreshToken={coverageRefreshToken}
    onOpenMyShare={() => {
      requestCloseActiveScreen();
      setPendingOpenMyShare(true);
    }}
    onContributeToProject={openSendToProject}
  /></ScreenErrorBoundary>}{
    /* Backend errors, shown over every stage — the PIN and login screens
       are their own full-screen overlays, so an in-card banner would be
       invisible on exactly the steps most likely to fail. The backend's
       own message is surfaced as-is ("PIN must be 4 to 6 digits",
       "Please verify OTP before registration", "Account locked"), since
       it is already more specific than anything generic here. */
  }{authError && <div
    role="alert"
    onClick={() => setAuthError(null)}
    style={{
      position: "fixed",
      left: "50%",
      transform: "translateX(-50%)",
      bottom: "calc(24px + env(safe-area-inset-bottom, 0px))",
      zIndex: 999,
      width: "calc(100% - 40px)",
      maxWidth: 340,
      padding: "12px 16px",
      borderRadius: 14,
      background: "#FEF2F2",
      border: "1px solid rgba(220,38,38,0.3)",
      boxShadow: "0 10px 30px rgba(0,0,0,0.14)",
      color: "#B91C1C",
      fontSize: 12.5,
      fontWeight: 600,
      lineHeight: 1.45,
      textAlign: "center",
      cursor: "pointer"
    }}
  >{authError}</div>}{
    /* Sits at the root so it can cover any screen a guarded action was
       started from — Send Money, the Dashboard sheets, Scan & Pay — not
       just the auth flow. */
  }<BiometricPinFallbackModal
    open={Boolean(pinFallbackRequest)}
    symbolId={(registeredUser && registeredUser.symbolId) || secureId}
    reason={pinFallbackRequest && pinFallbackRequest.reason}
    onResolve={resolvePinFallback}
  />{showDiagnostics && <DiagnosticsScreen onClose={closeDiagnostics} />}{showPicker && <CountryPickerScreen
    topCountries={TOP_COUNTRIES}
    countries={ALL_COUNTRIES}
    search={countrySearch}
    onSearch={setCountrySearch}
    selectedIso={dialCountry.iso}
    onSelect={(c) => {
      setDialCountry(c);
      setShowPicker(false);
      setCountrySearch("");
    }}
    onClose={() => {
      setShowPicker(false);
      setCountrySearch("");
    }}
  />}{showLoginPicker && <CountryPickerScreen
    topCountries={TOP_COUNTRIES}
    countries={ALL_COUNTRIES}
    search={loginCountrySearch}
    onSearch={setLoginCountrySearch}
    selectedIso={(loginMobileCountry || dialCountry).iso}
    onSelect={(c) => {
      setLoginMobileCountry(c);
      setLoginMobileBuffer("");
      setShowLoginPicker(false);
      setLoginCountrySearch("");
    }}
    onClose={() => {
      setShowLoginPicker(false);
      setLoginCountrySearch("");
    }}
  />}<style>{`
        /* Space Grotesk has no 800 face — asking for one here got the
           whole weight dropped and left T.fontDisplay's 800 rendering as
           700. Inter keeps its 800: that is the weight the GLOOBAL
           wordmark (T.fontWordmark) is built on. index.html carries the
           same two families as a <link>, which is what actually loads
           them on first paint; this @import is the fallback for contexts
           that render this component without that shell. */
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes phoneFlipPop { from { transform: scale(0.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes badgePop { from { transform: translateY(-3px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes iconAttention { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .phone-flip-btn { animation: phoneFlipPop 0.28s cubic-bezier(0.22, 1, 0.36, 1); }
        /* finDrift and finGlow are declared by AppSymbolBg itself now, with
           the component that uses them — see the note there. These copies
           stay because the registration flow's own flag particles animate
           on finDrift too, and that flow renders above this block rather
           than inside the background component. The dot and geo keyframes
           went with FinDotField and FinGeoField. */
        @keyframes finDrift {
          0% { transform: translate3d(0, 0, 0) rotate(var(--r0)); opacity: 0; }
          12% { opacity: var(--peak-op); }
          88% { opacity: var(--peak-op); }
          100% { transform: translate3d(var(--dx), var(--dy), 0) rotate(var(--r1)); opacity: 0; }
        }
        @keyframes finGlow {
          0%, 100% { filter: none; }
          50% { filter: drop-shadow(0 0 6px currentColor) brightness(1.5); }
        }
        @media (prefers-reduced-motion: reduce) {
          [aria-hidden="true"] span, [aria-hidden="true"] div { animation: none !important; opacity: 0 !important; }
        }
        @keyframes signalWave {
          0%, 100% { transform: scale(0.6); opacity: 0.3; box-shadow: none; }
          50% { transform: scale(1.35); opacity: 1; box-shadow: 0 0 6px 2px rgba(124,58,237,0.55); }
        }
        button:focus-visible {
          outline: 2px solid #3b6ef5;
          outline-offset: 2px;
        }
        /* Shared Version 2 tap/row feedback \u2014 used across registration,
           dashboard, country picker, and PIN screens for a consistent,
           lightweight "premium" press feel. Purely visual, no logic. */
        .v2-tap { transition: transform 0.1s ease, box-shadow 0.15s ease, background 0.15s ease; }
        .v2-tap:active { transform: scale(0.94); }
        .v2-row { transition: background 0.15s ease; }
        .v2-row:hover { background: rgba(124,58,237,0.05); }
        .v2-row:active { background: rgba(124,58,237,0.09); }
        @keyframes successPop {
          0% { transform: scale(0.5); opacity: 0; }
          60% { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .v2-success-pop { animation: successPop 0.35s cubic-bezier(.34,1.56,.64,1); }
        /* GH Score dashboard indicator \u2014 a soft circle that blinks through
           a rotating set of light colors instead of showing a static
           score card. Color-cycle and opacity-blink run as two separate
           animations so the color changes read as "random" against the
           blink's own rhythm rather than always landing in sync. */
        @keyframes ghColorCycle {
          0%   { background: #FDE68A; }
          14%  { background: #A7F3D0; }
          28%  { background: #BFDBFE; }
          42%  { background: #FBCFE8; }
          57%  { background: #DDD6FE; }
          71%  { background: #FED7AA; }
          85%  { background: #FCA5A5; }
          100% { background: #FDE68A; }
        }
        @keyframes ghBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
        .gh-blink-circle {
          animation: ghColorCycle 7s linear infinite, ghBlink 1.6s ease-in-out infinite;
        }
        /* The scan mark, everywhere it appears as something to tap.
           Roughly three seconds a colour, which is what the founder asked
           for: long enough to be a change somebody notices rather than a
           flicker they only feel. One property for the whole mark — the
           corners stroke in currentColor and the code blocks fill in it —
           so the two halves cannot drift out of step. */
        @keyframes scanMarkCycle {
          0%, 26%   { color: #7C3AED; }
          33%, 59%  { color: #1781CC; }
          66%, 92%  { color: #1C8F74; }
          100%      { color: #7C3AED; }
        }
        .scan-mark-cycle { animation: scanMarkCycle 9s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
          .v2-tap:active { transform: none; }
          /* Stopped outright, not sped up. The rule above collapses every
             animation to a millisecond, which for an INFINITE colour cycle
             is not "no motion" but a strobe — the exact thing somebody
             asking for reduced motion is protecting themselves from. */
          .scan-mark-cycle { animation: none !important; }
        }
      `}</style>{rootToast && <div
    style={{
      position: "fixed",
      bottom: "calc(28px + env(safe-area-inset-bottom, 0px))",
      left: "50%",
      transform: "translateX(-50%)",
      background: "#15132A",
      color: "#fff",
      fontSize: 13.5,
      fontWeight: 600,
      padding: "10px 18px",
      borderRadius: 999,
      zIndex: 9999,
      whiteSpace: "nowrap",
      boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
      pointerEvents: "none"
    }}
  >{rootToast}</div>}<AppMapLauncher entries={appMapEntries} currentKey={appMapCurrentKey} onLockedPress={handleAppMapLockedPress} />{
    /* ── THE IN-APP BANNER IS GONE ────────────────────────────────────

       A payment arriving while the app was open used to be drawn by the
       app, as a card slid over whatever screen was up, INSTEAD of being
       handed to the operating system. That was one notification in two
       shapes depending on where the person happened to be looking, and
       the founder's answer to seeing all three side by side was to keep
       the one in the tray and the one in the bell, and drop this.

       So the branch that chose between them is gone too: every payment
       now goes to the tray, whether the app is in front of the person
       or not. See usePaymentNotifications.

       The gloobal:paymentBanner event it listened for still fires —
       it is the "money moved while this page was visible" signal, and
       My Choices reloads its totals on it. */
  }</div>;
}