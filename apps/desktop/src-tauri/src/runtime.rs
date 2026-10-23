use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{oneshot, Mutex as AsyncMutex};

type Reply = Result<Value, String>;
type Pending = Arc<Mutex<HashMap<u64, oneshot::Sender<Reply>>>>;
type Emit = Arc<dyn Fn(&str, Value) + Send + Sync>;

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
}

fn program(app: &AppHandle) -> Result<(PathBuf, Vec<String>), String> {
    if cfg!(debug_assertions) {
        let project = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../..")
            .canonicalize()
            .map_err(|error| error.to_string())?;
        if std::env::var("MAAVERGE_BACKEND").as_deref() == Ok("python") {
            let python = project.join(if cfg!(windows) {
                ".venv/Scripts/python.exe"
            } else {
                ".venv/bin/python"
            });
            if !python.is_file() {
                return Err("Python 参考环境未准备，请运行 uv sync --frozen".into());
            }
            return Ok((python, vec!["-m".into(), "maaverge_runtime".into()]));
        }
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

fn application_directory() -> Result<PathBuf, String> {
    let executable = if cfg!(target_os = "linux") {
        std::env::var_os("APPIMAGE")
            .map(PathBuf::from)
            .filter(|path| path.is_absolute())
            .unwrap_or(std::env::current_exe().map_err(|error| error.to_string())?)
    } else {
        std::env::current_exe().map_err(|error| error.to_string())?
    };
    let directory = executable.parent().ok_or("无法定位应用程序目录")?;
    // A macOS bundle is the program; keep downloaded components alongside .app.
    if cfg!(target_os = "macos") && directory.file_name().is_some_and(|name| name == "MacOS") {
        if let Some(bundle) = directory.parent().and_then(|contents| contents.parent()) {
            if bundle
                .extension()
                .is_some_and(|extension| extension == "app")
            {
                return bundle
                    .parent()
                    .map(PathBuf::from)
                    .ok_or("无法定位应用程序目录".into());
            }
        }
    }
    Ok(directory.to_path_buf())
}

impl Runtime {
    pub async fn start(app: AppHandle) -> Result<Self, String> {
        if std::env::var_os("MAAVERGE_MODE").is_some_and(|mode| mode != "native") {
            return Err("模拟运行模式已移除，请移除 MAAVERGE_MODE 环境变量或设置为 native".into());
        }
        let (executable, arguments) = program(&app)?;
        let mut command = Command::new(executable);
        command.args(arguments);
        if !cfg!(debug_assertions) {
            // The service lives in resource_dir/runtime, not beside the main executable.
            command.env("MAAVERGE_APP_DIR", application_directory()?);
        }
        let emit: Emit = Arc::new(move |event, payload| {
            let _ = app.emit(event, payload);
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
            .env("PYTHONUNBUFFERED", "1")
            .env("PYTHONUTF8", "1")
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
                } else if message.get("method").and_then(Value::as_str) == Some("runtime.event") {
                    let payload = message.get("params").cloned().unwrap_or(Value::Null);
                    // JSON-RPC method names may contain dots; Tauri event names may not.
                    emit("runtime-event", payload);
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

    pub async fn request(&self, method: String, params: Value) -> Reply {
        if method.len() > 128 || params.to_string().len() > 1024 * 1024 {
            return Err("请求超出本地服务限制".into());
        }
        let snapshot = method == "app.snapshot";
        let settings = method == "settings.save";
        let timeout = if matches!(
            method.as_str(),
            "updates.prepare" | "updates.activate" | "updates.rollback"
        ) {
            Duration::from_secs(1800)
        } else {
            Duration::from_secs(120)
        };
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (sender, receiver) = oneshot::channel();
        self.pending
            .lock()
            .expect("pending lock")
            .insert(id, sender);
        let message = format!(
            "{}\n",
            json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params })
        );
        let written = {
            let mut stdin = self.stdin.lock().await;
            match stdin.as_mut() {
                Some(stdin) => stdin.write_all(message.as_bytes()).await,
                None => Err(std::io::Error::new(
                    std::io::ErrorKind::BrokenPipe,
                    "runtime stopped",
                )),
            }
        };
        if let Err(error) = written {
            self.pending.lock().expect("pending lock").remove(&id);
            return Err(format!("本地服务连接中断: {error}"));
        }
        match tokio::time::timeout(timeout, receiver).await {
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
        // EOF lets the service destroy native instances and close storage first.
        if let Some(mut child) = self.child.lock().await.take() {
            let graceful = async {
                // Include a concurrent blocked stdin write in the same deadline.
                self.stdin.lock().await.take();
                child.wait().await
            };
            if !matches!(
                tokio::time::timeout(Duration::from_secs(5), graceful).await,
                Ok(Ok(_))
            ) {
                let _ = child.kill().await;
                let _ = child.wait().await;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Write};
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
        }
    }

    #[test]
    #[ignore = "synthetic subprocess fixture for shutdown tests"]
    fn shutdown_fixture() {
        match std::env::var("MAAVERGE_TEST_SHUTDOWN_FIXTURE").as_deref() {
            Ok("eof") => {
                std::io::copy(&mut std::io::stdin().lock(), &mut std::io::sink()).unwrap();
            }
            Ok("hang") => std::thread::sleep(Duration::from_secs(30)),
            _ => {}
        }
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
            runtime
                .request("settings.save".into(), json!({"settings": settings}))
                .await
                .unwrap();
            assert!(!runtime.close_preferences().minimize_to_tray);
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
    runtime: tauri::State<'_, Runtime>,
    method: String,
    params: Option<Value>,
) -> Reply {
    runtime.request(method, params.unwrap_or(json!({}))).await
}
