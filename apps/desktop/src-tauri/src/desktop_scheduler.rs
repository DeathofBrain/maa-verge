//! Desktop-only scheduling effects. Bun owns the canonical rules and dispatch.
use crate::runtime::Runtime;
use serde_json::{json, Value};
use std::path::Path;
#[cfg(any(windows, test))]
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager};

#[derive(Default)]
pub struct DesktopScheduler {
    revision: AtomicU64,
    synchronization: tokio::sync::Mutex<()>,
    awake_until: AtomicU64,
    execution_active: Mutex<bool>,
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
        let outcome =
            tauri::async_runtime::spawn_blocking(move || synchronize_wake(enabled, &rules)).await;
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

fn synchronize_wake(enabled: bool, rules: &Value) -> Result<Value, String> {
    let root = crate::configuration::data_root()?;
    #[cfg(windows)]
    {
        reconcile_wake(
            enabled,
            rules,
            &root,
            &crate::configuration::pending_wake_cleanup()?,
            register_wake,
            crate::configuration::complete_wake_cleanup,
        )
    }
    #[cfg(not(windows))]
    register_wake(enabled, rules, &root)
}

#[cfg(any(windows, test))]
fn reconcile_wake(
    enabled: bool,
    rules: &Value,
    root: &Path,
    previous_roots: &[PathBuf],
    mut register: impl FnMut(bool, &Value, &Path) -> Result<Value, String>,
    mut complete: impl FnMut(&Path) -> Result<(), String>,
) -> Result<Value, String> {
    for previous in previous_roots {
        if previous == root {
            continue;
        }
        // register_wake derives its exact task identity from current_exe + root.
        // Failed deletion/confirmation leaves the durable cleanup entry retryable.
        register(false, &json!({"schedules": []}), previous)?;
        complete(previous)?;
    }
    register(enabled, rules, root)
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

    #[test]
    fn root_switch_cleans_only_the_previous_task_for_this_executable() {
        use std::cell::RefCell;
        let executable = Path::new("C:/Apps/MaaVerge/app.exe");
        let previous = PathBuf::from("C:/Profiles/previous");
        let current = PathBuf::from("C:/Profiles/current");
        let unrelated = PathBuf::from("C:/Profiles/explicit-environment");
        let previous_task = task_name(executable, &previous);
        let unrelated_task = task_name(executable, &unrelated);
        let other_program_task = task_name(Path::new("C:/Other/app.exe"), &previous);
        let tasks = RefCell::new(std::collections::HashSet::from([
            previous_task.clone(),
            unrelated_task.clone(),
            other_program_task.clone(),
        ]));
        let completed = RefCell::new(Vec::new());
        reconcile_wake(
            true,
            &json!({"schedules": []}),
            &current,
            &[previous.clone(), current.clone()],
            |enabled, _, root| {
                let name = task_name(executable, root);
                if enabled {
                    tasks.borrow_mut().insert(name);
                } else {
                    tasks.borrow_mut().remove(&name);
                }
                Ok(json!({"status": if enabled {"registered"} else {"disabled"}}))
            },
            |root| {
                completed.borrow_mut().push(root.to_path_buf());
                Ok(())
            },
        )
        .unwrap();
        assert!(!tasks.borrow().contains(&previous_task));
        assert!(tasks.borrow().contains(&task_name(executable, &current)));
        assert!(tasks.borrow().contains(&unrelated_task));
        assert!(tasks.borrow().contains(&other_program_task));
        assert_eq!(*completed.borrow(), vec![previous]);
    }

    #[test]
    fn failed_wake_cleanup_is_not_acknowledged_or_replaced_and_can_retry() {
        use std::cell::RefCell;
        let previous = PathBuf::from("C:/Profiles/previous");
        let current = PathBuf::from("C:/Profiles/current");
        let operations = RefCell::new(Vec::new());
        let rules = json!({"schedules": []});
        let failed = reconcile_wake(
            true,
            &rules,
            &current,
            std::slice::from_ref(&previous),
            |enabled, _, root| {
                operations.borrow_mut().push((enabled, root.to_path_buf()));
                Err("synthetic cleanup failure".into())
            },
            |_| panic!("failed cleanup must remain pending"),
        );
        assert_eq!(failed.unwrap_err(), "synthetic cleanup failure");
        assert_eq!(*operations.borrow(), vec![(false, previous.clone())]);
        let completed = RefCell::new(Vec::new());
        let restored = reconcile_wake(
            true,
            &rules,
            &current,
            std::slice::from_ref(&previous),
            |enabled, _, root| {
                operations.borrow_mut().push((enabled, root.to_path_buf()));
                Ok(json!({"status": if enabled {"registered"} else {"disabled"}}))
            },
            |root| {
                completed.borrow_mut().push(root.to_path_buf());
                Ok(())
            },
        )
        .unwrap();
        assert_eq!(restored["status"], "registered");
        assert_eq!(
            *operations.borrow(),
            vec![
                (false, previous.clone()),
                (false, previous.clone()),
                (true, current)
            ]
        );
        assert_eq!(*completed.borrow(), vec![previous]);
    }

    #[test]
    fn interrupted_cleanup_confirmation_retries_the_idempotent_delete() {
        let previous = PathBuf::from("C:/Profiles/previous");
        let current = PathBuf::from("C:/Profiles/current");
        let mut operations = 0;
        let failed = reconcile_wake(
            true,
            &json!({"schedules": []}),
            &current,
            &[previous],
            |enabled, _, _| {
                assert!(!enabled);
                operations += 1;
                Ok(json!({"status": "disabled"}))
            },
            |_| Err("synthetic selector write failure".into()),
        );
        assert_eq!(failed.unwrap_err(), "synthetic selector write failure");
        assert_eq!(operations, 1);
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
