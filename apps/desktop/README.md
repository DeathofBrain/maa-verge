# MAAVerge desktop UI

The React interface uses the typed `@maaverge/contracts` transport for every business operation. Browser development uses its deterministic mock adapter; the Tauri host connects the same interface to Python. The frontend never invokes ADB, native MaaCore or shell commands.

The first UI iteration uses a small, bespoke CSS system instead of Tailwind/shadcn. This keeps the initial interface cohesive without adding a component generator or remote assets. Colors, panel boundaries and responsive behavior live in `src/styles.css`; icons come from lucide-react. Fonts use local system fallbacks, so the interface requires no external font requests.

Available pages: overview, plan editor, Agent conversation and plan review, execution history, device settings and the three independent update channels. Game preview artwork is a CSS illustration and is labeled as a simulation, never a live game screenshot. Mock mode is visible in the top bar and settings.

Use root commands from `README.md`. `pnpm --filter @maaverge/desktop check` checks frontend types and `pnpm --filter @maaverge/desktop build` produces the Vite bundle. The root `pnpm test:e2e:mock` command validates browser workflows, persistence, stop behavior and update boundaries.

Tauri source is maintained separately under `src-tauri`. Native availability and platform verification are recorded in `docs/STATUS.md`; the presence of a UI control does not imply that a real platform or game connection has been verified.

Playwright uses its bundled Chromium by default. For an explicitly selected installed browser, set `MAAVERGE_TEST_BROWSER=msedge` (or another supported Playwright channel) before `pnpm test:e2e:mock`. The initial Windows browser verification used Microsoft Edge because the downloaded full Chromium build failed Windows side-by-side activation.
