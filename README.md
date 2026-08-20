# My Workbench

작업, 구현 계획, 코딩 에이전트 세션을 관리하는 로컬 우선 작업공간이다.

메인 대시보드는 로컬 작업과 구현 계획을 하나의 업무 화면으로 결합한다. 외부 이슈 트래커, 소스 관리 서비스, 배포 공급자 기능은 내장하지 않는다.

## 설치

Node.js 22.12 이상, pnpm, Git이 필요하다. 데스크톱 앱을 실행하려면 Rust와 Tauri도 필요하다.

```bash
cp .env.example .env
pnpm install
pnpm dev
```

웹 앱은 `http://localhost:3000`에서 실행된다. 브라우저에서는 화면을 미리 볼 수 있지만 로컬 작업과 계획 데이터는 표시하지 않는다.

데스크톱 앱 실행:

```bash
WORKBENCH_WORKSPACE_ROOTS="$HOME/Projects" pnpm tauri:dev
```

작업과 계획 읽기·쓰기, 에이전트 실행·취소, 변경 파일과 diff 확인은 데스크톱 앱에서만 사용할 수 있다. 브라우저에서는 로컬 데이터 소스를 사용 불가로 표시하고 관련 입력을 비활성화한다.

Tauri 명령은 앱 시작 시 프로세스 환경의 `WORKBENCH_WORKSPACE_ROOTS`를 읽고, 실제 경로가 그 아래에 있는 Git 저장소만 허용한다. `.env` 값만으로는 데스크톱 IPC 권한이 생기지 않는다. Git 명령과 에이전트 CLI가 실행되므로 신뢰하는 저장소만 허용한다.

독립 실행 패키지 생성:

```bash
pnpm tauri:build
```

패키징 전에 정적 진입점, 서버 함수 등록, Node 브라우저 대체 청크가 없는지 자동으로 검사한다.

## 프로젝트 문서

- [`DESIGN.md`](./DESIGN.md): 제품 방향, 핵심 흐름, 설계 경계
- [`AGENTS.md`](./AGENTS.md): 코딩 에이전트가 따라야 할 구현·안전 규칙

## 로컬 데이터

| 설정 | 용도 | 기본값 |
| --- | --- | --- |
| `MY_WORKBENCH_DATA` | `TASKS.md`를 저장할 디렉터리 | `~/.my-workbench` |
| `WORKBENCH_PLANS_DIR` | 저장된 계획 경로가 없을 때 사용할 구현 계획 디렉터리 | `~/.my-workbench/plans` |
| `WORKBENCH_WORKSPACE_ROOTS` | 에이전트 작업대에서 허용할 Git 저장소 루트. 운영체제의 경로 구분자로 여러 경로를 구분 | 비어 있음 |

`WORKBENCH_WORKSPACE_ROOTS`를 사용할 때 macOS와 Linux에서는 여러 루트를 `:`로 구분한다.
로컬 데이터 경로는 본인이 소유한 신뢰할 수 있는 디렉터리로 설정한다.
원자 저장은 일반 파일 권한을 보존하지만 사용자 정의 ACL, 확장 속성, 소유권 보존은 보장하지 않으므로 이런 메타데이터가 필요한 파일을 편집 대상으로 사용하지 않는다.

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
