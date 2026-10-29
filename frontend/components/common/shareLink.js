// src/components/common/shareLink.js
//
// SHARING A GLOOBAL LINK SO IT ARRIVES AS A LINK.
//
// "Share is a text, not a link." Two separate faults produced that:
//
//   1. The creator profile's Share sent "Pay me on Gloobal at rasoi.ghar"
//      and nothing else — no address at all, so there was nothing to tap.
//   2. The QR card passed the address in `url` AND inside `text`. What a
//      receiving app does with those two fields is up to the app: some
//      keep only `text`, some only `url`, some join them, and a picture
//      shared with `files` has its `url` dropped by most Android targets.
//
// So the link always travels INSIDE the message, on its own line at the
// end — the one place every messenger (WhatsApp, Telegram, SMS, Gmail)
// turns into a tappable link — and `url` is never set separately, which
// is what made it appear twice or not at all.
//
// The order of attempts, each falling through only when the one before is
// refused (a person closing the sheet is a choice, not a failure):
//   1. the picture, when there is one and this phone can share files;
//   2. the message with the link;
//   3. copy the message, and say so.
function gloobalShareMessage(message, url) {
  const m = String(message || "").trim();
  return url ? (m ? `${m}\n${url}` : url) : m;
}

async function gloobalShareLink({ title = "", message = "", url = "", file = null, onToast } = {}) {
  const text = gloobalShareMessage(message, url);
  const nav = typeof navigator !== "undefined" ? navigator : null;
  if (file && nav && typeof nav.canShare === "function" && typeof nav.share === "function") {
    try {
      if (nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title, text });
        return "shared";
      }
    } catch (error) {
      if (error && error.name === "AbortError") return "cancelled";
      // A refused picture still has a link to send — fall through.
    }
  }
  if (nav && typeof nav.share === "function") {
    try {
      await nav.share(title ? { title, text } : { text });
      return "shared";
    } catch (error) {
      if (error && error.name === "AbortError") return "cancelled";
    }
  }
  try {
    await nav.clipboard.writeText(text);
    if (onToast) onToast("Link copied");
    return "copied";
  } catch (error) {
    if (onToast) onToast(url || "Couldn't share right now");
    return "failed";
  }
}
