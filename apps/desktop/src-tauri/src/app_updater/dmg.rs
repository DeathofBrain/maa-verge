//! Install the signed, unchanged DMG also distributed for first installations.
//! Only the staged app bundle is exchanged; adjacent configuration stays in place.
use semver::Version;
use std::fs;
use std::path::{Path, PathBuf};

const STAGING_PREFIX: &str = ".maaverge-update-";
const RECEIPT: &str = "cleanup.json";

fn staging_name(name: &str) -> bool {
    name.strip_prefix(STAGING_PREFIX)
        .and_then(|name| name.split_once('-'))
        .is_some_and(|(pid, nonce)| {
            !pid.is_empty()
                && !nonce.is_empty()
                && pid.bytes().chain(nonce.bytes()).all(|b| b.is_ascii_digit())
        })
}

fn staging_pid(name: &str) -> Option<u32> {
    name.strip_prefix(STAGING_PREFIX)?
        .split_once('-')?
        .0
        .parse::<u32>()
        .ok()
        .filter(|pid| *pid > 0 && *pid <= i32::MAX as u32)
}

pub(super) fn cleanup_previous(executable: &Path, current: &Version) -> Result<(), String> {
    use std::io::Read;
    let installed = bundle_path(executable)?;
    let parent = installed.parent().ok_or("无法定位应用安装目录")?;
    let entries = fs::read_dir(parent).map_err(|error| error.to_string())?;
    for entry in entries.flatten() {
        let directory = entry.path();
        if !entry.file_name().to_str().is_some_and(staging_name)
            || !fs::symlink_metadata(&directory).is_ok_and(|metadata| metadata.is_dir())
        {
            continue;
        }
        let Some(pid) = entry.file_name().to_str().and_then(staging_pid) else {
            continue;
        };
        let receipt = directory.join(RECEIPT);
        if !fs::symlink_metadata(&receipt)
            .is_ok_and(|metadata| metadata.is_file() && metadata.len() <= 16_384)
        {
            continue;
        }
        let record = fs::File::open(&receipt).and_then(|file| {
            let mut bytes = Vec::new();
            file.take(16_385).read_to_end(&mut bytes)?;
            Ok(bytes)
        });
        let Ok(record) = record else { continue };
        let Ok(record) = serde_json::from_slice::<serde_json::Value>(&record) else {
            continue;
        };
        if record["formatVersion"] != 1
            || record["installation"].as_str() != installed.to_str()
            || record["updaterPid"].as_u64() != Some(pid as u64)
            || record.as_object().is_none_or(|fields| fields.len() != 4)
            || record["targetVersion"]
                .as_str()
                .and_then(|version| Version::parse(version).ok())
                .is_none_or(|version| current.cmp_precedence(&version) == std::cmp::Ordering::Less)
        {
            continue;
        }
        #[cfg(target_os = "macos")]
        if native::process_exists(pid) {
            continue;
        }
        // Entries are direct children of the cached installation parent. The
        // root and receipt are regular, never links; remove_dir_all does not
        // follow links inside the old bundle.
        fs::remove_dir_all(&directory)
            .map_err(|error| format!("无法清理旧应用暂存目录 {}：{error}", directory.display()))?;
    }
    Ok(())
}

fn bundle_path(executable: &Path) -> Result<PathBuf, String> {
    if !super::mac_bundle(executable) || !executable.is_absolute() {
        return Err("DMG 更新仅支持已安装的 macOS 应用包".into());
    }
    Ok(executable.ancestors().nth(3).unwrap().to_path_buf())
}

fn validate_identity(
    identifier: &str,
    version: &str,
    executable: &str,
    architecture: &str,
    expected_version: &str,
    target: &str,
) -> Result<(), String> {
    let expected_arch = match target {
        "darwin-aarch64-dmg" => "arm64",
        "darwin-x86_64-dmg" => "x86_64",
        _ => return Err("DMG 更新的平台目标无效".into()),
    };
    if identifier.trim() != "io.maaverge.desktop"
        || version.trim() != expected_version
        || executable.trim() != "maaverge"
        || architecture.trim() != expected_arch
    {
        return Err("DMG 应用的标识、版本、主程序或架构不匹配".into());
    }
    Ok(())
}

