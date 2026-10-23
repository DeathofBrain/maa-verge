# MaaCore 运行文件的选择性安装

Maa Verge 的 TypeScript 服务从官方稳定 Release 下载对应架构的完整归档，在不可变候选目录中选择性解压，再由独立 C++20 进程校验核心版本、API 和资源加载。首次安装和后续核心更新共用同一 TypeScript 提取规则；独立 MaaResource 覆盖包使用通用安全解压。发行路径不再调用官方 Python Updater。

核心精简提取和接入提交（`e6e8493`、`103bc99`）已包含在迁移基线中。其保留范围已迁至 [archives.ts](../services/backend/src/archives.ts)，安装、独立资源更新和空闲切换位于 [updates.ts](../services/backend/src/updates.ts)。Python 原实现仍用于回归比较；进程与数据库交接见 [runtime-migration.md](runtime-migration.md)。

## 下载与安装目录

“设置 → 更新”分别提供 MaaCore 与游戏资源的下载/安装根目录。安装版默认使用主程序同级的 `MaaCore/`、`MaaResource/`，由 Tauri 传入主程序目录，不能使用包内 `runtime/` 侧进程位置推导。macOS 以 `.app` 整体为程序，Linux AppImage 以 AppImage 文件为程序。源码开发使用各 checkout 独立数据根中的 `native/components/core/`、`native/components/resource/`，避免不同开发工作树共用下载。

每个根目录下有可续传下载缓存 `downloads/` 与不可变的 `generations/`。保存目录要求完整绝对路径，并检测实际写入能力；安装在系统只读目录时可选择用户可写目录，错误会保留当前设置和活动版本。恢复默认只改变后续下载位置。变更目录不移动或覆盖现有活动、候选、上一组回滚文件，运行中的 worker 继续使用其固定路径，已经安装在旧用户数据目录的版本继续可用。

契约新增可选 `Settings.componentPaths`（`core`、`resource`；保存空字符串恢复对应默认目录）与 `UpdateChannel.installDirectory`。服务初始化补全旧设置，旧客户端保存其他设置时保留目录。`UpdateChannel.resourceActivities` 按客户端提供已安装资源的活动名与 `last_updated`；官服和 B 服共享基础 `resource/version.json`，资源页合并显示为「国服（官服 / B服）」，其他客户端读取各自 `global/<client>/resource/version.json`，缺失时明确显示“活动信息未提供”。主页和更新页以活动名显示游戏资源版本，保留提交号、基础资源版本和更新时间用于核对。这是资源包标记，不替代官方活动日历的开放时间。

## 后台下载与断点续传

下载由 TypeScript 应用服务持有，切换设置分类或侧栏页面不会取消。窗口右上角持续显示 MaaCore / 游戏资源的进度、解压校验和结果；下载不占用其他页面的操作状态。准备完成仍需点击「应用更新」或等待自动更新流程在空闲边界生效，不能把下载完成当作安装成功。

「设置 → 更新 → 下载器」默认使用内置下载器，也可选择已安装的 aria2。aria2 路径留空时从服务的 PATH 查找 `aria2c`，或填写可执行文件的完整绝对路径；不接受命令行参数或脚本。程序通过固定参数直接启动 aria2c，不启用 RPC，也不会读取用户 aria2 配置。安装包暂不捆绑 aria2，选中后找不到或运行失败会明确报错，可改回内置下载器。偏好只影响之后开始的下载。

两种下载器均在对应组件根目录的 `downloads/` 保存可恢复的数据。缓存身份包含数据根、通道、固定来源 URL、版本、文件名、大小和摘要，重试同一包或重启服务可继续使用，其他版本或数据根不会混用。内置下载器使用 HTTP Range / If-Range，并核对服务端版本标记及 Content-Range；不能确认分片属于同一内容或来源不支持续传时重新下载。aria2 保留自己的控制文件；切换下载器时不混用两者的未完成数据。

下载没有两分钟总时限；连接或数据长时间停滞才会失败。中断或正常退出保留可用分片，重新打开后在失败通道点击「重试下载」。失败不会自动替换下载器。下载完成后仍检查大小、完整 SHA-256（上游提供时核对官方摘要）、2 GiB 上限，再执行归档安全校验及 C++ 核心/资源加载验证；完整性失败的分片会丢弃，已启用版本保持原样。未完成缓存的自动清理与磁盘配额仍待实现。Python 调试参考实现不提供新的下载器设置。

## 与 maa-cli 的关系

