# Mirror酱真实下载与更新验证

验证日期：2026-10-31。宿主为 Windows x64，源码为 `dev` 工作目录。使用用户明确授权的测试 CDK 请求真实服务；命令行探针通过标准输入读取，原生页面通过密码框临时保存到隔离测试库。结束后清空页面凭据并清理测试库残留，本文、探针文件和结果不保存 CDK 或限时下载 URL。未连接设备、运行游戏、安装应用、发布版本或读取发行私钥。

## 三端安装包下载

不填写 CDK 时，四种平台组合的正式、预览元数据均为 HTTP 200 / `code=0`：正式版 `v0.1.2`，预览版 `v0.1.3-alpha.1`，均无下载 URL。平台参数沿用已有官方分发配置，资源 ID 为 `maa-verge`。

四个有效测试 CDK 分别完成以下预览安装包的完整下载，经过生产 `MirrorChyanClient.download` 和 `downloadArchive`。独立重算的 SHA-256、文件大小同时匹配 Mirror 元数据、官方 GitHub release asset digest 与 `SHA256SUMS.txt`。

| 平台                | 官方文件                                 |    字节数 | SHA-256                                                            | 更新签名                        |
| ------------------- | ---------------------------------------- | --------: | ------------------------------------------------------------------ | ------------------------------- |
| Windows x64         | `Maa-Verge_0.1.3-alpha.1_x64-setup.exe`  | 219594070 | `770e91170d1a420c98e4b84a0c883baa4759ab9a1071092811b4258ebb8ea49f` | 版本与内容验证通过              |
| macOS Apple Silicon | `Maa-Verge_0.1.3-alpha.1_aarch64.dmg`    |  44615061 | `62c46b005955f89fbec2a66ea55b4c4e29808add2151da7f869ab05d66c6428c` | 此历史发行版未提供 DMG 更新签名 |
| macOS Intel         | `Maa-Verge_0.1.3-alpha.1_x64.dmg`        |  47129036 | `ad3e463bf0dfb3c2aee346fd4ebb02506fa61a0b5aa38220345c74cfe5a01fd3` | 此历史发行版未提供 DMG 更新签名 |
| Linux x64           | `Maa-Verge_0.1.3-alpha.1_amd64.AppImage` | 131357176 | `a53b68f4a89120e86846ea440ff458ef202bc999cb6e7b8319c24ef0ff22e936` | 版本与内容验证通过              |

文件格式分别符合 PE 安装器、UDIF DMG、ELF64 AppImage。Windows 的 NSIS 外壳为 i386 PE，不能据外壳推断包内应用架构。签名验证使用仓库既有公钥与官方清单，通过现有 `verifyUpdaterSignature` 完成。

## 三条应用内更新链路

### Maa Verge 应用

直接调用生产 `AppUpdateHttp`，仅下载、不安装。

| 场景                     | 结果                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| Windows 正式版＋过期 CDK | Mirror 返回 7001，显示续费与回退原因；从 GitHub 完整下载 EXE，57276900 字节，摘要与版本绑定签名通过 |
| Linux 正式版＋有效 CDK   | 状态确认经 Mirror 下载完整 AppImage，189458936 字节，摘要与版本绑定签名通过                         |
| macOS 两架构             | 当前公开正式版、预览版清单均无 `darwin-*-dmg` 目标；按新规则阻断，不下载 `.app.tar.gz`              |

新源码只接受签名 DMG，目标为 `darwin-aarch64-dmg`、`darwin-x86_64-dmg`；旧归档、旧目标和旧归档缓存均拒绝。缺少目标、空签名、错架构、错版本或登记资产不匹配时不能成为安装候选。后续发行不再生成 `.app.tar.gz`，仅支持旧归档的客户端需手动安装一次新版 DMG。

当前已发布两版均不能作为新 macOS 客户端的 DMG 应用内更新候选。这一结果是对真实发行清单的核查；新规则的拒绝行为由 Rust 与后台行为测试验证，尚未在 macOS WebView 中人工操作。

### MaaCore 核心

真实请求 `MAA`，Windows `stable` 返回 `v6.20.1`，`alpha` 返回 `v6.21.0-beta.3.d007.g110c5ffcbb`。完整下载 stable 包，297879254 字节，SHA-256 为 `28a6c812c184f4bd6e8a7e7448b2ffa6312d711de7d39595deac771e3e784ea8`。

在独立的 `test-results/mirrorchyan-live/component-instance` 中建立仅存内存的 UpdateStore，复用这份已下载并再次核对摘要的真实包，调用生产 `UpdateService`、`runUpdateJob`、`validateNative`：

1. 检查显示可用更新，安全解压并通过真实 MaaCore `--validate`，进入 `staged`。
2. 探针将忙碌回调设为 true，激活停留 `waiting_idle`；设为 false 后完成隔离组合激活。
3. 再次检查为 `idle`，提示当前已是最新版本。

没有打开业务数据库、创建设备控制器或触碰当前产品配置。忙碌状态由探针回调设置，不代表在真实游戏运行中切换已验收。macOS/Linux 核心仍按既有策略使用官方原生运行时源，本次不据 Windows 结果声称其宿主验证通过。

### MaaResource 资源

独立请求 `MaaResource`，不带系统、架构参数，版本为 `2026-10-30 09:26:08.000`。完整下载 14281129 字节，SHA-256 为 `2f46752546411f834d31463e5be814aa57767104050ec6470257cd89c2ae9285`。