#[cfg(target_os = "macos")]
mod native {
    use super::*;
    use std::ffi::CString;
    use std::io::{Read, Write};
    use std::os::unix::ffi::OsStrExt;
    use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

    const OUTPUT_LIMIT: u64 = 64 * 1024;

    // Drain both pipes concurrently, cap memory, and kill a stalled system tool.
    // Commands use fixed absolute binaries and argv; no shell interprets paths.
    fn command(command: &mut Command, timeout: Duration) -> Result<String, String> {
        let mut child = command
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("无法启动 macOS 更新工具：{error}"))?;
        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();
        let reader = |stream: Box<dyn Read + Send>| {
            let (sender, receiver) = std::sync::mpsc::sync_channel(1);
            std::thread::spawn(move || {
                let mut bytes = Vec::new();
                let result = stream
                    .take(OUTPUT_LIMIT + 1)
                    .read_to_end(&mut bytes)
                    .map(|_| bytes);
                let _ = sender.send(result);
            });
            receiver
        };
        let output = reader(Box::new(stdout));
        let errors = reader(Box::new(stderr));
        let deadline = Instant::now() + timeout;
        let status = loop {
            match child.try_wait() {
                Ok(Some(status)) => break Ok(status),
                Ok(None) if Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(50));
                }
                result => {
                    let _ = child.kill();
                    let _ = child.wait();
                    break Err(match result {
                        Err(error) => format!("macOS 更新工具执行失败：{error}"),
                        _ => "macOS 更新工具超时，已停止本次安装".into(),
                    });
                }
            }
        };
        let collect = |reader: std::sync::mpsc::Receiver<std::io::Result<Vec<u8>>>| -> Result<Vec<u8>, String> {
            let bytes = reader
                .recv_timeout(Duration::from_secs(2))
                .map_err(|_| "macOS 更新工具输出读取失败".to_string())?
                .map_err(|error| error.to_string())?;
            if bytes.len() as u64 > OUTPUT_LIMIT {
                return Err("macOS 更新工具输出超出限制".into());
            }
            Ok(bytes)
        };
        let output = collect(output)?;
        collect(errors)?;
        if !status?.success() {
            return Err("macOS 更新工具未成功完成，原应用与已下载更新包保留".into());
        }
        String::from_utf8(output).map_err(|_| "macOS 更新工具输出无效".into())
    }

    struct Temporary {
        path: PathBuf,
        preserve: bool,
    }

    impl Temporary {
        fn new(parent: &Path) -> Result<Self, String> {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|error| error.to_string())?
                .as_nanos();
            let path = parent.join(format!("{STAGING_PREFIX}{}-{nonce}", std::process::id()));
            fs::DirBuilder::new()
                .mode(0o700)
                .create(&path)
                .map_err(|error| {
                    format!("无法创建更新暂存目录，请检查安装位置写入权限：{error}")
                })?;
            Ok(Self {
                path,
                preserve: false,
            })
        }
    }

    impl Drop for Temporary {
        fn drop(&mut self) {
            if !self.preserve {
                let _ = fs::remove_dir_all(&self.path);
            }
        }
    }

    struct Mounted {
        workspace: Temporary,
        mount: PathBuf,
        detached: bool,
    }

    impl Mounted {
        fn detach(&mut self) -> Result<(), String> {
            command(
                Command::new("/usr/bin/hdiutil")
                    .arg("detach")
                    .arg(&self.mount),
                Duration::from_secs(30),
            )?;
            self.detached = true;
            Ok(())
        }
    }

    impl Drop for Mounted {
        fn drop(&mut self) {
            // Even a failed attach can leave a partial mount. Never recursively
            // clean a directory while it might still contain that mounted image.
            if !self.detached && self.detach().is_err() {
                self.workspace.preserve = true;
                eprintln!(
                    "更新映像未能卸载，已保留暂存目录：{}",
                    self.workspace.path.display()
                );
            }
        }
    }

    fn plist_value(bundle: &Path, key: &str) -> Result<String, String> {
        command(
            Command::new("/usr/libexec/PlistBuddy")
                .arg("-c")
                .arg(format!("Print :{key}"))
                .arg(bundle.join("Contents/Info.plist")),
            Duration::from_secs(10),
        )
    }

    fn exchange(installed: &Path, staged: &Path) -> Result<(), String> {
        unsafe extern "C" {
            fn renamex_np(
                from: *const std::ffi::c_char,
                to: *const std::ffi::c_char,
                flags: u32,
            ) -> i32;
        }
        let from =
            CString::new(staged.as_os_str().as_bytes()).map_err(|error| error.to_string())?;
        let to =
            CString::new(installed.as_os_str().as_bytes()).map_err(|error| error.to_string())?;
        // Darwin's RENAME_SWAP is 0x2. Both paths remain present atomically; an
        // unsupported filesystem leaves the original application untouched.
        // SAFETY: valid NUL-terminated paths outlive the system call.
        if unsafe { renamex_np(from.as_ptr(), to.as_ptr(), 0x2) } != 0 {
            return Err(format!(
                "无法原子替换应用包，原应用已保留，请使用完整安装包手动更新：{}",
                std::io::Error::last_os_error()
            ));
        }
        Ok(())
    }

    pub(super) fn process_exists(pid: u32) -> bool {
        unsafe extern "C" {
            fn kill(pid: i32, signal: i32) -> i32;
        }
        // Signal zero performs existence/permission checks without sending a
        // signal. EPERM also means the old process still exists; skip cleanup.
        (unsafe { kill(pid as i32, 0) }) == 0
            || std::io::Error::last_os_error().raw_os_error() != Some(3)
    }

    pub(crate) fn install(
        executable: &Path,
        data_root: &Path,
        version: &str,
        target: &str,
        bytes: &[u8],
    ) -> Result<(), String> {
        let installed = bundle_path(executable)?;
        let canonical_bundle = fs::canonicalize(&installed).map_err(|error| error.to_string())?;
        let canonical_data = fs::canonicalize(data_root)
            .map_err(|error| format!("无法复核配置目录位置：{error}"))?;
        if canonical_data.starts_with(&canonical_bundle) {
            return Err("配置目录位于应用包内部，请先将配置移出应用包再更新".into());
        }
        if !fs::symlink_metadata(&installed)
            .map_err(|error| error.to_string())?
            .is_dir()
        {
            return Err("应用安装位置不是普通应用包目录".into());
        }
        let workspace = Temporary::new(&std::env::temp_dir())?;
        let image = workspace.path.join("verified.dmg");
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&image)
            .map_err(|error| error.to_string())?;
        file.write_all(bytes)
            .and_then(|()| file.sync_all())
            .map_err(|error| error.to_string())?;
        drop(file);
        let mount = workspace.path.join("mount");
        fs::create_dir(&mount).map_err(|error| error.to_string())?;
        let mut mounted = Mounted {
            workspace,
            mount,
            detached: false,
        };
        command(
            Command::new("/usr/bin/hdiutil")
                .args([
                    "attach",
                    "-readonly",
                    "-nobrowse",
                    "-noautoopen",
                    "-mountpoint",
                ])
                .arg(&mounted.mount)
                .arg(&image),
            Duration::from_secs(60),
        )?;
        let source = mounted.mount.join("Maa Verge.app");
        if !fs::symlink_metadata(&source)
            .map_err(|error| error.to_string())?
            .is_dir()
        {
            return Err("DMG 中缺少普通 Maa Verge.app 应用目录".into());
        }
        let mut staging = Temporary::new(installed.parent().ok_or("无法定位应用安装目录")?)?;
        let updated = staging.path.join("Maa Verge.app");
        command(
            Command::new("/usr/bin/ditto").arg(&source).arg(&updated),
            Duration::from_secs(180),
        )?;
        command(
            Command::new("/usr/bin/codesign")
                .args(["--verify", "--deep", "--strict"])
                .arg(&updated),
            Duration::from_secs(120),
        )?;
        let architecture = command(
            Command::new("/usr/bin/lipo")
                .arg("-archs")
                .arg(updated.join("Contents/MacOS/maaverge")),
            Duration::from_secs(10),
        )?;
        validate_identity(
            &plist_value(&updated, "CFBundleIdentifier")?,
            &plist_value(&updated, "CFBundleShortVersionString")?,
            &plist_value(&updated, "CFBundleExecutable")?,
            &architecture,
            version,
            target,
        )?;
        fs::set_permissions(&updated, fs::Permissions::from_mode(0o755))
            .map_err(|error| error.to_string())?;
        mounted.detach()?;
        // Commit a bounded cleanup receipt before modifying the installation.
        // Startup only consumes it after the target version actually launches.
        let record = serde_json::json!({
            "formatVersion": 1,
            "installation": installed.to_str().ok_or("应用安装路径不是有效 UTF-8")?,
            "targetVersion": version,
            "updaterPid": std::process::id(),
        });
        let mut receipt = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(staging.path.join(RECEIPT))
            .map_err(|error| error.to_string())?;
        receipt
            .write_all(&serde_json::to_vec(&record).map_err(|error| error.to_string())?)
            .and_then(|()| receipt.sync_all())
            .map_err(|error| error.to_string())?;
        drop(receipt);
        fs::File::open(&staging.path)
            .and_then(|file| file.sync_all())
            .map_err(|error| error.to_string())?;
        // Only fixed .app paths are exchanged. The default config/ and its
        // selector live next to this bundle, so neither is copied or removed.
        exchange(&installed, &updated)?;
        // Keep the old bundle until restart/OS cleanup. Deleting it while its
        // executable is running can affect framework lookups in the old process.
        staging.preserve = true;
        if let Err(error) =
            fs::File::open(installed.parent().unwrap()).and_then(|file| file.sync_all())
        {
            eprintln!("应用包已更新，但安装目录同步失败：{error}");
        }
        Ok(())
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn atomic_bundle_exchange_preserves_both_versions() {
            let root = Temporary::new(&std::env::temp_dir()).unwrap();
            let old = root.path.join("installed.app");
            let new = root.path.join("staged.app");
            fs::create_dir(&old).unwrap();
            fs::create_dir(&new).unwrap();
            fs::write(old.join("version"), "old").unwrap();
            fs::write(new.join("version"), "new").unwrap();
            exchange(&old, &new).unwrap();
            assert_eq!(fs::read_to_string(old.join("version")).unwrap(), "new");
            assert_eq!(fs::read_to_string(new.join("version")).unwrap(), "old");
        }

        #[test]
        fn synthetic_dmg_uses_system_tools_and_preserves_data_or_rejects_before_swap() {
            let root = Temporary::new(&std::env::temp_dir()).unwrap();
            let source = root.path.join("image");
            let bundle = source.join("Maa Verge.app");
            let binary = bundle.join("Contents/MacOS/maaverge");
            fs::create_dir_all(binary.parent().unwrap()).unwrap();
            let arch = if cfg!(target_arch = "aarch64") {
                "arm64"
            } else {
                "x86_64"
            };
            let target = if cfg!(target_arch = "aarch64") {
                "darwin-aarch64-dmg"
            } else {
                "darwin-x86_64-dmg"
            };
            let wrong_target = if cfg!(target_arch = "aarch64") {
                "darwin-x86_64-dmg"
            } else {
                "darwin-aarch64-dmg"
            };
            let code = root.path.join("fixture.c");
            fs::write(&code, "int main(void) { return 0; }\n").unwrap();
            command(
                Command::new("/usr/bin/clang")
                    .arg("-arch")
                    .arg(arch)
                    .arg(&code)
                    .arg("-o")
                    .arg(&binary),
                Duration::from_secs(60),
            )
            .unwrap();
            fs::write(bundle.join("Contents/Info.plist"), r#"<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>io.maaverge.desktop</string><key>CFBundleExecutable</key><string>maaverge</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>0.2.0-beta.2</string><key>CFBundleVersion</key><string>0.2.0-beta.2</string></dict></plist>"#).unwrap();
            fs::write(bundle.join("Contents/payload"), "new").unwrap();
            command(
                Command::new("/usr/bin/codesign")
                    .args(["--force", "--sign", "-"])
                    .arg(&binary),
                Duration::from_secs(30),
            )
            .unwrap();
            command(
                Command::new("/usr/bin/codesign")
                    .args(["--force", "--sign", "-"])
                    .arg(&bundle),
                Duration::from_secs(30),
            )
            .unwrap();
            let create = |name: &str| {
                let image = root.path.join(name);
                command(
                    Command::new("/usr/bin/hdiutil")
                        .args([
                            "create",
                            "-format",
                            "UDZO",
                            "-volname",
                            "MaaVergeSynthetic",
                            "-srcfolder",
                        ])
                        .arg(&source)
                        .arg(&image),
                    Duration::from_secs(120),
                )
                .unwrap();
                fs::read(image).unwrap()
            };
            let bytes = create("valid.dmg");
            let installed = root.path.join("Installed.app");
            let executable = installed.join("Contents/MacOS/maaverge");
            fs::create_dir_all(executable.parent().unwrap()).unwrap();
            fs::write(&executable, "old synthetic application").unwrap();
            let data = root.path.join("config");
            fs::create_dir(&data).unwrap();
            fs::write(data.join("business-data"), "preserve").unwrap();
            for (version, target, data_root) in [
                ("0.2.0-beta.1", target, data.clone()),
                ("0.2.0-beta.2", wrong_target, data.clone()),
                ("0.2.0-beta.2", target, installed.join("config")),
            ] {
                assert!(install(&executable, &data_root, version, target, &bytes).is_err());
                assert_eq!(
                    fs::read_to_string(&executable).unwrap(),
                    "old synthetic application"
                );
            }
            fs::create_dir(installed.join("config")).unwrap();
            let alias = root.path.join("data-alias");
            std::os::unix::fs::symlink(installed.join("config"), &alias).unwrap();
            assert!(install(&executable, &alias, "0.2.0-beta.2", target, &bytes)
                .unwrap_err()
                .contains("配置目录位于"));
            fs::write(bundle.join("Contents/payload"), "tampered after signing").unwrap();
            let corrupt = create("corrupt.dmg");
            assert!(install(&executable, &data, "0.2.0-beta.2", target, &corrupt).is_err());
            assert_eq!(
                fs::read_to_string(&executable).unwrap(),
                "old synthetic application"
            );
            install(&executable, &data, "0.2.0-beta.2", target, &bytes).unwrap();
            assert_eq!(
                fs::read_to_string(installed.join("Contents/payload")).unwrap(),
                "new"
            );
            assert_eq!(
                fs::read_to_string(data.join("business-data")).unwrap(),
                "preserve"
            );
            assert!(fs::read_dir(&root.path).unwrap().flatten().any(|entry| {
                fs::read_to_string(entry.path().join("Maa Verge.app/Contents/MacOS/maaverge"))
                    .is_ok_and(|bytes| bytes == "old synthetic application")
            }));
            cleanup_previous(&executable, &Version::parse("0.2.0-beta.2").unwrap()).unwrap();
            let previous = fs::read_dir(&root.path)
                .unwrap()
                .flatten()
                .find(|entry| entry.file_name().to_str().is_some_and(staging_name))
                .unwrap()
                .path();
            // The updater process is this test and is still alive. Simulate its
            // later exit by rebinding the fixture receipt to an absent PID.
            let previous_after_exit = root.path.join(".maaverge-update-2147483647-1");
            let mut record: serde_json::Value =
                serde_json::from_slice(&fs::read(previous.join(RECEIPT)).unwrap()).unwrap();
            record["updaterPid"] = serde_json::json!(2147483647_u32);
            fs::write(previous.join(RECEIPT), serde_json::to_vec(&record).unwrap()).unwrap();
            fs::rename(&previous, &previous_after_exit).unwrap();
            cleanup_previous(&executable, &Version::parse("0.2.0-beta.2").unwrap()).unwrap();
            assert!(!previous_after_exit.exists());
        }
    }
}

