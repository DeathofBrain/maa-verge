//! Application updates belong to the desktop host; component updates stay in Bun.
//! Candidate packages are immutable, verified bytes in memory and never replace a
//! running service. Only an explicit activate request may shut the service down.
use crate::runtime::Runtime;
use reqwest::{Client, Url};
use semver::Version;
use serde_json::{json, Value};
use std::cmp::Ordering;
use std::future::Future;
use std::sync::atomic::{AtomicU64, Ordering as AtomicOrdering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::utils::{config::BundleType, platform::bundle_type};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use tokio::sync::Mutex as AsyncMutex;

const RELEASES: &str = "https://api.github.com/repos/DeathofBrain/maa-verge/releases";
const REPOSITORY_PATH: &str = "/DeathofBrain/maa-verge/releases/";
const MAX_METADATA: usize = 4 * 1024 * 1024;
const MAX_PACKAGE: u64 = 1024 * 1024 * 1024;
const MAX_PAGES: usize = 10;

fn now() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_default()
}

fn newer(candidate: &Version, current: &Version) -> bool {
    candidate.cmp_precedence(current) == Ordering::Greater
}

fn clean_https(url: &Url) -> bool {
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none_or(|port| port == 443)
        && url.fragment().is_none()
}

fn release_url(url: &Url, tag: &str) -> bool {
    clean_https(url)
        && url.host_str() == Some("github.com")
        && url.query().is_none()
        && url.path() == format!("{REPOSITORY_PATH}tag/{tag}")
}

fn asset_url(url: &Url, tag: &str) -> bool {
    let prefix = format!("{REPOSITORY_PATH}download/{tag}/");
    clean_https(url)
        && url.host_str() == Some("github.com")
        && url.query().is_none()
        && url.path().strip_prefix(&prefix).is_some_and(|name| {
            !name.is_empty()
                && name != "."
                && name != ".."
                && name
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || b"._+-".contains(&c))
        })
}

// GitHub redirects release attachments to its signed asset CDN. Never follow
// metadata-supplied URLs to a local endpoint, alternate repository or plain HTTP.
fn asset_redirect(url: &Url) -> bool {
    clean_https(url)
        && (matches!(
            url.host_str(),
            Some("release-assets.githubusercontent.com" | "objects.githubusercontent.com")
        ) || url.host_str() == Some("github.com")
            && url
                .path()
                .starts_with(&format!("{REPOSITORY_PATH}download/"))
            && url.query().is_none())
}

