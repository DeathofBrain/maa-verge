//! Explicit application attribution avoids the dependency's PowerShell/Terminal defaults.
use std::sync::OnceLock;
use tauri::{AppHandle, Manager};

const APPLICATION_NAME: &str = "Maa Verge";
struct Identity {
    #[cfg(windows)]
    identifier: String,
    #[cfg(not(target_os = "macos"))]
    icon: std::path::PathBuf,
}
static IDENTITY: OnceLock<Result<Identity, String>> = OnceLock::new();

#[cfg(not(windows))]
fn notification(identifier: &str, title: &str, body: &str) -> notify_rust::Notification {
    let mut notice = notify_rust::Notification::new();
    notice.appname(APPLICATION_NAME).summary(title).body(body);
    let _ = identifier;
    notice
}

#[cfg(not(target_os = "macos"))]
fn cache_icon(directory: &std::path::Path, bytes: &[u8]) -> std::io::Result<std::path::PathBuf> {
    use std::fs::{self, OpenOptions};
    use std::hash::{DefaultHasher, Hash, Hasher};
    use std::io::Write;
    use std::time::{SystemTime, UNIX_EPOCH};

    let mut hash = DefaultHasher::new();
    bytes.hash(&mut hash);
    // Keep immutable files outside the install/config roots: the OS can read
    // queued notifications after an update, config switch or application exit.
    let icon = directory.join(format!("maa-verge-{:016x}.png", hash.finish()));
    if fs::read(&icon).is_ok_and(|cached| cached == bytes) {
        return Ok(icon);
    }
    fs::create_dir_all(directory)?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temporary = directory.join(format!(".icon-{}-{nonce}.tmp", std::process::id()));
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        match fs::rename(&temporary, &icon) {
            Ok(()) => Ok(()),
            // Another process may have published the same embedded asset.
            Err(_) if fs::read(&icon).is_ok_and(|cached| cached == bytes) => Ok(()),
            Err(error) => Err(error),
        }
    })();
    let _ = fs::remove_file(temporary);
    result?;
    Ok(icon)
}

fn prepare_identity(app: &AppHandle) -> Result<&'static Identity, String> {
    IDENTITY
        .get_or_init(|| {
            #[cfg(not(target_os = "macos"))]
            let directory = app
                .path()
                .app_local_data_dir()
                .map_err(|error| error.to_string())?
                .join("notification-icons");
            #[cfg(not(target_os = "macos"))]
            let icon = cache_icon(&directory, include_bytes!("../icons/256x256.png"))
                .map_err(|error| format!("无法准备 Maa Verge 通知图标：{error}"))?;
            #[cfg(windows)]
            // Windows caches attribution assets for an AUMID. Use one stable
            // notification identity whose first registration has a real image,
            // instead of reusing the old app identity cached with an EXE icon.
            let identifier = format!("{}.notifications", app.config().identifier);
            #[cfg(windows)]
            {
                // The attribution area is controlled by the sender identity,
                // independently of the larger appLogoOverride content image.
                let sender_icon = cache_icon(&directory, include_bytes!("../icons/32x32.png"))
                    .map_err(|error| format!("无法准备 Maa Verge 发送者图标：{error}"))?;
                windows_identity::register(&identifier, APPLICATION_NAME, &sender_icon)?;
            }
            #[cfg(target_os = "macos")]
            notify_rust::set_application(&app.config().identifier).map_err(|error| {
                format!("无法使用 Maa Verge 应用身份发送通知，请使用应用包启动：{error}")
            })?;
            Ok(Identity {
                #[cfg(windows)]
                identifier,
                #[cfg(not(target_os = "macos"))]
                icon,
            })
        })
        .as_ref()
        .map_err(Clone::clone)
}

