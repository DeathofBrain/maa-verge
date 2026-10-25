use tauri_plugin_opener::OpenerExt;

fn webpage_url(value: &str) -> Result<String, String> {
    const INVALID: &str = "仅支持不含账号信息的 HTTP(S) 网页链接。";
    if value.len() > 2048 || value.chars().any(char::is_control) {
        return Err(INVALID.into());
    }
    let url = reqwest::Url::parse(value).map_err(|_| INVALID.to_string())?;
    if !matches!(url.scheme(), "https" | "http")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(INVALID.into());
    }
    Ok(url.into())
}

#[tauri::command]
pub async fn open_external_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let url = webpage_url(&url)?;
    // The UI supplies a webpage, never a program, shell command or opener name.
    tauri::async_runtime::spawn_blocking(move || app.opener().open_url(url, None::<&str>))
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::webpage_url;

    #[test]
    fn accepts_web_links_and_preserves_video_query_and_fragment() {
        let url = "https://www.bilibili.com/video/BV1example/?p=2&from=search#reply";
        assert_eq!(webpage_url(url).unwrap(), url);
        assert_eq!(
            webpage_url("http://example.com").unwrap(),
            "http://example.com/"
        );
    }

    #[test]
    fn rejects_non_web_schemes_credentials_and_malformed_links() {
        for value in [
            "javascript:alert(1)",
            "data:text/html,example",
            "file:///C:/Windows/System32/calc.exe",
            "mailto:someone@example.com",
            "cmd://example",
            "//example.com/video",
            "https://user:password@example.com/video",
            "https://user@example.com/video",
            "https://example.com/\nvideo",
            "not a URL",
            "",
        ] {
            assert!(webpage_url(value).is_err(), "accepted {value}");
        }
        assert!(webpage_url(&format!("https://example.com/{}", "x".repeat(2048))).is_err());
    }
}
