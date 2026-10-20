# MAAVerge development guide

## Context

Read PLAN.md and docs/STATUS.md before changes. MAAVerge is an AGPL-3.0-only, local-first Windows/macOS/Linux desktop assistant built with Tauri 2, React/TypeScript and a Python 3.12 runtime. Native MaaCore runs outside the UI process. Product UI is Simplified Chinese.

## Boundaries

- React uses the typed transport in packages/contracts; it never executes shell, ADB or native calls.
- Python owns plans, persistence, policy and updates. JSON-RPC 2.0 uses newline-delimited JSON over stdio; stdout is protocol-only, diagnostics go to stderr.
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
- Keep docs/STATUS.md accurate: implemented behavior, verification, limitations and next actions. Never report an untested platform as verified.

## Commands

The root package.json is the command source of truth: pnpm dev:mock, pnpm dev, pnpm run doctor, pnpm check, pnpm test:e2e:mock, pnpm build.
Python: uv sync --frozen; uv run pytest. Rust: cargo fmt --check and cargo clippy --locked when the native toolchain is available.
Use targeted checks while developing, then the relevant project checks. Do not modify formatting or dependencies unrelated to the task.

## Real-world effects

Development and CI default to mock adapters. Do not connect to or operate a real game, invoke paid models, publish releases or upload account data as part of routine tests. Explicit real-device testing must be selected and recorded.
Default consumable budgets are zero. Model-generated actions pass deterministic validation. Never expose arbitrary shell commands to the model.
