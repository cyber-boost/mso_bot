# Maestro

> A conductor's podium for AI models — one web console, one desktop app, one
> Python CLI, every BYOK cloud endpoint.

Maestro conducts language models over the two wire protocols that matter —
**OpenAI Chat Completions** and **Anthropic Messages** — from a single,
self-hostable console. The model catalog is the public BYOK index at
[models.dev](https://models.dev), loaded server-side and searchable in the
UI. Keys are yours: bring them per provider, keep them in your browser, and
route chat, agent loops and staged workflows through any provider that
speaks either protocol.

The repo ships the same product three ways:

| Surface           | What it is                                                              | Where                     |
| ----------------- | ----------------------------------------------------------------------- | ------------------------- |
| **Web console**   | TanStack Start SSR app (Nitro `node-server` preset) — one Node process   | `src/`, `server/`, `Dockerfile` |
| **Desktop app**   | Tauri v2 shell that boots the built server as a bundled Node sidecar    | `src-tauri/`              |
| **Python CLI**    | Single-file, stdlib-only conductor for cloud **and** local runtimes     | `maestro/maestro.py`      |

No external database is required: the server falls back to an embedded
**PGLite** (Postgres compiled to WASM) when `DATABASE_URL` is unset. The
Nitro build is a portable `.output/` you can run on a plain VPS, under
Docker, or inside the desktop bundle — see [DEPLOY.md](./DEPLOY.md) for the
full VPS guide.

> Repo note: the directory is `mso_bot` and `package.json` names the
> workspace `app-builder-workspace`, but the product is **Maestro**
> (`ps.maestro.app`, version 0.1.0, MIT).

---

## Contents

- [Feature tour](#feature-tour)
- [Harnesses](#harnesses)
- [How a chat request flows](#how-a-chat-request-flows)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [npm scripts](#npm-scripts)
- [Environment variables](#environment-variables)
- [Data layer](#data-layer)
- [Testing and QA](#testing-and-qa)
- [Deployment](#deployment)
- [Desktop app (Tauri)](#desktop-app-tauri)
- [Python CLI](#python-cli)
- [Project structure](#project-structure)
- [Platform chrome and sandbox contract](#platform-chrome-and-sandbox-contract)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Feature tour

The console is one screen with seven views (top nav on desktop, bottom bar
on mobile):

| View       | What you get |
| ---------- | ------------ |
| **Chat**   | Streaming chat with the selected model, run under the selected harness. A model rail lists providers and featured models; assistant replies stream token-by-token, and tool/stage activity appears as inline traces. Per-harness starter prompts, temperature and max-tokens controls. |
| **Shell**  | An xterm.js terminal where the current provider/model is rendered as a robot persona — a playful, gamified way to talk to the same backend (levels, trophies, circuit décor). |
| **Harness**| Inspect the built-in harnesses, fork them, or author your own (loop kind, system instructions, tools, workflow stages, max steps, temperature). Custom harnesses persist in `localStorage` and appear everywhere a harness can be picked. |
| **Catalog**| Browse the whole models.dev stand — providers, models, context windows, chat-capability filters, search. |
| **Keys**   | BYOK management. Keys live in this browser (`localStorage`), are attached per request, and are never written on the server. Pinned providers (xAI, Anthropic, OpenAI, OpenRouter, Groq, Ollama, LM Studio, vLLM) float to the top. |
| **CLI**    | An in-app replica of the Python CLI: `models`, `providers`, `which`, `use provider/model`, `harness use <id>`, `run <prompt>`, plus copy-paste install lines for the real CLI. |
| **Play**   | A physics-y arena floor of draggable "square terminal" units (up to 6), each running its own mini shell (`ask`, `models`, `which`, `echo`, `ping`, `still`/`go`, `name`), all streaming through the same `/api/chat` backend. |

The web app is also installable as a **PWA** (manifest and head tags are
injected by the `grokPwaPlugin()` + `server/middleware/grok-pwa.ts` pair;
`?install=1` serves a platform-specific install tutorial), ships an Open
Graph share card (`public/og.jpg`, configured via `src/lib/og/site.json`),
and is fully responsive down to phone viewports.

There is additionally a WebRTC **P2P room primitive**
(`src/lib/multiplayer/p2p.ts`) for multiplayer features.

## Harnesses

A harness shapes how a model is run. Each one compiles down to a system
prompt plus an execution loop (`src/lib/harness.ts`, `src/lib/run-harness.ts`):

| Loop                       | Behaviour |
| -------------------------- | --------- |
| **Once**                   | One completion. The default. |
| **Agent** (ReAct)          | Think, call a tool, repeat. The model ends a reply with a single `<tool name="…">{json}</tool>` tag; Maestro runs the tool and feeds the result back. `maxSteps` is clamped to 1–6. |
| **Workflow** (pipeline)    | Named stages in a row (up to 5). Each stage gets its own stage instructions and the previous stage's output; the transcript is stitched with stage headings. |

Built-in harnesses:

| Harness       | Loop     | Temp | Tools                                 | Shape |
| ------------- | -------- | ---- | ------------------------------------- | ----- |
| **Open**      | Once     | —    | —                                     | Bare model, no extra instructions |
| **Claude Code** | Agent  | 0.3  | catalog, which, scratch, reflect       | Coding agent, max 5 steps |
| **Codex**     | Workflow | 0.2  | —                                     | Plan → Implement |
| **Cursor**    | Once     | 0.4  | —                                     | Pair programmer |
| **Research**  | Workflow | 0.5  | —                                     | Gather → Synthesize |
| **Reviewer**  | Once     | 0.2  | —                                     | Verdict, then findings by severity |

Agent tools available to harnesses that opt in:

- `catalog` — search the models.dev stand (`{"q": "grok"}`)
- `which` — report the current provider/model
- `scratch` — set/get short notes that persist across steps
- `reflect` — a beat to think before acting

## How a chat request flows

1. The browser POSTs `/api/chat` with `{ providerId, modelId, messages,
   temperature, maxTokens, apiKey? }` (`src/routes/api/chat.ts`).
2. The server resolves the provider from the cached models.dev catalog and
   its protocol (`src/lib/protocol.ts`): Anthropic providers go to
   `POST {base}/messages` with `x-api-key` + `anthropic-version: 2023-06-01`;
   everyone else goes to `POST {base}/chat/completions` with a Bearer token.
3. Guards applied server-side:
   - only the last **40** messages are kept, each trimmed to **8,000** chars,
     and at least one `user` message is required;
   - `maxTokens` is clamped to **16–2048** (default 1024) and `temperature`
     to **0–2** (default 0.7);
   - only **HTTPS** base URLs are called;
   - **local runtimes** (Ollama `127.0.0.1:11434`, vLLM `:8000`,
     llama.cpp `:8080`, LM Studio) are rejected — they are reachable from the
     Python CLI on your machine, not from the console.
4. API key resolution: the per-request key from the Keys panel wins; for the
   `xai` provider a server-side `XAI_API_KEY` may serve as fallback;
   otherwise the request fails with a hint naming the expected env var.
5. The upstream SSE stream is normalized into `data:` events —
   `{"delta": "…"}`, `{"usage": …}`, `{"done": true}` or `{"error": "…"}` —
   and the client accumulates them (`src/lib/chat.ts`).

Harness-aware execution (`src/lib/run-harness.ts`) wraps `streamChat` with
the loop kinds above and emits `TraceEvent`s (stage / tool / thought) that
the Chat view renders inline.

## Tech stack

| Layer      | Choice |
| ---------- | ------ |
| Framework  | React 19 + TanStack Start / Router / Query (SSR, file routes) |
| Build      | Vite 8, Tailwind CSS v4, `@vitejs/plugin-react` |
| Server     | Nitro v3 (`node-server` preset) → portable `.output/` |
| State      | zustand + `localStorage` persistence (`src/lib/store.ts`) |
| UI         | Radix primitives, lucide-react, xterm.js, sonner, recharts |
| Database   | PGLite embedded fallback, or node-postgres/Neon when `DATABASE_URL` is set; kysely + Better Auth pre-wired (opt-in) |
| Auth       | Better Auth (`src/lib/auth/*`), gated by the `VITE_AUTH_ENABLED` build flag |
| Desktop    | Tauri v2 (Rust shell + standalone Node sidecar) |
| CLI        | Python 3.10+, stdlib only |
| QA         | Playwright/Chromium browser smoke, `node --test` unit suites |

## Getting started

### Prerequisites

- **Node ≥ 22** (the Docker image and CI both use Node 22; the desktop
  sidecar bundles its own standalone Node, default 24.21.0)
- **npm** — install with `npm install`, not `npm ci`: the committed lockfile
  can drift out of sync with what current npm resolves, and `npm install`
  reconciles
- Optional: **Rust + Tauri CLI** for desktop builds, **Python 3.10+** for
  the CLI, **Docker + Compose** for container deploys

### Run the dev server

```bash
git clone <your-repo-url> mso_bot && cd mso_bot
npm install
npm run dev
```

The dev server binds **`0.0.0.0:8080`** (strict port — this is the
live-preview contract of the App Builder workspace; see
[AGENTS.md](./AGENTS.md)). Open <http://127.0.0.1:8080>.

First steps in the UI:

1. The console boots on the default model **`xai/grok-4.5`** with the
   **Open** harness.
2. Open **Keys** and paste a provider key (e.g. an Anthropic or OpenAI key)
   — or, for the `xai` provider, run the server with `XAI_API_KEY` set and
   chat with no per-user key at all.
3. Pick a model from the rail, choose a harness (try **Claude Code** for a
   tool-using agent, or **Research** for a two-stage workflow), and send a
   message.

### Run the production build

```bash
npm run build        # vite build (Nitro node-server) + npm run db:migrate
PORT=8080 HOST=0.0.0.0 node .output/server/index.mjs
```

To QA the built output on the loopback preview port (`127.0.0.1:8081`):

```bash
npm run preview:restart   # frees :8081 first, then serves the latest .output
```

## npm scripts

| Script              | What it does |
| ------------------- | ------------ |
| `dev`               | Vite dev server on `0.0.0.0:8080`, wrapped by `scripts/with-app-env.mjs` |
| `build`             | Production Nitro build (`.output/`) + `db:migrate` |
| `build:dev`         | Same build in development mode |
| `db:migrate`        | Applies pending SQL files from `migrations/` (non-recursive) to `DATABASE_URL`; skips when unset |
| `preview`           | `vite preview` of the built output on `127.0.0.1:8081` |
| `preview:restart`   | Kills whatever owns `:8081`, then restarts the preview on the latest build |
| `preview:stop`      | Stops the managed preview |
| `typecheck`         | `tsc --noEmit` |
| `check:auth`        | Verifies the auth invariant against the running dev server |
| `test`              | `node --test` over `scripts/**/*.test.mjs` + type-stripped tests in `src/lib` |
| `lint`              | `eslint .` |
| `format`            | `prettier --write .` |

## Environment variables

| Var                    | Purpose | Default |
| ---------------------- | ------- | ------- |
| `PORT`                 | Nitro server listen port | `8080` |
| `HOST`                 | Nitro bind address | `0.0.0.0` |
| `XAI_API_KEY`          | Server-side xAI key so the console works without per-user keys | — |
| `DATABASE_URL`         | Postgres/Neon connection; unset ⇒ embedded PGLite | — |
| `VITE_AUTH_ENABLED`    | Build-time auth flag, carried via `.grok/app-env.json` through `with-app-env.mjs` | — |
| `MAESTRO_DESKTOP`      | Set to `1` by the Tauri shell when it spawns the backend | — |
| `NODE_VERSION`         | Standalone Node version fetched for the desktop sidecar | `24.21.0` |
| `NODE_DIST_URL`        | Where `fetch-sidecar.mjs` downloads that Node runtime | `https://nodejs.org/dist` |
| `MAESTRO_HOME`         | CLI only: config/cache directory for `maestro.py` | `~/.maestro` |
| `PREVIEW_READY_TIMEOUT_MS` | Max wait for `preview:restart` readiness | `60000` |

Never create a `.env` file in this workspace — the platform injects secrets
on deploy, and only `VITE_`-prefixed variables ever reach the browser.

## Data layer

`src/lib/db.ts` exposes one minimal SQL surface over two interchangeable
backends:

- **`DATABASE_URL` set** ⇒ real Postgres (node-postgres; Neon-ready).
  `npm run build` runs `db:migrate`, which applies pending files from
  `migrations/` in one transaction each, recorded in a `_migrations` table.
- **unset** ⇒ embedded **PGLite**, so the app has a working database even
  with nothing configured. The dev server pre-bootstraps PGLite only when
  top-level migration files exist (see `pgliteBootstrapPlugin` in
  `vite.config.ts`); production bootstraps on import.

The read is deliberately **non-recursive**: the opt-in auth schema parked at
`migrations/auth/0001_auth.sql` is *not* applied unless an app opts into
accounts. Auth (Better Auth wiring under `src/lib/auth/`) is off by
default; consult [AGENTS.md](./AGENTS.md) §0.5 for the exact triage rules
before turning it on.

## Testing and QA

```bash
npm run test        # unit suites for scripts/*.test.mjs and src/lib
npm run typecheck   # tsc --noEmit
npm run lint        # eslint .
```

The `scripts/` directory doubles as the toolchain and its own test suite:
`brand-check`, `browser-smoke-verdict`, `check-auth-invariant`,
`grok-pwa-plugin`, `migration-plan`, `preview`, `sign-out-plan`,
`with-app-env` and `write-atomic` all ship co-located `*.test.mjs` files.

For render QA there is a Playwright-driven smoke pass:

```bash
npm run dev &                        # dev server up on :8080
node scripts/browser-smoke.mjs       # one run audits desktop + mobile, JSON verdict
```

Against the built output, use `npm run preview:restart` (loopback `:8081`)
and re-run the smoke script with the dev verdict as `--baseline` to catch
dev-vs-production divergence (e.g. `Failed to load module script … MIME type
"text/html"`).

## Deployment

Full VPS walkthrough (Docker, bare Node + systemd, TLS via Caddy):
**[DEPLOY.md](./DEPLOY.md)**. Quick reference:

```bash
# Option A — build + run in Docker (recommended)
docker compose up -d --build
curl -I http://127.0.0.1:8080/

# Option A' — run a prebuilt .output with no image build
npm run build
docker compose -f docker-compose.runtime.yml up -d

# Option B — bare Node 20+
npm ci || npm install
npm run build
PORT=8080 HOST=0.0.0.0 node .output/server/index.mjs
```

TLS: put a reverse proxy such as Caddy in front (`reverse_proxy
127.0.0.1:8080`) and it will auto-issue Let's Encrypt certificates; the SSE
chat stream proxies cleanly.

## Desktop app (Tauri)

The desktop bundle wraps the *same* Nitro server as a local sidecar:

1. `scripts/fetch-sidecar.mjs` downloads a **standalone Node runtime**
   (default 24.21.0) and installs it as `src-tauri/binaries/maestro-backend`
   — Tauri's `bundle.externalBin`.
2. The Nitro `.output/` is bundled as a resource (`../.output/` → `output/`).
3. On launch, `src-tauri/src/lib.rs` spawns the sidecar running
   `.output/server/index.mjs` with `PORT=5180`, `HOST=127.0.0.1`,
   `NODE_ENV=production`, `MAESTRO_DESKTOP=1`, polls until it answers HTTP,
   then navigates the window to `http://127.0.0.1:5180`. Until then the
   window shows the boot splash at `.desktop-shell/index.html`
   ("tuning the orchestra…").

### Build locally

```bash
npm install
node scripts/build-frontend.mjs        # cross-platform build → .output (Windows-safe)
node scripts/fetch-sidecar.mjs         # or: --target x86_64-pc-windows-msvc, etc.
npx tauri build                       # runs scripts/verify-output.mjs as beforeBuildCommand
```

Bundles land in `src-tauri/target/release/bundle/`. For development,
`tauri.conf.json` sets `devUrl: http://127.0.0.1:5180` and an empty
`beforeDevCommand` — start the dev server yourself, then `cargo tauri dev`.

### CI

[`.github/workflows/desktop.yml`](./.github/workflows/desktop.yml) builds on
every push to `main` (and manually), producing:

| Target | Artifacts |
| ------ | --------- |
| Windows x64 (`x86_64-pc-windows-msvc`) | NSIS `*-setup.exe`, `.msi` |
| macOS universal (`universal-apple-darwin`) | `.app.tar.gz`, `.dmg` |
| Linux x64 glibc (`x86_64-unknown-linux-gnu`) | `.deb`, `.AppImage` |

macOS fetches **both** arm64 and x64 sidecars for the universal binary;
there is no musl target because Tauri webviews link webkit2gtk/GTK, which
are glibc-only.

## Python CLI

`maestro/maestro.py` (also served by the web app at `/maestro.py`) is a
single-file, stdlib-only conductor that reaches what the web console
deliberately cannot: **local runtimes** and terminal use.

```bash
python3 maestro.py                        # interactive model picker
python3 maestro.py models grok            # search the models.dev catalog
python3 maestro.py chat grok-4.5          # interactive chat
python3 maestro.py run xai/grok-4.5 "hi"  # one-shot
python3 maestro.py config set xai "$XAI_API_KEY"
python3 maestro.py run ollama/llama3.2 "hi"   # local runtime
```

- No third-party packages; Python 3.10+.
- Config in `~/.maestro/` (`MAESTRO_HOME` to override); catalog cache
  refreshes daily (`maestro pull`).
- Bare model ids resolve to the native lab first (`grok-4.5` →
  `xai/grok-4.5`).
- Same protocol routing as the console: OpenAI vs Anthropic, per provider.

Details in [`maestro/README.md`](./maestro/README.md).

## Project structure

```
mso_bot/
├── AGENTS.md                    # App Builder sandbox contract (read before agent-driven work)
├── AGENTS.project.md            # project-level agent note
├── DEPLOY.md                    # VPS deployment guide
├── LICENSE                      # MIT
├── docker-compose.yml           # Docker: build in-container + run
├── docker-compose.runtime.yml   # Docker: run a prebuilt .output only
├── Dockerfile                   # multi-stage build (node:22-slim) → runtime
├── Dockerfile.runtime           # runtime-only image over a prebuilt .output
├── startup.sh                   # sandbox revive: probe :8080, else `npm run dev` in background
├── vite.config.ts               # dev :8080 / preview :8081, nitro node-server, platform plugins
├── .desktop-shell/index.html    # Tauri boot splash (shown until the sidecar answers)
├── .github/workflows/desktop.yml  # CI: Windows / macOS / Linux desktop bundles
├── maestro/
│   ├── README.md                # CLI documentation
│   └── maestro.py               # single-file stdlib-only Python CLI
├── migrations/
│   └── auth/0001_auth.sql       # opt-in auth schema (not applied by default)
├── public/
│   ├── __grok/                  # platform chrome — PWA install page, icons (do not edit)
│   ├── maestro.py               # the CLI, served for download by the app
│   ├── favicon.svg / og.jpg     # identity + Open Graph share card
├── reference/shell/             # design-reference UI components
├── scripts/                     # build/preview/QA toolchain, each with co-located tests
├── server/
│   ├── middleware/grok-pwa.ts   # PWA head/manifest + install-page middleware (platform)
│   └── virtual-grok-og-identity.d.ts
└── src/
    ├── components/              # console, model rail, and the seven panels
    │   └── shell/               # robot-shell décor (avatar, traces, terminal)
    ├── lib/
    │   ├── app-data/            # viewer connector data + readiness scheduling
    │   ├── auth/                # Better Auth wiring (opt-in)
    │   ├── multiplayer/         # WebRTC P2P room primitive
    │   ├── catalog.ts / catalog-load.server.ts   # models.dev catalog + search
    │   ├── chat.ts              # client SSE consumer for /api/chat
    │   ├── harness.ts / run-harness.ts            # harness defs + loop runner
    │   ├── protocol.ts          # OpenAI vs Anthropic routing, base URLs, payloads
    │   ├── db.ts                # Neon or embedded PGLite, one SQL surface
    │   └── store.ts             # zustand state + localStorage persistence
    ├── routes/
    │   ├── __root.tsx           # document shell (AuthProvider, host bridge)
    │   ├── index.tsx            # the console
    │   └── api/chat.ts          # streaming chat proxy (SSE)
    ├── router.tsx               # getRouter() file-route router
    └── styles.css               # Tailwind v4 entry
└── src-tauri/                   # desktop shell (Rust + Tauri v2)
    ├── src/lib.rs               # spawns the Node sidecar on 127.0.0.1:5180
    ├── tauri.conf.json          # bundle config; resources: ../.output → output/
    ├── binaries/                # fetched standalone Node sidecar (created by fetch-sidecar.mjs)
    └── icons/                   # all platform icons
```

## Platform chrome and sandbox contract

This repo doubles as an **App Builder workspace**: it is designed to be
built and verified inside the Grok sandbox, where the user sees only a chat
and a live preview of whatever runs on `0.0.0.0:8080`.
**[AGENTS.md](./AGENTS.md) is the single source of truth** for that
contract; the points most likely to bite a contributor:

- The dev server must stay on **`0.0.0.0:8080`** and always start via
  `npm run dev` (the `with-app-env.mjs` wrapper), never `vite` directly —
  bypassing it drops the `VITE_AUTH_ENABLED` build flag.
- `startup.sh` is the revive entrypoint (probe, then background `npm run
  dev`); don't rename or delete it.
- `public/__grok/`, `server/`, and `scripts/grok-pwa-*` are platform chrome
  — never delete or strip them, and don't add a CSP that blocks
  `https://grok.com`.
- Application server routes go in `src/routes/`, never in `server/`.
- No `.env` files; secrets arrive via the platform, and only `VITE_*` vars
  reach the browser.
- Auth and the database are **opt-in**; see AGENTS.md §0.5 before adding
  either.

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| `npm ci` fails on lockfile drift | Use `npm install` (the committed lockfile can drift; `npm install` reconciles) |
| `:8081` busy when previewing | `npm run preview:restart` — it frees the port first |
| Chat 401 "Add a key for …" | Paste that provider's key in the **Keys** view, or run the server with `XAI_API_KEY` for xAI |
| "Local endpoints are reached from the Python CLI…" | By design — talk to Ollama/LM Studio/vLLM through `maestro/maestro.py` |
| Desktop window stuck on "tuning the orchestra…" | The sidecar didn't boot: check that `.output/server/index.mjs` exists and `src-tauri/binaries/maestro-backend` was fetched for your target triple |
| Dev server won't start | Missing the first-scaffold files? `src/router.tsx`, `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/styles.css` must all exist |

## License

[MIT](./LICENSE) © 2026 Cyber Boost.