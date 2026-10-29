# Maa Verge development guide

## Context

Read PLAN.md and docs/STATUS.md before changes. Maa Verge is an AGPL-3.0-only, local-first Windows/macOS/Linux desktop assistant built with Tauri 2, React/TypeScript, a TypeScript application service on pinned Bun, and a C++20 MaaCore worker. Native MaaCore runs outside the UI process. Product UI is Simplified Chinese. See docs/runtime-migration.md for runtime and data migration boundaries.

## Boundaries

- React uses the typed transport in packages/contracts; it never executes shell, ADB or native calls.
- TypeScript owns plans, persistence, policy, Agent proposals and updates. C++ owns MaaCore loading, device leases and native calls; it never writes the business database. JSON-RPC 2.0 uses newline-delimited JSON over stdio; stdout is protocol-only, diagnostics go to stderr.
- JSON Schema in packages/contracts/schemas is authoritative; regenerate TypeScript types and standalone validators with pnpm contracts:generate. Native NDJSON output uses protocolVersion 1.
- Development and production use the TypeScript service and C++ worker. Do not introduce a Python runtime, reference backend or automatic backend fallback.
- Every application service instance must hold the same dedicated SQLite data-root lease before opening business data. Never delete its lock file. Back up existing data with serialize, fsync, integrity validation and rename; preserve implicit rowids and persistent run.start requestId deduplication.
- Product runtimes use real devices, execution, screenshots and update sources. Only Agent proposals remain local and deterministic. Synthetic adapters belong in tests and must run without MaaCore, a simulator, model keys or paid requests.
- A device has one controller. Never replace files referenced by active workers. Updates stage immutable core/resource generations, validate, then activate at idle boundaries with rollback.
- AsstStop clears the native queue; it is not pause/resume. Task-completion messages alone do not prove action success.
- Keep application, core and resource update channels separate. Core version equality must not suppress resource updates.

## Collaboration

- Inspect existing changes before editing. Own a narrow subsystem; do not overwrite another contributor's work.
- Develop in the existing primary repository checkout or additional Git worktrees created and checked out only under `<primary-repository-root>/.worktree/<task-name>`. This path restriction also applies to tools, automation, and subagents. Contributors sharing a checkout must own non-overlapping files and must not independently switch its shared branch; inspect and preserve local changes before editing or switching branches. Isolate test data and ports; device locks remain shared across local instances.
- After a task is merged, return to the primary checkout, stop the task's processes, confirm all changes are merged, and preserve any required local files. Remove the task's worktree with `git worktree remove`, delete its merged temporary local branch, and use `git worktree prune` if stale registrations remain. Do not remove another contributor's worktree or discard unmerged or uncommitted work.
- Default saved configuration and business data to the program directory's config folder (checkout/config in development), with configurable roots. Keep device leases in the shared standard user-data path; never hardcode a developer's drive, username or ADB location.
- Do not commit credentials, local databases, screenshots of real accounts, native downloads, virtual environments or build output.
- Commit dependency lockfiles. Update contracts and documentation with interface changes. Generated files must be regenerated from their source.
- Use Conventional Commits (`feat:`, `fix:`, `docs:`, etc.); write the description after the colon in Simplified Chinese, for example `feat: 添加主页仪表盘` or `fix(ui): 修复窗口缩放闪烁`.
- Keep docs/STATUS.md accurate: implemented behavior, verification, limitations and next actions. Never report an untested platform as verified.

## Project skills

- Project-local skills live in `.skill/`. Load the relevant `SKILL.md` only when its task applies.
- When planning, changing or checking Maa Verge version numbers, read and follow [maa-verge-versioning](.skill/maa-verge-versioning/SKILL.md). Apply SemVer 2.0.0 while respecting the project's release-tag subset and independent application, core, resource, protocol and data versions.
- When creating, editing or reviewing the user-facing README, read and follow [maa-verge-readme](.skill/maa-verge-readme/SKILL.md). Keep installation and usage claims aligned with the actual published release and preserve the user's branding and Logo disclosure choices.
- When creating, editing or reviewing Maa Verge Release notes, changelogs or release copy, read and follow [maa-verge-release-notes](.skill/maa-verge-release-notes/SKILL.md). Its `assets/release-notes.md` is the maintained template; version notes belong in `docs/releases/<tag>.md`. Build-only and updater implementation work do not require this writing skill.

## Commands

The root package.json is the command source of truth: pnpm dev, pnpm dev:ui, pnpm setup:bun, pnpm run doctor, pnpm check, pnpm test:runtime, pnpm test:packaging, pnpm test:desktop-runtime, pnpm test:e2e, pnpm build.
Use .bun-version and tools/setup-bun.mjs for the pinned runtime; do not depend on a global Bun. C++: node tools/build-core-worker.mjs (Node-driven synthetic CTest), or --production to skip test fixtures. Rust: cargo fmt --check and cargo clippy --locked when the native toolchain is available.
Use targeted checks while developing, then the relevant project checks. Do not modify formatting or dependencies unrelated to the task.
Format touched files with the repository configuration: Prettier for TypeScript/JavaScript, JSON, styles and Markdown; clang-format for C++; rustfmt for Rust. VS Code setup and CLI commands are documented in docs/development.md. Do not format generated files or vendored code; regenerate outputs from their source.

## Real-world effects

Development starts the real native service. CI and routine tests use isolated data and synthetic fixtures with automatic connections and downloads disabled. Do not connect to or operate a real game, invoke paid models, publish releases or upload account data as part of routine tests. Explicit real-device testing must be selected and recorded.
Default consumable budgets are zero. Model-generated actions pass deterministic validation. Never expose arbitrary shell commands to the model.
