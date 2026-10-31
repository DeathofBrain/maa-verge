mod app_updater;
mod configuration;
mod desktop_notifications;
mod desktop_scheduler;
mod directory_picker;
mod external_links;
mod notification_sender;
mod runtime;
mod uninstall;

use runtime::Runtime;
use std::sync::atomic::{AtomicU8, Ordering};
use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Listener, Manager};
use tokio::sync::Notify;

const RUNNING: u8 = 0;
const CLOSE_REQUESTED: u8 = 1;
const EXIT_REQUESTED: u8 = 2;
const CLEANING_UP: u8 = 3;
const EXIT_READY: u8 = 4;
const EXIT_UI_TIMEOUT: Duration = Duration::from_millis(1500);

#[derive(Default)]
struct DesktopLifecycle {
    phase: AtomicU8,
    ui_ready: Notify,
}

impl DesktopLifecycle {
    fn status(&self) -> &'static str {
        match self.phase.load(Ordering::Acquire) {
            RUNNING => "running",
            CLOSE_REQUESTED => "close-requested",
            _ => "exiting",
        }
    }

    fn request_close(&self) -> bool {
        self.phase
            .compare_exchange(
                RUNNING,
                CLOSE_REQUESTED,
                Ordering::AcqRel,
                Ordering::Acquire,
            )
            .is_ok()
    }

    fn cancel_close(&self) {
        let _ = self.phase.compare_exchange(
            CLOSE_REQUESTED,
            RUNNING,
            Ordering::AcqRel,
            Ordering::Acquire,
        );
    }

    fn begin_exit(&self) -> bool {
        // Tray, window and OS requests can arrive together. Exactly one owns cleanup.
        self.phase
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |phase| {
                (phase < EXIT_REQUESTED).then_some(EXIT_REQUESTED)
            })
            .is_ok()
    }

    fn exiting(&self) -> bool {
        self.phase.load(Ordering::Acquire) >= EXIT_REQUESTED
    }

    fn acknowledge_ui(&self) {
        if self.phase.load(Ordering::Acquire) == EXIT_REQUESTED {
            // A permit is retained if the UI responds before the task starts waiting.
            self.ui_ready.notify_one();
        }
    }

    async fn wait_for_ui(&self, timeout: Duration) -> bool {
        let acknowledged = tokio::time::timeout(timeout, self.ui_ready.notified())
            .await
            .is_ok();
        self.phase.store(CLEANING_UP, Ordering::Release);
        acknowledged
    }

    fn finish_exit(&self) {
        self.phase.store(EXIT_READY, Ordering::Release);
    }

    fn can_exit(&self, code: Option<i32>) -> bool {
        // The updater closes the service before asking Tauri to restart. Avoid
        // starting a second normal-exit flow that could interfere with restart.
        code == Some(tauri::RESTART_EXIT_CODE) || self.phase.load(Ordering::Acquire) == EXIT_READY
    }
}

#[cfg(target_os = "windows")]
fn configure_window_transitions(app: &tauri::AppHandle) {
    use std::ffi::c_void;

    #[link(name = "dwmapi")]
    unsafe extern "system" {
        fn DwmSetWindowAttribute(
            hwnd: *mut c_void,
            attribute: u32,
            value: *const c_void,
            size: u32,
        ) -> i32;
    }

    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    // DWM stretches a cached WebView frame during maximize/restore. Disable that
    // transition for this window so the integrated title bar keeps its size.
    const DWMWA_TRANSITIONS_FORCEDISABLED: u32 = 3;
    let disabled = 1_i32;
    // SAFETY: hwnd belongs to the live main window; value points to a BOOL for
    // the duration of this synchronous call and its size is supplied exactly.
    let result = unsafe {
        DwmSetWindowAttribute(
            hwnd.0,
            DWMWA_TRANSITIONS_FORCEDISABLED,
            (&disabled as *const i32).cast(),
            std::mem::size_of_val(&disabled) as u32,
        )
    };
    if result < 0 {
        eprintln!("Could not configure window transitions: HRESULT {result:#x}");
    }
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn request_exit(app: &tauri::AppHandle) {
    if !app.state::<DesktopLifecycle>().begin_exit() {
        return;
    }
    desktop_notifications::stop(app);
    show_main(app);
    let _ = app.emit("app-exit-started", ());
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        // Let React paint its progress dialog first. A broken or loading WebView
        // must still allow bounded shutdown without an acknowledgement.
        app.state::<DesktopLifecycle>()
            .wait_for_ui(EXIT_UI_TIMEOUT)
            .await;
        if let Some(runtime) = app.try_state::<Runtime>() {
            runtime.shutdown().await;
        }
        app.state::<DesktopLifecycle>().finish_exit();
        app.exit(0);
    });
}

