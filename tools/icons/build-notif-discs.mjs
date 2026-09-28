// tools/icons/build-notif-discs.mjs
//
// Draws the eight coloured discs a notification is shown with, into
// public/icons/notif/disc-0.png … disc-7.png. Developer tooling: not
// shipped as source, but its OUTPUT is — the PNGs are committed, because a
// deploy must not depend on Python and Pillow being present.
//
// Why these exist at all. In the app, a payment notification carries the
// Gloobal mark in white on a coloured circle, and the colour is picked from
// the notification's own id so each row keeps its own (LOGO_FLIP_COLORS in
// frontend/constants/theme.js, gloobalNotifDiscIndex in
// components/cards/notificationCard.jsx). On the lock screen the same
// notification is drawn by the operating system, which will show an image
// and nothing else — no CSS, no element to tint. So the eight possible
// discs are pre-drawn as images, and the page, the service worker and the
// server all pick the same one by index.
//
// THE ORDER OF THE COLOURS IS THE CONTRACT. disc-3.png is LOGO_FLIP_COLORS[3]
// and nothing else; reordering that list without re-running this script
// makes the banner and the card disagree about what colour one payment is.
// tests/notification-card.test.mjs asserts the two lists match.
//
// Run: node tools/icons/build-notif-discs.mjs
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const icons = path.resolve(here, "../../gloobal-essentials-preview/public/icons");
execFileSync("python3", [path.join(here, "build-notif-discs.py"), icons], { stdio: "inherit" });