fn client(attachments: bool, timeout: Duration) -> Result<Client, String> {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let redirects = if attachments {
        reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 || !asset_redirect(attempt.url()) {
                attempt.error("应用更新下载拒绝不可信的重定向")
            } else {
                attempt.follow()
            }
        })
    } else {
        reqwest::redirect::Policy::none()
    };
    Client::builder()
        .user_agent(concat!("maa-verge/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(15))
        .timeout(timeout)
        .redirect(redirects)
        .build()
        .map_err(|error| format!("无法初始化应用更新连接：{error}"))
}

async fn metadata(url: Url, attachments: bool) -> Result<Value, String> {
    let mut response = client(attachments, Duration::from_secs(30))?
        .get(url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|error| format!("应用更新元数据请求失败：{error}"))?;
    if !response.status().is_success() {
        return Err(format!("应用更新源 HTTP {}", response.status()));
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_METADATA as u64)
    {
        return Err("应用更新元数据超出 4 MiB 限制".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|error| error.to_string())? {
        if bytes.len().saturating_add(chunk.len()) > MAX_METADATA {
            return Err("应用更新元数据超出 4 MiB 限制".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|error| format!("应用更新元数据不是有效 JSON：{error}"))
}

#[derive(Clone, Debug)]
struct Release {
    version: Version,
    tag: String,
    information: Value,
    assets: Vec<Value>,
}

fn select_release(releases: &[Value], channel: &str) -> Option<Release> {
    releases.iter().filter_map(|release| {
        if release.get("draft")?.as_bool()? {
            return None;
        }
        let prerelease = release.get("prerelease")?.as_bool()?;
        let tag = release.get("tag_name")?.as_str()?;
        let version = Version::parse(tag.strip_prefix('v').unwrap_or(tag)).ok()?;
        if channel == "stable" && (prerelease || !version.pre.is_empty()) {
            return None;
        }
        let url = release.get("html_url")?.as_str()?;
        if !release_url(&Url::parse(url).ok()?, tag) {
            return None;
        }
        Some(Release {
            version,
            tag: tag.into(),
            information: json!({
                "url": url,
                "notes": release.get("body").and_then(Value::as_str).unwrap_or("").chars().take(16_384).collect::<String>(),
                "publishedAt": release.get("published_at").and_then(Value::as_str).unwrap_or("").chars().take(64).collect::<String>(),
                "prerelease": prerelease,
            }),
            assets: release.get("assets").and_then(Value::as_array).cloned().unwrap_or_default(),
        })
    }).max_by(|a, b| a.version.cmp_precedence(&b.version))
}

async fn latest_release(channel: &str) -> Result<Option<Release>, String> {
    let mut releases = Vec::new();
    for page in 1..=MAX_PAGES {
        let url = Url::parse(&format!("{RELEASES}?per_page=100&page={page}")).unwrap();
        let json = metadata(url, false).await?;
        let items = json.as_array().ok_or("GitHub 应用发行列表格式错误")?;
        releases.extend(items.iter().cloned());
        if items.len() < 100 {
            return Ok(select_release(&releases, channel));
        }
    }
    Err("应用发行列表超过安全查询上限，无法确定最新版本".into())
}

fn platform_target(
    os: &str,
    arch: &str,
    bundle: Option<&str>,
    appimage: bool,
) -> Result<String, String> {
    match (os, arch, bundle) {
        ("windows", "x86_64", Some("nsis" | "msi")) => {
            Ok(format!("windows-{arch}-{}", bundle.unwrap()))
        }
        ("windows", _, _) => {
            Err("当前不是可识别的 MSI/NSIS 安装版，请从发行页安装对应版本后使用自动更新".into())
        }
        ("macos", "x86_64" | "aarch64", Some("app")) => Ok(format!("darwin-{arch}")),
        ("macos", _, _) => {
            Err("macOS 仅应用包安装版支持自动更新；请先从发行页安装 Maa Verge.app".into())
        }
        ("linux", "x86_64", Some("appimage")) if appimage => Ok(format!("linux-{arch}")),
        ("linux", _, Some("deb" | "rpm")) => {
            Err("DEB/RPM 安装版请使用系统包管理器或下载对应安装包更新".into())
        }
        ("linux", _, _) => Err(
            "Linux 仅 AppImage 安装版支持应用内自动更新；请使用系统包管理器或发行页安装包".into(),
        ),
        _ => Err("此系统架构尚未提供应用自动更新".into()),
    }
}

fn host_target(app: &AppHandle) -> Result<String, String> {
    if cfg!(debug_assertions) {
        return Err("开发构建仅检查应用发行版；请安装正式发行包后使用应用内更新".into());
    }
    #[cfg(target_os = "macos")]
    if !mac_bundle(&std::env::current_exe().map_err(|error| error.to_string())?) {
        return Err("macOS 开发可执行文件无法自更新，请使用发行版 Maa Verge.app".into());
    }
    let bundle = match bundle_type() {
        Some(BundleType::Nsis) => Some("nsis"),
        Some(BundleType::Msi) => Some("msi"),
        Some(BundleType::Deb) => Some("deb"),
        Some(BundleType::Rpm) => Some("rpm"),
        Some(BundleType::AppImage) => Some("appimage"),
        Some(BundleType::App | BundleType::Dmg) => Some("app"),
        _ => None,
    };
    #[cfg(target_os = "linux")]
    let appimage = app.env().appimage.is_some();
    #[cfg(not(target_os = "linux"))]
    let appimage = {
        let _ = app;
        false
    };
    platform_target(
        std::env::consts::OS,
        std::env::consts::ARCH,
        bundle,
        appimage,
    )
}

#[cfg(any(target_os = "macos", test))]
fn mac_bundle(executable: &std::path::Path) -> bool {
    let Some(directory) = executable.parent() else {
        return false;
    };
    let Some(contents) = directory.parent() else {
        return false;
    };
    directory.file_name().is_some_and(|name| name == "MacOS")
        && contents.file_name().is_some_and(|name| name == "Contents")
        && contents.parent().is_some_and(|bundle| {
            bundle
                .extension()
                .is_some_and(|extension| extension == "app")
        })
}

fn package_filename(version: &Version, target: &str) -> Result<String, String> {
    let suffix = match target {
        "windows-x86_64-nsis" => "x64-setup.exe",
        "windows-x86_64-msi" => "x64_zh-CN.msi",
        "darwin-aarch64" => "aarch64.app.tar.gz",
        "darwin-x86_64" => "x64.app.tar.gz",
        "linux-x86_64" => "amd64.AppImage",
        _ => return Err("应用更新清单包含不支持的平台目标".into()),
    };
    Ok(format!("Maa-Verge_{version}_{suffix}"))
}

fn package_metadata(manifest: &Value, release: &Release, target: &str) -> Result<u64, String> {
    let version = manifest
        .get("version")
        .and_then(Value::as_str)
        .and_then(|version| Version::parse(version).ok());
    if version.as_ref() != Some(&release.version) {
        return Err("应用更新清单版本与所选 GitHub Release 不一致".into());
    }
    let package = manifest
        .get("platforms")
        .and_then(|platforms| platforms.get(target))
        .ok_or_else(|| format!("此发行版缺少 {target} 的签名更新包；请等待发行产物完成"))?;
    package
        .get("signature")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty() && value.len() <= 8192)
        .ok_or("应用更新包缺少有效签名")?;
    let url = package
        .get("url")
        .and_then(Value::as_str)
        .and_then(|value| Url::parse(value).ok())
        .ok_or("应用更新包地址无效")?;
    if !asset_url(&url, &release.tag) {
        return Err("应用更新包必须来自所选官方 GitHub Release".into());
    }
    let filename = package_filename(&release.version, target)?;
    if url.path_segments().and_then(|mut parts| parts.next_back()) != Some(filename.as_str()) {
        return Err(format!(
            "应用更新包的平台、架构或安装器不匹配，预期 {filename}"
        ));
    }
    let asset = release
        .assets
        .iter()
        .find(|asset| {
            asset.get("browser_download_url").and_then(Value::as_str) == Some(url.as_str())
        })
        .ok_or("应用更新包未在所选 GitHub Release 资产中登记")?;
    if asset.get("name").and_then(Value::as_str) != Some(filename.as_str()) {
        return Err("应用更新包登记的文件名与平台产物不一致".into());
    }
    let size = asset
        .get("size")
        .and_then(Value::as_u64)
        .filter(|size| *size > 0 && *size <= MAX_PACKAGE)
        .ok_or("应用更新包大小无效或超过 1 GiB 限制")?;
    Ok(size)
}

#[derive(Clone)]
struct Candidate {
    update: Update,
    size: u64,
    bytes: Option<Arc<Vec<u8>>>,
}

struct State {
    channel: String,
    automatic: bool,
    generation: u64,
    value: Value,
    candidate: Option<Candidate>,
}

impl State {
    fn fail_check(&mut self, error: &str) {
        self.candidate = None;
        // A failed check cannot supply prepare() with a usable candidate. Clear
        // the version as well so the UI offers another check, not a download.
        self.value["latestVersion"] = Value::Null;
        self.value["status"] = json!("failed");
        self.value["progress"] = json!(0);
        self.value["message"] = json!(error);
    }
}

pub struct AppUpdater {
    app: AppHandle,
    current: Version,
    can_install: bool,
    state: Mutex<State>,
    operation: AsyncMutex<()>,
    event_id: AtomicU64,
}

fn initial_value(version: &Version, can_install: bool) -> Value {
    json!({ "id": "app", "currentVersion": version.to_string(), "latestVersion": null,
        "status": "idle", "progress": 0, "message": "尚未检查应用更新", "appCanInstall": can_install })
}

fn configure_state(
    state: &mut State,
    settings: &Value,
    current: &Version,
    can_install: bool,
) -> bool {
    let channel = if settings.get("appUpdateChannel").and_then(Value::as_str) == Some("stable") {
        "stable"
    } else {
        "preview"
    };
    let automatic = settings
        .get("autoUpdateApp")
        .and_then(Value::as_bool)
        .unwrap_or(true);
    let changed = state.channel != channel;
    let enabled = !state.automatic && automatic;
    state.automatic = automatic;
    if changed {
        state.channel = channel.into();
        state.generation += 1;
        state.candidate = None;
        state.value = initial_value(current, can_install);
        state.value["message"] = json!("应用更新通道已切换，尚未检查此通道");
    }
    changed || enabled
}

impl AppUpdater {
    pub fn new(app: AppHandle) -> Self {
        let current = app.package_info().version.clone();
        let can_install = host_target(&app).is_ok();
        Self {
            app,
            state: Mutex::new(State {
                channel: "preview".into(),
                automatic: true,
                generation: 0,
                value: initial_value(&current, can_install),
                candidate: None,
            }),
            current,
            can_install,
            operation: AsyncMutex::new(()),
            event_id: AtomicU64::new(
                OffsetDateTime::now_utc().unix_timestamp_nanos() as u64 / 1_000_000,
            ),
        }
    }

    pub fn value(&self) -> Value {
        self.state.lock().expect("app updater state").value.clone()
    }

    fn emit(&self, value: Value) {
        let _ = self.app.emit(
            "runtime-event",
            json!({
                "id": self.event_id.fetch_add(1, AtomicOrdering::Relaxed),
                "type": "update.changed", "message": value["message"], "createdAt": now(),
                "data": { "channel": "app", "update": value }
            }),
        );
    }

    fn change(&self, generation: u64, update: impl FnOnce(&mut State)) -> Result<Value, String> {
        let value = {
            let mut state = self.state.lock().expect("app updater state");
            if state.generation != generation {
                return Err("应用更新通道已切换，请重新检查".into());
            }
            update(&mut state);
            state.value.clone()
        };
        self.emit(value.clone());
        Ok(value)
    }

    /// Settings remain owned and persisted by the backend. Changing the channel
    /// invalidates every old candidate, including an in-flight download.
    pub fn configure(&self, settings: &Value) -> bool {
        let mut state = self.state.lock().expect("app updater state");
        let check = configure_state(&mut state, settings, &self.current, self.can_install);
        if check {
            let value = state.value.clone();
            drop(state);
            self.emit(value);
        }
        check
    }

    pub fn check_in_background(app: AppHandle, force: bool) {
        tauri::async_runtime::spawn(async move {
            let updater = app.state::<Self>();
            if force || updater.state.lock().expect("app updater state").automatic {
                let _ = updater.check_wait().await;
            }
        });
    }

    pub fn merge_snapshot(&self, snapshot: &mut Value) {
        if let Some(updates) = snapshot.get_mut("updates").and_then(Value::as_array_mut) {
            updates.retain(|value| value.get("id").and_then(Value::as_str) != Some("app"));
            updates.insert(0, self.value());
        }
    }

    async fn check_wait(&self) -> Result<Value, String> {
        let _operation = self.operation.lock().await;
        self.check_locked().await
    }

    pub async fn check(&self) -> Result<Value, String> {
        let _operation = self
            .operation
            .try_lock()
            .map_err(|_| "已有应用更新操作正在进行")?;
        self.check_locked().await
    }

    async fn check_locked(&self) -> Result<Value, String> {
        let (generation, channel) = {
            let state = self.state.lock().expect("app updater state");
            // Do not discard a downloaded and verified package on ordinary checks.
            if state
                .candidate
                .as_ref()
                .is_some_and(|candidate| candidate.bytes.is_some())
            {
                return Ok(state.value.clone());
            }
            (state.generation, state.channel.clone())
        };
        self.change(generation, |state| {
            state.value["status"] = json!("checking");
            state.value["progress"] = json!(0);
            state.value["checkedAt"] = json!(now());
            state.value["message"] = json!("正在检查 GitHub 应用发行版");
        })?;
        let result = self.find_candidate(generation, &channel).await;
        if let Err(error) = &result {
            let _ = self.change(generation, |state| state.fail_check(error));
        }
        result
    }

    async fn find_candidate(&self, generation: u64, channel: &str) -> Result<Value, String> {
        let release = latest_release(channel).await?;
        self.change(generation, |state| {
            state.candidate = None;
            state.value["checkedAt"] = json!(now());
            state.value["latestVersion"] = release
                .as_ref()
                .map(|release| json!(release.version.to_string()))
                .unwrap_or(Value::Null);
            state.value.as_object_mut().unwrap().remove("appRelease");
            if let Some(release) = &release {
                state.value["appRelease"] = release.information.clone();
            }
        })?;
        let Some(release) = release else {
            return self.change(generation, |state| {
                state.value["status"] = json!("idle");
                state.value["message"] = json!("所选通道暂无已发布版本");
            });
        };
        if !newer(&release.version, &self.current) {
            return self.change(generation, |state| {
                state.value["status"] = json!("idle");
                state.value["message"] = json!("当前已是所选通道最新版本，无需更新");
            });
        }
        let target = match host_target(&self.app) {
            Ok(target) => target,
            Err(message) => {
                return self.change(generation, |state| {
                    state.value["status"] = json!("idle");
                    state.value["message"] = json!(message);
                })
            }
        };
        let manifests: Vec<_> = release
            .assets
            .iter()
            .filter(|asset| asset.get("name").and_then(Value::as_str) == Some("latest.json"))
            .collect();
        if manifests.len() != 1 {
            return Err(
                "新发行版尚未提供唯一的签名更新清单 latest.json；请等待发行产物完成".into(),
            );
        }
        let manifest_url = manifests[0]
            .get("browser_download_url")
            .and_then(Value::as_str)
            .and_then(|url| Url::parse(url).ok())
            .ok_or("签名更新清单地址无效")?;
        if !asset_url(&manifest_url, &release.tag) {
            return Err("签名更新清单必须来自所选官方 GitHub Release".into());
        }
        let manifest = metadata(manifest_url.clone(), true).await?;
        let size = package_metadata(&manifest, &release, &target)?;
        // restore_update applies the plugin's target/semver logic and requires
        // signatures that bind this exact version. HTTP parsing stays bounded.
        let update = self
            .app
            .updater_builder()
            .target(target)
            .endpoints(vec![manifest_url])
            .map_err(|error| error.to_string())?
            .version_comparator(|current, remote| newer(&remote.version, &current))
            .build()
            .map_err(|error| error.to_string())?
            .restore_update(manifest)
            .map_err(|error| format!("签名更新清单无效：{error}"))?
            .ok_or("更新清单没有提供更高版本")?;
        self.change(generation, |state| {
            state.candidate = Some(Candidate {
                update,
                size,
                bytes: None,
            });
            state.value["status"] = json!("available");
            state.value["message"] = json!("发现应用新版本，可下载并校验签名");
        })
    }

    pub async fn prepare(&self) -> Result<Value, String> {
        let _operation = self
            .operation
            .try_lock()
            .map_err(|_| "已有应用更新操作正在进行")?;
        let (generation, candidate) = {
            let state = self.state.lock().expect("app updater state");
            let candidate = state
                .candidate
                .clone()
                .ok_or("请先检查并选择可用的应用更新")?;
            if candidate.bytes.is_some() {
                return Ok(state.value.clone());
            }
            (state.generation, candidate)
        };
        self.change(generation, |state| {
            state.value["status"] = json!("downloading");
            state.value["progress"] = json!(0);
            state.value["message"] = json!("正在下载应用更新，完成后校验签名");
        })?;
        let result = self.download(generation, &candidate).await;
        match result {
            Ok(bytes) => self.change(generation, |state| {
                state.candidate.as_mut().unwrap().bytes = Some(Arc::new(bytes));
                state.value["status"] = json!("staged");
                state.value["progress"] = json!(100);
                state.value["message"] =
                    json!("应用更新已通过签名校验；请在任务结束后确认退出并安装");
            }),
            Err(error) => {
                let _ = self.change(generation, |state| {
                    state.value["status"] = json!("failed");
                    state.value["progress"] = json!(0);
                    state.value["message"] =
                        json!(format!("应用更新下载或签名校验失败，可重试：{error}"));
                });
                Err(error)
            }
        }
    }

    async fn download(&self, generation: u64, candidate: &Candidate) -> Result<Vec<u8>, String> {
        let mut response = client(true, Duration::from_secs(30 * 60))?
            .get(candidate.update.download_url.clone())
            .send()
            .await
            .map_err(|error| error.to_string())?;
        if !response.status().is_success() {
            return Err(format!("应用更新包 HTTP {}", response.status()));
        }
        if response
            .content_length()
            .is_some_and(|size| size != candidate.size || size > MAX_PACKAGE)
        {
            return Err("应用更新包长度与 GitHub Release 资产不一致".into());
        }
        let mut bytes = Vec::new();
        let mut progress = 0;
        while let Some(chunk) = tokio::time::timeout(Duration::from_secs(60), response.chunk())
            .await
            .map_err(|_| "应用更新下载停滞，请重试")?
            .map_err(|error| error.to_string())?
        {
            if self.state.lock().expect("app updater state").generation != generation {
                return Err("应用更新通道已切换，已取消旧通道下载".into());
            }
            if bytes.len() as u64 + chunk.len() as u64 > candidate.size {
                return Err("应用更新包超出登记的资产大小".into());
            }
            bytes.extend_from_slice(&chunk);
            let percent = ((bytes.len() as u64 * 100) / candidate.size).min(99);
            if percent != progress {
                progress = percent;
                self.change(generation, |state| {
                    state.value["progress"] = json!(percent);
                })?;
            }
        }
        if bytes.len() as u64 != candidate.size {
            return Err("应用更新包下载不完整".into());
        }
        candidate
            .update
            .verify(&bytes)
            .map_err(|error| format!("应用更新签名校验失败：{error}"))?;
        Ok(bytes)
    }

    pub async fn activate(&self, runtime: &Runtime) -> Result<Value, String> {
        let _operation = self
            .operation
            .try_lock()
            .map_err(|_| "已有应用更新操作正在进行")?;
        // Exclude all in-flight UI requests before the final backend gate. The
        // backend gate also excludes its automatic connections/component jobs.
        let _exclusive = runtime.update_gate.write().await;
        let (generation, candidate, bytes) = {
            let state = self.state.lock().expect("app updater state");
            let candidate = state.candidate.clone().ok_or("没有已准备的应用更新")?;
            let bytes = candidate.bytes.clone().ok_or("请先下载并校验应用更新")?;
            (state.generation, candidate, bytes)
        };
        candidate
            .update
            .verify(&bytes)
            .map_err(|error| format!("安装前签名复核失败：{error}"))?;
        let snapshot = runtime.request("app.snapshot".into(), json!({})).await?;
        ensure_idle(&snapshot)?;
        self.change(generation, |state| {
            state.value["message"] = json!("正在等待后台组件操作结束并确认安装状态");
        })?;
        // Bun pauses new work, drains existing component operations and checks
        // native safety again before acquiring the final installation gate.
        if let Err(error) = prepare_backend_installation(|method| {
            runtime.request(method.into(), json!({ "channel": "app" }))
        })
        .await
        {
            self.change(generation, |state| {
                state.value["message"] = json!(format!(
                    "安装准备未完成：{error}；已验证的更新包保留，可重试"
                ));
            })?;
            return Err(error);
        }
        runtime.mark_updating();
        self.change(generation, |state| {
            state.value["status"] = json!("staged");
            state.value["message"] = json!("正在退出本地服务并安装应用更新");
        })?;
        // Windows updater exits the process directly after spawning the
        // installer; RunEvent::Exit is not guaranteed, so shutdown MUST precede it.
        runtime.shutdown().await;
        if let Err(error) = candidate.update.install(bytes.as_ref()) {
            let message = format!("应用更新安装失败，将重启应用恢复本地服务：{error}");
            eprintln!("{message}");
            let _ = self.change(generation, |state| {
                state.value["status"] = json!("failed");
                state.value["message"] = json!(message);
            });
            self.app.restart();
        }
        self.app.restart();
    }

    pub fn rollback(&self) -> Result<Value, String> {
        Err("应用安装不支持在线回滚；可从官方发行页重新安装旧版本，业务数据将保留".into())
    }
}

async fn prepare_backend_installation<Request, Response>(mut request: Request) -> Result<(), String>
where
    Request: FnMut(&'static str) -> Response,
    Response: Future<Output = Result<Value, String>>,
{
    if let Err(error) = request("updates.activate").await {
        // A transport timeout does not cancel the Bun request. Invalidate its
        // preparation token before a late component drain can acquire the gate.
        // Confirmation is bounded even if the service no longer responds.
        let recovery = match tokio::time::timeout(
            Duration::from_secs(10),
            request("updates.rollback"),
        )
        .await
        {
            Ok(Ok(_)) => "已取消安装准备，可以继续使用".into(),
            Ok(Err(cancel_error)) => format!(
                "取消安装准备失败：{cancel_error}；无法确认本地服务已解除暂停，请重启应用后重试"
            ),
            Err(_) => "取消安装准备确认超时；无法确认本地服务已解除暂停，请重启应用后重试".into(),
        };
        return Err(format!("{error}；{recovery}"));
    }
    Ok(())
}

fn ensure_idle(snapshot: &Value) -> Result<(), String> {
    let runs = snapshot
        .get("runs")
        .and_then(Value::as_array)
        .ok_or("无法确认当前执行状态，请稍后重试")?;
    let devices = snapshot
        .get("devices")
        .and_then(Value::as_array)
        .ok_or("无法确认设备状态，请稍后重试")?;
    let tools = snapshot
        .get("toolJobs")
        .and_then(Value::as_array)
        .ok_or("无法确认工具执行状态，请稍后重试")?;
    if runs
        .iter()
        .any(|run| run.get("status").and_then(Value::as_str) == Some("running"))
        || tools
            .iter()
            .any(|job| job.get("status").and_then(Value::as_str) == Some("running"))
        || devices.iter().any(|device| {
            !matches!(
                device.get("state").and_then(Value::as_str),
                Some("idle" | "offline")
            )
        })
    {
        return Err("任务、工具或设备连接仍在进行；请等待空闲后再退出并安装应用更新".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn release(version: &str, prerelease: bool, draft: bool) -> Value {
        json!({ "tag_name": format!("v{version}"), "prerelease": prerelease, "draft": draft,
            "html_url": format!("https://github.com/DeathofBrain/maa-verge/releases/tag/v{version}"),
            "published_at": "2026-10-23T00:00:00Z", "body": "说明", "assets": [] })
    }

    #[test]
    fn channels_choose_highest_semver_without_downgrades() {
        let releases = vec![
            release("0.2.0-beta.2", true, false),
            release("0.1.0", false, false),
            release("0.2.0-beta.10", true, false),
            release("9.0.0", false, true),
            release("0.1.2", false, false),
            release("0.3.0-beta", false, false),
        ];
        assert_eq!(
            select_release(&releases, "stable")
                .unwrap()
                .version
                .to_string(),
            "0.1.2"
        );
        assert_eq!(
            select_release(&releases, "preview")
                .unwrap()
                .version
                .to_string(),
            "0.3.0-beta"
        );
        assert_eq!(
            select_release(&[release("0.1.0", false, false)], "preview")
                .unwrap()
                .version
                .to_string(),
            "0.1.0"
        );
        assert!(!newer(
            &Version::parse("0.1.0+rebuild").unwrap(),
            &Version::parse("0.1.0").unwrap()
        ));
        assert!(!newer(
            &Version::parse("0.1.0").unwrap(),
            &Version::parse("0.2.0-beta.1").unwrap()
        ));
        assert!(newer(
            &Version::parse("0.2.0").unwrap(),
            &Version::parse("0.2.0-beta.1").unwrap()
        ));
        assert!(select_release(&[release("garbage", false, false)], "preview").is_none());
        assert!(select_release(&[release("0.1.0", true, false)], "stable").is_none());
    }

    #[test]
    fn only_official_release_metadata_and_assets_are_trusted() {
        let tag = "v0.2.0";
        let good = "https://github.com/DeathofBrain/maa-verge/releases/download/v0.2.0/Maa.Verge_0.2.0_x64-setup.exe";
        assert!(asset_url(&Url::parse(good).unwrap(), tag));
        for bad in [
            good.replace("https:", "http:"),
            good.replace("github.com", "github.com.evil.test"),
            good.replace("DeathofBrain", "someone"),
            good.replace("v0.2.0/", "v0.1.0/"),
            good.replace("github.com/", "user@github.com/"),
            format!("{good}?redirect=bad"),
            format!("{good}#fragment"),
            good.replace("github.com/", "github.com:444/"),
            good.replace("Maa.Verge_0.2.0_x64-setup.exe", "%2e%2e%2fother.exe"),
            "https://127.0.0.1/private".into(),
        ] {
            assert!(!asset_url(&Url::parse(&bad).unwrap(), tag), "{bad}");
        }
        assert!(asset_redirect(&Url::parse("https://release-assets.githubusercontent.com/github-production-release-asset/1/file?token=signed").unwrap()));
        assert!(!asset_redirect(
            &Url::parse("http://release-assets.githubusercontent.com/file").unwrap()
        ));
        assert!(!asset_redirect(
            &Url::parse("https://release-assets.githubusercontent.com.evil.test/file").unwrap()
        ));
        assert!(!asset_redirect(
            &Url::parse("https://github.com/other/repository/releases/download/v1/file").unwrap()
        ));
        let mut bad = release("0.2.0", false, false);
        bad["html_url"] = json!("https://github.com/other/repository/releases/tag/v0.2.0");
        assert!(select_release(&[bad], "stable").is_none());
    }

    #[test]
    fn installer_targets_keep_windows_installers_separate() {
        assert_eq!(
            platform_target("windows", "x86_64", Some("msi"), false).unwrap(),
            "windows-x86_64-msi"
        );
        assert_eq!(
            platform_target("windows", "x86_64", Some("nsis"), false).unwrap(),
            "windows-x86_64-nsis"
        );
        assert!(platform_target("windows", "x86_64", None, false).is_err());
        assert_eq!(
            platform_target("macos", "aarch64", Some("app"), false).unwrap(),
            "darwin-aarch64"
        );
        assert_eq!(
            platform_target("macos", "x86_64", Some("app"), false).unwrap(),
            "darwin-x86_64"
        );
        assert_eq!(
            platform_target("linux", "x86_64", Some("appimage"), true).unwrap(),
            "linux-x86_64"
        );
        assert!(platform_target("linux", "x86_64", Some("appimage"), false).is_err());
        for bundle in [None, Some("deb"), Some("rpm")] {
            assert!(platform_target("linux", "x86_64", bundle, false).is_err());
        }
        assert!(platform_target("linux", "aarch64", Some("appimage"), true).is_err());
        assert!(platform_target("macos", "aarch64", None, false).is_err());
        assert!(mac_bundle(std::path::Path::new(
            "/Applications/Maa Verge.app/Contents/MacOS/Maa Verge"
        )));
        assert!(!mac_bundle(std::path::Path::new(
            "/project/target/debug/maa-verge"
        )));
    }

    #[test]
    fn manifests_bind_release_version_platform_url_signature_and_size() {
        let mut selected = select_release(&[release("0.2.0", false, false)], "stable").unwrap();
        let url = "https://github.com/DeathofBrain/maa-verge/releases/download/v0.2.0/Maa-Verge_0.2.0_x64-setup.exe";
        selected.assets = vec![
            json!({ "name": "Maa-Verge_0.2.0_x64-setup.exe", "browser_download_url": url, "size": 123 }),
        ];
        let manifest = json!({ "version": "0.2.0", "platforms": { "windows-x86_64-nsis": { "url": url, "signature": "valid-envelope" } } });
        assert_eq!(
            package_metadata(&manifest, &selected, "windows-x86_64-nsis").unwrap(),
            123
        );
        assert!(package_metadata(&manifest, &selected, "windows-x86_64-msi").is_err());
        let mut bad = manifest.clone();
        bad["version"] = json!("0.3.0");
        assert!(package_metadata(&bad, &selected, "windows-x86_64-nsis").is_err());
        bad = manifest.clone();
        bad["platforms"]["windows-x86_64-nsis"]["signature"] = json!("");
        assert!(package_metadata(&bad, &selected, "windows-x86_64-nsis").is_err());
        bad = manifest.clone();
        bad["platforms"]["windows-x86_64-nsis"]["url"] =
            json!(url.replace("Maa-Verge_0.2.0_x64-setup.exe", "unlisted.exe"));
        assert!(package_metadata(&bad, &selected, "windows-x86_64-nsis").is_err());
        selected.assets[0]["size"] = json!(MAX_PACKAGE + 1);
        assert!(package_metadata(&manifest, &selected, "windows-x86_64-nsis").is_err());
    }

    #[test]
    fn a_valid_signature_may_not_switch_installers_or_architectures() {
        let mut selected = select_release(&[release("0.2.0", false, false)], "stable").unwrap();
        let targets = [
            "windows-x86_64-nsis",
            "windows-x86_64-msi",
            "darwin-aarch64",
            "darwin-x86_64",
            "linux-x86_64",
        ];
        for target in targets {
            let filename = package_filename(&selected.version, target).unwrap();
            let url = format!(
                "https://github.com/DeathofBrain/maa-verge/releases/download/v0.2.0/{filename}"
            );
            selected.assets =
                vec![json!({ "name": filename, "browser_download_url": url, "size": 123 })];
            let mut manifest = json!({ "version": "0.2.0", "platforms": {} });
            for mapping in targets {
                manifest["platforms"][mapping] =
                    json!({ "url": url, "signature": "signed-official-package" });
                assert_eq!(
                    package_metadata(&manifest, &selected, mapping).is_ok(),
                    target == mapping,
                    "{target} artifact must not install for {mapping}"
                );
            }
            selected.assets[0]["name"] = json!("mislabeled-asset.exe");
            assert!(package_metadata(&manifest, &selected, target).is_err());
        }
    }

    #[test]
    fn activation_requires_idle_devices_and_executions_but_defers_component_work_to_backend() {
        let idle = json!({ "runs": [], "toolJobs": [], "devices": [{ "state": "idle" }, { "state": "offline" }],
            "updates": [{ "id": "app", "status": "staged" }, { "id": "core", "status": "active" }] });
        assert!(ensure_idle(&idle).is_ok());
        let mut busy = idle.clone();
        busy["runs"] = json!([{ "status": "running", "boundaryWaiting": true }]);
        assert!(ensure_idle(&busy).is_err());
        busy = idle.clone();
        busy["devices"][0]["state"] = json!("running");
        assert!(ensure_idle(&busy).is_err());
        busy = idle.clone();
        busy["toolJobs"] = json!([{ "status": "running" }]);
        assert!(ensure_idle(&busy).is_err());
        for status in ["checking", "downloading", "waiting_idle"] {
            busy = idle.clone();
            busy["updates"][1]["status"] = json!(status);
            assert!(ensure_idle(&busy).is_ok());
        }
        assert!(ensure_idle(&json!({})).is_err());
    }

    #[test]
    fn successful_installation_preparation_preserves_the_backend_gate() {
        tauri::async_runtime::block_on(async {
            let calls = Arc::new(Mutex::new(Vec::new()));
            let result = prepare_backend_installation(|method| {
                calls.lock().unwrap().push(method);
                async { Ok(json!({ "status": "staged" })) }
            })
            .await;
            assert!(result.is_ok());
            assert_eq!(*calls.lock().unwrap(), vec!["updates.activate"]);
        });
    }

    #[test]
    fn timed_out_preparation_is_cancelled_before_a_late_drain_can_acquire_the_gate() {
        tauri::async_runtime::block_on(async {
            #[derive(Default)]
            struct PendingPreparation {
                preparing: bool,
                updating: bool,
                calls: Vec<&'static str>,
            }
            let backend = Arc::new(Mutex::new(PendingPreparation::default()));
            let (finish_drain, drained) = tokio::sync::oneshot::channel::<()>();
            let pending_backend = backend.clone();
            // The server keeps working after the host stops awaiting its reply.
            let late_preparation = tokio::spawn(async move {
                drained.await.unwrap();
                let mut state = pending_backend.lock().unwrap();
                if state.preparing {
                    state.updating = true;
                }
            });
            let result = prepare_backend_installation(|method| {
                let backend = backend.clone();
                async move {
                    let mut state = backend.lock().unwrap();
                    state.calls.push(method);
                    match method {
                        "updates.activate" => {
                            state.preparing = true;
                            Err("本地服务响应超时；操作结果可能未知".into())
                        }
                        "updates.rollback" => {
                            state.preparing = false;
                            state.updating = false;
                            Ok(json!({ "message": "已取消安装准备" }))
                        }
                        _ => panic!("unexpected backend request"),
                    }
                }
            })
            .await;
            let error = result.unwrap_err();
            assert!(error.contains("本地服务响应超时"));
            assert!(error.contains("已取消安装准备，可以继续使用"));
            finish_drain.send(()).unwrap();
            late_preparation.await.unwrap();
            let state = backend.lock().unwrap();
            assert_eq!(state.calls, vec!["updates.activate", "updates.rollback"]);
            assert!(!state.preparing);
            assert!(!state.updating);
        });
    }

    #[test]
    fn failed_preparation_cancellation_preserves_both_errors_without_claiming_recovery() {
        tauri::async_runtime::block_on(async {
            let calls = Arc::new(Mutex::new(Vec::new()));
            let result = prepare_backend_installation(|method| {
                calls.lock().unwrap().push(method);
                async move {
                    Err(if method == "updates.activate" {
                        "原安装准备响应已中断".into()
                    } else {
                        "取消请求连接中断".into()
                    })
                }
            })
            .await;
            let error = result.unwrap_err();
            assert_eq!(
                *calls.lock().unwrap(),
                vec!["updates.activate", "updates.rollback"]
            );
            assert!(error.contains("原安装准备响应已中断"));
            assert!(error.contains("取消请求连接中断"));
            assert!(error.contains("无法确认本地服务已解除暂停，请重启应用后重试"));
            assert!(!error.contains("可以继续使用"));
        });
    }

    #[test]
    fn changing_channel_invalidates_stale_state_without_persisting_an_app_version() {
        let current = Version::parse("0.1.0").unwrap();
        let staged = json!({ "id": "app", "currentVersion": "obsolete-database-value", "latestVersion": "0.2.0-beta.1",
            "status": "staged", "progress": 100, "appRelease": { "url": "old-channel" }, "message": "已准备" });
        let mut state = State {
            channel: "preview".into(),
            automatic: true,
            generation: 7,
            value: staged.clone(),
            candidate: None,
        };
        // Unrelated settings and disabling automatic checks preserve staged UI.
        assert!(!configure_state(
            &mut state,
            &json!({ "appUpdateChannel": "preview", "autoUpdateApp": false }),
            &current,
            true
        ));
        assert_eq!(state.value, staged);
        assert_eq!(state.generation, 7);
        assert!(!state.automatic);
        // Channel changes invalidate a still-running download through generation.
        assert!(configure_state(
            &mut state,
            &json!({ "appUpdateChannel": "stable", "autoUpdateApp": false }),
            &current,
            true
        ));
        assert_eq!(state.generation, 8);
        assert_eq!(state.channel, "stable");
        assert_eq!(state.value["currentVersion"], "0.1.0");
        assert_eq!(state.value["status"], "idle");
        assert_eq!(state.value["latestVersion"], Value::Null);
        assert_eq!(state.value["progress"], 0);
        assert_eq!(state.value["appCanInstall"], true);
        assert!(state.value.get("appRelease").is_none());
        // Re-enabling automatic checks requests a check; repeated saves do not.
        let automatic = json!({ "appUpdateChannel": "stable", "autoUpdateApp": true });
        assert!(configure_state(&mut state, &automatic, &current, true));
        assert!(!configure_state(&mut state, &automatic, &current, true));
        assert_eq!(state.generation, 8);
    }

    #[test]
    fn failed_checks_offer_rechecking_while_retaining_release_explanation() {
        let current = Version::parse("0.1.0").unwrap();
        let information = json!({ "url": "https://github.com/DeathofBrain/maa-verge/releases/tag/v0.2.0", "notes": "等待签名产物" });
        for error in ["应用更新源 HTTP 403", "此发行版缺少签名更新包"] {
            let mut value = initial_value(&current, true);
            value["latestVersion"] = json!("0.2.0");
            value["status"] = json!("checking");
            value["appRelease"] = information.clone();
            value["checkedAt"] = json!("2026-10-23T00:00:00Z");
            let mut state = State {
                channel: "preview".into(),
                automatic: true,
                generation: 4,
                value,
                candidate: None,
            };
            state.fail_check(error);
            assert_eq!(state.value["status"], "failed");
            assert_eq!(state.value["latestVersion"], Value::Null);
            assert_eq!(state.value["currentVersion"], "0.1.0");
            assert_eq!(state.value["appRelease"], information);
            assert_eq!(state.value["checkedAt"], "2026-10-23T00:00:00Z");
            assert_eq!(state.value["message"], error);
            assert_eq!(state.generation, 4);
            assert!(state.candidate.is_none());
        }
    }
}
