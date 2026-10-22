# Maa Verge desktop UI

The React interface uses the typed `@maaverge/contracts` transport for every business operation. The Tauri host connects it to the real TypeScript service and C++ worker. A plain browser reports the missing desktop runtime; product code has no mock fallback. The frontend never invokes ADB, native MaaCore or shell commands.

The first UI iteration uses a small, bespoke CSS system instead of Tailwind/shadcn. This keeps the initial interface cohesive without adding a component generator or remote assets. Colors, panel boundaries and responsive behavior live in `src/styles.css`; icons come from lucide-react. Fonts use local system fallbacks, so the interface requires no external font requests.

Available pages: overview, plan editor, Agent conversation and plan review, execution history, device settings and the three independent update channels. The bottom preview uses actual connected-device frames with adjustable refresh rate and optional manual clicks. Agent alone retains local deterministic proposals for review and manual execution.

Use root commands from `README.md`. `pnpm --filter @maaverge/desktop check` checks frontend types and `pnpm --filter @maaverge/desktop build` produces the Vite bundle. The root `pnpm test:e2e` command validates workflows through an explicit test-only Tauri bridge and deterministic fixture under `tests/ui/fixtures`; those modules are absent from the product bundle.

Tauri source is maintained separately under `src-tauri`. Native availability and platform verification are recorded in `docs/STATUS.md`; the presence of a UI control does not imply that a real platform or game connection has been verified.

The desktop window uses the existing workspace top bar as its title bar. On Windows/Linux, native decorations are disabled and the top-right buttons minimize, maximize/restore and request close through the typed window bridge in `@maaverge/contracts`. Close still follows the tray preference. The top bar's noninteractive area and sidebar brand support dragging and native double-click maximize; selectors, search and buttons are excluded. The loading/error screen also keeps window controls available. Browser previews do not show desktop controls. On macOS, `tauri.macos.conf.json` uses an overlay title bar with native traffic lights and reserved space in the sidebar brand; platform verification remains separate.

The title bar has a fixed height. The typed bridge synchronizes both the native window and WebView backgrounds with the resolved light/dark theme to prevent a different background showing during resize. Windows disables DWM transitions for the main window because they stretch a cached WebView frame, including the integrated title bar, during maximize/restore. This is an application window attribute; CSS hover and page transitions still run.

Playwright uses its bundled Chromium by default. For an explicitly selected installed browser, set `MAAVERGE_TEST_BROWSER=msedge` (or another supported Playwright channel) before `pnpm test:e2e`. The initial Windows browser verification used Microsoft Edge because the downloaded full Chromium build failed Windows side-by-side activation.
