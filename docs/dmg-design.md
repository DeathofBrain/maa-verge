# macOS DMG 安装界面

DMG 沿用 Maa Verge 的蓝灰配色，依次展示拖拽安装、首次系统放行和开源声明。应用与 Applications 文件夹均由 Finder 提供真实图标和拖拽行为，背景不绘制替代图标或虚假的可点击按钮。

- 安装：将 Maa Verge 拖入 Applications。
- 首次打开：安装后先尝试打开；若被系统拦截，进入「系统设置 → 隐私与安全性 → 仍要打开」，按提示确认。
- 声明：Maa Verge 为开源软件，不包含任何恶意代码；附公开源码地址与 AGPL-3.0-only 许可。

首次放行说明对应当前 ad-hoc 签名发行方式，不表示应用已经获得 Apple 的开发者认证或公证。签名、完整性校验和旧版本问题见[应用更新与首次放行](app-updates.md#macos-签名与首次放行)。

## 资源与重新生成

设计源为 `apps/desktop/src-tauri/installer/dmg-background.svg`；随包背景为同目录的 `dmg-background.png`。只编辑 SVG，再运行生成器，不手动修改 PNG。生成器复用仓库固定的 Noto Sans SC 字体与 Playwright，不添加依赖、不请求网络、不启动产品服务。

```sh
node tools/generate-dmg-background.mjs
```

需要已安装 Playwright Chromium；使用已有 Edge 等浏览器时，可通过 `PLAYWRIGHT_CHROMIUM_CHANNEL=msedge` 指定。Windows 使用 checkout 固定 Node，例如在 PowerShell 中运行：

```powershell
$env:PLAYWRIGHT_CHROMIUM_CHANNEL = 'msedge'
& ./.tools/node/node.exe tools/generate-dmg-background.mjs
```

逻辑画布为 **800×600**，PNG 为 **1600×1200、144 DPI**（`pHYs` 为 5669 pixels/meter），供 Finder 按逻辑尺寸显示并保持 Retina 清晰度。生成 PNG 是需提交的安装器资源，发行构建直接使用，无须运行浏览器。

`tauri.macos.conf.json` 设置 800×640 的 Finder 窗口，为标题栏预留空间；应用及 Applications 图标中心分别为 `(220, 245)`、`(580, 245)`。Tauri 提供 128px 图标和 16px 文件名，不在背景重复绘制。调整布局时同步修改 SVG 与平台配置，并在 macOS Finder 内核对标题栏、标签、背景缩放和拖拽。

`tools/build.mjs` 在 macOS 为 Tauri 设置 `TAURI_BUNDLER_DMG_IGNORE_CI=true`，防止 CI 默认跳过背景与图标位置。构建宿主必须能运行 Finder AppleScript；不应以跳过布局掩盖自动化权限失败。

## 验证边界

使用当前 Tauri 配置 schema 验证合并后的配置，并人工检查生成背景；不得添加外观断言测试。Windows 的图片预览不能代替 macOS 实际验收。

macOS 宿主须运行 `pnpm build`，挂载 DMG 核对背景、两种图标及拖拽安装；另运行 `node tools/smoke-macos-install.mjs` 检查安装、签名与启动。签名发行继续使用现有的 `--require-updater` 流程。Apple Silicon 与 Intel、首次 Gatekeeper 放行均需在对应宿主记录验证，不能据图片生成成功宣称通过。
