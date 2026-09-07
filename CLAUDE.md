# CLAUDE.md

Guidance for Claude Code working in this repository.

## Paths

| | |
|---|---|
| Repo root | `D:\gloobalv3` |
| Remote | `https://github.com/gloobal-pay-gloobal/GloobalV3.git` |
| Deploy branch | `main` |
| Live frontend | https://gloobalv3.netlify.app (Netlify) |
| Live API | https://gloobal-pay.onrender.com (Render, root `server`) |

**GloobalV3 is the only active repository.** Netlify and Render both build
from `GloobalV3` / `main` — no other repo, branch, or deployment source is
part of normal development:

```
edit in D:\gloobalv3  →  git commit  →  git push origin main
                                              │
                   ┌─────────────────────┴─────────────────────┐
                   ▼                                            ▼
         Netlify → frontend                        Render → API (server/)
```

Both halves auto-deployed on a push to `main` when this was last checked
(7 September 2026) — see the Deployment section for the evidence and for
what to do if it stops. This reverses the earlier note that neither half
was automatic.

`D:\gloobalv3` is the single active workspace. Every other Gloobal folder
on this machine — including `D:\Desktop\Gloobal`, `D:\Gloobal project`,
`D:\GloobalApp`, `D:\gloobal-new version` and
`D:\_stale-server-backup-20260820` — is an older repository or backup kept
for **reference only**; see `docs/handoffs/legacy-repositories.md`.

Never edit, move, or delete anything outside `D:\gloobalv3` automatically.
Read from them if you must, but do not copy anything across without first
checking whether this repo is already ahead. Their layout and conventions
are obsolete — this file is the only authority on how the project is
structured.

## Workflow rules

- Check `git status` before editing.
- Work on a branch; do not commit to `main` unless explicitly told to.
- Run `node build_app.mjs` after any change under `backend/` or `frontend/`.
- Run `git status`, `git diff --stat` and `git diff --check` before committing.
- Never push without explicit approval.
- Never commit a `.env`, `secret.txt`, or any credential.
- Never run `npm audit fix` unless asked.

## Layout

```
D:\gloobalv3\
├── .claude/                    Claude Code settings, skills, local tooling
├── frontend/                   React source (concatenation build)
├── backend/                    Browser-side domain simulation, also concatenated
├── server/                     Real Express + MongoDB API, deployed to Render
├── gloobal-essentials-preview/ Vite project; consumes the generated bundle
├── financial-principles-tests/ Domain/financial test suite
├── tools/                      Developer tooling — not shipped, not bundled
│   ├── frontend/               Frontend diagnostics (scan/probe scripts)
│   ├── backend/                Live API contract checks
│   └── email/                  Email + report mailer utilities
├── docs/                       Architecture, deployment, operations, handoffs
├── archive/                    Reference copies of superseded code
│   └── legacy/                 Historical material — read-only
├── build_app.mjs               Concatenates backend/ + frontend/ into the bundle
├── CLAUDE.md
└── README.md
```

Notes on that tree:

- **Developer diagnostics live under `tools/`** — `tools/frontend/` for the
  bundle and screens, `tools/backend/` for the live API. Nothing under
  `tools/` is shipped or bundled into the app.
- **Email utilities live under `tools/email/`** (`mailer.py`, `fetch_mail.py`,
  `send.bat`, and the Node `report-mailer/`). They read credentials at run
  time from `tools/email/secret.txt` and `tools/email/report-mailer/.env`,
  both gitignored; only the `.example` files are committed.
- **Historical material lives under `archive/legacy/`** — superseded docs and
  the v1 frontend. It exists to be read, not built, imported, or edited.
  Nothing in the live app may depend on it.

### `backend/` and `server/` are different systems

This trips people up constantly, so: **do not merge or rename them.**

- **`backend/`** is a browser-side domain simulation — ledger, accounts,
  settlement, risk, receipts — that runs *inside the app*. It is
  concatenated into the frontend bundle by `build_app.mjs`. It has no
  database and no network listener.
- **`server/`** is the real production API: Express 5 + Mongoose against
  MongoDB Atlas, deployed to Render. `server/server.js` must stay at that
  path — the deployment depends on it.

## The concatenation build system

`frontend/` and `backend/` are **not** ES modules in the normal sense.
`build_app.mjs` concatenates them, in the order listed in its
`FRONTEND_MODULES` / `BACKEND_MODULES` arrays, into a single file:

```
gloobal-essentials-preview/src/GloobalApp.jsx
```

That file is **generated. Never edit it directly** — it is gitignored and
overwritten on every build. Edit the sources under `frontend/` or
`backend/` and re-run the build.

Because the result shares one global scope:

- Top-level `var` names must be globally unique across the whole tree.
- React hook and lucide-icon imports use numbered aliases (`useState19`,
  `ChevronLeft2`). Before adding one, grep the frontend tree for the
  highest existing number and go one past it.
- A new source file must be added to `FRONTEND_MODULES` in `build_app.mjs`
  or it will silently not be included.
- Module order is semantically significant. Definitions must precede use
  for anything evaluated at load time (function declarations hoist; `var`
  initialisers do not).

Do not convert this to standard ES modules.

## Commands

