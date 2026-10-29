//! Bun owns all update HTTP requests. Only validated bytes cross back into the
//! desktop's signature and durable-installation boundary.
use super::{
    cache_directory, select_release, AppUpdater, Candidate, Release, State, MAX_PACKAGE, MAX_PAGES,
};
use crate::runtime::Runtime;
use serde_json::{json, Value};
use std::fs::{self, File};
use std::future::Future;
use std::io::Read;
use std::path::Path;
use std::time::Duration;
use tauri::Manager;

const MAX_WIRE_METADATA: usize = 3 * 1024 * 1024;

fn operation_id(generation: u64) -> String {
    format!("app-{}-{generation}", std::process::id())
}

fn apply_progress(state: &mut State, value: &Value) -> bool {
    let Some(progress) = value["progress"].as_u64().filter(|value| *value <= 90) else {
        return false;
    };
    let Some(fields) = value.as_object() else {
        return false;
    };
    let speed = value.get("downloadSpeedBytesPerSecond");
    let current = state.value["progress"].as_u64().unwrap_or_default();
    // A server can ignore Range after reconnecting. Keep displayed progress
    // monotonic while still accepting the new transfer's measured speed.
    let next = current.max(progress);
    if fields.keys().any(|key| {
        !matches!(
            key.as_str(),
            "operationId" | "progress" | "downloadSpeedBytesPerSecond"
        )
    }) || speed.is_some_and(|speed| {
        speed
            .as_f64()
            .is_none_or(|speed| !speed.is_finite() || speed < 0.0)
    }) || value["operationId"].as_str() != Some(operation_id(state.generation).as_str())
        || state.value["status"] != "downloading"
        || current >= 95
        || (current == next && state.value.get("downloadSpeedBytesPerSecond") == speed)
    {
        return false;
    }
    state.value["progress"] = json!(next);
    if let Some(speed) = speed {
        state.value["downloadSpeedBytesPerSecond"] = speed.clone();
    } else {
        state
            .value
            .as_object_mut()
            .expect("app updater value")
            .remove("downloadSpeedBytesPerSecond");
    }
    true
}

async fn wait_for_host<F, C, A, R>(request: F, current: C, cancel: A) -> Result<Value, String>
where
    F: Future<Output = Result<Value, String>>,
    C: Fn() -> Result<(), String>,
    A: FnOnce() -> R,
    R: Future<Output = ()>,
{
    tokio::pin!(request);
    let result = loop {
        if let Err(error) = current() {
            break Err(error);
        }
        if let Ok(result) = tokio::time::timeout(Duration::from_millis(200), request.as_mut()).await
        {
            break result.and_then(|value| current().map(|()| value));
        }
    };
    if result.is_err() {
        cancel().await;
    }
    result
}

fn hex_digest(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn read_package(result: &Value, expected_size: u64, directory: &Path) -> Result<Vec<u8>, String> {
    if result.as_object().is_none_or(|value| value.len() != 3)
        || expected_size == 0
        || expected_size > MAX_PACKAGE
        || result["size"].as_u64() != Some(expected_size)
        || !result["sha256"].as_str().is_some_and(hex_digest)
    {
        return Err("应用更新下载结果无效".into());
    }
    let path = result["path"]
        .as_str()
        .map(Path::new)
        .ok_or("应用更新下载路径无效")?;
    if !path.is_absolute()
        || !path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.strip_suffix(".bin").is_some_and(hex_digest))
        || path
            .parent()
            .map(fs::canonicalize)
            .transpose()
            .map_err(|error| error.to_string())?
            != Some(fs::canonicalize(directory).map_err(|error| error.to_string())?)
    {
        return Err("应用更新下载文件不在专用缓存目录内".into());
    }
    let metadata = fs::symlink_metadata(path).map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.len() != expected_size {
        return Err("应用更新下载文件类型或大小无效".into());
    }
    let mut bytes = Vec::new();
    let read =
        File::open(path).and_then(|file| file.take(expected_size + 1).read_to_end(&mut bytes));
    // This complete transport artifact is never the installable package. Rust
    // independently verifies and commits it using the existing durable cache.
    let removed = fs::remove_file(path);
    read.map_err(|error| format!("无法读取应用更新下载文件：{error}"))?;
    removed.map_err(|error| format!("无法清理应用更新下载文件：{error}"))?;
    if bytes.len() as u64 != expected_size {
        return Err("应用更新下载文件大小已改变".into());
    }
    Ok(bytes)
}

impl AppUpdater {
    pub fn host_progress(&self, payload: &Value) {
        let value = {
            let mut state = self.state.lock().expect("app updater state");
            if !apply_progress(&mut state, payload) {
                return;
            }
            state.value.clone()
        };
        self.emit(value);
    }

    pub(super) fn transport_current(&self, generation: u64) -> Result<(), String> {
        if self.state.lock().expect("app updater state").generation != generation {
            return Err("应用更新通道已切换，已取消旧通道请求".into());
        }
        if self
            .app
            .try_state::<crate::DesktopLifecycle>()
            .is_some_and(|state| state.exiting())
        {
            return Err("应用正在退出，已取消应用更新请求".into());
        }
        Ok(())
    }

