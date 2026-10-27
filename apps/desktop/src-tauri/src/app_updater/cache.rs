//! A committed manifest is the only entry point to an immutable downloaded package.
//! Write and sync the bytes first; an interrupted download never becomes installable.
use serde_json::Value;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub(super) struct Cache {
    directory: PathBuf,
}

fn regular_file(path: &Path, limit: u64) -> Result<File, String> {
    let metadata = fs::symlink_metadata(path).map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.len() > limit {
        return Err("应用更新缓存文件类型或大小无效".into());
    }
    File::open(path).map_err(|error| error.to_string())
}

fn package_name(value: &Value) -> Result<&str, String> {
    value["package"]
        .as_str()
        .filter(|name| {
            name.starts_with("package-")
                && name.ends_with(".bin")
                && name.len() < 100
                && name
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || b"-.".contains(&byte))
        })
        .ok_or_else(|| "应用更新缓存包名无效".into())
}

impl Cache {
    pub(super) fn new(directory: PathBuf) -> Self {
        Self { directory }
    }

    fn publish(&self, value: &Value) -> Result<(), String> {
        let bytes = serde_json::to_vec(value).map_err(|error| error.to_string())?;
        if bytes.len() > super::MAX_METADATA {
            return Err("应用更新缓存元数据超出限制".into());
        }
        let temporary = self.directory.join("pending.json.tmp");
        // Never truncate a link left in place of a temporary file.
        match fs::remove_file(&temporary) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|error| error.to_string())?;
        file.write_all(&bytes)
            .and_then(|()| file.sync_all())
            .map_err(|error| error.to_string())?;
        drop(file);
        fs::rename(temporary, self.directory.join("pending.json"))
            .map_err(|error| error.to_string())?;
        #[cfg(unix)]
        File::open(&self.directory)
            .and_then(|file| file.sync_all())
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub(super) fn stage(&self, metadata: &Value, bytes: &[u8]) -> Result<(), String> {
        fs::create_dir_all(&self.directory).map_err(|error| error.to_string())?;
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_nanos();
        let name = format!("package-{}-{nonce}.bin", std::process::id());
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(self.directory.join(&name))
            .map_err(|error| error.to_string())?;
        file.write_all(bytes)
            .and_then(|()| file.sync_all())
            .map_err(|error| error.to_string())?;
        drop(file);
        let mut value = metadata.clone();
        value["package"] = Value::String(name.clone());
        value["attempted"] = Value::Bool(false);
        if let Err(error) = self.publish(&value) {
            let _ = fs::remove_file(self.directory.join(&name));
            return Err(error);
        }
        self.clean_packages(Some(&name));
        Ok(())
    }

    pub(super) fn load(&self) -> Result<Option<(Value, Vec<u8>)>, String> {
        let manifest = self.directory.join("pending.json");
        if !manifest.try_exists().map_err(|error| error.to_string())? {
            return Ok(None);
        }
        let mut text = String::new();
        regular_file(&manifest, super::MAX_METADATA as u64)?
            .take(super::MAX_METADATA as u64 + 1)
            .read_to_string(&mut text)
            .map_err(|error| error.to_string())?;
        if text.len() > super::MAX_METADATA {
            return Err("应用更新缓存元数据超出限制".into());
        }
        let value: Value = serde_json::from_str(&text).map_err(|error| error.to_string())?;
        let name = package_name(&value)?;
        let mut bytes = Vec::new();
        regular_file(&self.directory.join(name), super::MAX_PACKAGE)?
            .take(super::MAX_PACKAGE + 1)
            .read_to_end(&mut bytes)
            .map_err(|error| error.to_string())?;
        if bytes.len() as u64 > super::MAX_PACKAGE {
            return Err("应用更新缓存包超出限制".into());
        }
        Ok(Some((value, bytes)))
    }

    pub(super) fn mark_attempted(&self) -> Result<(), String> {
        self.set_attempted(true)
    }

