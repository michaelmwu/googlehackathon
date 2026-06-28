# Contributing

Starflow is a focused MVP. Changes should preserve the fast path from messy capture to one doable next step.

## Principles

- Keep the first screen usable as the app, not as marketing.
- Keep Gemini credentials and model calls server-side.
- Prefer one active task, tiny steps, and concrete language over broad productivity features.
- Keep page-agent mutations explicit, bounded, and persisted through server-owned tools.
- Preserve local development in parallel Conductor workspaces.
- Preserve supply-chain cooldowns and committed lockfiles.

## Local Workflow

Install from the committed lockfile:

```bash
bun install --frozen-lockfile
```

Run the app:

```bash
bun run dev:local
```

Run the narrowest relevant checks while iterating:

```bash
bun run typecheck
bun run lint
bun run test:e2e
```

Before opening or updating a pull request, run:

```bash
bun run build
```

## Pull Requests

Use the PR template. Include what changed, why it changed, and how it was validated.

Call out reviewer-sensitive areas:

- Database migrations or schema changes.
- Cloud Run deploy behavior.
- Authentication, cookies, permissions, or secrets.
- Model prompts, tool-calling behavior, or page-agent mutation rules.
- User-facing flow changes.

Avoid committing local state such as `.env`, `node_modules`, build output, caches, raw logs, screenshots, and `.context/`.

## Documentation

Keep reader-facing docs in canonical project files:

- `README.md` for overview and quickstart.
- `ARCHITECTURE.md` for system details and API/data boundaries.
- `DEVELOPMENT.md` for setup, checks, local database, and deploy operations.
- `docs/` for dated product and engineering decisions.

Operational notes in `.context/` are workspace-local scratch and should not be committed.
