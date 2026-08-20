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

# My Workbench 에이전트 가이드

동작을 변경하기 전에 설치 방법을 설명하는 [`README.md`](./README.md)와 제품 기준을 정의한 [`DESIGN.md`](./DESIGN.md)를 읽는다.

## 목표

- 한 명의 개발자를 위한 로컬 우선 ADE를 `작업 → 계획 → 워크트리 → 에이전트 실행 → 변경·검증 → 판단` 흐름으로 만든다.
- `/`를 메인 업무 콘솔로 취급한다. 대시보드를 더 만들기보다 이 흐름을 개선한다.
- 겹치는 기능은 통합한다. 핵심 흐름을 단축하지 않거나 다음 행동을 분명하게 만들지 못하는 기능은 필요한지 다시 판단한다.

## 데이터별 기준

- 작업: `MY_WORKBENCH_DATA` 아래의 `TASKS.md`
- 계획: 저장된 계획 경로, `WORKBENCH_PLANS_DIR`, `MY_WORKBENCH_DATA/plans` 순서로 선택한 디렉터리의 Markdown 파일
- 저장소와 변경 상태: 에이전트 작업대에서 선택한 Git 저장소
- 에이전트 작업대 실행 상태: 로컬 Tauri 런타임과 이벤트

## 코드 경계

- `src/routes`: 라우트 조합, 로더, 페이지 상호작용
- `src/components`: 재사용 가능한 표현·상호작용 컴포넌트
- `src/lib`: 공유 타입, 순수 변환, 명시적인 Tauri 클라이언트 어댑터. 핵심 도메인 변환은 순수 함수로 유지하고 집중 테스트를 작성한다.
- `src-tauri`: 로컬 Markdown 접근, 데스크톱 에이전트 생명주기, 프로세스 제어, 변경 파일, diff 명령
- Tauri 명령 입력은 경계에서 검증한다. Node 전용 API를 클라이언트가 가져올 수 있는 모듈에 두지 않는다.
- 라우트가 다른 라우트의 컴포넌트를 직접 가져오지 않는다. 공유 UI는 `src/components`에 둔다.
- `src/routeTree.gen.ts`는 TanStack Router가 생성하므로 직접 수정하지 않는다.
- 위의 `intent-skills` 블록은 `pnpm dlx @tanstack/intent@latest install --map`이 관리하므로 보존한다.

## 데이터 및 변경 안전

- 앱 시작 시 프로세스 환경으로 전달된 `WORKBENCH_WORKSPACE_ROOTS` 밖의 작업공간은 Tauri IPC로 접근하지 않는다.
- 로컬 파일을 다루는 테스트는 격리된 임시 디렉터리를 사용한다. 사용자의 실제 `~/.my-workbench`와 저장소 루트를 변경하지 않는다.
- `.env`, 자격 증명, 비공개 URL, 세션 기록, 생성된 런타임 데이터를 커밋하지 않는다. 테스트에는 합성 데이터를 사용한다.
- 파괴적인 Git·파일시스템 작업과 향후 원격 쓰기는 명시적인 사용자 행동과 영향에 맞는 확인 과정 뒤에서만 실행한다.
- 클라이언트가 전달한 모든 경로를 신뢰하지 않는다. 심볼릭 링크를 해석한 실제 경로가 허용 루트 안에 있는지 파일시스템, Git, 프로세스 접근 전에 검증한다. 허용 루트는 외부 에이전트 프로세스의 운영체제 샌드박스를 대신하지 않는다.
- 셸 명령 문자열보다 argv 기반 프로세스 API를 사용한다. 경로 순회와 셸 인자를 차단하고, 취소 동작을 보존하며, 프로세스 출력 스트림이 막히지 않도록 끝까지 소비한다.
- Tauri IPC는 로컬 파일과 프로세스에 접근할 수 있으므로 새 Tauri 명령을 보안 변경으로 취급한다.
- 작업이나 계획 내용을 외부 AI API로 백그라운드 전송하는 기능을 추가하지 않는다. 외부 전송이 필요해지면 전송 전에 대상과 범위를 알리고 명시적 동의를 받는다.

## UI 규칙

- 사용자에게 보이는 문구는 한글로 작성한다. 코드 식별자와 그대로 표시해야 하는 고유 기술명은 영어를 유지한다.
- 로딩, 비어 있음, 일부 실패, 오류, 파괴적 작업 확인 상태를 처리한다. 한 데이터 소스의 실패로 메인 콘솔 전체를 비우지 않는다.
- `--workbench-*` 디자인 토큰을 재사용한다. 같은 색상을 반복해서 직접 쓰지 말고 토큰을 추가한다.
- 키보드 접근, 보이는 포커스, 라이트·다크 테마, 좁은 화면 사용성을 유지한다.
- 브라우저에서는 로컬 데이터 소스를 사용 불가로 표시하고 관련 입력을 비활성화한다. 파일 접근, 에이전트 프로세스, 취소, 변경 파일, diff 동작은 Tauri 런타임에서 확인한다.
- 브라우저 문제를 조사하기 전에 실제 실행 중인 서버와 포트를 확인한다. 3000, 3001, 3002 포트의 오래된 프로세스가 원인을 잘못 보이게 할 수 있다.

## 작업 규칙

- 패키지 관리자는 `pnpm`을 사용한다. `pnpm dev`는 3000 포트에서 정적 SPA 미리보기를 실행한다.
- 편집 전에 현재 워크트리 상태를 확인하고 관련 없는 사용자 변경을 보존한다.
- 동작을 만족하는 가장 작은 일관된 변경을 만든다. 병렬 추상화를 추가하기보다 기존 도우미를 재사용하고 오래된 경로를 삭제한다.
- 단순하지 않은 파서, 필터, 상태 변환, 서버 경계 변경에는 범위를 좁힌 Vitest 테스트를 하나 이상 추가하거나 갱신한다.
- 제품 경계나 핵심 흐름이 바뀌면 `DESIGN.md`, 설치·설정·공개 사용법이 바뀌면 `README.md`를 갱신한다.

## 검증

- 문서만 변경: `git diff --check`, 링크와 경로 확인
- TypeScript 동작 변경: 집중 Vitest 후 필요 범위에 따라 `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm check`, `pnpm build`
- Rust 또는 Tauri 동작 변경: `cargo test --manifest-path src-tauri/Cargo.toml`과 관련 프런트엔드 검사
- 패키징 변경: `pnpm build`, `pnpm verify:tauri-frontend`, `pnpm tauri:build`
- UI 변경: 실제 브라우저에서 영향받은 경로, 콘솔 오류, 필요한 경우 좁은 화면 확인

요청한 동작이 실제로 작동하고, 관련 검사가 통과하며, diff에 생성물이나 비공개 데이터가 없고, 문서가 변경 후 시스템을 정확히 설명할 때 작업이 완료된다.
