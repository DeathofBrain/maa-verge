//! Desktop-only scheduling effects. Bun owns the canonical rules and dispatch.
use crate::runtime::Runtime;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

#[derive(Default)]
pub struct DesktopScheduler {
    revision: AtomicU64,
    synchronization: tokio::sync::Mutex<()>,
    awake_until: AtomicU64,
    execution_active: Mutex<bool>,
}

pub fn data_root() -> PathBuf {
    let root = configured_root();
    let root = if root.is_absolute() {
        root
    } else {
        std::env::current_dir().unwrap_or_default().join(root)
    };
    std::fs::canonicalize(&root).unwrap_or(root)
}

fn configured_root() -> PathBuf {
    let args: Vec<String> = std::env::args().collect();
    if let Some(index) = args.iter().position(|arg| arg == "--schedule-data-root") {
        if let Some(value) = args
            .get(index + 1)
            .map(PathBuf::from)
            .filter(|path| path.is_absolute())
        {
            return value;
        }
    }
    if let Some(value) = std::env::var_os("MAAVERGE_DATA_DIR") {
        let value = PathBuf::from(value);
        if value.starts_with("~") {
            if let Some(home_directory) =
                std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
            {
                return PathBuf::from(home_directory)
                    .join(value.strip_prefix("~").unwrap_or(&value));
            }
        }
        return value;
    }
    if cfg!(debug_assertions) {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../config")
    } else {
        std::env::current_exe()
            .unwrap_or_default()
            .parent()
            .unwrap_or(Path::new("."))
            .join("config")
    }
}

pub fn is_wake(args: &[String]) -> bool {
    args.iter().any(|arg| arg == "--scheduled-wake")
}

pub fn handle_event(app: AppHandle, payload: &Value) {
    let event = payload["type"].as_str().unwrap_or_default();
    if matches!(
        event,
        "schedule.preparing"
            | "schedule.countdown"
            | "schedule.starting"
            | "run.started"
            | "tool.started"
    ) {
        keep_awake(&app, 600);
    }
    if matches!(event, "schedule.changed" | "settings.saved") {
        synchronize(app.clone());
    }
    if matches!(event, "schedule.notice" | "schedule.countdown") {
        let _ = app
            .notification()
            .builder()
            .title("Maa Verge 定时任务")
            .body(payload["message"].as_str().unwrap_or("定时任务即将开始"))
            .show();
    }
    if event == "schedule.countdown" && payload["data"]["showWindow"].as_bool() == Some(true) {
        crate::show_main(&app);
    }
}

pub fn synchronize(app: AppHandle) {
    let Some(state) = app.try_state::<DesktopScheduler>() else {
        return;
    };
    let revision = state.revision.fetch_add(1, Ordering::AcqRel) + 1;
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(400)).await;
        let state = app.state::<DesktopScheduler>();
        let _guard = state.synchronization.lock().await;
        if state.revision.load(Ordering::Acquire) != revision {
            return;
        }
        let runtime = app.state::<Runtime>();
        let Ok(snapshot) = runtime.request("app.snapshot".into(), json!({})).await else {
            return;
        };
        let Ok(rules) = runtime.request("schedule.list".into(), json!({})).await else {
            return;
        };
        let enabled = snapshot["settings"]["scheduler"]["scheduledWakeUp"]
            .as_bool()
            .unwrap_or(false);
        let outcome = tauri::async_runtime::spawn_blocking(move || {
            register_wake(enabled, &rules, &data_root())
        })
        .await;
        let wake = match outcome {
            Ok(Ok(wake)) => wake,
            Ok(Err(message)) => {
                json!({"supported": cfg!(windows), "status": "failed", "message": message})
            }
            Err(error) => {
                json!({"supported": cfg!(windows), "status": "failed", "message": error.to_string()})
            }
        };
        let _ = runtime
            .request("schedule.host".into(), json!({"wake": wake}))
            .await;
    });
}

pub fn start(app: AppHandle) {
    synchronize(app.clone());
    if is_wake(&std::env::args().collect::<Vec<_>>()) {
        keep_awake(&app, 600);
    }
    let monitor_app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(20)).await;
            let Ok(snapshot) = monitor_app
                .state::<Runtime>()
                .request("app.snapshot".into(), json!({}))
                .await
            else {
                break;
            };
            let active = ["runs", "toolJobs"].iter().any(|key| {
                snapshot[*key]
                    .as_array()
                    .is_some_and(|items| items.iter().any(|item| item["status"] == "running"))
            });
            *monitor_app
                .state::<DesktopScheduler>()
                .execution_active
                .lock()
                .expect("execution state") = active;
        }
    });
    #[cfg(windows)]
    {
        let app = app.clone();
        // SetThreadExecutionState is thread-affine. One dedicated thread owns and
        // releases the request, including the unattended wake preparation window.
        std::thread::spawn(move || loop {
            let state = app.state::<DesktopScheduler>();
            let required = state.awake_until.load(Ordering::Acquire) > epoch_seconds()
                || *state.execution_active.lock().expect("execution state");
            // SAFETY: Fixed documented flags; the call has no pointer arguments.
            unsafe {
                SetThreadExecutionState(0x80000000 | if required { 1 } else { 0 });
            }
            std::thread::sleep(Duration::from_secs(10));
        });
    }
}