#[cfg(target_os = "macos")]
pub(super) use native::install;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dmg_installation_requires_a_bundle_and_keeps_adjacent_config_outside_it() {
        let root = std::env::temp_dir();
        let bundle = root.join("Maa Verge.app");
        assert_eq!(
            bundle_path(&bundle.join("Contents/MacOS/maaverge")).unwrap(),
            bundle
        );
        assert!(!root.join("config").starts_with(&bundle));
        assert!(bundle_path(&root.join("maaverge")).is_err());
        assert!(bundle_path(Path::new("Maa Verge.app/Contents/MacOS/maaverge")).is_err());
    }

    #[test]
    fn dmg_identity_binds_application_version_executable_and_architecture() {
        let validate = |identifier, version, executable, arch, target| {
            validate_identity(
                identifier,
                version,
                executable,
                arch,
                "0.2.0-beta.2",
                target,
            )
        };
        assert!(validate(
            "io.maaverge.desktop\n",
            "0.2.0-beta.2\n",
            "maaverge\n",
            "arm64\n",
            "darwin-aarch64-dmg"
        )
        .is_ok());
        for values in [
            (
                "other",
                "0.2.0-beta.2",
                "maaverge",
                "arm64",
                "darwin-aarch64-dmg",
            ),
            (
                "io.maaverge.desktop",
                "0.2.0-beta.1",
                "maaverge",
                "arm64",
                "darwin-aarch64-dmg",
            ),
            (
                "io.maaverge.desktop",
                "0.2.0-beta.2",
                "../other",
                "arm64",
                "darwin-aarch64-dmg",
            ),
            (
                "io.maaverge.desktop",
                "0.2.0-beta.2",
                "maaverge",
                "x86_64",
                "darwin-aarch64-dmg",
            ),
            (
                "io.maaverge.desktop",
                "0.2.0-beta.2",
                "maaverge",
                "arm64 x86_64",
                "darwin-x86_64-dmg",
            ),
            (
                "io.maaverge.desktop",
                "0.2.0-beta.2",
                "maaverge",
                "arm64",
                "windows-x86_64-nsis",
            ),
        ] {
            assert!(validate(values.0, values.1, values.2, values.3, values.4).is_err());
        }
        assert!(validate(
            "io.maaverge.desktop",
            "0.2.0-beta.2",
            "maaverge",
            "x86_64",
            "darwin-x86_64-dmg"
        )
        .is_ok());
    }

    #[test]
    fn old_bundles_are_cleaned_only_after_launching_the_bound_target_version() {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "maaverge-dmg-cleanup-{}-{nonce}",
            std::process::id()
        ));
        let installed = root.join("Maa Verge.app");
        let executable = installed.join("Contents/MacOS/maaverge");
        fs::create_dir_all(executable.parent().unwrap()).unwrap();
        let receipt = |installation: &Path| serde_json::json!({"formatVersion": 1, "installation": installation, "targetVersion": "0.2.0", "updaterPid": 2147483647_u32});
        for (name, record) in [
            (".maaverge-update-2147483647-1", Some(receipt(&installed))),
            (
                ".maaverge-update-2147483647-2",
                Some(receipt(&root.join("other.app"))),
            ),
            (".maaverge-update-2147483647-3", None),
            ("other-user-directory", Some(receipt(&installed))),
        ] {
            let directory = root.join(name);
            fs::create_dir(&directory).unwrap();
            fs::write(
                directory.join("old-application"),
                "preserve until new launch",
            )
            .unwrap();
            if let Some(record) = record {
                fs::write(
                    directory.join(RECEIPT),
                    serde_json::to_vec(&record).unwrap(),
                )
                .unwrap();
            }
        }
        cleanup_previous(&executable, &Version::parse("0.1.9").unwrap()).unwrap();
        assert!(root.join(".maaverge-update-2147483647-1").exists());
        cleanup_previous(&executable, &Version::parse("0.2.0").unwrap()).unwrap();
        assert!(!root.join(".maaverge-update-2147483647-1").exists());
        for name in [
            ".maaverge-update-2147483647-2",
            ".maaverge-update-2147483647-3",
            "other-user-directory",
        ] {
            assert!(root.join(name).join("old-application").is_file());
        }
        for name in [
            ".maaverge-update-../unsafe",
            ".maaverge-update-0-1",
            ".maaverge-update-99999999999999999-1",
        ] {
            assert!(!staging_name(name) || staging_pid(name).is_none());
        }
        fs::remove_dir_all(root).unwrap();
    }
}
