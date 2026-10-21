# Maa Verge development guide

## Context

Read PLAN.md and docs/STATUS.md before changes. Maa Verge is an AGPL-3.0-only, local-first Windows/macOS/Linux desktop assistant built with Tauri 2, React/TypeScript, a TypeScript application service on pinned Bun, and a C++20 MaaCore worker. Native MaaCore runs outside the UI process. Product UI is Simplified Chinese. See docs/runtime-migration.md for the Python reference and migration boundaries.

## Boundaries

- React uses the typed transport in packages/contracts; it never executes shell, ADB or native calls.
- TypeScript owns plans, persistence, policy, Agent proposals and updates. C++ owns MaaCore loading, device leases and native calls; it never writes the business database. JSON-RPC 2.0 uses newline-delimited JSON over stdio; stdout is protocol-only, diagnostics go to stderr.
- JSON Schema in packages/contracts/schemas is authoritative; regenerate TypeScript types and standalone validators with pnpm contracts:generate. Native NDJSON output uses protocolVersion 1.
- Production includes the Bun-compiled service and C++ worker, with no Python fallback. MAAVERGE_BACKEND=python selects the retained reference only in debug builds. Do not replace a failed service with another backend automatically.
- Both services must hold the same dedicated SQLite data-root lease before opening business data. Never delete its lock file. Back up existing data with serialize, fsync, integrity validation and rename; preserve implicit rowids and persistent run.start requestId deduplication.
- Runtime adapters must support deterministic mock operation without MaaCore, a simulator, model keys or paid requests.
- A device has one controller. Never replace files referenced by active workers. Updates stage immutable core/resource generations, validate, then activate at idle boundaries with rollback.
- AsstStop clears the native queue; it is not pause/resume. Task-completion messages alone do not prove action success.
- Keep application, core and resource update channels separate. Core version equality must not suppress resource updates.

## Collaboration

- Inspect existing changes before editing. Own a narrow subsystem; do not overwrite another contributor's work.
- Use feature branches/worktrees for parallel work. Local data and ports must be isolated per checkout; device locks are shared across local instances.
- Use standard user-data paths and configurable roots; never hardcode a developer's drive, username or ADB location.
- Do not commit credentials, local databases, screenshots of real accounts, native downloads, virtual environments or build output.
- Commit dependency lockfiles. Update contracts and documentation with interface changes. Generated files must be regenerated from their source.
- Use Conventional Commits (`feat:`, `fix:`, `docs:`, etc.); write the description after the colon in Simplified Chinese, for example `feat: 添加主页仪表盘` or `fix(ui): 修复窗口缩放闪烁`.
- Keep docs/STATUS.md accurate: implemented behavior, verification, limitations and next actions. Never report an untested platform as verified.

## Commands

The root package.json is the command source of truth: pnpm dev:mock, pnpm dev, pnpm setup:bun, pnpm run doctor, pnpm check, pnpm test:runtime, pnpm test:packaging, pnpm test:desktop-runtime, pnpm test:e2e:mock, pnpm build.
Use .bun-version and tools/setup-bun.mjs for the pinned runtime; do not depend on a global Bun. C++: node tools/build-core-worker.mjs (synthetic CTest), or --production without Python. Python reference/fixture tests: uv sync --frozen; uv run pytest. Rust: cargo fmt --check and cargo clippy --locked when the native toolchain is available.
Use targeted checks while developing, then the relevant project checks. Do not modify formatting or dependencies unrelated to the task.

## Real-world effects

Development and CI default to mock adapters. Do not connect to or operate a real game, invoke paid models, publish releases or upload account data as part of routine tests. Explicit real-device testing must be selected and recorded.
Default consumable budgets are zero. Model-generated actions pass deterministic validation. Never expose arbitrary shell commands to the model.
