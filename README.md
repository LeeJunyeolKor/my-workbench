# My Workbench

작업, 구현 계획, Git 워크트리, 코딩 에이전트 세션을 관리하는 로컬 우선 작업공간이다.

메인 대시보드는 로컬 작업 상태를 하나의 업무 화면으로 결합한다. 외부 이슈 트래커, 소스 관리 서비스, 배포 공급자 기능은 내장하지 않는다. 연동이 필요하면 `src/lib/connectors/types.ts`의 특정 서비스 공급자에 종속되지 않는 계약을 구현한다.

## 설치

Node.js 22.12 이상, pnpm, Git이 필요하다. 데스크톱 앱을 실행하려면 Rust와 Tauri도 필요하다.

```bash
cp .env.example .env
pnpm install
pnpm dev
```

웹 앱은 `http://localhost:3000`에서 실행된다.

데스크톱 앱 실행:

```bash
WORKBENCH_WORKSPACE_ROOTS="$HOME/Projects" pnpm tauri:dev
```

에이전트 실행, 취소, 변경 파일과 diff 확인은 데스크톱 앱에서만 사용할 수 있다. 브라우저에서는 해당 실행 입력과 버튼이 비활성화된다.

Tauri 명령은 앱 시작 시 프로세스 환경의 `WORKBENCH_WORKSPACE_ROOTS`를 읽고, 실제 경로가 그 아래에 있는 Git 저장소만 허용한다. `.env` 값만으로는 데스크톱 IPC 권한이 생기지 않는다. Git 명령과 에이전트 CLI가 실행되므로 신뢰하는 저장소만 허용한다.

현재 TanStack Start 서버 기능은 Tauri IPC로 이전되지 않아 배포 패키지를 만들 수 없다. `pnpm tauri:build`는 동작하지 않는 앱을 생성하지 않도록 정적 `index.html`이 없으면 실패한다.

## 프로젝트 문서

- [`DESIGN.md`](./DESIGN.md): 제품 방향, 핵심 흐름, 설계 경계
- [`AGENTS.md`](./AGENTS.md): 코딩 에이전트가 따라야 할 구현·안전 규칙

## 로컬 데이터

| 설정 | 용도 | 기본값 |
| --- | --- | --- |
| `MY_WORKBENCH_DATA` | `TASKS.md`를 저장할 디렉터리 | `~/.my-workbench` |
| `WORKBENCH_PLANS_DIR` | 저장된 계획 경로가 없을 때 사용할 구현 계획 디렉터리 | `~/.my-workbench/plans` |
| `WORKBENCH_WORKSPACE_ROOTS` | Git 저장소를 탐색하고 Tauri IPC에서 허용할 루트. 운영체제의 경로 구분자로 여러 경로를 구분 | 비어 있음 |

환경변수 또는 워크트리 설정에서 스캔 루트를 지정하기 전에는 워크트리를 탐색하지 않는다. `WORKBENCH_WORKSPACE_ROOTS`를 사용할 때 macOS와 Linux에서는 여러 루트를 `:`로 구분한다.

`.env`, 접근 토큰, 비공개 저장소 URL, 생성된 작업 데이터는 버전 관리에 포함하지 않는다.

## 검증

```bash
pnpm test
pnpm build
pnpm check
cargo test --manifest-path src-tauri/Cargo.toml
```

## 라이선스와 공개 상태

이 저장소는 공개되어 있지만 현재 오픈소스 라이선스를 부여하지 않는다. 재사용, 수정, 재배포를 허용하려면 먼저 라이선스를 추가해야 한다.