pub fn keep_awake(app: &AppHandle, seconds: u64) {
    if let Some(state) = app.try_state::<DesktopScheduler>() {
        state
            .awake_until
            .store(epoch_seconds() + seconds, Ordering::Release);
    }
}
fn epoch_seconds() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg(windows)]
#[link(name = "kernel32")]
extern "system" {
    fn SetThreadExecutionState(flags: u32) -> u32;
}

#[cfg(any(windows, test))]
fn task_name(executable: &Path, root: &Path) -> String {
    let identity = format!(
        "{}\0{}",
        executable.to_string_lossy().to_lowercase(),
        root.to_string_lossy().to_lowercase()
    );
    let hash = identity.bytes().fold(0xcbf29ce484222325_u64, |hash, byte| {
        (hash ^ u64::from(byte)).wrapping_mul(0x100000001b3)
    });
    format!("MaaVergeWake_{hash:016x}")
}
#[cfg(any(windows, test))]
fn xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(any(windows, test))]
fn wake_xml(rules: &Value, executable: &Path, root: &Path) -> Result<Option<String>, String> {
    let mut minutes = std::collections::BTreeSet::new();
    for rule in rules["schedules"].as_array().ok_or("定时列表无效")? {
        // Session overrides disappear on restart, so OS wake rules use saved
        // enables. An extra wake for a skipped occurrence performs no game action.
        if rule["disabledReason"].is_string() || rule["enabled"] != true {
            continue;
        }
        let hour = rule["hour"]
            .as_u64()
            .filter(|hour| *hour < 24)
            .ok_or("定时小时无效")?;
        let minute = rule["minute"]
            .as_u64()
            .filter(|minute| *minute < 60)
            .ok_or("定时分钟无效")?;
        minutes.insert((hour * 60 + minute + 1440 - 5) % 1440);
    }
    if minutes.is_empty() {
        return Ok(None);
    }
    let triggers = minutes.iter().map(|minute| format!("<CalendarTrigger><StartBoundary>2000-01-01T{:02}:{:02}:00</StartBoundary><Enabled>true</Enabled><ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay></CalendarTrigger>", minute / 60, minute % 60)).collect::<String>();
    let root_arg = root.to_string_lossy();
    if root_arg.contains('"') || root_arg.chars().any(char::is_control) {
        return Err("数据目录不能包含引号或控制字符".into());
    }
    let trailing = root_arg.chars().rev().take_while(|c| *c == '\\').count();
    let arguments = format!(
        "--scheduled-wake --schedule-data-root \"{}{}\"",
        root_arg,
        "\\".repeat(trailing)
    );
    Ok(Some(format!(
        r#"<?xml version="1.0" encoding="UTF-16"?><Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><RegistrationInfo><Description>Maa Verge 定时唤醒</Description></RegistrationInfo><Triggers>{triggers}</Triggers><Principals><Principal id="User"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals><Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>false</StartWhenAvailable><WakeToRun>true</WakeToRun><ExecutionTimeLimit>PT0S</ExecutionTimeLimit></Settings><Actions Context="User"><Exec><Command>{}</Command><Arguments>{}</Arguments><WorkingDirectory>{}</WorkingDirectory></Exec></Actions></Task>"#,
        xml(&executable.to_string_lossy()),
        xml(&arguments),
        xml(&executable
            .parent()
            .unwrap_or(Path::new("."))
            .to_string_lossy())
    )))
}

#[cfg(not(windows))]
fn register_wake(_enabled: bool, _rules: &Value, _root: &Path) -> Result<Value, String> {
    Ok(
        json!({"supported": false, "status": "unsupported", "message": "此平台支持应用运行期间定时，本版不支持系统唤醒"}),
    )
}