    pub(super) async fn host_request(
        &self,
        generation: u64,
        mut params: Value,
    ) -> Result<Value, String> {
        self.transport_current(generation)?;
        let metadata = params["operation"] != "download";
        let runtime = self.app.try_state::<Runtime>().ok_or("本地服务尚未启动")?;
        let id = operation_id(generation);
        params["operationId"] = json!(id);
        let value = wait_for_host(
            runtime.request("host.updates".into(), params),
            || self.transport_current(generation),
            || async {
                let cancellation = runtime.request(
                    "host.updates".into(),
                    json!({
                        "operation": "cancel", "operationId": id
                    }),
                );
                let _ = tokio::time::timeout(Duration::from_secs(5), cancellation).await;
            },
        )
        .await?;
        if metadata
            && serde_json::to_vec(&value)
                .map_err(|error| error.to_string())?
                .len()
                > MAX_WIRE_METADATA
        {
            return Err("应用更新元数据超出传输限制".into());
        }
        Ok(value)
    }

    pub(super) async fn latest_release(
        &self,
        generation: u64,
        channel: &str,
    ) -> Result<Option<Release>, String> {
        let mut releases = Vec::new();
        for page in 1..=MAX_PAGES {
            let json = self
                .host_request(generation, json!({ "operation": "releases", "page": page }))
                .await?;
            let items = json.as_array().ok_or("GitHub 应用发行列表格式错误")?;
            releases.extend(items.iter().cloned());
            if items.len() < 100 {
                return Ok(select_release(&releases, channel));
            }
        }
        Err("应用发行列表超过安全查询上限，无法确定最新版本".into())
    }

    pub(super) async fn download_package(
        &self,
        generation: u64,
        candidate: &Candidate,
    ) -> Result<Vec<u8>, String> {
        let url = &candidate.update.download_url;
        let name = url
            .path_segments()
            .and_then(|mut parts| parts.next_back())
            .ok_or("应用更新包文件名无效")?;
        let mut params = json!({
            "operation": "download", "tag": candidate.metadata["release"]["tag_name"],
            "version": candidate.update.version, "name": name, "size": candidate.size
        });
        if let Some(digest) = candidate.metadata["release"]["assets"]
            .as_array()
            .and_then(|assets| {
                assets
                    .iter()
                    .find(|asset| asset["browser_download_url"].as_str() == Some(url.as_str()))
            })
            .and_then(|asset| asset.get("digest"))
            .filter(|digest| !digest.is_null())
        {
            params["digest"] = digest.clone();
        }
        let result = self.host_request(generation, params).await?;
        let directory = cache_directory()?.join("downloads");
        let size = candidate.size;
        tauri::async_runtime::spawn_blocking(move || read_package(&result, size, &directory))
            .await
            .map_err(|error| error.to_string())?
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};

    fn state() -> State {
        State {
            channel: "stable".into(),
            automatic: false,
            generation: 3,
            value: json!({ "status": "downloading", "progress": 0 }),
            candidate: None,
        }
    }

    #[test]
    fn host_progress_is_bound_to_active_download_and_generation() {
        let mut state = state();
        let payload = json!({ "operationId": operation_id(3), "progress": 25 });
        assert!(apply_progress(&mut state, &payload));
        assert!(!apply_progress(&mut state, &payload));
        for payload in [
            json!({ "operationId": operation_id(2), "progress": 50 }),
            json!({ "operationId": operation_id(3), "progress": 91 }),
            json!({ "operationId": operation_id(3), "progress": 50.5 }),
            json!({ "operationId": operation_id(3), "progress": 50, "extra": true }),
        ] {
            assert!(!apply_progress(&mut state, &payload));
        }
        state.value["status"] = json!("staged");
        assert!(!apply_progress(
            &mut state,
            &json!({ "operationId": operation_id(3), "progress": 60 })
        ));
    }

    #[test]
    fn download_speed_can_change_without_advancing_percent_and_is_validated() {
        let mut state = state();
        let payload = json!({ "operationId": operation_id(3), "progress": 25,
            "downloadSpeedBytesPerSecond": 1_048_576 });
        assert!(apply_progress(&mut state, &payload));
        assert_eq!(state.value["downloadSpeedBytesPerSecond"], 1_048_576);
        assert!(!apply_progress(&mut state, &payload));
        let slower = json!({ "operationId": operation_id(3), "progress": 25,
            "downloadSpeedBytesPerSecond": 512.5 });
        assert!(apply_progress(&mut state, &slower));
        assert_eq!(state.value["downloadSpeedBytesPerSecond"], 512.5);
        for speed in [json!(-1), json!("512"), Value::Null, json!(true)] {
            let invalid = json!({ "operationId": operation_id(3), "progress": 30,
                "downloadSpeedBytesPerSecond": speed });
            assert!(!apply_progress(&mut state, &invalid));
            assert_eq!(state.value["progress"], 25);
        }
        assert!(apply_progress(
            &mut state,
            &json!({ "operationId": operation_id(3), "progress": 25 })
        ));
        assert!(state.value.get("downloadSpeedBytesPerSecond").is_none());
        assert!(apply_progress(
            &mut state,
            &json!({ "operationId": operation_id(3), "progress": 30,
                "downloadSpeedBytesPerSecond": 0 })
        ));
        assert_eq!(state.value["downloadSpeedBytesPerSecond"], 0);
    }