pub fn show(app: &AppHandle, title: &str, body: &str) -> Result<(), String> {
    let identity = prepare_identity(app)?;
    if app
        .try_state::<crate::DesktopLifecycle>()
        .is_some_and(|lifecycle| lifecycle.exiting())
    {
        return Err("应用正在退出，已停止发送通知".into());
    }
    #[cfg(windows)]
    {
        use tauri_winrt_notification::{Duration, IconCrop, Toast};
        // notify-rust's Windows adapter ignores Notification::icon. Set the
        // app logo explicitly, in addition to the sender's registered IconUri.
        // Toast::icon prepends file:/// itself; escape URI delimiters while
        // keeping the registry's IconUri as the original filesystem path.
        let icon_uri_path = identity
            .icon
            .to_string_lossy()
            .replace('%', "%25")
            .replace('#', "%23");
        Toast::new(&identity.identifier)
            .title(title)
            .text1(body)
            .icon(
                std::path::Path::new(&icon_uri_path),
                IconCrop::Square,
                APPLICATION_NAME,
            )
            .sound(None)
            .duration(Duration::Short)
            .show()
            .map_err(|error| error.to_string())
    }
    #[cfg(not(windows))]
    {
        let notice = notification(&app.config().identifier, title, body);
        #[cfg(not(target_os = "macos"))]
        let notice = {
            let mut notice = notice;
            notice.icon(&identity.icon.to_string_lossy());
            notice
        };
        // macOS gets its icon from the application bundle selected above.
        #[cfg(target_os = "macos")]
        let _ = identity;
        notice
            .show()
            .map(|_handle| ())
            .map_err(|error| error.to_string())
    }
}

#[cfg(windows)]
mod windows_identity {
    use std::ffi::c_void;
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;

    type KeyHandle = *mut c_void;

    #[link(name = "advapi32")]
    unsafe extern "system" {
        fn RegCreateKeyExW(
            key: KeyHandle,
            subkey: *const u16,
            reserved: u32,
            class: *mut u16,
            options: u32,
            access: u32,
            security: *const c_void,
            result: *mut KeyHandle,
            disposition: *mut u32,
        ) -> i32;
        fn RegSetValueExW(
            key: KeyHandle,
            name: *const u16,
            reserved: u32,
            kind: u32,
            data: *const u8,
            size: u32,
        ) -> i32;
        fn RegCloseKey(key: KeyHandle) -> i32;
    }

    struct Key(KeyHandle);
    impl Drop for Key {
        fn drop(&mut self) {
            // SAFETY: RegCreateKeyExW returned this owned registry handle.
            unsafe { RegCloseKey(self.0) };
        }
    }
    fn result(status: i32) -> Result<(), String> {
        if status == 0 {
            Ok(())
        } else {
            Err(format!(
                "无法注册 Maa Verge 通知身份：{}",
                std::io::Error::from_raw_os_error(status)
            ))
        }
    }
    fn terminated(value: &std::ffi::OsStr) -> Vec<u16> {
        value.encode_wide().chain(std::iter::once(0)).collect()
    }
    impl Key {
        fn string(&self, name: &str, value: &std::ffi::OsStr, kind: u32) -> Result<(), String> {
            let name = terminated(name.as_ref());
            let value = terminated(value);
            let size = u32::try_from(value.len() * std::mem::size_of::<u16>())
                .map_err(|_| "通知身份路径过长")?;
            // SAFETY: Owned key, valid NUL-terminated UTF-16 buffers and exact
            // byte count; the registry copies the value before returning.
            result(unsafe {
                RegSetValueExW(self.0, name.as_ptr(), 0, kind, value.as_ptr().cast(), size)
            })
        }
    }
    pub fn register(identifier: &str, name: &str, icon: &Path) -> Result<(), String> {
        // Deriving a stable notification ID from the Tauri identifier keeps
        // development checkouts isolated and gives portable builds a sender.
        let subkey =
            terminated(format!("Software\\Classes\\AppUserModelId\\{identifier}").as_ref());
        let mut handle = std::ptr::null_mut();
        // SAFETY: HKEY_CURRENT_USER is a documented predefined handle, buffers
        // live through the call, and KEY_SET_VALUE grants only the required access.
        result(unsafe {
            RegCreateKeyExW(
                (-2147483647_isize) as KeyHandle,
                subkey.as_ptr(),
                0,
                std::ptr::null_mut(),
                0,
                0x0002,
                std::ptr::null(),
                &mut handle,
                std::ptr::null_mut(),
            )
        })?;
        let key = Key(handle);
        // Match Windows App SDK's REG_EXPAND_SZ display assets. Keep literal
        // percent signs in paths from being interpreted as environment names.
        let icon = icon.as_os_str();
        let expand = !icon.to_string_lossy().contains('%');
        key.string("DisplayName", name.as_ref(), 2)?;
        key.string("IconBackgroundColor", "00000000".as_ref(), 1)?;
        key.string("IconUri", icon, if expand { 2 } else { 1 })
    }
}

#[cfg(all(test, not(windows)))]
mod tests {
    use super::*;

    #[test]
    fn sender_metadata_uses_the_app_instead_of_the_executable_or_launcher() {
        let notice = notification(
            "io.maaverge.desktop",
            "synthetic title",
            "synthetic message",
        );
        assert_eq!(notice.appname, APPLICATION_NAME);
    }
}
