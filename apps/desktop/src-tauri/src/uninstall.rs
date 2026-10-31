//! macOS only: the bundled service owns component policy and the cleanup lease.
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tauri::Manager;

fn bundle_for(executable: &Path) -> Result<PathBuf, String> {
    let macos = executable.parent().ok_or("无法定位应用包")?;
    let contents = macos.parent().ok_or("无法定位应用包")?;
    let bundle = contents.parent().ok_or("无法定位应用包")?;
    if macos.file_name().is_none_or(|name| name != "MacOS")
        || contents.file_name().is_none_or(|name| name != "Contents")
        || bundle
            .extension()
            .is_none_or(|extension| extension != "app")
        || executable.file_name().is_none_or(|name| name != "maaverge")
    {
        return Err("请使用已安装的 macOS Maa Verge 应用".into());
    }
    Ok(bundle.to_path_buf())
}

#[tauri::command]
pub fn get_desktop_uninstall_info(app: tauri::AppHandle) -> Result<Value, String> {
    let home = std::env::var_os("MAAVERGE_COMPONENT_HOME")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .map(Ok)
        .unwrap_or_else(|| app.path().home_dir())
        .map_err(|error| error.to_string())?;
    if !home.is_absolute() {
        return Err("组件用户目录必须使用完整的绝对路径".into());
    }
    let root = home.join("Library/Application Support/Maa Verge");
    let application = std::env::current_exe()
        .ok()
        .and_then(|executable| bundle_for(&executable).ok());
    let available = cfg!(target_os = "macos") && !cfg!(debug_assertions) && application.is_some();
    let reason = if !cfg!(target_os = "macos") {
        "此卸载入口仅适用于 macOS"
    } else if !available {
        "仅已安装的 macOS 应用支持卸载，开发环境不会删除文件"
    } else {
        ""
    };
    Ok(json!({
        "available": available,
        "reason": reason,
        "application": application.as_deref().unwrap_or(Path::new("")),
        "componentDirectories": [root.join("MaaCore"), root.join("MaaResource")],
        "configurationDirectory": crate::configuration::data_root()?,
    }))
}

#[cfg(target_os = "macos")]
fn helper_result(output: &std::process::Output) -> Result<(), String> {
    let value = if output.stdout.len() <= 65_536 {
        serde_json::from_slice::<Value>(&output.stdout).ok()
    } else {
        None
    };
    if output.status.success() && value.as_ref().is_some_and(|value| value["ok"] == true) {
        return Ok(());
    }
    let mut message = value
        .as_ref()
        .and_then(|value| value["message"].as_str())
        .unwrap_or("卸载工具未能确认清理结果，应用与组件可能仍需手动处理")
        .to_string();
    if let Some(moved) = value
        .as_ref()
        .and_then(|value| value["movedPaths"].as_array())
    {
        let moved = moved.iter().filter_map(Value::as_str).collect::<Vec<_>>();
        if !moved.is_empty() {
            message.push_str("；以下项目已移入废纸篓：");
            message.push_str(&moved.join("、"));
        }
    }
    Err(message)
}

