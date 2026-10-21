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
use tokio::sync::{oneshot, Mutex as AsyncMutex};

type Reply = Result<Value, String>;
type Pending = Arc<Mutex<HashMap<u64, oneshot::Sender<Reply>>>>;

pub struct Runtime {
    child: AsyncMutex<Option<Child>>,
    stdin: AsyncMutex<Option<ChildStdin>>,
    pending: Pending,
    next_id: AtomicU64,
    minimize_to_tray: AtomicBool,
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
                project.join("services/backend/src/entry.ts").to_string_lossy().into(),
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

impl Runtime {
    pub async fn start(app: AppHandle) -> Result<Self, String> {
        let (executable, arguments) = program(&app)?;
        let mut command = Command::new(executable);
        command
            .args(arguments)
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
        if std::env::var_os("MAAVERGE_MODE").is_none() {
            command.env(
                "MAAVERGE_MODE",
                if cfg!(debug_assertions) {
                    "mock"
                } else {
                    "native"
                },
            );
        }
        #[cfg(windows)]
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        let mut child = command.spawn().map_err(|error| error.to_string())?;
        let stdin = child.stdin.take().ok_or("runtime stdin unavailable")?;
        let stdout = child.stdout.take().ok_or("runtime stdout unavailable")?;
        let stderr = child.stderr.take().ok_or("runtime stderr unavailable")?;
        let pending: Pending = Arc::new(Mutex::new(HashMap::new()));
        let replies = pending.clone();
        let event_app = app.clone();
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
                    let _ = event_app.emit("runtime.event", payload);
                }
            }
            for (_, sender) in replies.lock().expect("pending lock").drain() {
                let _ = sender.send(Err("本地服务已退出，请重启 Maa Verge".into()));
            }
            let _ = event_app.emit(
                "runtime.disconnected",
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
            minimize_to_tray: AtomicBool::new(true),
        };
        runtime.request("app.snapshot".into(), json!({})).await?;
        Ok(runtime)
    }

    pub fn minimize_to_tray(&self) -> bool {
        self.minimize_to_tray.load(Ordering::Relaxed)
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
                    let minimize = if snapshot {
                        value.pointer("/settings/minimizeToTray")
                    } else if settings {
                        value.get("minimizeToTray")
                    } else {
                        None
                    };
                    if let Some(minimize) = minimize.and_then(Value::as_bool) {
                        self.minimize_to_tray.store(minimize, Ordering::Relaxed);
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
        self.stdin.lock().await.take();
        if let Some(mut child) = self.child.lock().await.take() {
            if tokio::time::timeout(Duration::from_secs(5), child.wait())
                .await
                .is_err()
            {
                let _ = child.kill().await;
                let _ = child.wait().await;
            }
        }
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