    #[test]
    fn download_speed_is_cleared_when_transfer_finishes_or_changes_state() {
        for (status, progress) in [
            ("downloading", 95),
            ("staged", 100),
            ("failed", 0),
            ("checking", 0),
        ] {
            let mut state = state();
            state.value["downloadSpeedBytesPerSecond"] = json!(1024);
            state.value["status"] = json!(status);
            state.value["progress"] = json!(progress);
            state.clear_inactive_download_speed();
            assert!(state.value.get("downloadSpeedBytesPerSecond").is_none());
        }
    }

    #[test]
    fn restarted_transfers_refresh_speed_without_rewinding_or_reopening_verification() {
        let mut state = state();
        state.value["progress"] = json!(60);
        for (progress, speed) in [(0, 0), (25, 1024)] {
            assert!(apply_progress(
                &mut state,
                &json!({ "operationId": operation_id(3), "progress": progress,
                    "downloadSpeedBytesPerSecond": speed })
            ));
            assert_eq!(state.value["progress"], 60);
            assert_eq!(state.value["downloadSpeedBytesPerSecond"], speed);
        }
        let cleared = json!({ "operationId": operation_id(3), "progress": 25 });
        assert!(apply_progress(&mut state, &cleared));
        assert_eq!(state.value["progress"], 60);
        assert!(state.value.get("downloadSpeedBytesPerSecond").is_none());
        assert!(!apply_progress(&mut state, &cleared));

        state.value["progress"] = json!(95);
        for payload in [
            cleared,
            json!({ "operationId": operation_id(3), "progress": 90,
                "downloadSpeedBytesPerSecond": 2048 }),
        ] {
            assert!(!apply_progress(&mut state, &payload));
            assert_eq!(state.value["progress"], 95);
            assert!(state.value.get("downloadSpeedBytesPerSecond").is_none());
        }
    }

    #[test]
    fn generation_invalidation_cancels_a_waiting_host_request() {
        tauri::async_runtime::block_on(async {
            let active = AtomicBool::new(true);
            let cancelled = AtomicBool::new(false);
            let result = wait_for_host(
                async {
                    tokio::time::sleep(Duration::from_millis(10)).await;
                    active.store(false, Ordering::Release);
                    std::future::pending().await
                },
                || {
                    active
                        .load(Ordering::Acquire)
                        .then_some(())
                        .ok_or_else(|| "changed".into())
                },
                || async {
                    cancelled.store(true, Ordering::Release);
                },
            )
            .await;
            assert_eq!(result.unwrap_err(), "changed");
            assert!(cancelled.load(Ordering::Acquire));
        });
    }

    #[test]
    fn host_failure_or_deadline_always_requests_cancellation() {
        tauri::async_runtime::block_on(async {
            let cancelled = AtomicBool::new(false);
            let result = wait_for_host(
                async { Err("timeout".into()) },
                || Ok(()),
                || async {
                    cancelled.store(true, Ordering::Release);
                },
            )
            .await;
            assert_eq!(result.unwrap_err(), "timeout");
            assert!(cancelled.load(Ordering::Acquire));
        });
    }

    #[test]
    fn completed_downloads_are_confined_bounded_and_consumed() {
        let directory = std::env::temp_dir().join(format!(
            "maaverge-app-transport-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let downloads = directory.join("downloads");
        fs::create_dir_all(&downloads).unwrap();
        let path = downloads.join(format!("{}.bin", "a".repeat(64)));
        fs::write(&path, b"test").unwrap();
        let result = json!({ "path": path, "size": 4, "sha256": "b".repeat(64) });
        assert!(read_package(&result, 5, &downloads).is_err());
        let mut bad = result.clone();
        bad["path"] = json!(directory.join(format!("{}.bin", "a".repeat(64))));
        fs::write(bad["path"].as_str().unwrap(), b"test").unwrap();
        assert!(read_package(&bad, 4, &downloads).is_err());
        assert!(Path::new(bad["path"].as_str().unwrap()).is_file());
        let invalid = downloads.join("invalid.bin");
        fs::write(&invalid, b"test").unwrap();
        bad["path"] = json!(invalid);
        assert!(read_package(&bad, 4, &downloads).is_err());
        fs::remove_file(&path).unwrap();
        fs::create_dir(&path).unwrap();
        assert!(read_package(&result, 4, &downloads).is_err());
        fs::remove_dir(&path).unwrap();
        fs::write(&path, b"oversized").unwrap();
        assert!(read_package(&result, 4, &downloads).is_err());
        fs::write(&path, b"test").unwrap();
        assert_eq!(read_package(&result, 4, &downloads).unwrap(), b"test");
        assert!(!path.exists());
        fs::remove_dir_all(directory).unwrap();
    }
}
