# JavaScript 缺失许可正文的固定版本补充

打包优先收集依赖发布包中的 LICENSE、COPYING、NOTICE 和 COPYRIGHT。发布包缺少正文时，`javascript-overrides.json` 只允许精确的包名与版本，核对发布包的许可声明及补充原始字节 SHA-256；未登记版本仍拒绝打包。生成的许可文件包含来源、上游提交、许可声明和哈希，打包不访问网络。

`@cfworker/json-schema@4.1.1` 由 LangChain 的依赖闭包引入。其 npm 发布包将 `files` 限于 `dist`、`src` 和 `README.md`，遗漏完整许可正文；npm 版本元数据声明 MIT，并给出 `gitHead` 为 `5409fdc2bd144f68e8b28c61c71fcb16600000a6`。补充同一提交仓库根 `LICENSE.md` 的完整 MIT 许可，保留 `Copyright (c) 2020 Jeremy Danyow`。来源与原始字节 SHA-256 见固定清单；升级版本后需要重新核验。

`js-tiktoken@1.0.21` 同样由 LangChain 的依赖闭包引入。其 npm 包的 `files` 清单遗漏许可正文；npm 版本元数据声明 MIT，`gitHead` 为 `4c8b748e07992c00386f3180af5c574b27b65139`。补充该提交仓库根 `LICENSE` 的完整 MIT 许可，保留 `Copyright (c) 2022 OpenAI, Shantanu Jain`；不从作者或项目名称推断版权声明。
