# My Workbench

A local-first workspace for managing tasks, implementation plans, Git worktrees, and coding-agent sessions.

The main dashboard combines local work into one operational view. External issue trackers, source-control hosts, and deployment providers are intentionally not bundled; integrations can implement the provider-neutral contract in `src/lib/connectors/types.ts`.

## Setup

Requirements: Node.js 22+, pnpm, Git, and optionally Rust/Tauri for the desktop app.

```bash
cp .env.example .env
pnpm install
pnpm dev
```

The web app is served at `http://localhost:3000`.

For the desktop app:

```bash
pnpm tauri:dev
```

## Project documents

- [`DESIGN.md`](./DESIGN.md) defines the product direction, core workflow, and design boundaries.
- [`AGENTS.md`](./AGENTS.md) is the canonical implementation and safety guide for coding agents.

## Local data

| Setting | Purpose | Default |
| --- | --- | --- |
| `MY_WORKBENCH_DATA` | Directory containing `TASKS.md` | `~/.my-workbench` |
| `WORKBENCH_PLANS_DIR` | Implementation-plan directory | `~/.my-workbench/plans` |
| `WORKBENCH_WORKSPACE_ROOTS` | Git repository roots to scan, separated by the OS path delimiter | Empty |

Worktree discovery is disabled until `WORKBENCH_WORKSPACE_ROOTS` is set. On macOS and Linux, separate multiple roots with `:`.

Keep `.env`, access tokens, private repository URLs, and generated work data out of version control.

Plan AI editing can fall back to a configured external model API after a local CLI failure and may send plan content to that provider. Do not configure external API keys unless you accept this current behavior; a separate transfer opt-in is still required by the target design.

## Verification

```bash
pnpm test
pnpm build
pnpm check
```

## License and publication

This repository is public, but no open-source license is currently granted. Add a license before allowing reuse, modification, or redistribution.
