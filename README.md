# Hackathon Project

This is a clean, modern hackathon workspace bootstrapped using **Bun** and **TypeScript**, aligned with standard repository hygiene patterns inspired by the [508 Devkit](https://github.com/508-dev/508-devkit).

## 🚀 Quickstart

Ensure you have [Bun](https://bun.sh) installed.

### 1. Install Dependencies

```bash
bun install
```

### 2. Run the Development Server / Entrypoint

```bash
bun run dev
```

This runs the entrypoint script at `src/index.ts`.

### 3. Check TypeScript Types

```bash
bun run typecheck
```

## 📂 Project Layout

- `src/` - Main source folder containing application logic.
  - `src/index.ts` - Simple application entry point.
- `tsconfig.json` - Custom compiler options optimized for Bundler-like module resolution in Bun.
- `.gitignore` - Standard files, build directory, OS-specific files, and local `.env` secrets ignored.

## 🛠️ Design & Development Principles

This repository maintains:
1. **Low overhead**: Leverages Bun's native TS running capability directly.
2. **Deterministic types**: Uses TypeScript strict mode for catch-early logic errors.
3. **Clean workspace**: Standard local secrets (`.env`) are kept out of source control.