#[tauri::command]
fn get_desktop_lifecycle(lifecycle: tauri::State<'_, DesktopLifecycle>) -> &'static str {
    lifecycle.status()
}

#[tauri::command]
fn exit_ui_ready(lifecycle: tauri::State<'_, DesktopLifecycle>) {
    lifecycle.acknowledge_ui();
}

#[tauri::command]
fn resolve_window_close(app: tauri::AppHandle, action: String) -> Result<(), String> {
    if !matches!(action.as_str(), "tray" | "exit" | "cancel") {
        return Err("未知的窗口关闭操作".into());
    }
    let lifecycle = app.state::<DesktopLifecycle>();
    if lifecycle.exiting() {
        show_main(&app);
        return Ok(());
    }
    match action.as_str() {
        "tray" => {
            let window = app.get_webview_window("main").ok_or("主窗口不可用")?;
            lifecycle.cancel_close();
            window.hide().map_err(|error| error.to_string())?;
            if lifecycle.exiting() {
                show_main(&app);
            }
        }
        "exit" => request_exit(&app),
        "cancel" => lifecycle.cancel_close(),
        _ => unreachable!(),
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(DesktopLifecycle::default())
        .manage(desktop_notifications::DesktopNotifications::default())
        .manage(desktop_scheduler::DesktopScheduler::default())
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {
            if desktop_scheduler::is_wake(&args) {
                desktop_scheduler::keep_awake(app, 600);
            } else {
                show_main(app);
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            runtime::runtime_request,
            external_links::open_external_url,
            configuration::get_configuration_locations,
            configuration::save_configuration_directory,
            configuration::open_configuration_directory,
            directory_picker::pick_directory,
            uninstall::get_desktop_uninstall_info,
            uninstall::uninstall_desktop_application,
            desktop_notifications::desktop_notification_status,
            desktop_notifications::desktop_test_notification,
            resolve_window_close,
            get_desktop_lifecycle,
            exit_ui_ready
        ])
        .setup(|app| {
            let notification_app = app.handle().clone();
            app.listen("runtime-event", move |event| {
                if let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload()) {
                    desktop_notifications::handle_event(&notification_app, &payload);
                }
            });
            #[cfg(target_os = "windows")]
            configure_window_transitions(app.handle());
            let updater = app_updater::AppUpdater::new(app.handle().clone());
            // Consume an already verified package before sidecars, automatic
            // connections or schedules can lock the installation files again.
            updater.resume_on_startup();
            let runtime = tauri::async_runtime::block_on(Runtime::start(app.handle().clone()))
                .map_err(std::io::Error::other)?;
            app.manage(runtime);
            app.manage(updater);
            desktop_scheduler::start(app.handle().clone());
            // The first snapshot may overlap offline component preparation.
            // Never hold the window's setup thread while waiting for service I/O.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let snapshot = handle
                    .state::<Runtime>()
                    .request("app.snapshot".into(), serde_json::json!({}))
                    .await;
                match snapshot {
                    Ok(snapshot) => {
                        handle
                            .state::<desktop_notifications::DesktopNotifications>()
                            .configure(&snapshot["settings"]);
                        handle
                            .state::<app_updater::AppUpdater>()
                            .configure(&snapshot["settings"]);
                        app_updater::AppUpdater::check_in_background(handle, false);
                    }
                    Err(error) => eprintln!("初始化应用更新设置失败：{error}"),
                }
            });
            let show = MenuItem::with_id(app, "show", "显示 Maa Verge", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let icon = app
                .default_window_icon()
                .cloned()
                .ok_or_else(|| std::io::Error::other("Application icon is missing"))?;
            TrayIconBuilder::with_id("main")
                .icon(icon)
                .tooltip("Maa Verge · 明日方舟助手")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main(app),
                    "quit" => request_exit(app),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Keep the WebView alive throughout confirmation and cleanup.
                api.prevent_close();
                let app = window.app_handle();
                let lifecycle = app.state::<DesktopLifecycle>();
                if lifecycle.exiting() {
                    show_main(app);
                    return;
                }
                let preferences = app
                    .try_state::<Runtime>()
                    .map(|runtime| runtime.close_preferences())
                    .unwrap_or_default();
                if preferences.remember_close_action {
                    if preferences.minimize_to_tray {
                        let _ = window.hide();
                    } else {
                        request_exit(app);
                    }
                } else if lifecycle.request_close() {
                    let _ = app.emit("window-close-requested", ());
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("Maa Verge desktop initialization failed");
    app.run(|app, event| {
        if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
            if !app.state::<DesktopLifecycle>().can_exit(code) {
                api.prevent_exit();
                request_exit(app);
            }
        }
    });
}

#[cfg(test)]
mod lifecycle_tests {
    use super::*;
    use std::sync::Arc;

    #[test]
    fn updater_restart_bypasses_pending_normal_exit_without_cancelling_restart() {
        let lifecycle = DesktopLifecycle::default();
        assert!(lifecycle.request_close());
        assert!(!lifecycle.can_exit(None));
        assert!(!lifecycle.can_exit(Some(0)));
        assert!(lifecycle.can_exit(Some(tauri::RESTART_EXIT_CODE)));
        assert_eq!(lifecycle.status(), "close-requested");
        assert!(lifecycle.begin_exit());
        assert!(!lifecycle.can_exit(Some(0)));
        assert!(lifecycle.can_exit(Some(tauri::RESTART_EXIT_CODE)));
        assert_eq!(lifecycle.status(), "exiting");
        lifecycle.finish_exit();
        assert!(lifecycle.can_exit(None));
    }

    #[test]
    fn pending_close_survives_queries_and_can_be_cancelled() {
        let lifecycle = DesktopLifecycle::default();
        assert_eq!(lifecycle.status(), "running");
        assert!(lifecycle.request_close());
        assert!(!lifecycle.request_close());
        assert_eq!(lifecycle.status(), "close-requested");
        assert_eq!(lifecycle.status(), "close-requested");
        lifecycle.cancel_close();
        assert_eq!(lifecycle.status(), "running");
        assert!(lifecycle.request_close());
    }

    #[test]
    fn concurrent_exit_requests_have_one_cleanup_owner() {
        let lifecycle = Arc::new(DesktopLifecycle::default());
        assert!(lifecycle.request_close());
        let requests: Vec<_> = (0..16)
            .map(|_| {
                let lifecycle = lifecycle.clone();
                std::thread::spawn(move || lifecycle.begin_exit())
            })
            .collect();
        let owners = requests
            .into_iter()
            .map(|request| usize::from(request.join().unwrap()))
            .sum::<usize>();
        assert_eq!(owners, 1);
        lifecycle.cancel_close();
        assert_eq!(lifecycle.status(), "exiting");
        assert!(!lifecycle.request_close());
        assert!(!lifecycle.can_exit(None));
    }

    #[test]
    fn ui_acknowledgement_before_wait_is_retained_until_cleanup() {
        tauri::async_runtime::block_on(async {
            let lifecycle = DesktopLifecycle::default();
            assert!(lifecycle.begin_exit());
            lifecycle.acknowledge_ui();
            assert!(lifecycle.wait_for_ui(Duration::from_millis(100)).await);
            assert!(!lifecycle.can_exit(None));
            lifecycle.finish_exit();
            assert!(lifecycle.can_exit(None));
            assert!(!lifecycle.begin_exit());
        });
    }

    #[test]
    fn unavailable_ui_has_a_bounded_fallback_and_early_ack_is_ignored() {
        tauri::async_runtime::block_on(async {
            let lifecycle = DesktopLifecycle::default();
            lifecycle.acknowledge_ui();
            assert!(lifecycle.begin_exit());
            assert!(!lifecycle.wait_for_ui(Duration::from_millis(1)).await);
            assert_eq!(lifecycle.status(), "exiting");
            assert!(!lifecycle.can_exit(None));
            lifecycle.finish_exit();
            assert!(lifecycle.can_exit(None));
        });
    }
}
