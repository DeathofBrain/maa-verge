use crate::app_updater::AppUpdater;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{oneshot, Mutex as AsyncMutex, RwLock};

type Reply = Result<Value, String>;
type Pending = Arc<Mutex<HashMap<u64, oneshot::Sender<Reply>>>>;
type Emit = Arc<dyn Fn(&str, Value) + Send + Sync>;

fn frontend_method(method: &str) -> Result<(), String> {
    if method.starts_with("host.") {
        return Err("此操作仅供桌面宿主调用".into());
    }
    Ok(())
}

fn emit_notification(message: &Value, emit: &Emit) {
    let payload = message.get("params").cloned().unwrap_or(Value::Null);
    match message.get("method").and_then(Value::as_str) {
        Some("runtime.event") => emit("runtime-event", payload),
        Some("runtime.hostEvent") => emit("app-update-progress", payload),
        _ => {}
    }
}

fn request_timeout(method: &str, params: &Value) -> Duration {
    if matches!(
        method,
        "updates.prepare" | "updates.activate" | "updates.rollback"
    ) || method == "host.updates" && params["operation"] == "download"
    {
        Duration::from_secs(1800)
    } else {
        Duration::from_secs(120)
    }
}

struct PendingRequest<'a> {
    pending: &'a Pending,
    id: u64,
}

impl Drop for PendingRequest<'_> {
    fn drop(&mut self) {
        self.pending.lock().expect("pending lock").remove(&self.id);
    }
}

struct WritingRequest<'a> {
    channel: &'a mut Option<ChildStdin>,
    failed: &'a AtomicBool,
    completed: bool,
}

impl Drop for WritingRequest<'_> {
    fn drop(&mut self) {
        if !self.completed {
            // A timeout/cancellation can leave half an NDJSON frame. Never
            // append another request to that ambiguous protocol stream.
            self.failed.store(true, Ordering::Release);
            self.channel.take();
        }
    }
}

// A job object or taskkill /T can also kill a shared ADB server first started by
// this instance. Track only our own runtime/worker executables instead, retaining
// process handles so PID reuse cannot redirect termination to another process.
#[cfg(windows)]
mod owned_processes {
    use super::*;
    use std::ffi::c_void;

    type Handle = *mut c_void;
    const PROCESS_ACCESS: u32 = 0x0010_1001; // SYNCHRONIZE, query, terminate
    const WAIT_TIMEOUT: u32 = 258;

