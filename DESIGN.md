# My Workbench Design

My Workbench is a local-first agentic development environment for one developer. It should make the current unit of work, the agent's activity, the resulting changes, and the next human decision visible in one place.

This document is the product and interaction contract. Implementation rules live in [`AGENTS.md`](./AGENTS.md); setup instructions live in [`README.md`](./README.md).

## Product thesis

My Workbench is tailored to a personal development loop, not designed as a general project-management suite or an Orca clone. A feature belongs when it shortens this loop:

`Task → Plan → Worktree → Agent run → Diff and checks → Decision`

The UI should answer four questions without making the user reconstruct state across tools:

1. What am I working on?
2. What is the agent doing now?
3. What changed, and did verification pass?
4. What should I decide or do next?

## Design principles

### Local state is the source of truth

Tasks and plans are Markdown files, workspace state comes from Git, and agent execution runs locally. The product must remain useful when every connector is unavailable.

### Actions matter more than reports

The main console prioritizes active work, blocked work, failed checks, and the next available action. Historical reporting is secondary.

### One concept gets one surface

Extend the existing task, plan, worktree, or agent surface before adding another dashboard or chat flow for the same state. Repeated views should share a view model rather than copy business logic.

### Partial failure stays partial

Tasks, plans, worktrees, and connectors load independently. One failed source shows a source-level error while the rest of the console remains usable.

### Writes are explicit and reviewable

Local file changes, process execution, Git mutations, and future connector writes must be initiated by a clear user action. Destructive or external writes require a preview or confirmation appropriate to their impact.

## Information architecture

| Route | Responsibility |
| --- | --- |
| `/` | Main work console: active work, source health, progress, and next actions |
| `/tasks` | Local task board backed by `TASKS.md` |
| `/plans` | Markdown implementation-plan index and detail |
| `/worktrees` | Configured repositories, worktrees, branches, and Git state |
| `/agent-slice` | One agent run: workspace, lifecycle, output, changed files, and diff |
| `/agent-settings` | Discover and control local agent rules, skills, and hooks |

`/design-preview` is a temporary compatibility route for the component currently used by `/`. It is not a second product surface; do not add navigation or route-specific behavior to it. Remove it after the console component has a neutral home.

## Linking model and current limitation

The current implementation does not yet persist one stable work-item identity across the loop. Task IDs are regenerated when `TASKS.md` is parsed, plans use directory names as IDs, and plan, branch, worktree, and session associations rely on task-like keys and path hints.

Treat those links as compatibility heuristics, not durable references. The intended model is a provider-neutral, persisted work-item ID shared by tasks, plans, worktrees, and agent runs. Provider issue or review IDs remain optional attributes and must not become shared domain keys.

## Main console contract

The console combines four independently readable sources:

- tasks: current queue and completion state;
- plans: implementation progress and recent plan activity;
- worktrees: active branches and working-tree state;
- connectors: optional external issues, reviews, or deployments.

Each visible item should lead to a concrete detail or action. The console must distinguish loading, empty, unavailable, blocked, and completed states. Empty local data is an onboarding state, not an error. Connector failure must not block local work.

## System boundaries

```text
Local Markdown ─┐
Git worktrees ──┼─> server functions ─> pure domain/view models ─> route UI
Connectors ─────┘

Route UI ─> Tauri commands ─> local agent process and diff events
```

- `src/routes` owns route composition and page interaction.
- `src/components` owns reusable UI.
- `src/server` owns filesystem, Git, process, keychain, and connector access.
- `src/lib` owns provider-neutral types, shared transformations, and explicit browser or Tauri client adapters. Keep domain transformations pure and tested.
- `src-tauri` owns the Agent Workspace desktop runtime and emits serializable lifecycle events. Its lifecycle is the execution source of truth for that surface.

Browser-mode agent execution and diff data are previews, not proof of a real agent run. Validate real execution through the Tauri runtime.

Plan Chat currently has a separate server-side CLI process and history path. Do not add another execution path; converge it with the Agent Workspace runtime or remove the duplicate flow.

`WorkbenchConnector` is intentionally read-only. Provider implementations may translate remote data into `issue`, `review`, or `deployment` items, but shared UI and domain code must not depend on provider URLs, credentials, statuses, or repository catalogs.

## Data and safety

- Runtime data stays outside the repository under `MY_WORKBENCH_DATA` and `WORKBENCH_PLANS_DIR`.
- Repository discovery is disabled until `WORKBENCH_WORKSPACE_ROOTS` is configured.
- Credentials stay in environment variables or the operating-system keychain and are never rendered, logged, or stored in fixtures.
- Paths received from the client must be resolved and constrained to an allowed root before filesystem, Git, or process use.
- Tests that touch files or agent settings use isolated temporary directories, never the user's real workbench or agent configuration.
- Sending plan content to an external AI API is a data-boundary crossing and requires a separate explicit opt-in.
- Agent Settings mutates real local rule, skill, and hook files. Treat enable, disable, and rename operations as writes, not display preferences.

## Known safety gaps

- Plan AI editing currently falls back to configured external model APIs after a local CLI failure and can send plan content without a separate transfer confirmation. Until this is fixed, configuring an external API key means accepting that fallback behavior.
- Configured workspace roots limit discovery, but not every worktree, process, or Tauri IPC path is yet constrained to those roots. Do not treat workspace configuration as a filesystem sandbox. Enforce resolved-path and symlink-aware containment before expanding mutations.
- Agent execution is split between the Tauri Agent Workspace and the server-side Plan Chat process. The target design is one lifecycle and cancellation model.

## Interaction and visual language

- Keep the console dense enough for operational work, but use hierarchy and whitespace so the next action remains obvious.
- Use the existing `--workbench-*` tokens as the visual source of truth. Add a token instead of repeating a hard-coded color.
- Support light and dark themes, keyboard navigation, visible focus, and narrow screens.
- Use Korean for user-facing copy. Keep code identifiers and provider-neutral technical terms in English.
- Never communicate status by color alone; pair it with text or an icon label.

## Non-goals

- multi-user project management, team permissions, or cloud synchronization;
- bundled Jira, Bitbucket, GitHub, or deployment-provider workflows;
- automatic merge, deploy, issue transition, or other unreviewed remote writes;
- a second database while local files and Git remain sufficient;
- duplicate dashboards for individual tools or providers.

## Design acceptance

A product change is ready when:

- it clearly maps to a stage in the core loop;
- it makes the next action or decision easier to find;
- local workflows still work with connectors disabled or failing;
- links do not assume the current heuristic task IDs are stable;
- external data transfer is separately disclosed and enabled;
- filesystem and process paths are contained after resolving symlinks;
- empty, loading, partial, error, and destructive-action states are handled;
- provider-specific data stays behind a connector boundary;
- the relevant behavior is covered by focused tests and real UI verification.
