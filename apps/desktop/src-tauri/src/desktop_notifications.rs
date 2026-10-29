//! System notifications consume only live host events, never snapshot/history rows.
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::{NotificationExt, PermissionState};

#[derive(Clone, Copy)]
enum Category {
    RunResults,
    DeviceErrors,
    Updates,
    Schedules,
}

#[derive(Clone)]
struct Notice {
    title: &'static str,
    body: String,
    category: Category,
}

#[derive(Default)]
struct Policy {
    // Unconfigured startup events (including interrupted historical runs) are silent.
    settings: Option<Value>,
    seen: HashSet<String>,
    recent: VecDeque<String>,
    device_errors: HashSet<String>,
    update_states: HashMap<String, (String, String)>,
}

impl Policy {
    fn configure(&mut self, settings: &Value) {
        self.settings = Some(settings["notifications"].clone());
    }

    fn allowed(&self, category: Category) -> bool {
        let Some(settings) = &self.settings else {
            return false;
        };
        let key = match category {
            Category::RunResults => "runResults",
            Category::DeviceErrors => "deviceErrors",
            Category::Updates => "updates",
            Category::Schedules => "schedules",
        };
        settings["enabled"].as_bool().unwrap_or(true) && settings[key].as_bool().unwrap_or(true)
    }

    fn remember(&mut self, key: String) -> bool {
        if !self.seen.insert(key.clone()) {
            return false;
        }
        self.recent.push_back(key);
        if self.recent.len() > 1024 {
            if let Some(expired) = self.recent.pop_front() {
                self.seen.remove(&expired);
            }
        }
        true
    }

    fn event(&mut self, event: &Value) -> Option<Notice> {
        let kind = event["type"].as_str()?;
        let data = &event["data"];
        let device = data["device"]["id"]
            .as_str()
            .or_else(|| data["deviceId"].as_str())
            .unwrap_or("discovery");
        if kind == "device.connected" {
            self.device_errors.remove(device);
            self.device_errors.remove("discovery");
        }
        let (category, title, key) = match kind {
            "run.completed" | "run.failed" | "run.interrupted" | "tool.completed"
            | "tool.failed" | "tool.interrupted" => {
                let tool = kind.starts_with("tool.");
                let run = if tool { &data["job"] } else { &data["run"] };
                let id = run["id"]
                    .as_str()
                    .or_else(|| data["runId"].as_str())
                    .or_else(|| data["toolId"].as_str())?;
                let copilot = run["source"] == "copilot";
                let title = match (tool, copilot, kind.rsplit('.').next()?) {
                    (true, _, "completed") => "工具执行结束",
                    (true, _, "failed") => "工具执行失败",
                    (true, _, _) => "工具执行中断",
                    (_, true, "completed") => "作业执行结束",
                    (_, true, "failed") => "作业执行失败",
                    (_, true, _) => "作业执行中断",
                    (_, _, "completed") => "任务表执行结束",
                    (_, _, "failed") => "任务表执行失败",
                    _ => "任务表执行中断",
                };
                (Category::RunResults, title, format!("{kind}:{id}"))
            }
            "device.failed" | "device.connection_failed" | "device.auto_connect_failed" => {
                if !self.device_errors.insert(device.to_owned()) {
                    return None;
                }
                (Category::DeviceErrors, "设备连接异常", String::new())
            }
            "update.changed" => {
                let channel = data["channel"].as_str()?;
                let update = &data["update"];
                let status = update["status"].as_str()?;
                let version = update["latestVersion"]
                    .as_str()
                    .or_else(|| update["currentVersion"].as_str())
                    .unwrap_or_default();
                let state = (status.to_owned(), version.to_owned());
                if self.update_states.insert(channel.to_owned(), state.clone()) == Some(state) {
                    return None;
                }
                let title = match status {
                    "staged" => "更新已准备好",
                    "active" => "组件更新已生效",
                    "failed" => "更新失败",
                    _ => return None,
                };
                (Category::Updates, title, String::new())
            }
            "schedule.notice" | "schedule.countdown" => {
                let id = event["id"].as_u64()?;
                (
                    Category::Schedules,
                    "定时任务即将开始",
                    format!("{kind}:{id}"),
                )
            }
            _ => return None,
        };
        // Remember suppressed results too: turning notifications back on must
        // not replay results that arrived while the user had disabled them.
        if !key.is_empty() && !self.remember(key) {
            return None;
        }
        if !self.allowed(category) {
            return None;
        }
        let body = event["message"]
            .as_str()
            .unwrap_or(title)
            .chars()
            .filter(|character| !character.is_control() || *character == '\n')
            .take(240)
            .collect();
        Some(Notice {
            title,
            body,
            category,
        })
    }
}

#[derive(Default)]
pub struct DesktopNotifications {
    policy: Mutex<Policy>,
    last_test: Mutex<Option<Instant>>,
}

impl DesktopNotifications {
    pub fn configure(&self, settings: &Value) {
        self.policy
            .lock()
            .expect("notification policy")
            .configure(settings);
    }
}

pub fn handle_event(app: &AppHandle, event: &Value) {
    let notice = app
        .state::<DesktopNotifications>()
        .policy
        .lock()
        .expect("notification policy")
        .event(event);
    if let Some(notice) = notice {
        let app = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            // A user may disable a category while dispatch is waiting for a thread.
            if !app
                .state::<DesktopNotifications>()
                .policy
                .lock()
                .expect("notification policy")
                .allowed(notice.category)
            {
                return;
            }
            if let Err(error) = app
                .notification()
                .builder()
                .title(format!("Maa Verge · {}", notice.title))
                .body(notice.body)
                .show()
            {
                eprintln!("系统通知发送失败：{error}");
            }
        });
    }
}