#[tauri::command]
pub async fn uninstall_desktop_application(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Err("此卸载入口仅适用于 macOS".into())
    }
    #[cfg(target_os = "macos")]
    {
        use std::process::Stdio;
        use std::time::Duration;
        use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
        use tokio::process::Command;

        let info = get_desktop_uninstall_info(app.clone())?;
        if info["available"] != true {
            return Err(info["reason"].as_str().unwrap_or("当前无法卸载").into());
        }
        let bundle = bundle_for(&std::env::current_exe().map_err(|error| error.to_string())?)?;
        let executable = bundle.join("Contents/Resources/runtime/maaverge-runtime");
        if !executable.is_file() {
            return Err("安装包缺少卸载所需的本地服务，请重新安装应用后重试".into());
        }
        let locations = crate::configuration::get_configuration_locations()?;
        let mut roots = ["directory", "nextDirectory"]
            .map(|key| {
                locations[key]
                    .as_str()
                    .map(String::from)
                    .ok_or("无法确认保留的配置目录")
            })
            .into_iter()
            .collect::<Result<Vec<_>, _>>()?;
        let runtime = app.state::<crate::runtime::Runtime>();
        let snapshot = runtime.request("app.snapshot".into(), json!({})).await?;
        for (channel, default) in ["core", "resource"].into_iter().zip(
            info["componentDirectories"]
                .as_array()
                .ok_or("无法确认默认组件目录")?,
        ) {
            if let Some(directory) = snapshot["settings"]["componentPaths"][channel].as_str() {
                if !directory.is_empty() && Some(directory) != default.as_str() {
                    roots.push(directory.to_string());
                }
            }
        }
        if let Some(directory) = snapshot["settings"]["copilotStorage"]["directory"].as_str() {
            if !directory.is_empty() {
                roots.push(directory.to_string());
            }
        }
        let lifecycle = app.state::<crate::DesktopLifecycle>();
        if !lifecycle.begin_exit() {
            return Err("应用正在退出或安装更新，请稍后重试".into());
        }
        runtime.mark_updating();
        crate::desktop_notifications::stop(&app);
        let result = async {
            runtime.shutdown_for_uninstall().await?;
            let mut command = Command::new(executable);
            command.args(["--uninstall-macos", "--bundle"]).arg(&bundle);
            for root in roots {
                command.arg("--data-root").arg(root);
            }
            command
                .env_remove("BUN_OPTIONS")
                .env_remove("BUN_BE_BUN")
                .env_remove("NODE_OPTIONS")
                .env_remove("NODE_PATH")
                .current_dir(bundle.parent().ok_or("无法定位安装目录")?)
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .kill_on_drop(true);
            let output = tokio::time::timeout(Duration::from_secs(90), command.output())
                .await
                .map_err(|_| "卸载超时，请检查废纸篓中的应用与组件".to_string())?
                .map_err(|error| format!("无法启动卸载工具：{error}"))?;
            helper_result(&output)
        }
        .await;
        if let Err(error) = result {
            let message = format!("卸载未完成，将重新打开 Maa Verge：{error}");
            eprintln!("{message}");
            let recover = app.clone();
            app.dialog()
                .message(&message)
                .title("卸载 Maa Verge")
                .kind(MessageDialogKind::Error)
                .show(move |_| recover.restart());
            return Err(message);
        }
        lifecycle.finish_exit();
        app.exit(0);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uninstall_only_accepts_the_fixed_application_executable() {
        assert_eq!(
            bundle_for(Path::new("/test/Maa Verge.app/Contents/MacOS/maaverge")).unwrap(),
            Path::new("/test/Maa Verge.app")
        );
        for path in [
            "/test/maaverge",
            "/test/other/Contents/MacOS/maaverge",
            "/test/Maa Verge.app/Contents/Resources/maaverge",
            "/test/Maa Verge.app/Contents/MacOS/other",
        ] {
            assert!(bundle_for(Path::new(path)).is_err(), "{path}");
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn uninstall_reports_partial_cleanup_and_rejects_unconfirmed_results() {
        use std::os::unix::process::ExitStatusExt;
        let output = |code, json: &str| std::process::Output {
            status: std::process::ExitStatus::from_raw(code),
            stdout: json.as_bytes().to_vec(),
            stderr: vec![],
        };
        assert!(helper_result(&output(0, r#"{"ok":true,"movedPaths":[]}"#)).is_ok());
        assert!(helper_result(&output(0, "unconfirmed")).is_err());
        assert!(helper_result(&output(256, r#"{"ok":true}"#)).is_err());
        let error = helper_result(&output(
            256,
            r#"{"ok":false,"message":"synthetic failure","movedPaths":["/test/MaaCore"]}"#,
        ))
        .unwrap_err();
        assert!(error.contains("synthetic failure"));
        assert!(error.contains("/test/MaaCore"));
    }
}
