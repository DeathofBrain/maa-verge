//! The launcher selector is separate from business data, so it remains findable
//! after choosing a different data root. A process keeps its startup root.
use serde_json::{json, Value};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri_plugin_opener::OpenerExt;

const SELECTOR_FILE: &str = "config-location.json";
const SELECTOR_MAX_BYTES: usize = 16_384;
static STARTUP: OnceLock<Result<StartupConfiguration, String>> = OnceLock::new();
static SELECTOR_WRITE: Mutex<()> = Mutex::new(());

#[derive(Clone, Debug)]
struct StartupConfiguration {
    application_directory: PathBuf,
    directory: PathBuf,
    source: &'static str,
}

#[derive(Default)]
struct Selector {
    directory: Option<PathBuf>,
    pending_wake_cleanup: Vec<PathBuf>,
}

fn read_selector(application_directory: &Path) -> Result<Selector, String> {
    let file = application_directory.join(SELECTOR_FILE);
    let metadata = match fs::metadata(&file) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(Selector::default())
        }
        Err(error) => return Err(format!("无法读取配置目录设置 {}：{error}", file.display())),
    };
    if metadata.len() > SELECTOR_MAX_BYTES as u64 {
        return Err(format!("配置目录设置过大：{}", file.display()));
    }
    let value: Value = serde_json::from_slice(
        &fs::read(&file).map_err(|error| format!("无法读取 {}：{error}", file.display()))?,
    )
    .map_err(|error| format!("配置目录设置损坏 {}：{error}", file.display()))?;
    if value["version"] != 1 {
        return Err(format!("不支持的配置目录设置版本：{}", file.display()));
    }
    let directory = value["directory"]
        .as_str()
        .ok_or_else(|| format!("配置目录设置缺少 directory：{}", file.display()))?;
    let pending_wake_cleanup = match value.get("pendingWakeCleanup") {
        None => Vec::new(),
        Some(Value::Array(roots)) if roots.len() <= 64 => roots
            .iter()
            .map(|root| {
                normalize_saved_directory(root.as_str().ok_or("旧定时配置目录必须是字符串")?)?
                    .ok_or_else(|| "旧定时配置目录不能为空".to_string())
            })
            .collect::<Result<Vec<_>, String>>()?,
        _ => return Err("旧定时配置目录列表无效".into()),
    };
    Ok(Selector {
        directory: normalize_saved_directory(directory)?,
        pending_wake_cleanup,
    })
}

fn selector_directory(application_directory: &Path) -> Result<Option<PathBuf>, String> {
    Ok(read_selector(application_directory)?.directory)
}

fn same_directory(first: &Path, second: &Path) -> bool {
    fs::canonicalize(first).unwrap_or_else(|_| first.to_path_buf())
        == fs::canonicalize(second).unwrap_or_else(|_| second.to_path_buf())
}

fn normalize_saved_directory(value: &str) -> Result<Option<PathBuf>, String> {
    if value.len() > 4096 || value.chars().any(char::is_control) {
        return Err("配置目录包含无效字符或路径过长".into());
    }
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    let directory = PathBuf::from(value);
    if !directory.is_absolute() {
        return Err("配置目录必须使用完整的绝对路径".into());
    }
    Ok(Some(directory))
}

pub(crate) fn application_directory_for(
    executable: &Path,
    platform: &str,
    appimage: Option<&Path>,
) -> Result<PathBuf, String> {
    let executable = if platform == "linux" {
        appimage
            .filter(|path| path.is_absolute())
            .unwrap_or(executable)
    } else {
        executable
    };
    let directory = executable.parent().ok_or("无法定位应用程序目录")?;
    if platform == "macos" && directory.file_name().is_some_and(|name| name == "MacOS") {
        if let Some(bundle) = directory.parent().and_then(|contents| contents.parent()) {
            if bundle
                .extension()
                .is_some_and(|extension| extension == "app")
            {
                return bundle
                    .parent()
                    .map(PathBuf::from)
                    .ok_or("无法定位应用程序目录".into());
            }
        }
    }
    Ok(directory.to_path_buf())
}