    pub(super) fn schedule(&self) -> Result<(), String> {
        self.set_attempted(false)
    }

    fn set_attempted(&self, attempted: bool) -> Result<(), String> {
        let manifest = self.directory.join("pending.json");
        let file = regular_file(&manifest, super::MAX_METADATA as u64)?;
        let mut value: Value = serde_json::from_reader(file).map_err(|error| error.to_string())?;
        package_name(&value)?;
        value["attempted"] = Value::Bool(attempted);
        self.publish(&value)
    }

    pub(super) fn discard(&self) -> Result<(), String> {
        match fs::remove_file(self.directory.join("pending.json")) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
        self.clean_packages(None);
        Ok(())
    }

    fn clean_packages(&self, keep: Option<&str>) {
        let Ok(entries) = fs::read_dir(&self.directory) else {
            return;
        };
        for entry in entries.flatten() {
            let name = entry.file_name();
            let Some(name) = name.to_str() else { continue };
            if Some(name) != keep && package_name(&serde_json::json!({"package": name})).is_ok() {
                // remove_file never recursively follows a directory or a link.
                let _ = fs::remove_file(entry.path());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(0);

    fn fixture() -> Cache {
        Cache::new(std::env::temp_dir().join(format!(
                "maaverge-app-cache-{}-{}-{}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos(),
                NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed)
            )))
    }

    #[test]
    fn restart_keeps_verified_bytes_and_attempt_marker_until_success() {
        let cache = fixture();
        assert!(cache.load().unwrap().is_none());
        cache
            .stage(&json!({"version": "0.2.0"}), b"synthetic signed bytes")
            .unwrap();
        let restarted = Cache::new(cache.directory.clone());
        let (record, bytes) = restarted.load().unwrap().unwrap();
        assert_eq!(record["attempted"], false);
        assert_eq!(bytes, b"synthetic signed bytes");
        restarted.mark_attempted().unwrap();
        assert_eq!(cache.load().unwrap().unwrap().0["attempted"], true);
        assert_eq!(cache.load().unwrap().unwrap().1, bytes);
        // Explicit deferral can schedule one new automatic try after failure.
        cache.schedule().unwrap();
        let (scheduled, scheduled_bytes) = cache.load().unwrap().unwrap();
        assert_eq!(scheduled["attempted"], false);
        assert_eq!(scheduled["package"], record["package"]);
        assert_eq!(scheduled_bytes, bytes);
        cache.discard().unwrap();
        assert!(cache.load().unwrap().is_none());
        fs::remove_dir_all(cache.directory).unwrap();
    }

    #[test]
    fn uncommitted_files_do_not_replace_a_ready_package() {
        let cache = fixture();
        cache.stage(&json!({"version": "0.2.0"}), b"ready").unwrap();
        fs::write(
            cache.directory.join("package-interrupted.bin"),
            b"incomplete",
        )
        .unwrap();
        fs::write(cache.directory.join("pending.json.tmp"), b"{").unwrap();
        assert_eq!(cache.load().unwrap().unwrap().1, b"ready");
        cache
            .stage(&json!({"version": "0.3.0"}), b"new ready")
            .unwrap();
        assert_eq!(cache.load().unwrap().unwrap().1, b"new ready");
        assert!(!cache.directory.join("package-interrupted.bin").exists());
        fs::remove_dir_all(cache.directory).unwrap();
    }

    #[test]
    fn missing_corrupt_and_escaping_cache_entries_are_rejected() {
        let cache = fixture();
        cache.stage(&json!({}), b"bytes").unwrap();
        for contents in [
            "{",
            "{\"package\":\"../outside.bin\"}",
            "{\"package\":\"package-missing.bin\"}",
        ] {
            fs::write(cache.directory.join("pending.json"), contents).unwrap();
            assert!(cache.load().is_err());
        }
        cache.discard().unwrap();
        fs::remove_dir_all(cache.directory).unwrap();
    }
}
