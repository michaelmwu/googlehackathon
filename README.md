# Starflow

Starflow is a mobile-first ADHD support app that turns scattered thoughts into one doable next step. It gives users a fast capture surface, asks Gemini to triage the dump, and keeps a scoped page agent available to shrink, rewrite, or adjust the current plan without exposing model credentials to the browser.

## What It Does

- Capture messy thoughts as text, voice-dictated text, or a photo.
- Triage a capture into one main quest, a reason it matters, and tiny steps.
- Keep the current focus task in a shared Postgres-backed task store.
- Let the page chat make explicit allowed UI mutations, such as rewriting capture text or shrinking a focus step.
- Support demo sign-in and identity-only Google sign-in.
- Run Gemini server-side through either Gemini Enterprise Agent Platform or the Gemini Developer API.

## Stack

- Bun + Hono HTTP server with TypeScript.
- Vite + React frontend.
- Tailwind CSS v4 styling.
- TanStack Query for frontend server state.
- Drizzle + Postgres 16 with `pgvector`.
- Google GenAI SDK (`@google/genai`) for Gemini.
- Static frontend served by the same Bun process in production.
- Cloud Run container contract: listens on `0.0.0.0` and `PORT`.

## Quickstart

Install dependencies from the committed lockfile:

```bash
bun install --frozen-lockfile
```

Create local environment variables:

```bash
cp .env.example .env
```

For the fastest local demo, set `GEMINI_API_KEY` in `.env` from Google AI Studio.

Start local Postgres, apply migrations, and run the Bun API plus Vite frontend:

```bash
bun run dev:local
```

In Conductor, `dev:local` uses the allocated 10-port block: Vite on the browser-safe app port, Bun/Hono API on the next port, and Postgres on another port in the block.

To inspect the derived local values:

```bash
./scripts/local-env.sh env
```

## Useful Commands

```bash
bun run dev:local      # full local stack
bun run dev:api        # API only
bun run dev            # Vite frontend only
bun run db:migrate     # local Postgres migrations
bun run typecheck      # TypeScript check
bun run lint           # Biome check
bun run test:e2e       # Playwright browser checks
bun run build          # production build
```

## Project Docs

- [ARCHITECTURE.md](ARCHITECTURE.md) explains the runtime architecture, API surface, data model, and AI agent boundaries.
- [DEVELOPMENT.md](DEVELOPMENT.md) covers local setup, environment variables, database commands, checks, and Cloud Run deploy notes.
- [CONTRIBUTING.md](CONTRIBUTING.md) describes expectations for changes and pull requests.
- `docs/product-decisions.md`, `docs/engineering-decisions.md`, and `docs/starflow-mvp-plan.md` preserve dated product and engineering rationale.
