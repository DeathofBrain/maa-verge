mod runtime;

use runtime::Runtime;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;

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
            let runtime = tauri::async_runtime::block_on(Runtime::start(app.handle().clone()))
                .map_err(std::io::Error::other)?;
            app.manage(runtime);
            let show = MenuItem::with_id(app, "show", "显示 MAAVerge", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let mut pixels = vec![0_u8; 32 * 32 * 4];
            for y in 4..28 {
                for x in 4..28 {
                    let offset = (y * 32 + x) * 4;
                    pixels[offset..offset + 4].copy_from_slice(&[176, 235, 105, 255]);
                }
            }
            TrayIconBuilder::with_id("main")
                .icon(tauri::image::Image::new_owned(pixels, 32, 32))
                .tooltip("MAAVerge · 明日方舟助手")
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
        .expect("MAAVerge desktop initialization failed");
    app.run(|app, event| {
        if let tauri::RunEvent::Exit = event {
            if let Some(runtime) = app.try_state::<Runtime>() {
                tauri::async_runtime::block_on(runtime.shutdown());
            }
        }
    });
}