#[tauri::command]
pub fn desktop_notification_status(
    app: AppHandle,
    request_permission: bool,
) -> Result<Value, String> {
    let permission = if request_permission {
        app.notification().request_permission()
    } else {
        app.notification().permission_state()
    }
    .map_err(|error| format!("无法检查系统通知通道：{error}"))?;
    // The desktop plugin reports permission to use its channel. OS notification
    // settings and Do Not Disturb can still suppress actual delivery.
    Ok(json!({ "permission": match permission {
        PermissionState::Granted => "granted",
        PermissionState::Denied => "denied",
        _ => "prompt",
    }}))
}

#[tauri::command]
pub async fn desktop_test_notification(app: AppHandle) -> Result<(), String> {
    let state = app.state::<DesktopNotifications>();
    // A manual test is governed by the master switch, independently of categories.
    let enabled = state
        .policy
        .lock()
        .expect("notification policy")
        .settings
        .as_ref()
        .is_some_and(|settings| settings["enabled"].as_bool().unwrap_or(true));
    if !enabled {
        return Err("请先启用并保存系统通知设置".into());
    }
    {
        let mut last = state.last_test.lock().expect("notification test throttle");
        if last.is_some_and(|last| last.elapsed() < Duration::from_secs(2)) {
            return Err("请稍候再发送测试通知".into());
        }
        *last = Some(Instant::now());
    }
    tauri::async_runtime::spawn_blocking(move || {
        app.notification()
            .builder()
            .title("Maa Verge · 测试通知")
            .body("系统通知已发送。任务执行结果、设备异常、更新与定时提醒将按设置通知。")
            .show()
            .map_err(|error| format!("系统通知发送失败：{error}"))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(kind: &str, data: Value) -> Value {
        json!({ "id": 1, "type": kind, "message": "合成流程结果", "data": data })
    }

    #[test]
    fn startup_and_progress_stay_silent_and_terminal_results_are_deduplicated() {
        let mut policy = Policy::default();
        let finished = event("run.completed", json!({"run": {"id": "run-1"}}));
        assert!(policy.event(&finished).is_none());
        policy.configure(&json!({}));
        assert!(policy.event(&finished).is_none());
        assert!(policy
            .event(&event("run.progress", json!({"run": {"id": "run-2"}})))
            .is_none());
        let copilot = event(
            "run.completed",
            json!({"run": {"id": "run-2", "source": "copilot"}}),
        );
        assert_eq!(policy.event(&copilot).unwrap().title, "作业执行结束");
        assert!(policy.event(&copilot).is_none());
        assert_eq!(
            policy
                .event(&event("tool.failed", json!({"job": {"id": "tool-1"}})))
                .unwrap()
                .title,
            "工具执行失败"
        );
    }

    #[test]
    fn saved_preferences_take_effect_immediately_without_replaying_muted_results() {
        let mut policy = Policy::default();
        policy.configure(&json!({"notifications": {"enabled": false}}));
        let result = event("run.failed", json!({"run": {"id": "run-1"}}));
        assert!(policy.event(&result).is_none());
        policy.configure(&json!({"notifications": {"enabled": true, "runResults": false}}));
        assert!(!policy.allowed(Category::RunResults));
        assert!(policy.allowed(Category::Schedules));
        policy.configure(&json!({"notifications": {"enabled": true}}));
        assert!(policy.event(&result).is_none());
        let notice = policy
            .event(&event("run.failed", json!({"run": {"id": "run-2"}})))
            .unwrap();
        policy.configure(&json!({"notifications": {"enabled": false}}));
        assert!(!policy.allowed(notice.category));
    }

    #[test]
    fn device_failure_retries_notify_again_only_after_connection_recovers() {
        let mut policy = Policy::default();
        policy.configure(&json!({}));
        let data = json!({"device": {"id": "device-1"}});
        assert!(policy
            .event(&event("device.failed", data.clone()))
            .is_some());
        assert!(policy
            .event(&event("device.connection_failed", data.clone()))
            .is_none());
        assert!(policy
            .event(&event("device.connecting", data.clone()))
            .is_none());
        assert!(policy
            .event(&event("device.failed", data.clone()))
            .is_none());
        assert!(policy
            .event(&event("device.connected", data.clone()))
            .is_none());
        assert!(policy.event(&event("device.failed", data)).is_some());
    }

    #[test]
    fn update_channels_keep_independent_transitions_and_ignore_download_progress() {
        let mut policy = Policy::default();
        policy.configure(&json!({}));
        let update = |channel: &str, status: &str| {
            event(
                "update.changed",
                json!({"channel": channel, "update": {"id": channel, "status": status, "latestVersion": "fixture-version", "currentVersion": "previous-version", "progress": 100, "message": "合成更新结果"}}),
            )
        };
        assert!(policy.event(&update("core", "downloading")).is_none());
        assert!(policy.event(&update("core", "staged")).is_some());
        assert!(policy.event(&update("core", "staged")).is_none());
        let mut newer = update("core", "staged");
        newer["data"]["update"]["latestVersion"] = json!("newer-fixture-version");
        assert!(policy.event(&newer).is_some());
        assert!(policy.event(&newer).is_none());
        assert!(policy.event(&update("resource", "staged")).is_some());
        assert!(policy.event(&update("app", "staged")).is_some());
        assert!(policy.event(&update("core", "active")).is_some());
        assert!(policy.event(&update("core", "failed")).is_some());
        assert!(policy.event(&update("core", "checking")).is_none());
        assert!(policy.event(&update("core", "failed")).is_some());
    }
}