fn resolve_configuration(
    application_directory: PathBuf,
    scheduled: Option<PathBuf>,
    environment: Option<PathBuf>,
) -> Result<StartupConfiguration, String> {
    // A task registered before a directory switch must not reopen the old data.
    // Unrelated explicit roots retain their normal precedence, including when
    // the selector is corrupt and the operator supplies a recovery override.
    let scheduled = scheduled.filter(|root| {
        read_selector(&application_directory).map_or(true, |selector| {
            let target = selector
                .directory
                .unwrap_or_else(|| application_directory.join("config"));
            same_directory(root, &target)
                || !selector
                    .pending_wake_cleanup
                    .iter()
                    .any(|old| same_directory(root, old))
        })
    });
    let (directory, source) = if let Some(directory) = scheduled {
        if !directory.is_absolute() {
            return Err("定时启动的配置目录必须使用完整的绝对路径".into());
        }
        (directory, "schedule")
    } else if let Some(directory) = environment {
        (directory, "environment")
    } else if let Some(directory) = selector_directory(&application_directory)? {
        (directory, "saved")
    } else {
        (application_directory.join("config"), "default")
    };
    let directory = if directory.is_absolute() {
        directory
    } else {
        std::env::current_dir()
            .map_err(|error| error.to_string())?
            .join(directory)
    };
    Ok(StartupConfiguration {
        application_directory,
        directory: fs::canonicalize(&directory).unwrap_or(directory),
        source,
    })
}

fn startup() -> Result<&'static StartupConfiguration, String> {
    STARTUP
        .get_or_init(|| {
            let application_directory = if cfg!(debug_assertions) {
                // The backend's development default is the checkout/config.
                std::env::var_os("MAAVERGE_APP_DIR")
                    .filter(|value| !value.is_empty())
                    .map(PathBuf::from)
                    .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.."))
            } else {
                crate::runtime::application_directory()?
            };
            let application_directory =
                fs::canonicalize(&application_directory).unwrap_or(application_directory);
            let arguments: Vec<String> = std::env::args().collect();
            let scheduled = arguments
                .iter()
                .position(|value| value == "--schedule-data-root")
                .map(|index| {
                    arguments
                        .get(index + 1)
                        .map(PathBuf::from)
                        .ok_or_else(|| "定时启动缺少配置目录".to_string())
                })
                .transpose()?;
            let environment = std::env::var_os("MAAVERGE_DATA_DIR")
                .filter(|value| !value.is_empty())
                .map(PathBuf::from)
                .map(|directory| {
                    if directory.starts_with("~") {
                        if let Some(user_directory) =
                            std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
                        {
                            return PathBuf::from(user_directory)
                                .join(directory.strip_prefix("~").unwrap_or(&directory));
                        }
                    }
                    directory
                });
            resolve_configuration(application_directory, scheduled, environment)
        })
        .as_ref()
        .map_err(Clone::clone)
}

pub fn data_root() -> Result<PathBuf, String> {
    Ok(startup()?.directory.clone())
}

pub fn should_pin_data_root() -> Result<bool, String> {
    Ok(startup()?.source != "default")
}

fn locations(configuration: &StartupConfiguration) -> Result<Value, String> {
    let default_directory = configuration.application_directory.join("config");
    let overridden = matches!(configuration.source, "environment" | "schedule");
    let saved = if overridden {
        selector_directory(&configuration.application_directory)
            .ok()
            .flatten()
    } else {
        selector_directory(&configuration.application_directory)?
    };
    let next_directory = saved.as_ref().unwrap_or(&default_directory);
    let effective_next = if overridden {
        &configuration.directory
    } else {
        next_directory
    };
    let current_directory = &configuration.directory;
    let canonical_next = fs::canonicalize(effective_next).unwrap_or(effective_next.clone());
    // Keep canonical roots for identity checks; expose shell-compatible paths
    // where removing Windows' verbatim prefix preserves the path's meaning.
    Ok(json!({
        "directory": dunce::simplified(current_directory),
        "database": dunce::simplified(&current_directory.join("native/maaverge.sqlite3")),
        "defaultDirectory": dunce::simplified(&default_directory),
        "configuredDirectory": saved.as_deref().map(dunce::simplified),
        "nextDirectory": dunce::simplified(effective_next),
        "selectorFile": dunce::simplified(&configuration.application_directory.join(SELECTOR_FILE)),
        "overridden": overridden,
        "source": configuration.source,
        "restartRequired": canonical_next != *current_directory,
    }))
}

#[tauri::command]
pub fn get_configuration_locations() -> Result<Value, String> {
    locations(startup()?)
}

