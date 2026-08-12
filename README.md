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

## Local data

| Setting | Purpose | Default |
| --- | --- | --- |
| `MY_WORKBENCH_DATA` | Directory containing `TASKS.md` | `~/.my-workbench` |
| `WORKBENCH_PLANS_DIR` | Implementation-plan directory | `~/.my-workbench/plans` |
| `WORKBENCH_WORKSPACE_ROOTS` | Git repository roots to scan, separated by the OS path delimiter | Empty |

Worktree discovery is disabled until `WORKBENCH_WORKSPACE_ROOTS` is set. On macOS and Linux, separate multiple roots with `:`.

Keep `.env`, access tokens, private repository URLs, and generated work data out of version control.

## Verification

```bash
pnpm test
pnpm build
pnpm check
```

## License and publication

No open-source license is currently granted. Add a license and publish this repository only after confirming ownership of every included file and any required employer export approval.
