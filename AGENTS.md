<!-- intent-skills:start -->
# Skill mappings - load `use` with `pnpm dlx @tanstack/intent@latest load <use>`.
skills:
  - when: "Install TanStack Devtools, pick framework adapter (React/Vue/Solid/Preact), register plugins via plugins prop, configure shell (position, hotkeys, theme, hideUntilHover, requireUrlFlag, eventBusConfig). TanStackDevtools component, defaultOpen, localStorage persistence."
    use: "@tanstack/devtools#devtools-app-setup"
  - when: "Publish plugin to npm and submit to TanStack Devtools Marketplace. PluginMetadata registry format, plugin-registry.ts, pluginImport (importName, type), requires (packageName, minVersion), framework tagging, multi-framework submissions, featured plugins."
    use: "@tanstack/devtools#devtools-marketplace"
  - when: "Build devtools panel components that display emitted event data. Listen via EventClient.on(), handle theme (light/dark), use @tanstack/devtools-ui components. Plugin registration (name, render, id, defaultOpen), lifecycle (mount, activate, destroy), max 3 active plugins. Two paths: Solid.js core with devtools-ui for multi-framework support, or framework-specific panels."
    use: "@tanstack/devtools#devtools-plugin-panel"
  - when: "Handle devtools in production vs development. removeDevtoolsOnBuild, devDependency vs regular dependency, conditional imports, NoOp plugin variants for tree-shaking, non-Vite production exclusion patterns."
    use: "@tanstack/devtools#devtools-production"
  - when: "Two-way event patterns between devtools panel and application. App-to-devtools observation, devtools-to-app commands, time-travel debugging with snapshots and revert. structuredClone for snapshot safety, distinct event suffixes for observation vs commands, serializable payloads only."
    use: "@tanstack/devtools-event-client#devtools-bidirectional"
  - when: "Create typed EventClient for a library. Define event maps with typed payloads, pluginId auto-prepend namespacing, emit()/on()/onAll()/onAllPluginEvents() API. Connection lifecycle (5 retries, 300ms), event queuing, enabled/disabled state, SSR fallbacks, singleton pattern. Unique pluginId requirement to avoid event collisions."
    use: "@tanstack/devtools-event-client#devtools-event-client"
  - when: "Analyze library codebase for critical architecture and debugging points, add strategic event emissions. Identify middleware boundaries, state transitions, lifecycle hooks. Consolidate events (1 not 15), debounce high-frequency updates, DRY shared payload fields, guard emit() for production. Transparent server/client event bridging."
    use: "@tanstack/devtools-event-client#devtools-instrumentation"
  - when: "Configure @tanstack/devtools-vite for source inspection (data-tsd-source, inspectHotkey, ignore patterns), console piping (client-to-server, server-to-client, levels), enhanced logging, server event bus (port, host, HTTPS), production stripping (removeDevtoolsOnBuild), editor integration (launch-editor, custom editor.open). Must be FIRST plugin in Vite config. Vite ^6 || ^7 only."
    use: "@tanstack/devtools-vite#devtools-vite-plugin"
  - when: "Step-by-step migration from Next.js App Router to TanStack Start: route definition conversion, API mapping, server function conversion from Server Actions, middleware conversion, data fetching pattern changes."
    use: "@tanstack/react-start#lifecycle/migrate-from-nextjs"
  - when: "React bindings for TanStack Start: createStart, StartClient, StartServer, React-specific imports, re-exports from @tanstack/react-router, full project setup with React, useServerFn hook."
    use: "@tanstack/react-start#react-start"
  - when: "Implement, review, debug, and refactor TanStack Start React Server Components in React 19 apps. Use when tasks mention @tanstack/react-start/rsc, renderServerComponent, createCompositeComponent, CompositeComponent, renderToReadableStream, createFromReadableStream, createFromFetch, Composite Components, React Flight streams, loader or query owned RSC caching, router.invalidate, structuralSharing: false, selective SSR, stale names like renderRsc or .validator, or migration from Next App Router RSC patterns. Do not use for generic SSR or non-TanStack RSC frameworks except brief comparison."
    use: "@tanstack/react-start#react-start/server-components"
  - when: "Framework-agnostic core concepts for TanStack Router: route trees, createRouter, createRoute, createRootRoute, createRootRouteWithContext, addChildren, Register type declaration, route matching, route sorting, file naming conventions. Entry point for all router skills."
    use: "@tanstack/router-core#router-core"
  - when: "Route protection with beforeLoad, redirect()/throw redirect(), isRedirect helper, authenticated layout routes (_authenticated), non-redirect auth (inline login), RBAC with roles and permissions, auth provider integration (Auth0, Clerk, Supabase), router context for auth state."
    use: "@tanstack/router-core#router-core/auth-and-guards"
  - when: "Automatic code splitting (autoCodeSplitting), .lazy.tsx convention, createLazyFileRoute, createLazyRoute, lazyRouteComponent, getRouteApi for typed hooks in split files, codeSplitGroupings per-route override, splitBehavior programmatic config, critical vs non-critical properties."
    use: "@tanstack/router-core#router-core/code-splitting"
  - when: "Route loader option, loaderDeps for cache keys, staleTime/gcTime/ defaultPreloadStaleTime SWR caching, pendingComponent/pendingMs/ pendingMinMs, errorComponent/onError/onCatch, beforeLoad, router context and createRootRouteWithContext DI pattern, router.invalidate, Await component, deferred data loading with unawaited promises."
    use: "@tanstack/router-core#router-core/data-loading"
  - when: "Link component, useNavigate, Navigate component, router.navigate, ToOptions/NavigateOptions/LinkOptions, from/to relative navigation, activeOptions/activeProps, preloading (intent/viewport/render), preloadDelay, navigation blocking (useBlocker, Block), createLink, linkOptions helper, scroll restoration, MatchRoute."
    use: "@tanstack/router-core#router-core/navigation"
  - when: "notFound() function, notFoundComponent, defaultNotFoundComponent, notFoundMode (fuzzy/root), errorComponent, CatchBoundary, CatchNotFound, isNotFound, NotFoundRoute (deprecated), route masking (mask option, createRouteMask, unmaskOnReload)."
    use: "@tanstack/router-core#router-core/not-found-and-errors"
  - when: "Dynamic path segments ($paramName), splat routes ($ / _splat), optional params ({-$paramName}), prefix/suffix patterns ({$param}.ext), useParams, params.parse/stringify, pathParamsAllowedCharacters, i18n locale patterns."
    use: "@tanstack/router-core#router-core/path-params"
  - when: "validateSearch, search param validation with Zod/Valibot/ArkType adapters, fallback(), search middlewares (retainSearchParams, stripSearchParams), custom serialization (parseSearch, stringifySearch), search param inheritance, loaderDeps for cache keys, reading and writing search params."
    use: "@tanstack/router-core#router-core/search-params"
  - when: "Non-streaming and streaming SSR, RouterClient/RouterServer, renderRouterToString/renderRouterToStream, createRequestHandler, defaultRenderHandler/defaultStreamHandler, HeadContent/Scripts components, head route option (meta/links/styles/scripts), ScriptOnce, automatic loader dehydration/hydration, memory history on server, data serialization, document head management."
    use: "@tanstack/router-core#router-core/ssr"
  - when: "Full type inference philosophy (never cast, never annotate inferred values), Register module declaration, from narrowing on hooks and Link, strict:false for shared components, getRouteApi for code-split typed access, addChildren with object syntax for TS perf, LinkProps and ValidateLinkOptions type utilities, as const satisfies pattern."
    use: "@tanstack/router-core#router-core/type-safety"
