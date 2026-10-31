//! Application updates belong to the desktop host; component updates stay in Bun.
//! Verified packages survive restart. Installation always stops owned sidecars
//! first; a failed attempt must never prevent the old application from starting.
mod cache;
#[cfg(any(target_os = "macos", test))]
mod dmg;
mod transport;

use crate::runtime::Runtime;
use cache::Cache;
use reqwest::Url;
use semver::Version;
use serde_json::{json, Value};
use std::cmp::Ordering;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering as AtomicOrdering};
use std::sync::{Arc, Mutex};
use tauri::utils::{config::BundleType, platform::bundle_type};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use tokio::sync::Mutex as AsyncMutex;

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
        ("macos", "x86_64" | "aarch64", Some("app")) => Ok(format!("darwin-{arch}-dmg")),
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
    #[cfg(target_os = "windows")]
    require_windows_installer(&std::env::current_exe().map_err(|error| error.to_string())?)?;
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

#[cfg(any(target_os = "windows", test))]
fn require_windows_installer(executable: &std::path::Path) -> Result<(), String> {
    if executable
        .parent()
        .is_some_and(|directory| directory.join("MaaVerge.portable").is_file())
    {
        return Err("ZIP 便携版请从发行页下载完整 ZIP，退出并备份配置后手动更新".into());
    }
    Ok(())
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
        "darwin-aarch64-dmg" => "aarch64.dmg",
        "darwin-x86_64-dmg" => "x64.dmg",
        "linux-x86_64" => "amd64.AppImage",
        _ => return Err("应用更新清单包含不支持的平台目标".into()),
    };
    Ok(format!("Maa-Verge_{version}_{suffix}"))
}

fn install_candidate(app: &AppHandle, candidate: &Candidate, bytes: &[u8]) -> Result<(), String> {
    // The original installation path is cached by Tauri before a bundle swap.
    // Its restart implementation uses that path through LaunchServices.
    #[cfg(target_os = "macos")]
    {
        if !matches!(
            candidate.update.target.as_str(),
            "darwin-aarch64-dmg" | "darwin-x86_64-dmg"
        ) {
            return Err("macOS 应用更新仅支持签名 DMG 安装包，请重新检查并下载更新".into());
        }
        candidate
            .update
            .verify(bytes)
            .map_err(|error| format!("安装前 DMG 签名复核失败：{error}"))?;
        let executable = tauri::process::current_binary(&app.env())
            .map_err(|error| format!("无法定位应用安装路径：{error}"))?;
        dmg::install(
            &executable,
            &crate::configuration::data_root()?,
            &candidate.update.version,
            &candidate.update.target,
            bytes,
        )
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        candidate
            .update
            .install(bytes)
            .map_err(|error| error.to_string())
    }
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
        .ok_or_else(|| {
            if target == "windows-x86_64-msi"
                && manifest["platforms"].get("windows-x86_64-nsis").is_some()
            {
                "此版本已停止提供 MSI 更新包；请先备份 config 配置与作业文件，关闭并卸载旧 MSI 版，再从官方发行页下载安装 EXE 版".into()
            } else if matches!(target, "darwin-aarch64-dmg" | "darwin-x86_64-dmg") {
                format!("此发行版缺少 macOS 签名 DMG 更新包（{target}）；请从发行页手动安装或等待新版本")
            } else {
                format!("此发行版缺少 {target} 的签名更新包；请等待发行产物完成")
            }
        })?;
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
    metadata: Value,
}

struct State {
    channel: String,
    automatic: bool,
    generation: u64,
    value: Value,
    candidate: Option<Candidate>,
}

impl State {
    fn clear_inactive_download_speed(&mut self) {
        if self.value["status"] != "downloading"
            || self.value["progress"].as_u64().unwrap_or_default() >= 95
        {
            self.value
                .as_object_mut()
                .expect("app updater value")
                .remove("downloadSpeedBytesPerSecond");
        }
    }