核心已是最新后，资源检查仍发现可用更新；资源包从不可变核心基线合并，包内 `last_updated` 匹配所选时间戳，并通过真实 MaaCore 资源加载验证。资源同样经过 `staged → waiting_idle → active`，再次检查为 `idle`。四次核心/资源准备及激活原生校验全部通过。

## 原生页面回归与下载来源

使用最新 debug Tauri WebView、生产 Bun Runtime 和 C++ 原生验证器，在独立数据根和初始空缓存中从设置页操作核心、资源更新。没有使用合成 runtime、网络夹具或 `fetch` 覆写，自动连接和自动更新关闭，设备和执行记录均为零。

- 核心：页面触发真实 Mirror 下载上述 297879254 字节包，安全解压、原生验证后点击「应用更新」，完成激活。
- 资源：页面触发真实 Mirror 下载上述 14281129 字节包，合并为 10094 文件的不可变候选，通过原生验证并进入 `staged`。资源激活另由前述生产服务隔离验证覆盖。
- 两条链路下载期间，更新卡片显示「下载来源：Mirror酱」，卡片及常驻通知显示「正在通过 Mirror酱下载组件」，速度和进度随真实下载变化。重启同一隔离实例，切换「更新 → 通用与外观 → 更新」后来源仍保留，未新增下载。页面错误为零。

来源提示由实际下载链路写入 `downloadSource`，不会因填写 CDK 就显示 Mirror酱。应用、核心和资源的行为回归覆盖未知来源、Mirror 下载、回退官方、重新检查清理旧来源；实际回退时切换为「官方源」。应用来源经生产后台进度、Rust host 事件转发至页面；组件来源来自实际选源与下载进度。

另用独立原生实例填写过期 CDK，仅检查核心更新。真实服务返回 7001 后，页面明确显示「Mirror酱 CDK 已过期，请续费后重试，已改用官方更新源」，并从官方元数据得到 `v6.20.1` 候选；没有准备更新或下载大包。凭据通过 UI 清空，进程正常退出，扫描本次 459 文件无凭据残留、无不可读文件，租约锁保留。

真实选源证据包括生产下载状态、初始空缓存、完整包摘要、原生验证及持久 generation 元数据；核心/资源记录的无凭据元数据地址分别为 `https://mirrorchyan.com/api/resources/MAA/latest`、`https://mirrorchyan.com/api/resources/MaaResource/latest`。本次没有独立 HTTP 抓包。开发版应用自更新门禁保持开启，应用页下载行为由夹具测试，真实应用传输和验签由前述 `AppUpdateHttp` 测试覆盖。

两次原生进程均正常退出，无本次 Maa Verge 或 worker 残留。扫描本次页面数据、profile、日志、报告及截图共 979 文件，清理隔离业务库旧页后凭据字节匹配为零，数据根租约锁保留；仓库文本扫描 24503 文件同样没有测试 CDK。

## CDK 错误矩阵

下列各类型均对 `maa-verge`、`MAA`、`MaaResource` 实际请求，三个 ID 的结果一致；未返回下载 URL，客户端中文错误与官方定义相符。

| 测试类型               | HTTP | code |
| ---------------------- | ---: | ---: |
| 已过期                 |  403 | 7001 |
| 无效字符串（额外对照） |  403 | 7002 |
| 下载次数上限           |  403 | 7003 |
| 类型错误               |  403 | 7004 |
| 已封禁                 |  403 | 7005 |

四个有效 CDK 在本次下载时均可正常获取实际完整包，没有遇到流程测试码 8009。错误码的自动测试仍覆盖 8009，不能将元数据成功替代完整下载成功。

## 自动检查及证据

- 固定 Bun 最终更新/来源/Runtime 定向回归：224/224，含合成 C++ 更新作业和编译服务自重入；不使用真实 CDK。其中 DMG 限制定向后台传输测试 99/99。
- 发行工具测试：35/35。`check:app` 通过：工具 171 通过、2 项 Windows 条件跳过，契约 43/43，四工作区 TypeScript 与知识/契约/CSS/架构门禁通过。
- Rust fmt、严格 clippy 通过；Rust 测试 66 通过、3 项既有条件忽略。覆盖旧归档/缓存拒绝、真实更新插件恢复、签名内容与版本复核、跨架构、下载来源进度及清理边界。
- Windows Edge 页面定向 27/27，最终全量 257/257、0 失败、0 跳过（2 workers，隔离端口 15674，6.8 分钟）；合成桌面桥用于行为回归，原生真实下载页面验证另见上节。
- 没有新增外观断言测试。

本机脱敏探针和报告保存在忽略目录 `test-results/mirrorchyan-live/`：`public-metadata.json`、`credentials.json`、`official-verification.json`、`app-transport.json`、`components.json`、`page-report.json`、`page-fallback.json`、`secret-scan.json`；原生截图为 `page-core-mirror-progress.png`、`page-resource-mirror-progress.png`、`page-resource-source-after-return.png`、`page-expired-fallback.png`。全量 UI 报告位于 `test-results/mirrorchyan-full-ui/report.json`。文件名 `credentials.json` 仅表示凭据测试结果，内容没有凭据。真实包、隔离 generation 和报告均不进入 Git。

Windows/Linux 生产应用下载已验证；macOS DMG 下载和官方摘要已验证，签名 DMG 的挂载、原子替换、重启、首次放行，以及 Linux 原生升级安装仍需对应宿主完成。没有修改历史 release、官方 Mirror 上传工作流或版本号。
