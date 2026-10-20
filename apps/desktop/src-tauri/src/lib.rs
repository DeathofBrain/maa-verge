mod runtime;

use runtime::Runtime;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            show_main(app);
        }))
        .invoke_handler(tauri::generate_handler![runtime::runtime_request])
        .setup(|app| {
            #[cfg(target_os = "windows")]
            configure_window_transitions(app.handle());
            let runtime = tauri::async_runtime::block_on(Runtime::start(app.handle().clone()))
                .map_err(std::io::Error::other)?;
            app.manage(runtime);
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
                    "quit" => app.exit(0),
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
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window
                    .app_handle()
                    .try_state::<Runtime>()
                    .is_some_and(|runtime| runtime.minimize_to_tray())
                {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("Maa Verge desktop initialization failed");
    app.run(|app, event| {
        if let tauri::RunEvent::Exit = event {
            if let Some(runtime) = app.try_state::<Runtime>() {
                tauri::async_runtime::block_on(runtime.shutdown());
            }
        }
    });
}