fn unique_suffix() -> String {
    format!(
        "{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    )
}

fn verify_directory(directory: &Path) -> Result<(), String> {
    fs::create_dir_all(directory)
        .map_err(|error| format!("无法创建配置目录 {}：{error}", directory.display()))?;
    let probe = directory.join(format!(".maaverge-write-{}.tmp", unique_suffix()));
    let file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&probe)
        .map_err(|error| format!("配置目录不可写 {}：{error}", directory.display()))?;
    let result = file.sync_all();
    drop(file);
    let _ = fs::remove_file(&probe);
    result.map_err(|error| format!("配置目录不可写 {}：{error}", directory.display()))
}

#[cfg(test)]
fn write_selector(application_directory: &Path, directory: Option<&Path>) -> Result<(), String> {
    write_selector_with_cleanup(application_directory, directory, &[])
}

fn write_selector_with_cleanup(
    application_directory: &Path,
    directory: Option<&Path>,
    pending_wake_cleanup: &[PathBuf],
) -> Result<(), String> {
    let selector = application_directory.join(SELECTOR_FILE);
    let bytes = serde_json::to_vec_pretty(&json!({
        "version": 1,
        "directory": directory.map(|path| path.to_string_lossy()).unwrap_or_default(),
        "pendingWakeCleanup": pending_wake_cleanup,
    }))
    .map_err(|error| format!("无法序列化配置目录设置：{error}"))?;
    // Include the final newline in the same bound enforced by the reader.
    if bytes.len() >= SELECTOR_MAX_BYTES {
        return Err("配置目录设置过大，请重启应用完成旧定时目录清理后重试".into());
    }
    let temporary = application_directory.join(format!(".{SELECTOR_FILE}-{}.tmp", unique_suffix()));
    let mut created = false;
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        created = true;
        file.write_all(&bytes)?;
        file.write_all(b"\n")?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temporary, &selector)?;
        #[cfg(unix)]
        fs::File::open(application_directory)?.sync_all()?;
        Ok::<(), std::io::Error>(())
    })();
    if created && result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result.map_err(|error| format!("无法保存配置目录设置 {}：{error}", selector.display()))
}

#[tauri::command]
pub fn save_configuration_directory(directory: String) -> Result<Value, String> {
    save_directory(startup()?, &directory, cfg!(windows))
}

fn save_directory(
    configuration: &StartupConfiguration,
    directory: &str,
    track_wake: bool,
) -> Result<Value, String> {
    let _write = SELECTOR_WRITE.lock().map_err(|_| "配置目录设置锁不可用")?;
    if matches!(configuration.source, "environment" | "schedule") {
        return Err("当前配置目录由环境变量或启动参数指定，请先移除该覆盖后再修改".into());
    }
    let directory = normalize_saved_directory(directory)?;
    let target = directory
        .as_deref()
        .map(PathBuf::from)
        .unwrap_or_else(|| configuration.application_directory.join("config"));
    verify_directory(&target)?;
    let mut pending = read_selector(&configuration.application_directory)?.pending_wake_cleanup;
    if track_wake
        && !same_directory(&configuration.directory, &target)
        && !pending
            .iter()
            .any(|root| same_directory(root, &configuration.directory))
    {
        pending.push(configuration.directory.clone());
    }
    pending.retain(|root| !same_directory(root, &target));
    if pending.len() > 64 {
        return Err("待清理的旧定时目录过多，请重启应用完成清理后重试".into());
    }
    write_selector_with_cleanup(
        &configuration.application_directory,
        directory.as_deref(),
        &pending,
    )?;
    locations(configuration)
}

#[cfg(any(windows, test))]
fn pending_cleanup(configuration: &StartupConfiguration) -> Result<Vec<PathBuf>, String> {
    if matches!(configuration.source, "environment" | "schedule") {
        return Ok(Vec::new());
    }
    let selector = read_selector(&configuration.application_directory)?;
    let target = selector
        .directory
        .unwrap_or_else(|| configuration.application_directory.join("config"));
    if !same_directory(&configuration.directory, &target) {
        return Ok(Vec::new());
    }
    Ok(selector
        .pending_wake_cleanup
        .into_iter()
        .filter(|root| !same_directory(root, &target))
        .collect())
}

#[cfg(windows)]
pub fn pending_wake_cleanup() -> Result<Vec<PathBuf>, String> {
    pending_cleanup(startup()?)
}