<!-- intent-skills:end -->

# My Workbench Agent Guide

Read [`README.md`](./README.md) for setup and [`DESIGN.md`](./DESIGN.md) for the product contract before changing behavior.

## Mission

- Build a single-developer, local-first ADE around `Task → Plan → Worktree → Agent run → Diff and checks → Decision`.
- Treat `/` as the main work console. Prefer improving that flow over adding another dashboard.
- Consolidate overlapping features. If a change does not shorten the core loop or clarify the next action, question whether it belongs.

## Sources of truth

- Tasks: `TASKS.md` under `MY_WORKBENCH_DATA`.
- Plans: Markdown under `WORKBENCH_PLANS_DIR`.
- Repository and change state: Git and configured worktree roots.
- Agent Workspace execution state: the local Tauri runtime and its events. Plan Chat currently has a separate server-side process path; do not add a third runtime.
- External metadata: optional read-only connectors; connector failure must not block local workflows.

## Code boundaries

- `src/routes`: route composition, loaders, and page interaction.
- `src/components`: reusable presentation and interaction components.
- `src/server`: filesystem, Git, process, keychain, and connector access.
- `src/lib`: provider-neutral types, shared transformations, and explicit client adapters; keep domain transformations pure and focused-testable.
- `src-tauri`: desktop agent lifecycle, process control, changed files, and diff commands.
- Validate every server-function input at the boundary. Keep Node-only APIs out of client-importable modules.
- Put provider integrations behind `WorkbenchConnector`. Do not leak provider URLs, credentials, statuses, or repository catalogs into shared models or routes.
- Do not add route-to-route component imports. Move shared UI into `src/components` when touching the current `/` and `/design-preview` compatibility arrangement.
- Do not edit `src/routeTree.gen.ts`; TanStack Router generates it.
- Preserve the `intent-skills` block above; `pnpm dlx @tanstack/intent@latest install --map` manages it.

