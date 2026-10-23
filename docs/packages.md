# GitHub Packages 软件包

[Maa Verge 的 GitHub Packages](https://github.com/DeathofBrain/maa-verge/pkgs/container/maa-verge) 使用 Container Registry 分发各平台安装包。`ghcr.io/deathofbrain/maa-verge:0.1.0` 包含对应 GitHub Release 的 7 个安装包及 `SHA256SUMS.txt`，文件位于镜像内的 `/packages/`。

普通桌面安装可直接使用 [GitHub Releases](https://github.com/DeathofBrain/maa-verge/releases/tag/v0.1.0)。已有 Docker 时，可在 PowerShell 或终端执行以下命令提取 package 中的文件；创建的临时容器仅用于复制文件，无需启动：

```sh
mkdir Maa-Verge-v0.1.0
docker create --name maaverge-package --platform linux/amd64 ghcr.io/deathofbrain/maa-verge:0.1.0 /unused
docker cp maaverge-package:/packages/. ./Maa-Verge-v0.1.0/
docker rm maaverge-package
```

进入提取目录后，按系统选择安装包并核对校验值。Linux/macOS 可用 `sha256sum -c SHA256SUMS.txt`（macOS 可改用 `shasum -a 256 -c SHA256SUMS.txt`），Windows 可用 `Get-FileHash -Algorithm SHA256 <安装包路径>` 与清单比对。

发布工作流读取指定的已发布 Release，核对文件集合与 SHA-256 后创建镜像，并写入应用源码、版本和提交标签。镜像标签使用不带 `v` 的版本号，开发预览不发布 `latest` 标签。镜像用于安装包分发，不包含可在容器中启动的桌面环境。
