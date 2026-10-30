use std::path::Path;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn pick_directory(
    window: tauri::WebviewWindow,
    default_path: Option<String>,
) -> Result<Option<String>, String> {
    let mut dialog = window
        .dialog()
        .file()
        .set_title("选择目录")
        .set_parent(&window);
    if let Some(path) = default_path
        .as_deref()
        .map(str::trim)
        .filter(|path| !path.is_empty())
    {
        let path = Path::new(path);
        if path.is_absolute() {
            if let Some(directory) = path.ancestors().find(|candidate| candidate.is_dir()) {
                dialog = dialog.set_directory(directory);
            }
        }
    }

    // The native callback keeps the UI event loop free while the user chooses.
    // A cancelled picker returns None and never writes application settings.
    let (sender, receiver) = tokio::sync::oneshot::channel();
    dialog.pick_folder(move |selection| {
        let _ = sender.send(selection);
    });
    let selection = receiver
        .await
        .map_err(|_| "目录选择窗口已关闭，请重试".to_string())?;
    selection
        .map(|selection| {
            let path = selection
                .into_path()
                .map_err(|_| "无法读取所选目录".to_string())?;
            dunce::simplified(&path)
                .to_str()
                .map(str::to_owned)
                .ok_or_else(|| "所选目录名称无法转换为文本".to_string())
        })
        .transpose()
}
