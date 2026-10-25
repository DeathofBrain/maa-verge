# 应用与核心更新

在「设置 → 更新」分别选择 Maa Verge 和 MaaCore 的「正式版」或「预览版」。两者设置独立，游戏资源继续按官方 MaaResource 提交更新，不受发行频道影响。

## 频道与更新行为

| 对象 | 默认频道 | 正式版 | 预览版 |
| --- | --- | --- | --- |
| Maa Verge | 预览版 | 项目 GitHub Releases 中非预发布、无 SemVer 预览后缀的版本 | 正式版与预览版中版本号最高的已发布版本 |
| MaaCore | 正式版 | 官方稳定版 API | 官方 Releases 中正式版与预览版的最高有效 SemVer |

草稿不参与检查；版本按 SemVer 比较，`beta.10` 高于 `beta.2`。切回正式频道时，已安装的较高预览版继续保留，不自动降级。应用和核心切换频道均取消旧频道候选；核心正在检查、下载、校验或切换时须等待操作完成再改频道。显式核心/资源回滚仍可恢复上一组已验证组合。

Maa Verge 的「启动时检查应用更新」默认开启，仅检查，不自动下载或退出。发现新版后选择「下载并校验」，切换页面不影响下载；签名通过后再选择「重启并安装」，确认退出。仍有任务、工具、连接或原生调用时拒绝安装，并说明具体占用原因。后台组件检查或更新尚未结束时，安装准备先暂停新增业务、自动连接和后续组件作业，等待已有组件操作安全结束，再复查空闲状态；已有组件切换可完成内部重连。最后关闭本地服务并释放设备、数据租约，再调用安装器和重启。安装准备失败时解除暂停，保留已验证的更新包供重试。

安装准备请求超时或连接中断时，桌面端会请求取消服务端准备，避免迟到的组件操作结束后继续暂停业务。确认取消后可重试；取消失败或未能在十秒内确认时，提示重启应用，不声称已恢复。

应用候选只保存在本次会话内存中，退出后需重新下载；当前不支持断点续传、aria2 或应用内版本回滚。MaaCore/资源继续使用原有下载器、断点续传、不可变版本目录和安全边界切换，见 [组件运行时](maacore-runtime.md)。

## 平台安装方式

| 平台/安装方式 | 应用内安装 |
| --- | --- |
| Windows x64 NSIS EXE | 下载同类 EXE，签名校验后退出并运行安装器 |
| Windows x64 MSI | 下载同类 MSI，保留原安装方式 |
| macOS Apple Silicon / Intel `.app` | 下载对应架构 `.app.tar.gz`，替换应用包并重启；DMG 继续用于首次手动安装 |
| Linux x64 AppImage | 在 AppImage 环境中更新当前 AppImage 并重启 |
| Linux DEB / RPM | 显示版本与平台提示，通过包管理器或对应安装包更新 |
| 开发构建、未识别的安装方式/架构 | 可以检查发行版本，禁用自动下载安装 |

自动安装仍要求应用位置可写或安装器获得所需权限。macOS 签名/公证和 Windows Authenticode 发布者签名与下文的更新签名是不同机制，目前没有完成这些系统发行签名的配置与验收。

## macOS 签名与首次放行

macOS 默认使用免费的 ad-hoc 本地签名，不需要 Apple Developer 付费账号或新增 GitHub Secrets。Tauri 配置显式设置 `bundle.macOS.signingIdentity: "-"`，在生成 DMG、更新归档及更新签名前封装整个 `.app`；Bun 服务、C++ worker 和 aria2c 保留各自的签名与权限。只签主程序或子进程、没有 `.app` 的资源封装，会导致系统报告应用「已损坏」。

本地签名可以验证应用包完整性，但没有 Apple 认可的发布者身份与公证。首次安装时，先把应用从 DMG 拖到可写的安装目录，尝试打开，再按系统提示到「系统设置 → 隐私与安全性」选择「仍要打开」。应用需要用户明确放行；CI 不修改全局 Gatekeeper 设置，也不承诺未公证下载可以直接打开。