    #[repr(C)]
    struct ProcessEntry {
        size: u32,
        usage: u32,
        pid: u32,
        heap: usize,
        module: u32,
        threads: u32,
        parent: u32,
        priority: i32,
        flags: u32,
        executable: [u16; 260],
    }

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn CreateToolhelp32Snapshot(flags: u32, pid: u32) -> Handle;
        fn Process32FirstW(snapshot: Handle, entry: *mut ProcessEntry) -> i32;
        fn Process32NextW(snapshot: Handle, entry: *mut ProcessEntry) -> i32;
        fn OpenProcess(access: u32, inherit: i32, pid: u32) -> Handle;
        fn QueryFullProcessImageNameW(
            process: Handle,
            flags: u32,
            name: *mut u16,
            size: *mut u32,
        ) -> i32;
        fn TerminateProcess(process: Handle, code: u32) -> i32;
        fn WaitForSingleObject(handle: Handle, milliseconds: u32) -> u32;
        fn CloseHandle(handle: Handle) -> i32;
    }

    struct Process(Handle);
    // Kernel process handles can be used from any thread. Each owned handle is
    // closed exactly once by Drop, after all operations on it have completed.
    unsafe impl Send for Process {}

    impl Drop for Process {
        fn drop(&mut self) {
            // SAFETY: this is an owned, valid kernel handle.
            unsafe { CloseHandle(self.0) };
        }
    }

    impl Process {
        fn open(pid: u32) -> Result<Self, std::io::Error> {
            // SAFETY: no borrowed pointers; this returns an independently owned handle.
            let handle = unsafe { OpenProcess(PROCESS_ACCESS, 0, pid) };
            if handle.is_null() {
                return Err(std::io::Error::last_os_error());
            }
            Ok(Self(handle))
        }

        fn image(&self) -> Result<PathBuf, String> {
            let mut name = vec![0_u16; 32768];
            let mut size = name.len() as u32;
            // SAFETY: the buffer has size writable UTF-16 elements for this call.
            if unsafe { QueryFullProcessImageNameW(self.0, 0, name.as_mut_ptr(), &mut size) } == 0 {
                return Err(format!(
                    "无法确认后台进程路径：{}",
                    std::io::Error::last_os_error()
                ));
            }
            use std::os::windows::ffi::OsStringExt;
            Ok(std::ffi::OsString::from_wide(&name[..size as usize]).into())
        }

        fn terminate(&self) -> Result<(), String> {
            // SAFETY: both calls use the retained process handle, never a reused PID.
            if unsafe { WaitForSingleObject(self.0, 0) } == WAIT_TIMEOUT
                && unsafe { TerminateProcess(self.0, 1) } == 0
                && unsafe { WaitForSingleObject(self.0, 0) } == WAIT_TIMEOUT
            {
                return Err(format!(
                    "后台工作进程无法结束，更新包已保留：{}",
                    std::io::Error::last_os_error()
                ));
            }
            Ok(())
        }

        fn wait(&self, deadline: std::time::Instant) -> Result<(), String> {
            let remaining = deadline
                .saturating_duration_since(std::time::Instant::now())
                .as_millis()
                .min(u32::MAX as u128) as u32;
            // SAFETY: the retained process handle remains valid for this wait.
            if unsafe { WaitForSingleObject(self.0, remaining) } != 0 {
                return Err("后台工作进程退出确认超时，更新包已保留".into());
            }
            Ok(())
        }
    }

    pub(super) struct Processes {
        root: Process,
        pid: u32,
        image: PathBuf,
        children: HashMap<u32, Process>,
    }

    impl Processes {
        pub(super) fn capture(child: &Child) -> Result<Self, String> {
            let pid = child.id().ok_or("本地服务进程已退出")?;
            let root = Process::open(pid)
                .map_err(|error| format!("无法确认本地服务 {pid} 的退出状态：{error}"))?;
            let image = root.image()?;
            let mut processes = Self {
                root,
                pid,
                image,
                children: HashMap::new(),
            };
            processes.capture_descendants()?;
            Ok(processes)
        }

        pub(super) fn capture_descendants(&mut self) -> Result<(), String> {
            // SAFETY: a process-only snapshot uses a zero PID and no pointers.
            let snapshot = unsafe { CreateToolhelp32Snapshot(2, 0) };
            if snapshot as isize == -1 {
                return Err(format!(
                    "无法检查后台工作进程：{}",
                    std::io::Error::last_os_error()
                ));
            }
            let snapshot = Process(snapshot);
            // SAFETY: all-zero integers/arrays form a valid ProcessEntry.
            let mut entry: ProcessEntry = unsafe { std::mem::zeroed() };
            entry.size = std::mem::size_of::<ProcessEntry>() as u32;
            let mut entries = Vec::new();
            // SAFETY: entry has the Win32-required size and remains writable throughout.
            let mut found = unsafe { Process32FirstW(snapshot.0, &mut entry) } != 0;
            while found {
                let end = entry
                    .executable
                    .iter()
                    .position(|character| *character == 0)
                    .unwrap_or(entry.executable.len());
                entries.push((
                    entry.pid,
                    entry.parent,
                    String::from_utf16_lossy(&entry.executable[..end]),
                ));
                found = unsafe { Process32NextW(snapshot.0, &mut entry) } != 0;
            }
            let enumeration_error = std::io::Error::last_os_error();
            if enumeration_error.raw_os_error() != Some(18) {
                return Err(format!("无法完整检查后台工作进程：{enumeration_error}"));
            }
            let mut descendants = std::collections::HashSet::from([self.pid]);
            // Retained handles keep these PIDs reserved after their processes
            // exit. A completed update job may have spawned a native validator
            // since the last snapshot; continue following that parent's PID.
            descendants.extend(self.children.keys().copied());
            loop {
                let mut changed = false;
                for (pid, parent, _) in &entries {
                    if descendants.contains(parent) && descendants.insert(*pid) {
                        changed = true;
                    }
                }
                if !changed {
                    break;
                }
            }
            let root_name = self.image.file_name().unwrap_or_default().to_string_lossy();
            for (pid, _, name) in entries {
                if !descendants.contains(&pid)
                    || pid == self.pid
                    || self.children.contains_key(&pid)
                    || !(name.eq_ignore_ascii_case(&root_name)
                        || name.eq_ignore_ascii_case("maaverge-core-worker.exe"))
                {
                    continue;
                }
                let process = match Process::open(pid) {
                    Ok(process) => process,
                    // A child may disappear between snapshot and OpenProcess.
                    Err(error) if error.raw_os_error() == Some(87) => continue,
                    Err(error) => {
                        return Err(format!("无法确认后台工作进程 {pid} 已退出：{error}"));
                    }
                };
                let image = match process.image() {
                    Ok(image) => image,
                    // A process can exit after OpenProcess, before its image query.
                    Err(_) if unsafe { WaitForSingleObject(process.0, 0) } == 0 => continue,
                    Err(error) => return Err(error),
                };
                if owned_image(&self.image, &image) {
                    self.children.insert(pid, process);
                }
            }
            Ok(())
        }

        pub(super) fn finish(mut self) -> Result<(), String> {
            // The root handle keeps its PID reserved even after Tokio has reaped
            // it, so late children can still be found by their parent PID.
            self.capture_descendants()?;
            let deadline = std::time::Instant::now() + Duration::from_secs(3);
            let mut outcome = self.terminate_and_wait(deadline);
            // A job could create a worker between the first snapshot and its
            // termination. Once the known parents have exited, follow their
            // retained PIDs again and close anything created in that interval.
            let final_capture = self.capture_descendants();
            let final_cleanup = match final_capture {
                Ok(()) => self.terminate_and_wait(deadline),
                Err(error) => Err(error),
            };
            if outcome.is_ok() {
                outcome = final_cleanup;
            }
            outcome
        }

        fn terminate_and_wait(&self, deadline: std::time::Instant) -> Result<(), String> {
            let mut outcome = self.root.terminate();
            for process in self.children.values() {
                let result = process.terminate();
                if outcome.is_ok() {
                    outcome = result;
                }
            }
            let result = self.root.wait(deadline);
            if outcome.is_ok() {
                outcome = result;
            }
            for process in self.children.values() {
                let result = process.wait(deadline);
                if outcome.is_ok() {
                    outcome = result;
                }
            }
            outcome
        }
    }

    pub(super) fn owned_image(root: &std::path::Path, image: &std::path::Path) -> bool {
        root.as_os_str()
            .to_string_lossy()
            .eq_ignore_ascii_case(&image.as_os_str().to_string_lossy())
            || image.file_name().is_some_and(|name| {
                name.to_string_lossy()
                    .eq_ignore_ascii_case("maaverge-core-worker.exe")
            })
    }

    #[cfg(test)]
    pub(super) fn is_running(pid: u32) -> bool {
        Process::open(pid)
            .is_ok_and(|process| unsafe { WaitForSingleObject(process.0, 0) } == WAIT_TIMEOUT)
    }
}

#[derive(Clone, Copy)]
pub struct ClosePreferences {
    pub minimize_to_tray: bool,
    pub remember_close_action: bool,
}

impl Default for ClosePreferences {
    fn default() -> Self {
        Self {
            minimize_to_tray: true,
            remember_close_action: false,
        }
    }
}

impl ClosePreferences {
    fn update(&mut self, settings: &Value) {
        self.minimize_to_tray = settings
            .get("minimizeToTray")
            .and_then(Value::as_bool)
            .unwrap_or(true);
        // Existing installations must still ask until the user remembers a choice.
        self.remember_close_action = settings
            .get("rememberCloseAction")
            .and_then(Value::as_bool)
            .unwrap_or(false);
    }
}

pub struct Runtime {
    child: AsyncMutex<Option<Child>>,
    stdin: AsyncMutex<Option<ChildStdin>>,
    pending: Pending,
    next_id: AtomicU64,
    close_preferences: Mutex<ClosePreferences>,
    pub update_gate: RwLock<()>,
    updating: AtomicBool,
    transport_failed: AtomicBool,
    shutdown_result: Mutex<Option<Result<(), String>>>,
    shutdown_clean: AtomicBool,
}

