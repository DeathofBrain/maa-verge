//! Explicit application attribution avoids the dependency's PowerShell/Terminal defaults.
use std::sync::OnceLock;
use tauri::{AppHandle, Manager};

const APPLICATION_NAME: &str = "Maa Verge";
static IDENTITY: OnceLock<Result<(), String>> = OnceLock::new();

fn notification(identifier: &str, title: &str, body: &str) -> notify_rust::Notification {
    let mut notice = notify_rust::Notification::new();
    notice.appname(APPLICATION_NAME).summary(title).body(body);
    #[cfg(windows)]
    notice.app_id(identifier);
    #[cfg(not(windows))]
    let _ = identifier;
    notice
}

fn prepare_identity(app: &AppHandle) -> Result<(), String> {
    IDENTITY
        .get_or_init(|| {
            #[cfg(windows)]
            windows_identity::register(
                &app.config().identifier,
                APPLICATION_NAME,
                &std::env::current_exe().map_err(|error| error.to_string())?,
            )?;
            #[cfg(target_os = "macos")]
            notify_rust::set_application(&app.config().identifier).map_err(|error| {
                format!("无法使用 Maa Verge 应用身份发送通知，请使用应用包启动：{error}")
            })?;
            #[cfg(not(any(windows, target_os = "macos")))]
            let _ = app;
            Ok(())
        })
        .clone()
}

pub fn show(app: &AppHandle, title: &str, body: &str) -> Result<(), String> {
    prepare_identity(app)?;
    if app
        .try_state::<crate::DesktopLifecycle>()
        .is_some_and(|lifecycle| lifecycle.exiting())
    {
        return Err("应用正在退出，已停止发送通知".into());
    }
    notification(&app.config().identifier, title, body)
        .show()
        .map(|_handle| ())
        .map_err(|error| error.to_string())
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
        fn string(&self, name: &str, value: &std::ffi::OsStr) -> Result<(), String> {
            let name = terminated(name.as_ref());
            let value = terminated(value);
            let size = u32::try_from(value.len() * std::mem::size_of::<u16>())
                .map_err(|_| "通知身份路径过长")?;
            // SAFETY: Owned key, valid NUL-terminated UTF-16 buffers and exact
            // byte count; REG_SZ copies the value before returning.
            result(unsafe {
                RegSetValueExW(self.0, name.as_ptr(), 0, 1, value.as_ptr().cast(), size)
            })
        }
    }
    pub fn register(identifier: &str, name: &str, executable: &Path) -> Result<(), String> {
        // This fixed app ID matches Tauri's installed shortcut. Registration in
        // HKCU also gives development and portable builds their own sender name.
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
        key.string("DisplayName", name.as_ref())?;
        key.string("IconUri", executable.as_os_str())
    }
}

#[cfg(test)]
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