已发布的 **v0.1.1 macOS 包确有资源封装缺失**，不是单纯的未知开发者提示。2026-10-24 核对 Apple Silicon DMG 的官方 SHA-256 与映像校验均通过，而 `codesign --verify --deep --strict` 返回 `code has no resources but signature indicates they must be present`。修复已随 [v0.1.2 正式版](https://github.com/DeathofBrain/maa-verge/releases/tag/v0.1.2) 发布，两种 macOS 架构均通过最终 DMG 安装、窗口与包内服务启动、退出清理及更新归档一致性检查；既有发行资产保持不变。

已经下载 v0.1.1 的用户，建议退出旧版并手动安装 v0.1.2 对应架构的 DMG。若仍要临时使用 v0.1.1，先从项目 Release 校验 `SHA256SUMS.txt`，退出应用并复制到安装目录，再在终端只补签这一个应用并验证签名；以下路径须替换为实际位置。该命令不使用 `--deep` 重签，保留三个子进程的权限：

```sh
codesign --force --sign - "/Applications/Maa Verge.app"
codesign --verify --deep --strict "/Applications/Maa Verge.app"
```

随后按系统提示放行。如果系统仍阻止此已核验的应用，可仅移除该应用的下载隔离标记，再打开；不关闭系统安全检查：

```sh
xattr -dr com.apple.quarantine "/Applications/Maa Verge.app"
```

v0.1.2 起由 `tools/verify-macos-bundle.mjs` 强制验证 `.app` 的资源封装和三个子进程签名。普通 CI 与发行 CI 的两种 macOS 架构还会运行 `node tools/smoke-macos-install.mjs`：校验最终 DMG、只读挂载并复制到临时安装目录，仅对测试副本模拟放行，用独立的数据、设备锁、日志和 Foundation 用户目录启动真实窗口与包内服务，验证原生退出及无进程残留。自动连接与自动更新在启动前关闭；已有 Maa Verge 实例存在时拒绝测试。

发行 CI 额外传入 `--require-updater`，解开最终 `.app.tar.gz`，验证签名及其与原应用的主程序、资源封装和子进程字节一致；任何检查失败都不能进入资产收集和上传。失败报告保存在 `build/macos-install-smoke/report.json`。这覆盖安装后启动与退出，不代替最低 macOS 版本、首次系统放行界面和真实游戏验收。

## 信任与版本边界

应用只从 [DeathofBrain/maa-verge](https://github.com/DeathofBrain/maa-verge/releases) 查询已发布版本，再读取所选标签自己的 `latest.json`。清单、平台/架构/安装器对应文件名、版本和 GitHub 资产登记必须匹配；包下载只跟随官方 GitHub 附件 CDN 的 HTTPS 重定向。元数据最多 4 MiB，单包最多 1 GiB，下载核对登记大小并限制停滞时间。

桌面内置 Tauri 更新公钥，要求 minisign 签名同时绑定包内容与版本；下载完成和安装前分别验证，缺失/错误签名、错误架构、安装器错配或版本回退均拒绝安装。`SHA256SUMS.txt` 供手动校验，不能替代更新签名。业务库不随应用安装回滚。

## 从 v0.1.0 迁移

[v0.1.0](https://github.com/DeathofBrain/maa-verge/releases/tag/v0.1.0) 的 GitHub 元数据标记为预发布，包含七个平台安装包及校验文件，没有内置应用更新器，也没有签名更新清单/更新包。用户需要手动安装一次 [v0.1.2 正式版](https://github.com/DeathofBrain/maa-verge/releases/tag/v0.1.2)，之后才能使用应用内更新。v0.1.1 已内置更新器，可在「设置 → 更新」获取 v0.1.2；macOS 旧版无法启动时请直接安装新版 DMG。保留旧标签与产物，不覆盖重发。

## 准备新发行版

`.github/workflows/release.yml` 的 **Prepare signed application release** 手动工作流会执行四宿主检查、构建、签名和资产校验，最后创建 GitHub **草稿**；不会自动公开发布。GitHub 要求手动工作流先进入仓库默认分支，之后可选择具体源码 ref。当前已发布的正式版为 [v0.1.2](https://github.com/DeathofBrain/maa-verge/releases/tag/v0.1.2)；后续发行仍需先提交新的版本号，并保留既有标签与资产。

1. 同步根 `package.json`、桌面/服务 `package.json`、`tauri.conf.json`、Cargo 包版本及相应锁文件，并编写 `docs/releases/v版本号.md`。标签必须为 `vMAJOR.MINOR.PATCH`，可带有效预览后缀；发行版本不接受 build metadata。
2. 使用 `node tools/app-updater-release.mjs check --tag v版本号` 核对。工作流拒绝覆盖现有 Release，已有标签必须指向选中的源码提交。
3. 确保 Actions secrets 已配置 `TAURI_SIGNING_PRIVATE_KEY` 与 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。本轮已在项目仓库配置，公钥保存在 Tauri 配置中；私钥和密码须独立加密备份，不得提交。后续版本沿用此密钥，直接换公钥会使旧客户端无法验证新包。
4. 在 Actions 选择该工作流与源码 ref，填写 `release_tag` 和 `prerelease`。含预览后缀的版本始终生成预发布草稿。构建从 secrets 读取签名材料；普通不带密钥的 `pnpm build` 仍可生成未签名测试安装包，不可直接作为自动更新发行版。
5. 检查草稿中的全部 **18 项附件**及发行说明，完成目标系统安装/更新验收后再手动发布。发布前客户端看不到草稿。

完整附件集合为七个首次安装包、两个分架构 macOS 更新归档、七个 `.sig`、`latest.json` 与 `SHA256SUMS.txt`。`latest.json` 包含 `windows-x86_64-nsis`、`windows-x86_64-msi`、`darwin-aarch64`、`darwin-x86_64`、`linux-x86_64` 五个目标。DEB/RPM 也生成签名供发行校验，但不交给应用内安装器。

发布工具 `tools/app-updater-release.mjs` 在收集及生成清单时验证真实签名、签名版本和完整产物集合。各平台带空格的原始产品名严格匹配后统一为 `Maa-Verge` 文件名；macOS 归档还加入版本与架构，避免多宿主上传时覆盖。复制重命名保留包内容与签名，重复或无法识别的安装包拒绝收集。发行资产解析与校验集中在 `tools/release-assets.mjs`，支持既有八附件与完整签名更新十八附件两种集合，拒绝不完整的混合版本；安装包仅通过 GitHub Releases 分发。

当前验证范围见 [开发状态](STATUS.md)。合成检查与 Windows 构建不能代替真实升级安装、macOS/Linux 宿主和最低系统验收。
