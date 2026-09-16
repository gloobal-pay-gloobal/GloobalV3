# Gloobal QR

One static, UPI-style QR per account. It identifies who to pay and nothing
else: no amount, no session, no expiry. The payer types the amount in the
normal Send Money flow, which does all the usual checks (PIN, balance, limits,
FX, liquidity, ledger).

## Payload

```
https://gloobalv3.netlify.app/p/<12 digits>
```

Each digit (0–7) is the position of one Gloobal ID symbol in the server's
canonical order `− + × = ○ □ ● ■`. The link is 44 ASCII bytes, which makes a
version 5 QR (37×37 modules) at error-correction level H. That leaves room for
the small logo square in the middle.

- A phone's own camera app sees an ordinary https link and opens the app.
  Netlify serves `index.html` for `/p/*`, and the app holds the link until the
  person is signed in, then opens Send Money prefilled.
- The in-app scanner accepts only this host and path, or a bare 12-symbol ID.
  Anything else (other hosts, `upi://`, phone numbers) is refused and never
  opened.
- The payee's name and ID come from `GET /api/users/resolve`, not from the QR.
  `POST /api/transactions/send` resolves the recipient again on the server.
- A scan or a link only ever opens Send Money. It never sends money.

## Where the code is

| Part | File |
|---|---|
| Builds and parses the link (no dependencies) | `backend/utils/gloobalPayLink.js` |
| QR card: `uqr` matrix, SVG, PNG share | `frontend/components/common/gloobalReceiveQrCard.jsx` |
| The only place the QR is shown | Dashboard Receive sheet (`frontend/screens/Dashboard/Dashboard.jsx`) |
| Scanner, confirm card, `/p/` link handling | `frontend/App.jsx` (`handleQrScanned`, `resolveGloobalPayee`, `openSendToPayee`, `readPayLinkFromUrl`) |
| Camera and gallery decoding (BarcodeDetector, then jsQR) | `frontend/components/common/qrScanner.jsx` |
| Tests | `tests/gloobal-pay-qr.test.mjs`, `tests/qr-browser.test.mjs` |

## Known limitation

**A printed Gloobal QR stops resolving if its owner renames their Gloobal ID.**
The link carries the ID the account had when the QR was made. After a rename
the server answers 404 ("No Gloobal account uses this QR."), because retired IDs
are never matched or reissued. It fails closed, never paying someone else, but
the owner has to reprint the QR. This iteration does not solve it.

## Measured scan reliability (simulated camera, not a real device)

Two independent decoders (jsQR, ZXing C++), 20 trials each, with blur, tilt,
noise and print contrast. At level H with the logo square:

| Size | Distance | Result |
|---|---|---|
| Phone screen, about 4.5 cm | 25–35 cm | 20/20 |
| Print, 3 cm | 12–20 cm | 20/20 |
| Print, 2 cm | 12 cm | 20/20 |
| Print, 2 cm | 20 cm | 11–13/20 |
| Print, 3 cm | 30 cm | 11–13/20 |
| Print, 2 cm | 30 cm | 0/20 |

For a street stall, print it at 3 cm or larger.
