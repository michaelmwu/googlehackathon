# Development

## Requirements

- Bun.
- Docker with Docker Compose v2 for local Postgres.
- A Gemini key or Google Cloud credentials for AI-backed flows.

This repo uses Bun lockfiles and a supply-chain cooldown. `bunfig.toml` sets:

```toml
[install]
minimumReleaseAge = 604800
```

Use frozen lockfile installs when setting up or validating the project.

## Local Setup

Install dependencies:

```bash
bun install --frozen-lockfile
```

Create `.env`:

```bash
cp .env.example .env
```

For the fastest local demo, set:

```bash
GEMINI_API_KEY=your-gemini-api-key
```

Run the full local stack:

```bash
bun run dev:local
```

This starts local Postgres, applies migrations, and runs both:

- `bun run dev:api`
- `bun run dev`

Stop it with `Ctrl-C`; the script stops the local Postgres service for this workspace.

## Local Ports

In Conductor, `scripts/local-env.sh` uses `CONDUCTOR_PORT` as a reserved 10-port block. It picks:

- `VITE_PORT` for the browser-safe frontend port.
- `PORT` for the Bun/Hono API.
- `POSTGRES_HOST_PORT` for local Postgres.

Outside Conductor, defaults are:

- `VITE_PORT=5173`
- `PORT=3000`
- a worktree-derived Postgres host port in the `15400` range.

Inspect generated values:

```bash
./scripts/local-env.sh env
```

Run any command with the generated local env:

```bash
./scripts/local-env.sh exec -- bun run dev:api
```

## Database

Local development uses Postgres 16 with `pgvector` in Docker.

```bash
bun run db:up
bun run db:migrate
bun run db:logs
bun run db:down
```

`bun run db:migrate` starts the Docker Compose Postgres service and applies SQL migrations from `db/migrations/`.

For a non-local database, set `DATABASE_URL` and run:

```bash
DATABASE_URL='postgresql://user:password@host:5432/database' bun run db:migrate:url
```

Use `db:migrate:url` for production-like databases from a trusted machine or CI job. The local `db:migrate` command is intended for local Docker only.

## Environment Variables

Common local variables:

```bash
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3.5-flash
GOOGLE_OAUTH_CLIENT_ID=your-web-client-id
SESSION_SECRET=replace-with-random-secret
ALLOWED_EMAILS=you@example.com,teammate@example.com
```

Gemini Enterprise Agent Platform key mode:

```bash
GOOGLE_AGENT_PLATFORM_KEY=your-agent-platform-key
GOOGLE_CLOUD_PROJECT=your-project-id
GEMINI_PROJECT_NUMBER=your-project-number
GEMINI_API_KEY=your-developer-api-fallback-key
```

When `GOOGLE_AGENT_PLATFORM_KEY` is present, the app uses Gemini Enterprise Agent Platform mode. `GEMINI_API_KEY` remains useful as a local Developer API fallback if the Agent Platform key is removed.

Google Cloud Application Default Credentials or Cloud Run service account mode:

```bash
GOOGLE_GENAI_USE_ENTERPRISE=true
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=global
GEMINI_MODEL=gemini-3.5-flash
```

## Checks

Run the narrowest relevant checks while iterating:

```bash
bun run typecheck
bun run lint
bun run test:e2e
```

Before opening or updating a PR, run:

```bash
bun run build
```

`bun run build` runs `tsc --noEmit` and `vite build`.
`bun run test:e2e` runs the Playwright browser suite against a Vite dev server with mocked API
responses, so it does not require local Postgres or Gemini credentials.
On a fresh local machine, install the Chromium browser once with
`bunx playwright install chromium`; CI installs the browser during the Playwright job.

## Google Cloud Bootstrap

For Cloud Run with Gemini Enterprise Agent Platform:

1. Create or select a Google Cloud project.
2. Enable billing.
3. Enable the Agent Platform / Vertex AI API.
4. Grant the Cloud Run service account permission to call Gemini, such as `roles/aiplatform.user`.
5. Configure database, session, and Gemini environment variables.

Agent Platform key runtime variables:

```bash
GOOGLE_AGENT_PLATFORM_KEY=your-agent-platform-key
GOOGLE_CLOUD_PROJECT=your-project-id
GEMINI_PROJECT_NUMBER=your-project-number
GEMINI_MODEL=gemini-3.5-flash
```

Service account / ADC runtime variables:

```bash
GOOGLE_GENAI_USE_ENTERPRISE=true
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=global
GEMINI_MODEL=gemini-3.5-flash
```

## Deploy

The examples below use `--allow-unauthenticated` for fast public demos. The app still requires Starflow session auth before model calls. For production, remove that flag and put additional rate limiting, quota controls, or an application gateway in front of model-backed APIs to avoid unexpected Gemini spend or abuse.

Prefer Secret Manager for `DATABASE_URL`, `SESSION_SECRET`, and API keys:

```bash
gcloud run deploy starflow \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-secrets DATABASE_URL=DATABASE_URL:latest,SESSION_SECRET=SESSION_SECRET:latest,GOOGLE_AGENT_PLATFORM_KEY=GOOGLE_AGENT_PLATFORM_KEY:latest \
  --set-env-vars GOOGLE_CLOUD_PROJECT=your-project-id,GEMINI_PROJECT_NUMBER=your-project-number
```

Before routing demo traffic to a fresh managed database, apply migrations:

```bash
DATABASE_URL='postgresql://user:password@host:5432/database' bun run db:migrate:url
```

Build and deploy from source with Google Cloud Buildpacks:

```bash
gcloud run deploy starflow \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_AGENT_PLATFORM_KEY=your-agent-platform-key,GOOGLE_CLOUD_PROJECT=your-project-id,GEMINI_PROJECT_NUMBER=your-project-number,DATABASE_URL=postgresql://user:password@host:5432/database,SESSION_SECRET=replace-with-random-secret
```

Or build the included container:

```bash
gcloud builds submit --tag us-central1-docker.pkg.dev/PROJECT_ID/starflow/starflow
gcloud run deploy starflow \
  --image us-central1-docker.pkg.dev/PROJECT_ID/starflow/starflow \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_AGENT_PLATFORM_KEY=your-agent-platform-key,GOOGLE_CLOUD_PROJECT=PROJECT_ID,GEMINI_PROJECT_NUMBER=your-project-number,DATABASE_URL=postgresql://user:password@host:5432/database,SESSION_SECRET=replace-with-random-secret
```