    fn fail_check(&mut self, error: &str) {
        self.candidate = None;
        // A failed check cannot supply prepare() with a usable candidate. Clear
        // the version as well so the UI offers another check, not a download.
        self.value["latestVersion"] = Value::Null;
        self.value["status"] = json!("failed");
        self.value["progress"] = json!(0);
        self.value["message"] = json!(error);
        self.clear_inactive_download_speed();
    }
}

pub struct AppUpdater {
    app: AppHandle,
    current: Version,
    can_install: bool,
    state: Mutex<State>,
    operation: AsyncMutex<()>,
    event_id: AtomicU64,
    cache: Result<Cache, String>,
}

fn cache_directory() -> Result<PathBuf, String> {
    Ok(crate::configuration::data_root()?.join("updates/app"))
}

fn installation_id() -> Result<String, String> {
    let directory = crate::runtime::application_directory()?;
    Ok(std::fs::canonicalize(&directory)
        .unwrap_or(directory)
        .to_string_lossy()
        .into_owned())
}

// Revalidate persisted metadata with the same source/platform/version rules as
// online discovery. The plugin then verifies both the bytes and signed version.
fn cached_release(
    record: &Value,
    current: &Version,
    target: &str,
    installation: &str,
) -> Result<Option<Release>, String> {
    if record["formatVersion"] != 1 || record["installation"].as_str() != Some(installation) {
        return Err("更新缓存格式或安装位置已改变，请重新下载".into());
    }
    let channel = record["channel"]
        .as_str()
        .filter(|channel| matches!(*channel, "stable" | "preview"))
        .ok_or("更新缓存的频道无效")?;
    let release =
        select_release(&[record["release"].clone()], channel).ok_or("更新缓存的发行信息无效")?;
    if !newer(&release.version, current) {
        return Ok(None);
    }
    let package_target = record["target"]
        .as_str()
        .filter(|package| *package == target)
        .ok_or("更新缓存的平台或安装状态无效，请重新下载")?;
    if !record["attempted"].is_boolean() {
        return Err("更新缓存的平台或安装状态无效，请重新下载".into());
    }
    package_metadata(&record["manifest"], &release, package_target)?;
    Ok(Some(release))
}

fn restore_signed_update<R: tauri::Runtime>(
    app: &AppHandle<R>,
    target: &str,
    manifest: Value,
    manifest_url: Url,
) -> Result<Update, String> {
    // build() requires a nonempty endpoint list even for offline restoration.
    // This URL supplies runtime context; restore_update never requests it.
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    app.updater_builder()
        .target(target)
        .endpoints(vec![manifest_url])
        .map_err(|error| error.to_string())?
        .version_comparator(|current, remote| newer(&remote.version, &current))
        .build()
        .map_err(|error| error.to_string())?
        .restore_update(manifest)
        .map_err(|error| format!("签名更新清单无效：{error}"))?
        .ok_or_else(|| "更新清单没有提供更高版本".into())
}