#[cfg(any(windows, test))]
fn complete_cleanup(configuration: &StartupConfiguration, root: &Path) -> Result<(), String> {
    let _write = SELECTOR_WRITE.lock().map_err(|_| "配置目录设置锁不可用")?;
    let mut selector = read_selector(&configuration.application_directory)?;
    selector
        .pending_wake_cleanup
        .retain(|old| !same_directory(root, old));
    write_selector_with_cleanup(
        &configuration.application_directory,
        selector.directory.as_deref(),
        &selector.pending_wake_cleanup,
    )
}

#[cfg(windows)]
pub fn complete_wake_cleanup(root: &Path) -> Result<(), String> {
    complete_cleanup(startup()?, root)
}

#[tauri::command]
pub async fn open_configuration_directory(app: tauri::AppHandle) -> Result<(), String> {
    let directory = data_root()?;
    if !directory.is_dir() {
        return Err("当前配置目录不存在".into());
    }
    // The frontend supplies no path, executable or opener name.
    tauri::async_runtime::spawn_blocking(move || {
        app.opener()
            .open_path(directory.to_string_lossy(), None::<&str>)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!("maaverge-config-{}", unique_suffix()));
            fs::create_dir_all(&root).unwrap();
            Self(fs::canonicalize(root).unwrap())
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn default_and_saved_roots_survive_restart_without_moving_data() {
        let fixture = Fixture::new();
        let initial = resolve_configuration(fixture.0.clone(), None, None).unwrap();
        assert_eq!(initial.directory, fixture.0.join("config"));
        fs::create_dir_all(initial.directory.join("native")).unwrap();
        fs::write(
            initial.directory.join("native/maaverge.sqlite3"),
            b"original",
        )
        .unwrap();
        let target = fixture.0.join("other");
        verify_directory(&target).unwrap();
        write_selector(&fixture.0, Some(&target)).unwrap();
        assert!(locations(&initial).unwrap()["restartRequired"]
            .as_bool()
            .unwrap());
        assert_eq!(initial.directory, fixture.0.join("config"));
        let next = resolve_configuration(fixture.0.clone(), None, None).unwrap();
        assert_eq!(next.directory, target);
        assert!(!target.join("native/maaverge.sqlite3").exists());
        assert_eq!(
            fs::read(initial.directory.join("native/maaverge.sqlite3")).unwrap(),
            b"original"
        );
        write_selector(&fixture.0, None).unwrap();
        assert_eq!(
            resolve_configuration(fixture.0.clone(), None, None)
                .unwrap()
                .directory,
            initial.directory
        );
    }

    #[test]
    fn explicit_roots_override_the_selector_and_even_corrupt_selector_files() {
        let fixture = Fixture::new();
        fs::write(fixture.0.join(SELECTOR_FILE), b"broken JSON").unwrap();
        let environment = fixture.0.join("environment");
        let scheduled = fixture.0.join("scheduled");
        let explicit_environment =
            resolve_configuration(fixture.0.clone(), None, Some(environment.clone())).unwrap();
        assert_eq!(explicit_environment.directory, environment);
        assert!(locations(&explicit_environment).is_ok());
        let explicit_schedule = resolve_configuration(
            fixture.0.clone(),
            Some(scheduled.clone()),
            Some(environment),
        )
        .unwrap();
        assert_eq!(explicit_schedule.directory, scheduled);
        assert!(locations(&explicit_schedule).is_ok());
        assert!(resolve_configuration(fixture.0.clone(), None, None).is_err());
    }

    #[test]
    fn existing_target_database_and_lock_are_never_modified() {
        let fixture = Fixture::new();
        let target = fixture.0.join("existing");
        fs::create_dir_all(target.join("native")).unwrap();
        let database = target.join("native/maaverge.sqlite3");
        let lock = target.join("native/.runtime-lock.sqlite3");
        fs::write(&database, b"target database").unwrap();
        fs::write(&lock, b"persistent lock").unwrap();
        verify_directory(&target).unwrap();
        write_selector(&fixture.0, Some(&target)).unwrap();
        assert_eq!(fs::read(database).unwrap(), b"target database");
        assert_eq!(fs::read(lock).unwrap(), b"persistent lock");
    }

    #[test]
    fn invalid_paths_and_unwritable_targets_preserve_the_selector() {
        let fixture = Fixture::new();
        let original = fixture.0.join("original");
        write_selector(&fixture.0, Some(&original)).unwrap();
        let before = fs::read(fixture.0.join(SELECTOR_FILE)).unwrap();
        for value in ["relative/config", "bad\npath", "\n", "\0"] {
            assert!(normalize_saved_directory(value).is_err());
        }
        let file = fixture.0.join("file");
        fs::write(&file, b"not a directory").unwrap();
        assert!(verify_directory(&file).is_err());
        assert_eq!(fs::read(fixture.0.join(SELECTOR_FILE)).unwrap(), before);
        assert!(write_selector(&file, Some(&original)).is_err());
        assert_eq!(fs::read(fixture.0.join(SELECTOR_FILE)).unwrap(), before);
        let oversized_cleanup: Vec<_> = (0..64)
            .map(|index| fixture.0.join(format!("{index}-{}", "x".repeat(512))))
            .collect();
        let error = write_selector_with_cleanup(&fixture.0, Some(&original), &oversized_cleanup)
            .unwrap_err();
        assert!(error.contains("配置目录设置过大"));
        assert_eq!(fs::read(fixture.0.join(SELECTOR_FILE)).unwrap(), before);
        assert_eq!(read_selector(&fixture.0).unwrap().directory, Some(original));
    }

    #[test]
    fn application_roots_follow_windows_macos_bundles_and_linux_appimages() {
        let fixture = Fixture::new();
        let installed = fixture.0.join("installed");
        let executable = installed.join("MaaVerge.exe");
        assert_eq!(
            application_directory_for(&executable, "windows", None).unwrap(),
            installed
        );
        let macos = fixture.0.join("Maa Verge.app/Contents/MacOS/Maa Verge");
        assert_eq!(
            application_directory_for(&macos, "macos", None).unwrap(),
            fixture.0
        );
        let mounted = fixture.0.join("mounted/usr/bin/MaaVerge");
        let image = fixture.0.join("downloads/Maa Verge.AppImage");
        assert_eq!(
            application_directory_for(&mounted, "linux", Some(&image)).unwrap(),
            fixture.0.join("downloads")
        );
        assert_eq!(
            application_directory_for(&mounted, "linux", Some(Path::new("relative.AppImage")))
                .unwrap(),
            fixture.0.join("mounted/usr/bin")
        );
        assert_eq!(
            application_directory_for(&executable, "windows", Some(&image)).unwrap(),
            installed
        );
    }

    #[test]
    fn old_wake_tasks_are_queued_until_the_new_root_starts_and_stale_wakes_follow_it() {
        let fixture = Fixture::new();
        let initial = resolve_configuration(fixture.0.clone(), None, None).unwrap();
        fs::create_dir_all(&initial.directory).unwrap();
        let target = fixture.0.join("next");
        save_directory(&initial, target.to_str().unwrap(), true).unwrap();
        assert!(pending_cleanup(&initial).unwrap().is_empty());
        let next = resolve_configuration(fixture.0.clone(), None, None).unwrap();
        assert_eq!(
            pending_cleanup(&next).unwrap(),
            vec![initial.directory.clone()]
        );
        let stale_wake =
            resolve_configuration(fixture.0.clone(), Some(initial.directory.clone()), None)
                .unwrap();
        assert!(same_directory(&stale_wake.directory, &target));
        assert_eq!(stale_wake.source, "saved");
        let unrelated = fixture.0.join("explicit");
        let explicit =
            resolve_configuration(fixture.0.clone(), Some(unrelated.clone()), None).unwrap();
        assert_eq!(explicit.directory, unrelated);
        assert!(pending_cleanup(&explicit).unwrap().is_empty());
        // Another preference save can happen while OS cleanup is in progress.
        let third = fixture.0.join("third");
        save_directory(&next, third.to_str().unwrap(), true).unwrap();
        complete_cleanup(&next, &initial.directory).unwrap();
        let selector = read_selector(&fixture.0).unwrap();
        assert_eq!(selector.directory, Some(third));
        assert_eq!(selector.pending_wake_cleanup, vec![next.directory]);
    }

    #[test]
    fn cancelling_a_pending_switch_removes_cleanup_and_non_windows_saves_do_not_queue_wakes() {
        let fixture = Fixture::new();
        let initial = resolve_configuration(fixture.0.clone(), None, None).unwrap();
        let target = fixture.0.join("next");
        save_directory(&initial, target.to_str().unwrap(), true).unwrap();
        save_directory(&initial, "", true).unwrap();
        assert!(read_selector(&fixture.0)
            .unwrap()
            .pending_wake_cleanup
            .is_empty());
        save_directory(&initial, target.to_str().unwrap(), false).unwrap();
        assert!(read_selector(&fixture.0)
            .unwrap()
            .pending_wake_cleanup
            .is_empty());
    }
}
