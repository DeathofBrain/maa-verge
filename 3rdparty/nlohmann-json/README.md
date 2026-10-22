# nlohmann/json 3.12.0

本目录保存未修改的上游单头文件和 MIT 许可证。CMake 与 VS Code 共用 `include`，配置和编译无需下载此依赖；本目录的 `CMakeLists.txt` 是 Maa Verge 提供的本地集成文件，并在配置时校验头文件 SHA-256。

| 文件 | 上游来源 | SHA-256 |
| --- | --- | --- |
| `include/nlohmann/json.hpp` | [v3.12.0 single_include/nlohmann/json.hpp](https://raw.githubusercontent.com/nlohmann/json/v3.12.0/single_include/nlohmann/json.hpp) | `aaf127c04cb31c406e5b04a63f1ae89369fccde6d8fa7cdda1ed4f32dfc5de63` |
| `LICENSE.MIT` | [v3.12.0 LICENSE.MIT](https://raw.githubusercontent.com/nlohmann/json/v3.12.0/LICENSE.MIT) | `46a65cffd1ea955132d95a8dd921640714a8d6b537d2e4e482d31145ae95b603` |

升级时从固定上游版本更新上述两个文件，同步本文件、CMake 校验值及 `services/native/THIRD_PARTY_NOTICES.md`，然后运行原生构建与合成 CTest。
