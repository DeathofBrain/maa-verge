# Release 说明编写规范

每版正文保存在 `docs/releases/<tag>.md`，与对应发布版本一起审阅。GitHub Release 使用这份 Markdown 作为正文。现有示例见 [v0.1.0](v0.1.0.md)。

结构参考原 MAA [v6.20.1 Release](https://github.com/MaaAssistantArknights/MaaAssistantArknights/releases/tag/v6.20.1)：先写少量 Highlights，再按新增、改进、修复等分类呈现详细更新，用 `<details>` 折叠长内容。Maa Verge 保持简体中文正文，补充本项目的安装包选择、首次使用和开发预览边界。

## 固定结构

1. **版本与重要提示**：写明开发预览 / 正式版；升级注意事项、数据迁移、签名 / 公证状态等影响使用的变化放在开头。
2. **本版亮点 | Highlights**：选 2–4 项最值得用户关注的变化，每项一个短标题和一段使用效果说明。
3. **下载与安装**：按平台、架构列出实际安装包的直接下载链接和校验清单。注明最低系统目标、必要系统依赖，说明 Source code 是源码归档。
4. **首次使用或升级说明**：写清需要用户执行的步骤；已有版本升级时只保留当次相关内容。
5. **已知问题与限制**：列出影响使用的缺口、平台范围和反馈入口，保持直接可见。
6. **详细更新**：当前版本放入 `<details open>`，按“新增 | New”“改进 | Improved”“修复 | Fix”“文档 | Docs”“其他 | Other”分类。没有内容的分类省略。
7. **构建与许可**：验证记录、构建来源、许可和对应源码使用独立的折叠块，保留可追溯链接。
8. **完整变更**：提供上一发布标签到本版的 compare 链接；首个版本提供源码标签链接。
9. **上游引用与版权**：放在全文最底部、保持展开，列出 MAA / MaaCore 与 MaaResource 的上游地址、实际引用范围和版权归属，链接对应上游许可。第三方内容保留各自声明。

## 写作与核对

* 版本号、发布日期、发布通道和提交范围以本次实际发布目标为准。GitHub 的 Pre-release 标记须单独确认；`v0.1.0` 也可以是开发预览。
* 从上一发布版本到目标提交检查提交记录和 diff，再按用户能感知的最终变化归并。同一功能的多次开发调整合成一条，完整撤销的内容删除。
* 首次开放的功能描述最终能力；修复条目只写已发布版本存在的问题。首个发布版通常只需要“新增”，无需凑齐分类。
* 亮点和详细日志只写本版对应代码已有的行为。后续分支的功能、较新的测试数量、待实现计划留在各自的开发状态记录中。
* 条件写进条目，例如“Windows MuMu”“只读画面”“需手动执行”。MaaCore、游戏资源与应用的更新范围分别说明，避免把上游更新直接记作应用功能。
* 有可核实的 PR 和贡献者时保留引用；没有对应信息时省略。不要由提交者显示名推测 GitHub 用户名。
* Release 正文中的源码、文档和图片使用完整 URL，文档链接固定到本版标签或提交。下载链接必须使用实际上传的文件名，检查大小写、架构和格式。
* 首屏保留用户需要的提示与下载入口；测试数量、进程实现和重建细节放入折叠块或对应文档。构建、合成回归、交互安装和真实设备验收分别标明实际范围。
* 保留 AGPL 对应源码、依赖许可及嵌入运行时源码 / 重建入口。根据本版实际依赖填写，不能沿用已失效的源码提交或引擎版本。
* 底部署名分别说明上游与本项目自有代码的版权，注明参考文档 / Release 结构及复用核心 / 资源的范围；游戏资源与其他第三方内容按各自声明标注，不统一归入应用许可。

## 可复制骨架

复制到 `docs/releases/<tag>.md` 后替换所有占位内容，删除不适用段落。下载表参照 [v0.1.0](v0.1.0.md)，逐项核对本版资产。

```markdown
## Maa Verge <tag>

一句话说明本版重点。

> **重要提示**：本版通道、升级注意事项及实际签名状态。

### 本版亮点 | Highlights

#### 亮点标题

说明用户现在能做什么，以及适用条件。

### 下载与安装

按系统和架构填写实际安装包直链、校验清单和系统要求。

### 升级说明

列出本次需要用户执行的步骤；首版改为“首次使用”。

### 已知问题与限制

* 影响使用的问题、适用平台与当前处理方式。

问题反馈：填写本项目 Issue 入口及需要提供的信息。

---

<details open>
<summary><b><tag>（YYYY-MM-DD）详细更新</b></summary>

### 新增 | New

* 说明新增功能的实际使用效果。

### 改进 | Improved

* 说明已有功能改善了什么。

### 修复 | Fix

* 说明在什么情况下会出现的问题及修复后的行为。

</details>

<details>
<summary><b>构建来源与验证范围</b></summary>

填写对应提交、构建运行链接，以及实际验证的平台、方式与边界。

</details>

<details>
<summary><b>许可与对应源码</b></summary>

填写本版源码标签、依赖许可位置、嵌入运行时源码与重建入口。

</details>

**完整变更**：[<previous-tag> → <tag>](https://github.com/DeathofBrain/maa-verge/compare/<previous-tag>...<tag>)

### 上游引用与版权

* 上游项目：[MAA / MaaAssistantArknights](https://github.com/MaaAssistantArknights/MaaAssistantArknights)。本项目复用 MaaCore 自动化核心，参考上游任务协议、连接配置与 Release 说明结构；按本版实际情况核对引用范围。
* 游戏资源来源：[MaaResource](https://github.com/MaaAssistantArknights/MaaResource)，仓库许可见其 [LICENSE](https://github.com/MaaAssistantArknights/MaaResource/blob/main/LICENSE)。游戏素材及第三方内容保留各自的版权与授权声明。
* MAA / MaaCore 开源代码的版权归上游原作者及贡献者所有，依据 [AGPL-3.0-only](https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/<maacore-tag>/LICENSE) 使用；Maa Verge 自有代码的版权归本项目贡献者所有，同样采用 AGPL-3.0-only。

Maa Verge 为独立项目，不代表游戏官方或 MaaAssistantArknights 官方客户端。
```

## 发布正文的使用

完成正文后，核对目标标签、对应构建、平台安装包、校验文件及文档链接，再将正文用于该版 GitHub Release。发布前查看折叠块与下载表的实际渲染，并清除全部占位内容。

修改这里的本地版本说明不会自动更新已经发布的 GitHub Release。已有正文勘误时保留原版功能、发布日期和验证范围；后续功能随下一个版本记录。