fn program(app: &AppHandle) -> Result<(PathBuf, Vec<String>), String> {
    validate_backend(std::env::var("MAAVERGE_BACKEND").ok().as_deref())?;
    if cfg!(debug_assertions) {
        let project = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../..")
            .canonicalize()
            .map_err(|error| error.to_string())?;
        let bun = project.join(if cfg!(windows) {
            ".tools/bun/bun.exe"
        } else {
            ".tools/bun/bun"
        });
        if !bun.is_file() {
            return Err("Bun 环境未准备，请运行 pnpm setup:bun".into());
        }
        Ok((
            bun,
            vec![
                "run".into(),
                "--no-env-file".into(),
                project
                    .join("services/backend/src/entry.ts")
                    .to_string_lossy()
                    .into(),
            ],
        ))
    } else {
        let executable = app
            .path()
            .resource_dir()
            .map_err(|error| error.to_string())?
            .join("runtime")
            .join(if cfg!(windows) {
                "maaverge-runtime.exe"
            } else {
                "maaverge-runtime"
            });
        if !executable.is_file() {
            return Err("应用安装包缺少本地服务，请重新安装 Maa Verge".into());
        }
        Ok((executable, vec![]))
    }
}

fn validate_backend(value: Option<&str>) -> Result<(), String> {
    if value.is_none_or(|value| value.is_empty() || value == "typescript") {
        Ok(())
    } else {
        Err("MAAVERGE_BACKEND 仅支持 typescript，请清除不受支持的后端设置".into())
    }
}

pub(crate) fn application_directory() -> Result<PathBuf, String> {
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let appimage = std::env::var_os("APPIMAGE").map(PathBuf::from);
    crate::configuration::application_directory_for(
        &executable,
        std::env::consts::OS,
        appimage.as_deref(),
    )
}

impl Runtime {
    pub async fn start(app: AppHandle) -> Result<Self, String> {
        if std::env::var_os("MAAVERGE_MODE").is_some_and(|mode| mode != "native") {
            return Err("模拟运行模式已移除，请移除 MAAVERGE_MODE 环境变量或设置为 native".into());
        }
        let (executable, arguments) = program(&app)?;
        let mut command = Command::new(executable);
        command.args(arguments);
        // Keep one startup root for the service, scheduler and app updater.
        // The default resolver still performs the existing legacy-data import.
        if crate::configuration::should_pin_data_root()? {
            command.env("MAAVERGE_DATA_DIR", crate::configuration::data_root()?);
        }
        if !cfg!(debug_assertions) {
            // The service lives in resource_dir/runtime, not beside the main executable.
            command.env("MAAVERGE_APP_DIR", application_directory()?);
        }
        let emit: Emit = Arc::new(move |event, payload| {
            if event == "app-update-progress" {
                if let Some(updater) = app.try_state::<AppUpdater>() {
                    updater.host_progress(&payload);
                }
                return;
            }
            let _ = app.emit(event, payload.clone());
            if event == "runtime-event" {
                crate::desktop_scheduler::handle_event(app.clone(), &payload);
            }
        });
        Self::start_process(command, emit).await
    }

