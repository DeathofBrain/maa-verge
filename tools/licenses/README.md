# Rust 缺失许可正文的固定版本补充

这些 crate 的 crates.io 发布包只有许可声明，没有完整许可正文；`rust-overrides.json` 将补充正文严格绑定到包名、版本和原始字节 SHA-256。升级后若仍缺正文，打包会失败，必须重新核实来源，不能直接按 SPDX 名称代用通用许可。

- `alloc-stdlib@0.3.0`：其 `.cargo_vcs_info.json` 指向 Dropbox 仓库固定提交，采用该提交仓库根 LICENSE。
- `webview2-com@0.39.1`、`webview2-com-sys@0.39.1`：同一固定提交的 workspace 根 LICENSE。
- `selectors@0.38.0`：固定提交的 `selectors/lib.rs` 首部明确声明 MPL 2.0，并链接 Mozilla 官方正文；该仓库提交没有对应 LICENSE 文件。保留 Mozilla 官方 MPL 2.0 全文，包含附录 A/B。
- `dlopen2@0.8.2`、`libappindicator-sys@0.9.0`：各自固定提交的 workspace 根完整许可；后者同时保留 MIT 与 Apache 2.0。
- macOS 使用的 `objc2`、`block2`、`dispatch2` 和相关 framework crate：各自精确提交的根 `LICENSE.md` 只有许可选择声明。保留该原文（包括 Apple SDK 衍生说明），并为全部 12 个精确包版本选择共同允许的 MIT 分支，附 SPDX 固定提交的 MIT 全文。MIT 原文中的版权占位符不作猜测替换；生成文本单独保留 Cargo `authors` 声明，没有声明的包保持为空。

打包时优先收集实际 Cargo 源目录中的 LICENSE、COPYING、NOTICE、COPYRIGHT 和 `license_file`；仅在正文缺失且版本精确匹配时使用此目录。固定来源、声明证据与哈希会写入生成的许可文本。Rust 标准库版权及完整第三方许可从实际 `rustc --print sysroot` 的 `share/doc/rust/COPYRIGHT-library.html` 和 `licenses/` 收集；这些文件属于 rustc 组件，不需要 rust-docs。