#[cfg(windows)]
fn register_wake(enabled: bool, rules: &Value, root: &Path) -> Result<Value, String> {
    use std::os::windows::process::CommandExt;
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let name = task_name(&executable, root);
    let content = if enabled {
        wake_xml(rules, &executable, root)?
    } else {
        None
    };
    // Absolute OS executable with fixed argv; no shell, script or model-supplied command.
    let scheduler =
        PathBuf::from(std::env::var_os("SystemRoot").ok_or("无法定位 Windows 系统目录")?)
            .join("System32/schtasks.exe");
    let run = |arguments: &[&std::ffi::OsStr]| {
        std::process::Command::new(&scheduler)
            .args(arguments)
            .creation_flags(0x08000000)
            .output()
            .map_err(|error| error.to_string())
    };
    if let Some(content) = content {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let temporary =
            std::env::temp_dir().join(format!("{name}-{}-{nonce}.xml", std::process::id()));
        let bytes: Vec<u8> = std::iter::once(0xfeff_u16)
            .chain(content.encode_utf16())
            .flat_map(u16::to_le_bytes)
            .collect();
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)
            .map_err(|error| error.to_string())?;
        file.write_all(&bytes)
            .and_then(|_| file.sync_all())
            .map_err(|error| error.to_string())?;
        drop(file);
        let output = run(&[
            "/Create".as_ref(),
            "/TN".as_ref(),
            name.as_ref(),
            "/XML".as_ref(),
            temporary.as_os_str(),
            "/F".as_ref(),
        ]);
        let _ = std::fs::remove_file(&temporary);
        let output = output?;
        if !output.status.success() {
            return Err(format!(
                "Windows 定时唤醒注册失败：{}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        Ok(
            json!({"supported": true, "status": "registered", "message": "已注册 Windows 唤醒：提前五分钟唤醒并启动 Maa Verge"}),
        )
    } else {
        let query = run(&["/Query".as_ref(), "/TN".as_ref(), name.as_ref()])?;
        if query.status.success() {
            let deleted = run(&[
                "/Delete".as_ref(),
                "/TN".as_ref(),
                name.as_ref(),
                "/F".as_ref(),
            ])?;
            if !deleted.status.success() {
                return Err("清理本实例 Windows 唤醒任务失败".into());
            }
        } else {
            // A failed lookup may mean access denied, not absence. Confirm that
            // enumeration succeeded before reporting the actual disabled state.
            let listing = run(&[
                "/Query".as_ref(),
                "/FO".as_ref(),
                "CSV".as_ref(),
                "/NH".as_ref(),
            ])?;
            if !listing.status.success() || String::from_utf8_lossy(&listing.stdout).contains(&name)
            {
                return Err("无法确认本实例 Windows 唤醒任务已清理".into());
            }
        }
        Ok(
            json!({"supported": true, "status": "disabled", "message": "Windows 定时唤醒未启用，或没有启用的定时项"}),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn wake_triggers_wrap_midnight_and_only_include_enabled_rules() {
        let rules = json!({"schedules":[{"hour":0,"minute":3,"enabled":true},{"hour":8,"minute":0,"enabled":false},{"hour":9,"minute":0,"enabled":true,"override":"skip"}]});
        let output = wake_xml(
            &rules,
            Path::new("C:/Apps/Maa & Verge/app.exe"),
            Path::new("C:/Apps/config"),
        )
        .unwrap()
        .unwrap();
        assert!(output.contains("2000-01-01T23:58:00"));
        assert_eq!(output.matches("<CalendarTrigger>").count(), 2);
        assert!(output.contains("Maa &amp; Verge"));
        assert!(output.contains("<WakeToRun>true"));
        assert!(output.contains("<StartWhenAvailable>false"));
    }
    #[test]
    fn separate_checkouts_never_share_a_wake_task() {
        assert_ne!(
            task_name(Path::new("C:/a.exe"), Path::new("C:/config-a")),
            task_name(Path::new("C:/a.exe"), Path::new("C:/config-b"))
        );
        assert!(
            wake_xml(&json!({"schedules":[]}), Path::new("a"), Path::new("b"))
                .unwrap()
                .is_none()
        );
    }
    #[cfg(windows)]
    #[test]
    #[ignore = "explicit isolated Windows scheduler registration; does not sleep or launch the app"]
    fn isolated_windows_wake_registration() {
        let root = std::env::temp_dir().join(format!(
            "maaverge-wake-test-{}-{}",
            std::process::id(),
            epoch_seconds()
        ));
        let minute = ((epoch_seconds() / 60) + 13) % 60;
        let rules = json!({"schedules":[{"hour":12,"minute":minute,"enabled":true}]});
        let result = register_wake(true, &rules, &root);
        let updated = result.as_ref().ok().map(|_| {
            register_wake(
                true,
                &json!({"schedules":[{"hour":13,"minute":minute,"enabled":true}]}),
                &root,
            )
        });
        let cleanup = register_wake(false, &rules, &root);
        assert_eq!(result.unwrap()["status"], "registered");
        assert_eq!(updated.unwrap().unwrap()["status"], "registered");
        assert_eq!(cleanup.unwrap()["status"], "disabled");
    }
}