```bash
# Rebuild the bundle (run from the repo root)
node build_app.mjs

# Production build
cd gloobal-essentials-preview && npm run build

# Diagnostics — all from the repo root
node tools/frontend/scan-undeclared.mjs    # undeclared identifiers
node tools/frontend/probe-screens.mjs      # screens x 194 countries
node tools/frontend/probe-panels.mjs       # panel rendering
node tools/frontend/probe-stages.mjs       # registration/login stages
node tools/backend/check-backend.mjs       # live API contract

# Domain tests
cd financial-principles-tests
node scripts/build-test-bundle.mjs && node --test tests/*.test.mjs

# Server
cd server && npm install && node --check server.js
```

### Known non-failures

- `scan-undeclared.mjs` reports `Notification` — a browser global, used
  behind a `typeof` guard in `frontend/components/dialogs/registerLogin.jsx`.
- `probe-screens.mjs` ends with two SSR-only failures
  (`useFinancialCore` outside a provider, missing `getServerSnapshot`).
  Both are expected; see `tools/frontend/README.md`.
- `probe-stages.mjs` exits 2 with "could not find the stage useState
  initialiser". Its regex predates the permissions gate added to
  `frontend/App.jsx`. Pre-existing; the probe needs updating, not the app.

## Environment

`server/.env` (never committed — see `server/.env.example`):

| | |
|---|---|
| `MONGO_URI` | MongoDB Atlas connection string |
| `AUTH_TOKEN_SECRET` | **Required in production.** Stable HMAC signing key, ≥32 chars. The server refuses to start without it when `NODE_ENV=production` or `RENDER=true`, because a boot-generated key invalidates every session on every restart. |
| `PORT` | default 5000 |
| `PROTOTYPE_OTP` | fixed OTP for testing, default `123456` |
| `PROTOTYPE_TRANSACTION_MAX_AMOUNT` | default 5000 |
| `ALLOWED_ORIGINS` | comma-separated CORS allowlist |

Frontend reads `VITE_API_URL`, defaulting to `https://gloobal-pay.onrender.com`.

## Auth

Bearer tokens, not JWTs: an HMAC-SHA256 signature over a base64url payload,
minted only in exchange for a real credential (PIN at `/api/login`, a
verified OTP at registration, or a WebAuthn assertion). Seven-day TTL.
Every route touching an account requires one and checks that the token
names *that* account.

On the client, `backend/services/api/httpClient.js` distinguishes a 401
(token dead → clear it and fire `gloobal:sessionExpired`, which `App.jsx`
turns into a redirect to Login) from `status === 0` (timeout, offline, or
Render cold start → keep the session, it says nothing about validity).
Preserve that distinction; conflating them signs people out for a slow
server.

## Deployment

Two independent deploy targets, from the same repo. See
`docs/deployment/README.md` for the full detail.

- **Netlify deploys the current Vite preview project.** `netlify.toml` sets
  `base = "gloobal-essentials-preview"` and publishes
  `gloobal-essentials-preview/dist`. Its `prebuild` hook runs
  `node ../build_app.mjs ..`, so the repo root has to stay in the deploy
  context — that relative path is why the app folder cannot move. Live at
  https://gloobalv3.netlify.app.
- **Render runs `server/`.** Root directory `server`, build `npm install`,
  start `node server.js`. `server/server.js` must remain at exactly that
  path; moving or renaming it breaks the deployment. Live at
  https://gloobal-pay.onrender.com.

Neither path may move.

**Auto-deploy was working on both targets on 7 September 2026.** This
section previously said the opposite — that both GitHub Apps had lost
repository access after the rename and no push could ever trigger a build.
That was true when it was written and is not true now.

What was observed. Merge `d6d9841` was pushed to `main` at 16:42 IST with
no manual deploy from anyone, and within minutes:

- the API served `GET /api/coverage`, a route that exists only in that
  merge, against real production data;
- the Netlify site served `/assets/index-B6Q6BnlK.js`, and a local
  production build of `d6d9841` produced a bundle with the same name.
  Vite's filename hash is derived from the content, so that is not a
  coincidence — it identifies the deployed bundle as that exact commit.

Note what this does and does not establish. It shows both sides picked up
one push automatically; it does not prove the underlying GitHub App
permissions were repaired deliberately, and nobody has re-read those
settings. Treat auto-deploy as working but verify rather than assume,
especially after any repository rename or transfer.

How to verify after a push, without opening either dashboard:

```bash
# Render — a route that only exists in the commit you just pushed
curl -s https://gloobal-pay.onrender.com/api/coverage | head -c 200

# Netlify — build locally, then compare the bundle filename to the live one
node build_app.mjs && (cd gloobal-essentials-preview && npm run build)
ls gloobal-essentials-preview/dist/assets/index-*.js
curl -s https://gloobalv3.netlify.app/ | grep -o '/assets/index-[^"]*\.js'
```

Matching filenames mean the live frontend is your commit. The API is on
Render's free tier and spins down after about fifteen minutes idle, so the
first request after a quiet spell can take 20-50 seconds — a slow first
curl is a cold start, not a failed deploy.

If a push does not land, trigger a manual deploy from the Render and
Netlify dashboards, and check the GitHub App's repository access before
assuming the service is misconfigured. Background in
`docs/deployment/README.md`, which still describes the earlier broken
state and has not been updated.

Render only rebuilds when files under `server/` change, so a docs- or
frontend-only commit leaving Render on an older commit is correct.
