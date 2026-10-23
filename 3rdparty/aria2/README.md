# 固定 aria2 源码与第三方许可

本目录保存 Maa Verge 内置 aria2 的完整上游源码归档和许可正文。`sources/` 中的 8 个源码归档与 3 个 GCC / MinGW 许可文本共 64,794,916 字节，保留原始发布字节；最大文件为 53,279,637 字节的 OpenSSL 源码归档。

- aria2 1.37.0：Windows 使用官方 `win-64bit-build1` 可执行文件；Linux 和 macOS 从同版源码编译。
- OpenSSL 3.5.9：Linux 的静态 TLS 依赖；macOS 使用系统 AppleTLS。
- GMP 6.3.0、Expat 2.5.0、SQLite 3.43.1、zlib 1.3、c-ares 1.19.1、libssh2 1.11.0：官方 Windows 构建对应的依赖源码。
- GCC Runtime Library Exception / GPLv3 与 MinGW-w64 v8.0.0 运行时许可：保留固定上游文本，不将运行时例外解释为其他第三方素材授权。

`manifest.json` 记录每份源码的精确 URL 和 SHA-256，以及 20 份许可正文的源归档、成员路径和正文 SHA-256。Windows ZIP 仅作为三份声明的来源登记在 `externalAssets` 中；该预编译归档及其中的 EXE 不提交到本目录，构建时仍按固定摘要获取和校验。

`notices/` 的正文逐字节取自对应归档或固定文本。唯一的内容提取是 SQLite：`PUBLIC-DOMAIN.txt` 保留 `sqlite3.c` 中含 `The author disclaims copyright` 的完整注释及末尾换行，不按固定长度截断。清单用 `sqlite-public-domain` 标记此转换，其提取函数为 `tools/setup-aria2.mjs` 中的 `sqlitePublicDomainNotice`。

构建从脚本所在仓库读取这些固定来源，不受调用目录或临时输出目录影响，不联网重新下载源码，也不为收集声明而调用源码归档解压器。源码、正文或清单缺失和摘要不符时直接失败；已生成的工具缓存不能掩盖来源损坏。Windows 仍需从校验后的官方 ZIP 中提取 `aria2c.exe`；Linux / macOS 的实际源码编译仍需解压源码。

发行包继续包含各平台实际使用的完整对应源码、许可正文及 `REBUILD.txt`，固定可执行文件摘要、版本校验与 GPL-3.0-or-later 分发选项均保持不变。各文件分别遵循其上游许可，不统一改为应用代码的许可。

更新本目录时，先核实上游版本及原始归档摘要，再提取正文并更新清单与 `aria2Assets`。保留完整声明和原始换行；仓库属性已禁止本目录的自动换行转换。用实际归档逐项核对清单，运行下载器测试及隔离的完整准备流程。不要在缺失声明时按 SPDX 名称生成替代正文。