    // The desktop and packaged integration smoke share the same transport and cleanup.
    async fn start_process(mut command: Command, emit: Emit) -> Result<Self, String> {
        command
            .env_remove("BUN_OPTIONS")
            .env_remove("BUN_BE_BUN")
            .env_remove("NODE_OPTIONS")
            .env_remove("NODE_PATH")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        command.env("MAAVERGE_MODE", "native");
        #[cfg(windows)]
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        let mut child = command.spawn().map_err(|error| error.to_string())?;
        let stdin = child.stdin.take().ok_or("runtime stdin unavailable")?;
        let stdout = child.stdout.take().ok_or("runtime stdout unavailable")?;
        let stderr = child.stderr.take().ok_or("runtime stderr unavailable")?;
        let pending: Pending = Arc::new(Mutex::new(HashMap::new()));
        let replies = pending.clone();
        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if line.len() > 4 * 1024 * 1024 {
                    eprintln!("runtime protocol message exceeded size limit");
                    break;
                }
                let message: Value = match serde_json::from_str(&line) {
                    Ok(message) => message,
                    Err(_) => {
                        eprintln!("runtime returned invalid JSON-RPC");
                        continue;
                    }
                };
                if let Some(id) = message.get("id").and_then(Value::as_u64) {
                    let sender = replies.lock().expect("pending lock").remove(&id);
                    if let Some(sender) = sender {
                        let reply = match message.get("error") {
                            Some(error) => Err(error.to_string()),
                            None => Ok(message.get("result").cloned().unwrap_or(Value::Null)),
                        };
                        let _ = sender.send(reply);
                    }
                } else {
                    // JSON-RPC method names may contain dots; Tauri event names may not.
                    emit_notification(&message, &emit);
                }
            }
            for (_, sender) in replies.lock().expect("pending lock").drain() {
                let _ = sender.send(Err("本地服务已退出，请重启 Maa Verge".into()));
            }
            emit(
                "runtime-disconnected",
                json!({ "reason": "本地服务已退出" }),
            );
        });
        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                eprintln!("[runtime] {line}");
            }
        });
        let runtime = Self {
            child: AsyncMutex::new(Some(child)),
            stdin: AsyncMutex::new(Some(stdin)),
            pending,
            next_id: AtomicU64::new(1),
            close_preferences: Mutex::new(ClosePreferences::default()),
            update_gate: RwLock::new(()),
            updating: AtomicBool::new(false),
            transport_failed: AtomicBool::new(false),
            shutdown_result: Mutex::new(None),
            shutdown_clean: AtomicBool::new(false),
        };
        runtime.request("app.snapshot".into(), json!({})).await?;
        Ok(runtime)
    }

    pub fn close_preferences(&self) -> ClosePreferences {
        *self
            .close_preferences
            .lock()
            .expect("close preferences lock")
    }

    pub fn mark_updating(&self) {
        self.updating.store(true, Ordering::Release);
    }

    pub async fn request(&self, method: String, params: Value) -> Reply {
        if method.len() > 128 || params.to_string().len() > 1024 * 1024 {
            return Err("请求超出本地服务限制".into());
        }
        let timeout = request_timeout(&method, &params);
        self.request_with_timeout(method, params, timeout).await
    }

    async fn request_with_timeout(
        &self,
        method: String,
        params: Value,
        timeout: Duration,
    ) -> Reply {
        if self.transport_failed.load(Ordering::Acquire) {
            return Err("本地服务通道已中断，请重启 Maa Verge 后重试".into());
        }
        let snapshot = method == "app.snapshot";
        let settings = method == "settings.save";
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (sender, receiver) = oneshot::channel();
        self.pending
            .lock()
            .expect("pending lock")
            .insert(id, sender);
        let _pending = PendingRequest {
            pending: &self.pending,
            id,
        };
        let message = format!(
            "{}\n",
            json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params })
        );
        let deadline = tokio::time::Instant::now() + timeout;
        let mut channel = tokio::time::timeout_at(deadline, self.stdin.lock())
            .await
            .map_err(|_| "本地服务写入超时；操作结果可能未知，请先检查状态".to_string())?;
        if self.transport_failed.load(Ordering::Acquire) {
            return Err("本地服务通道已中断，请重启 Maa Verge 后重试".into());
        }
        let mut transaction = WritingRequest {
            channel: &mut channel,
            failed: &self.transport_failed,
            completed: false,
        };
        let written = tokio::time::timeout_at(deadline, async {
            match transaction.channel.as_mut() {
                Some(stdin) => {
                    stdin.write_all(message.as_bytes()).await?;
                    // On Windows Tokio acknowledges a buffered blocking write
                    // before the OS pipe has accepted it. Flush belongs to the
                    // same deadline so a stalled service cannot retain the gate.
                    stdin.flush().await
                }
                None => Err(std::io::Error::new(
                    std::io::ErrorKind::BrokenPipe,
                    "runtime stopped",
                )),
            }
        })
        .await;
        transaction.completed = matches!(&written, Ok(Ok(())));
        drop(transaction);
        drop(channel);
        match written {
            Ok(Ok(())) => {}
            Ok(Err(error)) => {
                self.pending.lock().expect("pending lock").remove(&id);
                return Err(format!("本地服务连接中断: {error}"));
            }
            Err(_) => {
                self.pending.lock().expect("pending lock").remove(&id);
                return Err("本地服务写入超时；操作结果可能未知，请重启应用后检查状态".into());
            }
        }
        match tokio::time::timeout_at(deadline, receiver).await {
            Ok(Ok(reply)) => {
                if let Ok(value) = &reply {
                    let preferences = if snapshot {
                        value.get("settings")
                    } else if settings {
                        Some(value)
                    } else {
                        None
                    };
                    if let Some(preferences) = preferences {
                        self.close_preferences
                            .lock()
                            .expect("close preferences lock")
                            .update(preferences);
                    }
                }
                reply
            }
            Ok(Err(_)) => Err("本地服务响应已中断".into()),
            Err(_) => {
                self.pending.lock().expect("pending lock").remove(&id);
                Err("本地服务响应超时；操作结果可能未知，请先检查状态".into())
            }
        }
    }

    pub async fn shutdown(&self) {
        if let Err(error) = self.shutdown_for_update().await {
            eprintln!("{error}");
        }
    }

    #[cfg(any(target_os = "macos", test))]
    pub async fn shutdown_for_uninstall(&self) -> Result<(), String> {
        self.shutdown_for_update().await?;
        if self.shutdown_clean.load(Ordering::Acquire) {
            Ok(())
        } else {
            Err("未能确认后台服务正常退出，已取消卸载；请重新打开应用后重试".into())
        }
    }

    pub async fn shutdown_for_update(&self) -> Result<(), String> {
        let mut process = self.child.lock().await;
        if let Some(result) = self
            .shutdown_result
            .lock()
            .expect("shutdown result")
            .clone()
        {
            return result;
        }
        // EOF lets the service destroy native instances and close storage first.
        let outcome = if let Some(mut child) = process.take() {
            // If the caller itself is cancelled during cleanup, a later update
            // must not interpret the taken child slot as a successful shutdown.
            *self.shutdown_result.lock().expect("shutdown result") = Some(Err(
                "后台服务退出尚未确认，更新包已保留，请重启应用后重试".into(),
            ));
            #[cfg(windows)]
            let mut owned = owned_processes::Processes::capture(&child);
            let graceful = async {
                // Include a concurrent blocked stdin write in the same deadline.
                self.stdin.lock().await.take();
                child.wait().await
            };
            let mut outcome = Ok(());
            let graceful = tokio::time::timeout(Duration::from_secs(5), graceful).await;
            self.shutdown_clean.store(
                matches!(&graceful, Ok(Ok(status)) if status.success()),
                Ordering::Release,
            );
            if !matches!(graceful, Ok(Ok(_))) {
                #[cfg(windows)]
                if let Ok(owned) = &mut owned {
                    // Cleanup must still kill the root if enumeration fails.
                    let _ = owned.capture_descendants();
                }
                let _ = child.start_kill();
                outcome = tokio::time::timeout(Duration::from_secs(3), child.wait())
                    .await
                    .map_err(|_| "本地服务强制退出超时，更新包已保留".to_string())
                    .and_then(|result| {
                        result
                            .map(|_| ())
                            .map_err(|error| format!("无法确认本地服务已退出：{error}"))
                    });
            }
            #[cfg(windows)]
            {
                let children = owned.and_then(owned_processes::Processes::finish);
                if outcome.is_ok() {
                    outcome = children;
                }
            }
            outcome
        } else {
            Ok(())
        };
        *self.shutdown_result.lock().expect("shutdown result") = Some(outcome.clone());
        outcome
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Write};

    #[test]
    fn unsupported_backend_selection_is_rejected_without_fallback() {
        for value in [None, Some(""), Some("typescript")] {
            assert!(validate_backend(value).is_ok());
        }
        for value in ["legacy", "unknown", "TypeScript"] {
            assert!(validate_backend(Some(value)).is_err());
        }
    }

    #[test]
    fn frontend_cannot_call_any_host_only_method() {
        for method in ["host.updates", "host.other", "host."] {
            assert!(frontend_method(method).is_err(), "{method}");
        }
        for method in ["app.snapshot", "updates.prepare", "settings.save"] {
            assert!(frontend_method(method).is_ok(), "{method}");
        }
        assert_eq!(
            request_timeout("host.updates", &json!({ "operation": "download" })),
            Duration::from_secs(1800)
        );
        assert_eq!(
            request_timeout("host.updates", &json!({ "operation": "cancel" })),
            Duration::from_secs(120)
        );
    }

    #[test]
    fn host_notifications_use_the_internal_progress_handler() {
        let events = Arc::new(Mutex::new(Vec::new()));
        let collected = events.clone();
        let emit: Emit = Arc::new(move |event, payload| {
            collected.lock().unwrap().push((event.to_string(), payload));
        });
        let payload = json!({ "operationId": "app-123-2", "progress": 45 });
        emit_notification(
            &json!({ "method": "runtime.hostEvent", "params": payload }),
            &emit,
        );
        assert_eq!(
            events.lock().unwrap().as_slice(),
            &[("app-update-progress".into(), payload)]
        );
        emit_notification(&json!({ "method": "unknown.notification" }), &emit);
        assert_eq!(events.lock().unwrap().len(), 1);
    }
    use std::path::Path;

    #[test]
    fn existing_settings_require_a_choice_until_explicitly_remembered() {
        let mut preferences = ClosePreferences::default();
        preferences.update(&json!({"minimizeToTray": false}));
        assert!(!preferences.minimize_to_tray);
        assert!(!preferences.remember_close_action);
        preferences.update(&json!({"minimizeToTray": true, "rememberCloseAction": true}));
        assert!(preferences.minimize_to_tray);
        assert!(preferences.remember_close_action);
        preferences.update(&json!({"minimizeToTray": false, "rememberCloseAction": true}));
        assert!(!preferences.minimize_to_tray);
        assert!(preferences.remember_close_action);
        preferences.update(&json!({"minimizeToTray": false}));
        assert!(!preferences.remember_close_action);
    }

    fn shutdown_runtime(mode: &str) -> Runtime {
        let mut command = Command::new(std::env::current_exe().unwrap());
        command
            .args([
                "--ignored",
                "--exact",
                "runtime::tests::shutdown_fixture",
                "--nocapture",
                "--test-threads=1",
            ])
            .env("MAAVERGE_TEST_SHUTDOWN_FIXTURE", mode)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(0x08000000);
        let mut child = command.spawn().unwrap();
        let stdin = child.stdin.take().unwrap();
        Runtime {
            child: AsyncMutex::new(Some(child)),
            stdin: AsyncMutex::new(Some(stdin)),
            pending: Arc::new(Mutex::new(HashMap::new())),
            next_id: AtomicU64::new(1),
            close_preferences: Mutex::new(ClosePreferences::default()),
            update_gate: RwLock::new(()),
            updating: AtomicBool::new(false),
            transport_failed: AtomicBool::new(false),
            shutdown_result: Mutex::new(None),
            shutdown_clean: AtomicBool::new(false),
        }
    }

    #[test]
    #[ignore = "synthetic subprocess fixture for shutdown tests"]
    fn shutdown_fixture() {
        match std::env::var("MAAVERGE_TEST_SHUTDOWN_FIXTURE").as_deref() {
            Ok("eof") => {
                std::io::copy(&mut std::io::stdin().lock(), &mut std::io::sink()).unwrap();
            }
            Ok("failed") => {
                std::io::copy(&mut std::io::stdin().lock(), &mut std::io::sink()).unwrap();
                std::process::exit(1);
            }
            Ok("hang") => std::thread::sleep(Duration::from_secs(30)),
            #[cfg(windows)]
            Ok(mode @ ("orphan" | "orphan-hang")) => {
                // Intentionally orphan a Windows child so host cleanup must
                // terminate and wait on its independently retained handle.
                #[allow(clippy::zombie_processes)]
                let child = std::process::Command::new(std::env::current_exe().unwrap())
                    .args([
                        "--ignored",
                        "--exact",
                        "runtime::tests::shutdown_fixture",
                        "--nocapture",
                        "--test-threads=1",
                    ])
                    .env("MAAVERGE_TEST_SHUTDOWN_FIXTURE", "hang")
                    .stdin(Stdio::null())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
                    .unwrap();
                std::fs::write(
                    std::env::var_os("MAAVERGE_TEST_SHUTDOWN_PID_FILE").unwrap(),
                    child.id().to_string(),
                )
                .unwrap();
                if mode == "orphan-hang" {
                    std::thread::sleep(Duration::from_secs(30));
                } else {
                    std::io::copy(&mut std::io::stdin().lock(), &mut std::io::sink()).unwrap();
                }
            }
            #[cfg(windows)]
            Ok("relay") => {
                let mut child = spawn_shutdown_fixture("relay-job");
                let directory =
                    PathBuf::from(std::env::var_os("MAAVERGE_TEST_SHUTDOWN_RELAY_DIR").unwrap());
                std::fs::write(directory.join("job.pid"), child.id().to_string()).unwrap();
                std::io::copy(&mut std::io::stdin().lock(), &mut std::io::sink()).unwrap();
                child.wait().unwrap();
            }
            #[cfg(windows)]
            Ok("relay-job") => {
                let directory =
                    PathBuf::from(std::env::var_os("MAAVERGE_TEST_SHUTDOWN_RELAY_DIR").unwrap());
                let deadline = std::time::Instant::now() + Duration::from_secs(5);
                while !directory.join("captured").is_file() {
                    assert!(std::time::Instant::now() < deadline);
                    std::thread::sleep(Duration::from_millis(10));
                }
                // The host must find this child after the intermediate job exits.
                #[allow(clippy::zombie_processes)]
                let child = spawn_shutdown_fixture("hang");
                std::fs::write(directory.join("native.pid"), child.id().to_string()).unwrap();
            }
            _ => {}
        }
    }

    #[cfg(windows)]
    fn spawn_shutdown_fixture(mode: &str) -> std::process::Child {
        std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--ignored",
                "--exact",
                "runtime::tests::shutdown_fixture",
                "--nocapture",
                "--test-threads=1",
            ])
            .env("MAAVERGE_TEST_SHUTDOWN_FIXTURE", mode)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap()
    }

    #[cfg(windows)]
    #[test]
    fn cleanup_follows_a_retained_update_job_after_it_spawns_a_worker_and_exits() {
        tauri::async_runtime::block_on(async {
            let directory = std::env::temp_dir().join(format!(
                "maaverge-shutdown-relay-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            std::fs::create_dir(&directory).unwrap();
            let mut command = Command::new(std::env::current_exe().unwrap());
            command
                .args([
                    "--ignored",
                    "--exact",
                    "runtime::tests::shutdown_fixture",
                    "--nocapture",
                    "--test-threads=1",
                ])
                .env("MAAVERGE_TEST_SHUTDOWN_FIXTURE", "relay")
                .env("MAAVERGE_TEST_SHUTDOWN_RELAY_DIR", &directory)
                .stdin(Stdio::piped())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .kill_on_drop(true);
            let mut child = command.spawn().unwrap();
            let job = tokio::time::timeout(Duration::from_secs(5), async {
                loop {
                    if let Ok(pid) = std::fs::read_to_string(directory.join("job.pid")) {
                        if let Ok(pid) = pid.parse::<u32>() {
                            break pid;
                        }
                    }
                    tokio::time::sleep(Duration::from_millis(10)).await;
                }
            })
            .await
            .unwrap();
            let processes = owned_processes::Processes::capture(&child).unwrap();
            std::fs::write(directory.join("captured"), "").unwrap();
            let native = tokio::time::timeout(Duration::from_secs(5), async {
                loop {
                    if !owned_processes::is_running(job) {
                        if let Ok(pid) = std::fs::read_to_string(directory.join("native.pid")) {
                            if let Ok(pid) = pid.parse::<u32>() {
                                break pid;
                            }
                        }
                    }
                    tokio::time::sleep(Duration::from_millis(10)).await;
                }
            })
            .await
            .unwrap();
            assert!(owned_processes::is_running(native));
            processes.finish().unwrap();
            tokio::time::timeout(Duration::from_secs(3), child.wait())
                .await
                .unwrap()
                .unwrap();
            assert!(!owned_processes::is_running(native));
            std::fs::remove_dir_all(directory).unwrap();
        });
    }

    #[test]
    fn request_deadline_includes_a_busy_stdin_lock() {
        tauri::async_runtime::block_on(async {
            let runtime = shutdown_runtime("eof");
            let stdin = runtime.stdin.lock().await;
            let error = runtime
                .request_with_timeout("app.snapshot".into(), json!({}), Duration::from_millis(30))
                .await
                .unwrap_err();
            assert!(error.contains("写入超时"), "{error}");
            assert!(runtime.pending.lock().unwrap().is_empty());
            assert!(!runtime.transport_failed.load(Ordering::Acquire));
            drop(stdin);
            runtime.shutdown_for_update().await.unwrap();
        });
    }

    #[test]
    fn request_deadline_includes_a_pipe_that_is_not_being_read() {
        tauri::async_runtime::block_on(async {
            let runtime = shutdown_runtime("hang");
            let error = runtime
                .request_with_timeout(
                    "synthetic.large".into(),
                    json!({"payload": "x".repeat(900_000)}),
                    Duration::from_millis(100),
                )
                .await
                .unwrap_err();
            assert!(error.contains("写入超时"), "{error}");
            assert!(runtime.pending.lock().unwrap().is_empty());
            // A timed-out write must release its mutex so EOF can be delivered.
            assert!(runtime.stdin.try_lock().unwrap().is_none());
            assert!(runtime.transport_failed.load(Ordering::Acquire));
            assert!(runtime
                .request("app.snapshot".into(), json!({}))
                .await
                .unwrap_err()
                .contains("重启"));
            runtime.shutdown_for_update().await.unwrap();
            assert!(runtime.shutdown_for_uninstall().await.is_err());
        });
    }

    #[test]
    fn cancelling_a_partial_write_closes_the_protocol_stream() {
        tauri::async_runtime::block_on(async {
            let runtime = Arc::new(shutdown_runtime("hang"));
            let requesting = runtime.clone();
            let request = tauri::async_runtime::spawn(async move {
                requesting
                    .request_with_timeout(
                        "synthetic.large".into(),
                        json!({ "payload": "x".repeat(900_000) }),
                        Duration::from_secs(30),
                    )
                    .await
            });
            tokio::time::timeout(Duration::from_secs(2), async {
                while runtime.stdin.try_lock().is_ok() {
                    tokio::time::sleep(Duration::from_millis(1)).await;
                }
            })
            .await
            .unwrap();
            request.abort();
            assert!(request.await.is_err());
            assert!(runtime.stdin.lock().await.is_none());
            assert!(runtime.transport_failed.load(Ordering::Acquire));
            assert!(runtime.pending.lock().unwrap().is_empty());
            runtime.shutdown_for_update().await.unwrap();
        });
    }

    #[test]
    fn repeated_shutdown_preserves_an_unconfirmed_cleanup_failure() {
        tauri::async_runtime::block_on(async {
            let runtime = shutdown_runtime("eof");
            runtime.shutdown_for_update().await.unwrap();
            let failure = Err("无法确认后台工作进程已经退出".to_string());
            *runtime.shutdown_result.lock().unwrap() = Some(failure.clone());
            runtime.shutdown().await;
            assert_eq!(runtime.shutdown_for_update().await, failure);
            assert!(runtime.child.lock().await.is_none());
        });
    }

    #[test]
    fn cancelled_shutdown_cannot_be_reinterpreted_as_success() {
        tauri::async_runtime::block_on(async {
            let runtime = Arc::new(shutdown_runtime("hang"));
            let closing = runtime.clone();
            let shutdown =
                tauri::async_runtime::spawn(async move { closing.shutdown_for_update().await });
            tokio::time::timeout(Duration::from_secs(2), async {
                while runtime.child.try_lock().is_ok() {
                    tokio::time::sleep(Duration::from_millis(1)).await;
                }
            })
            .await
            .unwrap();
            shutdown.abort();
            assert!(shutdown.await.is_err());
            assert!(runtime
                .shutdown_for_update()
                .await
                .unwrap_err()
                .contains("尚未确认"));
        });
    }

    #[test]
    fn application_update_shutdown_does_not_wait_for_active_component_request_gate() {
        tauri::async_runtime::block_on(async {
            let runtime = shutdown_runtime("eof");
            let _component_request = runtime.update_gate.read().await;
            runtime.mark_updating();
            tokio::time::timeout(Duration::from_secs(4), runtime.shutdown_for_update())
                .await
                .expect("a component request must not block update shutdown")
                .unwrap();
        });
    }

    #[cfg(windows)]
    #[test]
    fn update_cleanup_excludes_adb_and_other_unowned_executables() {
        let root = Path::new(r"C:\Maa Verge\runtime\maaverge-runtime.exe");
        assert!(owned_processes::owned_image(root, root));
        assert!(owned_processes::owned_image(
            root,
            Path::new(r"C:\Maa Verge\runtime\maaverge-core-worker.exe")
        ));
        for image in [
            r"C:\Android\adb.exe",
            r"C:\Windows\System32\cmd.exe",
            r"C:\Another install\runtime\maaverge-runtime.exe",
        ] {
            assert!(!owned_processes::owned_image(root, Path::new(image)));
        }
    }

    #[cfg(windows)]
    #[test]
    fn graceful_and_forced_parent_exit_also_clean_up_owned_sidecars() {
        tauri::async_runtime::block_on(async {
            for mode in ["orphan", "orphan-hang"] {
                let directory = std::env::temp_dir().join(format!(
                    "maaverge-shutdown-{}-{}",
                    std::process::id(),
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_nanos()
                ));
                std::fs::create_dir(&directory).unwrap();
                let pid_file = directory.join("child.pid");
                // Pass the file only to this fixture rather than changing the test
                // process environment shared by concurrent Rust tests.
                let mut command = Command::new(std::env::current_exe().unwrap());
                command
                    .args([
                        "--ignored",
                        "--exact",
                        "runtime::tests::shutdown_fixture",
                        "--nocapture",
                        "--test-threads=1",
                    ])
                    .env("MAAVERGE_TEST_SHUTDOWN_FIXTURE", mode)
                    .env("MAAVERGE_TEST_SHUTDOWN_PID_FILE", &pid_file)
                    .stdin(Stdio::piped())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .kill_on_drop(true);
                let mut child = command.spawn().unwrap();
                let stdin = child.stdin.take().unwrap();
                let runtime = Runtime {
                    child: AsyncMutex::new(Some(child)),
                    stdin: AsyncMutex::new(Some(stdin)),
                    pending: Arc::new(Mutex::new(HashMap::new())),
                    next_id: AtomicU64::new(1),
                    close_preferences: Mutex::new(ClosePreferences::default()),
                    update_gate: RwLock::new(()),
                    updating: AtomicBool::new(false),
                    transport_failed: AtomicBool::new(false),
                    shutdown_result: Mutex::new(None),
                    shutdown_clean: AtomicBool::new(false),
                };
                tokio::time::timeout(Duration::from_secs(5), async {
                    while !pid_file.is_file() {
                        tokio::time::sleep(Duration::from_millis(10)).await;
                    }
                })
                .await
                .unwrap();
                runtime.shutdown_for_update().await.unwrap();
                // After graceful or forced exit, an uncooperative child must also
                // be gone before an installer can replace the packaged executables.
                let child_pid: u32 = std::fs::read_to_string(&pid_file).unwrap().parse().unwrap();
                assert!(!owned_processes::is_running(child_pid));
                std::fs::remove_dir_all(directory).unwrap();
            }
        });
    }

    #[test]
    fn shutdown_allows_graceful_eof_without_waiting_for_deadline() {
        tauri::async_runtime::block_on(async {
            let runtime = shutdown_runtime("eof");
            tokio::time::timeout(Duration::from_secs(4), runtime.shutdown())
                .await
                .expect("an EOF-aware service must exit promptly");
            assert!(runtime.stdin.lock().await.is_none());
            assert!(runtime.child.lock().await.is_none());
        });
    }

    #[test]
    fn shutdown_deadline_includes_waiting_for_a_busy_stdin_lock() {
        tauri::async_runtime::block_on(async {
            let runtime = shutdown_runtime("hang");
            let mut stdin = runtime.stdin.lock().await;
            tokio::time::timeout(Duration::from_secs(8), runtime.shutdown())
                .await
                .expect("a blocked writer must not prevent bounded cleanup");
            let writer = stdin.as_mut().unwrap();
            let written = async {
                writer.write_all(b"service must have been killed").await?;
                writer.flush().await
            };
            assert!(written.await.is_err());
            assert!(runtime.child.lock().await.is_none());
        });
    }

    #[test]
    fn uninstall_requires_a_successful_graceful_service_exit() {
        tauri::async_runtime::block_on(async {
            for (mode, clean) in [("eof", true), ("failed", false)] {
                let runtime = shutdown_runtime(mode);
                assert_eq!(runtime.shutdown_for_uninstall().await.is_ok(), clean);
                assert_eq!(runtime.shutdown_for_uninstall().await.is_ok(), clean);
            }
        });
    }

    #[test]
    fn update_shutdown_and_normal_exit_can_share_bounded_cleanup() {
        tauri::async_runtime::block_on(async {
            let runtime = Arc::new(shutdown_runtime("eof"));
            let _install = runtime.update_gate.write().await;
            runtime.mark_updating();
            let other = runtime.clone();
            let exiting = tauri::async_runtime::spawn(async move { other.shutdown().await });
            tokio::time::timeout(Duration::from_secs(4), async {
                runtime.shutdown().await;
                exiting.await.unwrap();
            })
            .await
            .expect("concurrent update and window exit must finish cleanup promptly");
            assert!(runtime.stdin.lock().await.is_none());
            assert!(runtime.child.lock().await.is_none());
            assert!(runtime.updating.load(Ordering::Acquire));
            assert!(!runtime.close_preferences().remember_close_action);
        });
    }

    fn lease(worker: &Path, lock: &Path) -> std::process::Output {
        let mut command = std::process::Command::new(worker);
        command
            .arg("--lease-only")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command.spawn().expect("packaged C++ worker");
        writeln!(
            child.stdin.take().unwrap(),
            "{}",
            json!({"protocolVersion": 1, "lockPath": lock, "lockTimeoutMs": 0})
        )
        .unwrap();
        child.wait_with_output().unwrap()
    }

    #[test]
    #[ignore = "requires standalone runtime; run pnpm test:desktop-runtime"]
    fn packaged_runtime_transport() {
        let executable = PathBuf::from(
            std::env::var_os("MAAVERGE_TEST_RUNTIME").expect("standalone runtime path"),
        );
        let data =
            PathBuf::from(std::env::var_os("MAAVERGE_TEST_DATA").expect("isolated test root"));
        let worker = executable.with_file_name(if cfg!(windows) {
            "maaverge-core-worker.exe"
        } else {
            "maaverge-core-worker"
        });
        let locks = data.join("locks");
        let events = Arc::new(Mutex::new(Vec::new()));
        let captured = events.clone();
        let emit: Emit = Arc::new(move |name, payload| {
            captured.lock().unwrap().push((name.to_owned(), payload))
        });
        let command = || {
            let mut command = Command::new(&executable);
            command
                .args(["--mode", "native", "--data-dir"])
                .arg(&data)
                .current_dir(&data)
                .env("PATH", "")
                .env("MAAVERGE_MODE", "native")
                .env("MAAVERGE_DEVICE_LOCK_DIR", &locks)
                .env_remove("MAAVERGE_CORE_WORKER_PATH")
                .env("BUN_OPTIONS", "--invalid-option")
                .env("BUN_BE_BUN", "1")
                .env("NODE_OPTIONS", "--invalid-option")
                .env("NODE_PATH", "invalid");
            command
        };
        tauri::async_runtime::block_on(async {
            let runtime = Runtime::start_process(command(), emit.clone())
                .await
                .unwrap();
            let snapshot = runtime
                .request("app.snapshot".into(), json!({}))
                .await
                .unwrap();
            assert_eq!(snapshot["mode"], "native");
            assert_eq!(snapshot["devices"], json!([]));
            assert_eq!(snapshot["plans"], json!([]));
            let mut settings = snapshot["settings"].clone();
            settings["minimizeToTray"] = json!(false);
            // Malformed host requests must fail before HTTP. Keep even a broken
            // validator confined to an unavailable loopback proxy in this smoke.
            settings["downloadProxy"] = json!({ "mode": "manual", "url": "http://127.0.0.1:1" });
            runtime
                .request("settings.save".into(), json!({"settings": settings}))
                .await
                .unwrap();
            assert!(!runtime.close_preferences().minimize_to_tray);
            for params in [
                json!({ "operation": "releases", "operationId": "desktop-host-smoke", "page": 0 }),
                json!({ "operation": "releases", "operationId": "desktop-host-smoke", "page": 1,
                    "url": "https://127.0.0.1/forbidden" }),
                json!({ "operation": "manifest", "operationId": "desktop-host-smoke", "tag": "v0.2.0",
                    "path": "forbidden.bin" }),
            ] {
                let error = runtime
                    .request("host.updates".into(), params)
                    .await
                    .unwrap_err();
                assert!(error.contains("-32602"), "{error}");
            }
            assert_eq!(
                runtime
                    .request(
                        "host.updates".into(),
                        json!({
                            "operation": "cancel", "operationId": "desktop-host-smoke"
                        })
                    )
                    .await
                    .unwrap(),
                json!({ "cancelled": false })
            );
            let proposal = runtime
                .request("agent.message".into(), json!({"message": "刷1-7材料3次"}))
                .await
                .unwrap();
            let mut plan = proposal["plan"].clone();
            plan["id"] = json!("desktop-smoke");
            runtime
                .request("plan.save".into(), json!({"plan": plan}))
                .await
                .unwrap();
            let params = json!({"planId":"desktop-smoke", "deviceId":"missing-device", "requestId":"desktop-once"});
            assert!(runtime.request("run.start".into(), params).await.is_err());
            let lock = locks.join("synthetic-controller.lock");
            std::fs::create_dir_all(&locks).unwrap();
            // Exercise the packaged worker's lease with a synthetic key only.
            let mut owner = std::process::Command::new(&worker)
                .arg("--lease-only")
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .unwrap();
            writeln!(
                owner.stdin.as_mut().unwrap(),
                "{}",
                json!({"protocolVersion":1,"lockPath":lock,"lockTimeoutMs":0})
            )
            .unwrap();
            let mut ready = String::new();
            BufReader::new(owner.stdout.take().unwrap())
                .read_line(&mut ready)
                .unwrap();
            assert_eq!(
                serde_json::from_str::<Value>(&ready).unwrap()["type"],
                "ready"
            );
            assert!(
                !lease(&worker, &lock).status.success(),
                "C++ lease must exclude a second controller"
            );
            owner.stdin.take();
            assert!(owner.wait().unwrap().success());
            runtime.shutdown().await;
            assert!(
                lease(&worker, &lock).status.success(),
                "EOF must release the C++ device lease"
            );
            let restarted = Runtime::start_process(command(), emit).await.unwrap();
            assert!(!restarted.close_preferences().minimize_to_tray);
            let recovered = restarted
                .request("app.snapshot".into(), json!({}))
                .await
                .unwrap();
            assert_eq!(recovered["plans"][0]["id"], "desktop-smoke");
            assert_eq!(recovered["runs"], json!([]));
            restarted.shutdown().await;
            assert!(events
                .lock()
                .unwrap()
                .iter()
                .any(|(name, _)| name == "runtime-event"));
        });
    }
}

#[tauri::command]
pub async fn runtime_request(
    app: AppHandle,
    runtime: tauri::State<'_, Runtime>,
    updater: tauri::State<'_, AppUpdater>,
    method: String,
    params: Option<Value>,
) -> Reply {
    frontend_method(&method)?;
    let params = params.unwrap_or(json!({}));
    if method.starts_with("updates.")
        && params.get("channel").and_then(Value::as_str) == Some("app")
    {
        if params.as_object().is_none_or(|params| params.len() != 1) {
            return Err("应用更新请求参数无效".into());
        }
        return match method.as_str() {
            "updates.check" => updater.check().await,
            "updates.prepare" => updater.prepare().await,
            "updates.activate" => updater.activate(&runtime).await,
            "updates.rollback" => updater.rollback(),
            _ => Err("未知的应用更新操作".into()),
        };
    }
    if runtime.updating.load(Ordering::Acquire) {
        return Err("正在退出并安装应用更新，请等待应用重新启动".into());
    }
    let _request = runtime.update_gate.read().await;
    if runtime.updating.load(Ordering::Acquire) {
        return Err("正在退出并安装应用更新，请等待应用重新启动".into());
    }
    let snapshot = method == "app.snapshot";
    let settings = method == "settings.save";
    let mut result = runtime.request(method, params).await?;
    if settings {
        app.state::<crate::desktop_notifications::DesktopNotifications>()
            .configure(&result);
    }
    if settings && updater.configure(&result) {
        AppUpdater::check_in_background(app, true);
    }
    if snapshot {
        updater.merge_snapshot(&mut result);
    }
    Ok(result)
}