## Data and mutation safety

- Do not scan workspace roots unless `WORKBENCH_WORKSPACE_ROOTS` or an explicit saved setting enables them.
- Tests that touch files, keychains, or agent settings must use isolated temporary directories. Never mutate the user's real `~/.my-workbench`, `~/.agents`, `~/.codex`, or repository roots.
- Never commit `.env`, credentials, private URLs, session transcripts, or generated runtime data. Use synthetic fixtures.
- Keep destructive Git/filesystem actions and future remote writes behind an explicit user action and appropriate confirmation.
- Treat every client-supplied path as untrusted. Resolve symlinks and enforce allowed-root containment before filesystem, Git, or process access; current workspace-root configuration does not yet protect every mutation path.
- Prefer argv-based process APIs over shell command strings, and preserve traversal, shell-argument, cancellation, and output-draining protections.
- Treat new Tauri commands as security-sensitive because IPC can reach local files and processes.
- Do not add background transfer of task or plan content to an external AI API. The current Plan AI fallback can transmit plan content after local CLI failure; replace it with a separate explicit opt-in before treating this boundary as safe.

## UI rules

- Keep user-facing copy in Korean and code identifiers in English.
- Handle loading, empty, partial, error, and destructive-confirmation states. One failed source must not blank the main console.
- Reuse `--workbench-*` design tokens; add a token instead of repeating hard-coded colors.
- Preserve keyboard access, visible focus, light/dark themes, and usable narrow-screen layouts.
- Browser-mode agent output is a preview. Use the Tauri runtime when claiming real Agent Workspace process, cancellation, or diff behavior.
- Verify the actual server and port before browser debugging; stale instances on 3000/3001/3002 can mislead.

## Working agreement

- Use `pnpm`. `pnpm dev` serves TanStack Start on port 3000.
- Inspect the current worktree before editing and preserve unrelated user changes.
- Make the smallest coherent change. Reuse existing helpers and delete obsolete paths instead of adding parallel abstractions.
- Add or update one focused Vitest test for non-trivial parser, filter, state, or server-boundary behavior.
- Update `DESIGN.md` when the product boundary or core flow changes. Update `README.md` when setup, configuration, or public usage changes.

## Verification

- Documentation-only: `git diff --check` and link/path review.
- TypeScript behavior: focused Vitest, then `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm check`, and `pnpm build` as appropriate.
- Rust or Tauri behavior: `cargo test --manifest-path src-tauri/Cargo.toml` plus the relevant frontend checks.
- UI behavior: verify affected routes in a real browser, including console errors and the narrow-screen layout when relevant.

A change is done only when the requested behavior works, relevant checks pass, generated or private data is absent from the diff, and the documentation still describes the resulting system.
