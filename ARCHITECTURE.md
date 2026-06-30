# Architecture

Starflow is a single Bun service that serves a Vite/React client and exposes Hono API routes. LLM calls stay on the server so browser clients never receive provider keys.

## Runtime Shape

```text
Mobile browser
  -> Vite/React app
  -> Hono API routes on Bun
  -> Drizzle ORM
  -> Postgres 16 + pgvector

Hono API routes
  -> OpenAI SDK
  -> OpenAI API or OpenAI-compatible endpoint
  -> Optional Gemini provider
```

In production, the frontend is built into `dist/client/` and served by the Bun process. The Docker entrypoint listens on `0.0.0.0` and `PORT`.

## Core Product Loop

1. The user signs in with demo auth or identity-only Google sign-in.
2. The user captures a messy thought, task, or photo.
3. The backend asks the configured LLM for a structured triage result.
4. The result is persisted as one open focus task with tiny steps.
5. The focus UI lets the user complete steps or ask the scoped page agent to adjust the task.
6. Reflection stores short check-ins and carry-forward context.

The app is intentionally optimized for activation: it prefers one task, small next actions, and non-judgmental language over comprehensive task management.

## AI Provider Modes

`src/config.ts` validates environment settings with Zod. `src/llm.ts` selects the LLM provider from environment variables.

Default OpenAI mode:

- OpenAI API with `OPENAI_API_KEY`.
- OpenAI-compatible endpoints with `OPENAI_BASE_URL`.

Set `LLM_PROVIDER=gemini` to use one of the Gemini modes:

- Gemini Enterprise Agent Platform with `GOOGLE_AGENT_PLATFORM_KEY`.
- Gemini Enterprise Agent Platform with `GOOGLE_GENAI_USE_ENTERPRISE=true` and `GOOGLE_API_KEY`.
- Gemini Enterprise Agent Platform with Application Default Credentials plus `GOOGLE_CLOUD_PROJECT`.
- Gemini Developer API with `GEMINI_API_KEY` or `GOOGLE_API_KEY`.

`/healthz` returns non-secret diagnostics for provider mode, credential source, project presence, model location, and credential readiness.

## Agent Roles

The product frames Starflow as an ADK-style multi-agent system:

- Context Agent: normalizes voice, text, image, and tool context into structured context.
- Task Extraction Agent: extracts candidate tasks into an inbox.
- Prioritization Agent: chooses the active work based on activation energy, deadlines, dependencies, energy, and available time.
- Breakdown Agent: turns active work into tiny executable subtasks.
- Adjustment Agent: handles task edits, task completions, and "this feels too much" changes.

The current implementation exposes that contract through Bun/Hono endpoints instead of importing ADK directly. `POST /api/events` is the orchestrator surface that can later become an ADK root agent without changing the UI model.

## Page Agent Mutation Boundary

Page agents can only mutate a narrow, schema-backed surface:

- Landing and sign-in agents can guide users into capture but cannot mutate persisted task state.
- Capture can call `set_capture_text` or `triage_now`.
- Focus can call bounded task tools such as `rewrite_task`, `replace_steps`, `add_step`, `shrink_step`, and `complete_step`.
- Reflect can call `set_carry_forward` for the current reflection form, but cannot mutate tasks.

The server applies focus mutations to Postgres through provider function calling and returns the reloaded task. Freeform chat replies alone are not trusted to change visible task state.

## Data Model

Drizzle schema lives in `src/db/schema.ts`; bootstrap SQL migrations live in `db/migrations/`.

Main tables:

- `app_users`: local users, demo users, and Google identity metadata.
- `google_oauth_accounts`: identity-only Google OAuth account links and optional token fields.
- `agent_sessions` and `agent_messages`: conversation/session storage.
- `agent_memories` and `agent_memory_embeddings`: durable context and `vector(768)` embeddings.
- `brain_dumps`: raw captures plus extracted metadata.
- `tasks` and `task_steps`: the active focus task and ordered tiny steps.
- `reflections`: reflection answers, summary, and carry-forward text.

Local development and Docker Compose deploys use `pgvector/pgvector:0.8.3-pg16`.

## API Surface

Current Hono routes include:

- `GET /healthz`: runtime and Gemini credential diagnostics without secrets.
- `GET /api/config`: browser-safe app configuration.
- `POST /api/auth/demo`: signs in as the local demo user.
- `POST /api/auth/google`: verifies a Google Identity Services ID token when `GOOGLE_OAUTH_CLIENT_ID` is configured.
- `POST /api/logout`: clears the signed session cookie.
- `GET /api/me`: returns the signed-in user.
- `GET /api/state`: returns the latest open focus task.
- `POST /api/generate`: low-level Gemini prompt endpoint.
- `POST /api/triage`: turns a brain dump into one main quest and tiny steps.
- `POST /api/memories`: stores user memory.
- `GET /api/memories/categorized`: returns grouped memories.
- `POST /api/capture/photo`: processes image capture.
- `GET /api/reflect/report`: returns reflection report data.
- `GET /api/reflections`: returns reflection history.
- `POST /api/reflect`: stores a reflection.
- `PATCH /api/steps/:id`: toggles a tiny step.
- `POST /api/events`: routes user events through the orchestrator contract.
- `POST /api/chat`: runs the role-specific page agent.

## Security Boundaries

- Model credentials are server-side only.
- Production requires `SESSION_SECRET`.
- Session cookies are signed with HMAC.
- Google sign-in verifies ID tokens against `GOOGLE_OAUTH_CLIENT_ID`.
- `ALLOWED_EMAILS` can restrict server-side access for test users.
- Public demo deploys should still protect model-backed APIs with auth, rate limits, quota controls, or an application gateway.

## Deferred Architecture

- Direct ADK integration is deferred; the API contract is shaped to allow it later.
- Firestore remains a cleaner Google-native shared task store for an ADK story, but Postgres is wired now for local development, migrations, and Cloud SQL.
- Gmail API, Calendar API, full embeddings/RAG workflows, multi-project task management, and server-side voice transcription are out of scope for the current MVP.