fn initial_value(version: &Version, can_install: bool) -> Value {
    json!({ "id": "app", "currentVersion": version.to_string(), "latestVersion": null,
        "status": "idle", "progress": 0, "message": "尚未检查应用更新", "appCanInstall": can_install,
        "appInstallOnStartup": false })
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
        #[cfg(target_os = "macos")]
        if can_install {
            let cleanup = tauri::process::current_binary(&app.env())
                .map_err(|error| error.to_string())
                .and_then(|executable| dmg::cleanup_previous(&executable, &current));
            if let Err(error) = cleanup {
                eprintln!("旧应用包清理未完成，已继续启动：{error}");
            }
        }
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
            cache: cache_directory().map(Cache::new),
        }
    }

    fn cache(&self) -> Result<&Cache, String> {
        self.cache.as_ref().map_err(Clone::clone)
    }

    fn restore_cached(&self) -> Result<bool, String> {
        // Debug builds never install or consume release packages.
        if !self.can_install {
            return Ok(false);
        }
        let Some((record, bytes)) = self.cache()?.load()? else {
            return Ok(false);
        };
        let target = host_target(&self.app)?;
        let Some(release) = cached_release(&record, &self.current, &target, &installation_id()?)?
        else {
            self.cache()?.discard()?;
            return Ok(false);
        };
        let package_target = record["target"].as_str().unwrap();
        let size = package_metadata(&record["manifest"], &release, package_target)?;
        if bytes.len() as u64 != size {
            return Err("更新缓存包大小不符，请重新下载".into());
        }
        let manifest_url = Url::parse(&format!(
            "https://github.com{REPOSITORY_PATH}download/{}/latest.json",
            release.tag
        ))
        .map_err(|error| error.to_string())?;
        let update = restore_signed_update(
            &self.app,
            package_target,
            record["manifest"].clone(),
            manifest_url,
        )?;
        update
            .verify(&bytes)
            .map_err(|error| format!("更新缓存签名校验失败：{error}"))?;
        let attempted = record["attempted"] == true;
        let mut state = self.state.lock().expect("app updater state");
        state.channel = record["channel"].as_str().unwrap().into();
        state.value["latestVersion"] = json!(release.version.to_string());
        state.value["appRelease"] = release.information;
        state.value["status"] = json!("staged");
        state.value["progress"] = json!(100);
        if let Some(source) = record
            .get("downloadSource")
            .filter(|source| matches!(source.as_str(), Some("MirrorChyan" | "GitHub")))
        {
            state.value["downloadSource"] = source.clone();
        }
        state.value["appInstallOnStartup"] = json!(!attempted);
        state.value["message"] = json!(if attempted {
            "上次应用更新未完成；已正常启动，更新包保留，可点击安装重试"
        } else {
            "已恢复下载并验证的更新包，正在安装"
        });
        state.candidate = Some(Candidate {
            update,
            size,
            bytes: Some(Arc::new(bytes)),
            metadata: record,
        });
        Ok(!attempted)
    }

    /// Called synchronously in setup, before starting the service or scheduler.
    /// Recoverable cache/installation failures always allow the old app to open.
    pub fn resume_on_startup(&self) {
        let restored = self.restore_cached();
        let result = match restored {
            Ok(true) => {
                let candidate = self
                    .state
                    .lock()
                    .expect("app updater state")
                    .candidate
                    .clone()
                    .unwrap();
                // Persist before invoking an installer that can exit this process.
                self.cache()
                    .and_then(|cache| cache.mark_attempted())
                    .and_then(|()| {
                        install_candidate(
                            &self.app,
                            &candidate,
                            candidate.bytes.as_ref().unwrap().as_ref(),
                        )
                    })
                    .map(|()| self.app.restart())
            }
            Ok(false) => return,
            Err(error) => {
                // Invalid/missing/tampered bytes must not keep breaking startup.
                if let Ok(cache) = self.cache() {
                    let _ = cache.discard();
                }
                Err(error)
            }
        };
        if let Err(error) = result {
            eprintln!("启动安装应用更新未完成：{error}");
            let mut state = self.state.lock().expect("app updater state");
            state.value["appInstallOnStartup"] = json!(false);
            state.value["status"] = json!(if state.candidate.is_some() {
                "staged"
            } else {
                "failed"
            });
            state.value["message"] = json!(format!(
                "应用更新未完成，已继续启动；可在更新页面重试：{error}"
            ));
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
            state.clear_inactive_download_speed();
            state.value.clone()
        };
        self.emit(value.clone());
        Ok(value)
    }

    /// Settings remain owned and persisted by the backend. Changing the channel
    /// invalidates every old candidate, including an in-flight download.
    pub fn configure(&self, settings: &Value) -> bool {
        let mut state = self.state.lock().expect("app updater state");
        let generation = state.generation;
        let check = configure_state(&mut state, settings, &self.current, self.can_install);
        if state.generation != generation {
            if let Err(error) = self.cache().and_then(|cache| cache.discard()) {
                eprintln!("无法清除旧频道的应用更新缓存：{error}");
            }
        }
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
            state
                .value
                .as_object_mut()
                .unwrap()
                .remove("downloadSource");
        })?;
        let result = self.find_candidate(generation, &channel).await;
        if let Err(error) = &result {
            let _ = self.change(generation, |state| state.fail_check(error));
        }
        result
    }

    async fn find_candidate(&self, generation: u64, channel: &str) -> Result<Value, String> {
        let release = self.latest_release(generation, channel).await?;
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
        let manifest = self
            .host_request(
                generation,
                json!({ "operation": "manifest", "tag": release.tag }),
            )
            .await?;
        let size = package_metadata(&manifest, &release, &target)?;
        // restore_update applies the plugin's target/semver logic and requires
        // signatures that bind this exact version. HTTP parsing stays bounded.
        let update = restore_signed_update(&self.app, &target, manifest.clone(), manifest_url)?;
        let record = json!({ "formatVersion": 1, "installation": installation_id()?, "channel": channel,
            "target": update.target, "manifest": manifest,
            "release": { "draft": false, "tag_name": release.tag, "prerelease": release.information["prerelease"],
                "html_url": release.information["url"], "body": release.information["notes"],
                "published_at": release.information["publishedAt"], "assets": release.assets } });
        self.change(generation, |state| {
            state.candidate = Some(Candidate {
                update,
                size,
                bytes: None,
                metadata: record,
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
            let mut state = self.state.lock().expect("app updater state");
            let candidate = state
                .candidate
                .clone()
                .ok_or("请先检查并选择可用的应用更新")?;
            if candidate.bytes.is_some() {
                self.cache()?
                    .schedule()
                    .map_err(|error| format!("无法安排下次启动更新：{error}"))?;
                state.value["status"] = json!("staged");
                state.value["appInstallOnStartup"] = json!(true);
                state.value["message"] = json!("更新包已保存，下次启动时将自动安装");
                let value = state.value.clone();
                drop(state);
                self.emit(value.clone());
                return Ok(value);
            }
            (state.generation, candidate)
        };
        self.change(generation, |state| {
            state.value["status"] = json!("downloading");
            state.value["progress"] = json!(0);
            state.value["message"] = json!("正在下载应用更新，完成后校验签名");
            state
                .value
                .as_object_mut()
                .unwrap()
                .remove("downloadSource");
        })?;
        let result = self
            .download(generation, &candidate)
            .await
            .and_then(|bytes| {
                // Serialize commit with channel invalidation. A channel change must
                // never leave an old in-flight download scheduled for next startup.
                let mut state = self.state.lock().expect("app updater state");
                if state.generation != generation {
                    return Err("应用更新通道已切换，请重新检查".into());
                }
                let mut metadata = candidate.metadata.clone();
                if let Some(source) = state
                    .value
                    .get("downloadSource")
                    .filter(|source| matches!(source.as_str(), Some("MirrorChyan" | "GitHub")))
                {
                    metadata["downloadSource"] = source.clone();
                }
                self.cache()?
                    .stage(&metadata, &bytes)
                    .map_err(|error| format!("无法保存应用更新包：{error}"))?;
                state.candidate.as_mut().unwrap().metadata = metadata;
                Ok(bytes)
            });
        match result {
            Ok(bytes) => self.change(generation, |state| {
                state.candidate.as_mut().unwrap().bytes = Some(Arc::new(bytes));
                state.value["status"] = json!("staged");
                state.value["progress"] = json!(100);
                state.value["appInstallOnStartup"] = json!(true);
                state.value["message"] =
                    json!("应用更新已验证并保存；可立即安装，也会在下次启动时自动安装");
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
        let bytes = self.download_package(generation, candidate).await?;
        self.transport_current(generation)?;
        self.change(generation, |state| {
            state.value["progress"] = json!(95);
            state.value["message"] = json!("应用更新包已下载，正在校验签名");
        })?;
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
        // Do not wait for a read gate held by a half-hour component download.
        // Explicit installation confirms stopping current work. EOF cancels
        // downloads and closes storage/workers; shutdown has a forced deadline.
        let lifecycle = self.app.state::<crate::DesktopLifecycle>();
        if lifecycle.exiting() {
            self.cache()?.schedule()?;
            return Err("应用正在退出，更新包已保留，将在下次启动时安装".into());
        }
        self.change(generation, |state| {
            state.value["status"] = json!("staged");
            state.value["message"] = json!("正在退出本地服务并安装应用更新");
        })?;
        self.cache()?
            .mark_attempted()
            .map_err(|error| format!("无法记录应用更新安装状态：{error}"))?;
        self.change(generation, |state| {
            state.value["appInstallOnStartup"] = json!(false);
        })?;
        if !lifecycle.begin_exit() {
            // A normal window/tray exit won the race before shutdown began.
            // No installer was called, so keep the next launch scheduled.
            self.cache()?.schedule()?;
            return Err("应用正在退出，更新包已保留，将在下次启动时安装".into());
        }
        // From here every failure must restore by restarting; no fallible UI
        // state transition may strand the runtime in its updating phase.
        runtime.mark_updating();
        // Windows updater exits the process directly after spawning the
        // installer; RunEvent::Exit is not guaranteed, so shutdown MUST precede it.
        if let Err(error) = runtime.shutdown_for_update().await {
            eprintln!("更新前本地服务关闭失败，将重启恢复：{error}");
            self.app.restart();
        }
        let app = self.app.clone();
        let installation = tauri::async_runtime::spawn_blocking(move || {
            install_candidate(&app, &candidate, bytes.as_ref())
        })
        .await;
        if let Err(error) = installation
            .map_err(|error| error.to_string())
            .and_then(|result| result.map_err(|error| error.to_string()))
        {
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
            "darwin-aarch64-dmg"
        );
        assert_eq!(
            platform_target("macos", "x86_64", Some("app"), false).unwrap(),
            "darwin-x86_64-dmg"
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
    fn portable_marker_prevents_using_an_installer_update() {
        let directory = std::env::temp_dir().join(format!(
            "maa-verge-portable-test-{}-{}",
            std::process::id(),
            OffsetDateTime::now_utc().unix_timestamp_nanos()
        ));
        std::fs::create_dir(&directory).unwrap();
        let executable = directory.join("maa-verge.exe");
        let marker = directory.join("MaaVerge.portable");
        assert!(require_windows_installer(&executable).is_ok());

        std::fs::write(&marker, "0.1.3-alpha1\n").unwrap();
        assert_eq!(
            require_windows_installer(&executable).unwrap_err(),
            "ZIP 便携版请从发行页下载完整 ZIP，退出并备份配置后手动更新"
        );
        assert!(require_windows_installer(&directory.join("other/maa-verge.exe")).is_ok());

        std::fs::remove_file(&marker).unwrap();
        std::fs::create_dir(&marker).unwrap();
        assert!(require_windows_installer(&executable).is_ok());
        std::fs::remove_dir_all(directory).unwrap();
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
        let migration = package_metadata(&manifest, &selected, "windows-x86_64-msi").unwrap_err();
        assert!(migration.contains("停止提供 MSI"));
        assert!(migration.contains("备份 config"));
        assert!(migration.contains("卸载旧 MSI"));
        assert!(migration.contains("EXE 版"));
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
            "darwin-aarch64-dmg",
            "darwin-x86_64-dmg",
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
    fn macos_requires_signed_dmg_and_rejects_archive_only_releases_and_cached_archives() {
        let current = Version::parse("0.1.0").unwrap();
        for host in ["darwin-aarch64", "darwin-x86_64"] {
            let dmg_target = format!("{host}-dmg");
            let version = Version::parse("0.2.0").unwrap();
            assert!(package_filename(&version, host).is_err());
            let architecture = if host == "darwin-aarch64" {
                "aarch64"
            } else {
                "x64"
            };
            let archive_name = format!("Maa-Verge_0.2.0_{architecture}.app.tar.gz");
            let archive_url = format!(
                "https://github.com/DeathofBrain/maa-verge/releases/download/v0.2.0/{archive_name}"
            );
            let mut manifest = json!({"version": "0.2.0", "platforms": {
                host: {"url": archive_url, "signature": "signed-legacy-archive"}
            }});
            let mut selected = release("0.2.0", false, false);
            selected["assets"] =
                json!([{"name": archive_name, "browser_download_url": archive_url, "size": 123}]);
            let release = select_release(&[selected.clone()], "stable").unwrap();
            let missing = package_metadata(&manifest, &release, &dmg_target).unwrap_err();
            assert!(missing.contains("缺少 macOS 签名 DMG"));
            assert!(package_metadata(&manifest, &release, host).is_err());

            let name = package_filename(&version, &dmg_target).unwrap();
            let url = format!(
                "https://github.com/DeathofBrain/maa-verge/releases/download/v0.2.0/{name}"
            );
            selected["assets"]
                .as_array_mut()
                .unwrap()
                .push(json!({"name": name, "browser_download_url": url, "size": 123}));
            manifest["platforms"][&dmg_target] =
                json!({"url": url, "signature": "signed-version-and-bytes"});
            for target in [host, &dmg_target] {
                let record = json!({"formatVersion": 1, "installation": "installation-A", "channel": "stable", "target": target,
                    "attempted": false, "release": selected, "manifest": manifest});
                let cached = cached_release(&record, &current, &dmg_target, "installation-A");
                if target == dmg_target {
                    assert!(cached.unwrap().is_some());
                } else {
                    assert!(cached.is_err());
                }
                let wrong_host = if host == "darwin-aarch64" {
                    "darwin-x86_64-dmg"
                } else {
                    "darwin-aarch64-dmg"
                };
                assert!(cached_release(&record, &current, wrong_host, "installation-A").is_err());
                assert!(
                    cached_release(&record, &current, "windows-x86_64-nsis", "installation-A")
                        .is_err()
                );
            }
            manifest["platforms"][&dmg_target]["signature"] = json!("");
            let release = select_release(&[selected], "stable").unwrap();
            assert!(package_metadata(&manifest, &release, &dmg_target).is_err());
        }
    }

    #[test]
    fn persisted_manifest_restores_with_the_real_plugin_and_checks_signed_bytes_offline() {
        // Public throwaway test vectors from tauri-plugin-updater's offline tests:
        // payload "test", with signed version 2.0.0. No installer is invoked.
        let mut context = tauri::test::mock_context(tauri::test::noop_assets());
        context.config_mut().plugins.0.insert(
            "updater".into(),
            json!({ "pubkey": "overridden-by-test-key" }),
        );
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_updater::Builder::new().pubkey("dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEE0OUVGNDc0NkZBNkU2RDcKUldUWDVxWnZkUFNlcERHV2cyYno4bjZBclFuQk13Z1FLMWdlVm9zb3JjYkx6Y3VuRCtLSitjWWU=").build())
            .build(context)
            .unwrap();
        let manifest = json!({ "version": "2.0.0", "platforms": { "test-target": {
            "url": "https://github.com/DeathofBrain/maa-verge/releases/download/v2.0.0/test.bin",
            "signature": "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVUWDVxWnZkUFNlcFBGMnpzanZQL0wvVFF0QkxSbldSdmFxKzRvbUsxVUV1Z3RRcC9VU3JHaUkxdjc2MnNEeTNpZDNhb3I3YlJDOUVUeWVvdDZsTUhIcldvWjVoalVNMVFjPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzkxNjQ5MDUxCWZpbGU6cGF5bG9hZAl2ZXJzaW9uOjIuMC4wCkREcTJDTE9FbDVjUW1DMmVKUkhsblpQVlZpT1pzdTFDanBQS1FvZWk0QS9YQmZrRHFHTzBCK1FNcmNySGdFUTVxVjNtbmU3NXRkRldoSnBxVVhoOUFBPT0="
        } } });
        let endpoint = Url::parse(
            "https://github.com/DeathofBrain/maa-verge/releases/download/v2.0.0/latest.json",
        )
        .unwrap();
        let restored = restore_signed_update(
            app.handle(),
            "test-target",
            manifest.clone(),
            endpoint.clone(),
        )
        .unwrap();
        assert_eq!(restored.version, "2.0.0");
        assert_eq!(restored.raw_json, manifest);
        restored.verify(b"test").unwrap();
        assert!(restored.verify(b"tampered").is_err());
        for target in ["darwin-aarch64-dmg", "darwin-x86_64-dmg"] {
            let mut dmg_manifest = manifest.clone();
            dmg_manifest["platforms"] = json!({target: manifest["platforms"]["test-target"]});
            let restored =
                restore_signed_update(app.handle(), target, dmg_manifest, endpoint.clone())
                    .unwrap();
            assert_eq!(restored.target, target);
            restored.verify(b"test").unwrap();
            assert!(restored.verify(b"tampered").is_err());
        }
        let mut wrong_version = manifest.clone();
        wrong_version["version"] = json!("9.0.0");
        assert!(restore_signed_update(
            app.handle(),
            "test-target",
            wrong_version,
            endpoint.clone()
        )
        .unwrap()
        .verify(b"test")
        .is_err());
        assert!(restore_signed_update(app.handle(), "other-target", manifest, endpoint).is_err());
    }

    #[test]
    fn persisted_packages_recheck_source_target_version_and_install_location_offline() {
        let current = Version::parse("0.1.0").unwrap();
        let target = "windows-x86_64-nsis";
        let filename = "Maa-Verge_0.2.0_x64-setup.exe";
        let url = format!(
            "https://github.com/DeathofBrain/maa-verge/releases/download/v0.2.0/{filename}"
        );
        let mut selected = release("0.2.0", false, false);
        selected["assets"] =
            json!([{ "name": filename, "browser_download_url": url, "size": 123 }]);
        let record = json!({ "formatVersion": 1, "installation": "installation-A", "channel": "stable",
            "target": target, "attempted": false, "release": selected,
            "manifest": { "version": "0.2.0", "platforms": { target: { "url": url, "signature": "signed-version-and-bytes" } } } });
        assert!(cached_release(&record, &current, target, "installation-A")
            .unwrap()
            .is_some());
        assert!(cached_release(&record, &current, target, "installation-B").is_err());
        assert!(cached_release(&record, &current, "windows-x86_64-msi", "installation-A").is_err());
        for version in ["0.2.0", "0.3.0"] {
            assert!(cached_release(
                &record,
                &Version::parse(version).unwrap(),
                target,
                "installation-A"
            )
            .unwrap()
            .is_none());
        }
        let mut attempted = record.clone();
        attempted["attempted"] = json!(true);
        assert!(
            cached_release(&attempted, &current, target, "installation-A")
                .unwrap()
                .is_some()
        );
        for replacement in [
            json!({"formatVersion": 2}),
            json!({"channel": "arbitrary"}),
            json!({"attempted": "false"}),
            json!({"manifest": {"version": "9.0.0"}}),
        ] {
            let mut invalid = record.clone();
            for (key, value) in replacement.as_object().unwrap() {
                invalid[key] = value.clone();
            }
            assert!(cached_release(&invalid, &current, target, "installation-A").is_err());
        }
        let mut invalid = record;
        invalid["release"]["html_url"] =
            json!("https://github.com/other/project/releases/tag/v0.2.0");
        assert!(cached_release(&invalid, &current, target, "installation-A").is_err());
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
