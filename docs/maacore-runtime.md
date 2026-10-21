# MaaCore 运行文件的选择性安装

Maa Verge 的 TypeScript 服务从官方稳定 Release 下载对应架构的完整归档，在不可变候选目录中选择性解压，再由独立 C++20 进程校验核心版本、API 和资源加载。首次安装和后续核心更新共用同一 TypeScript 提取规则；独立 MaaResource 覆盖包使用通用安全解压。发行路径不再调用官方 Python Updater。

核心精简提取和接入提交（`e6e8493`、`103bc99`）已包含在迁移基线中。其保留范围已迁至 [archives.ts](../services/backend/src/archives.ts)，安装、独立资源更新和空闲切换位于 [updates.ts](../services/backend/src/updates.ts)。Python 原实现仍用于回归比较；进程与数据库交接见 [runtime-migration.md](runtime-migration.md)。

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