参考 [maa-cli v0.7.7 的 `extract_mapper`](https://github.com/MaaAssistantArknights/maa-cli/blob/v0.7.7/crates/maa-cli/src/installer/maa_core.rs#L127)：完整下载后，分别提取动态库和资源。该逻辑不减少下载流量。

maa-cli 会将任意子目录中匹配动态库名称的文件扁平化到库目录；Windows 下匹配 `.dll` 也可能选入 GUI/.NET 文件。Maa Verge 因此限制库的来源目录，保留上游官方运行根的布局，避免子目录同名库覆盖和 GUI 依赖混入。

## 保留范围

- 仅接受平铺运行根或唯一一层外目录；从核心库和同级 `resource/version.json` 判断归档布局及平台。
- 保留运行根顶层的平台动态库，包括依赖、控制单元插件和 macOS/Linux 的版本化库文件。Windows 排除原 GUI 的 `MAA.dll` 及 .NET 主机 `hostfxr.dll`、`hostpolicy.dll`。
- 保留完整 `resource/`：任务、模板、OCR/ONNX 模型、国际服资源和设备端 minitouch/maatouch 等辅助程序均属于运行资源。
- 保留归档运行根中的许可证、版权及 NOTICE 声明。
- 不提取原 GUI、独立 GUI 更新器、`externals/` 中的 .NET/WPF 依赖、GUI 素材、Python 示例或调试符号。

原生依赖不能只剩 `MaaCore.dll`。上游 [核心构建脚本](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.1/src/MaaCore/CMakeLists.txt) 还安装 MaaUtils、OpenCV、FastDeploy、ONNX Runtime 等依赖；控制器也可能动态加载插件。

## 解压与切换边界

选择性解压仍检查归档的全部成员，拒绝路径越界、重复路径、特殊文件、目录链接、无效或循环别名。macOS/Linux 的合法文件别名物化为普通文件；选中的别名不得引用被过滤的目标。不会通过创建系统链接或扁平化子目录绕过筛选。

文件只写入新候选 generation。验证失败不切换；验证成功后仍等待任务空闲边界。已有活动 generation 与回滚文件不做原位精简。此前安装的完整包会保留，到下一次核心版本更新时才使用精简的新目录。

解压由包内服务的 `--update-job` 模式完成，该进程不打开业务数据库；随后调用 `maaverge-core-worker --validate`，检查必需符号、实际版本和资源加载。资源更新固定 MaaResource commit，候选以对应核心的完整基础资源重新构建，再应用该提交覆盖包，清除前次覆盖残留。核心版本相同不跳过资源检查。

## 官方分发情况（2026-10-21）

Windows v6.20.1 的稳定 Release 只有完整 ZIP。官方 [构建工作流](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.1/.github/workflows/ci.yml#L158) 提供 `MAARuntime-win-*`，但它是需要 GitHub 认证、有保留期限的 Actions 产物，且仍带独立更新器，不作为默认更新源。macOS 已有 `macos-runtime-universal.zip`，Linux 使用 `linux-*.tar.gz`。

若以后需要减少下载流量，可以推动上游正式发布 Windows runtime，或按固定官方 tag 构建并分发自己的运行时包；选择性解压主要减少本地磁盘占用。

## Windows x64 验证（2026-10-21）

以下为迁移前 Python 路径的历史验收记录，保留用于对照包体和提取规则；当前 TypeScript/C++ 路径的实际测试见 [STATUS.md](STATUS.md)，不据此推定新路径或其他平台已完成实测。

下载官方 `MAA-v6.20.1-win-x64.zip`，大小 297,879,254 字节，SHA-256 为 `28a6c812c184f4bd6e8a7e7448b2ffa6312d711de7d39595deac771e3e784ea8`，与 Release 元数据一致。全部归档文件展开共 571,424,588 字节（约 545.0 MiB）；选择性首装后的目录含本项目 manifest 共 340,850,391 字节（约 325.1 MiB），减少 **40.35%**。

保留的原生库为 `MaaCore.dll`、`MaaUtils.dll`、`DirectML.dll`、`MaaAdbControlUnit.dll`、`MaaWin32ControlUnit.dll`、`fastdeploy_ppocr_maa.dll`、`onnxruntime_maa.dll`、`opencv_world4_maa.dll`，以及完整 `resource/`。原 GUI、.NET/WPF、示例与素材目录未落盘。

在隔离数据目录中验证首装、通过官方 Python Updater 从 v6.20.0 更新到 v6.20.1、等待空闲激活及回滚。新旧核心均通过独立进程的版本/API/资源加载检查，原 v6.20.0 核心文件哈希保持一致。没有连接设备或运行游戏任务；macOS/Linux 的选择规则、归档布局和别名仅经合成归档测试，不代表目标平台原生实测。
