//! Model credentials belong to the desktop host, never to business settings or events.
// 对外只返回配置状态；实际密钥按数据根和提供商端点隔离，由宿主临时交给当前调用。
use reqwest::Url;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};
use zeroize::Zeroizing;

const SERVICE: &str = "com.maaverge.agent.model";
const UNAVAILABLE: &str = "系统凭据存储不可用或已锁定；请解锁后重试，或明确选择仅本次桌面会话";

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum StoreError {
    Unavailable,
}

pub(crate) trait CredentialStore: Send + Sync {
    fn get(&self, account: &str) -> Result<Option<String>, StoreError>;
    fn set(&self, account: &str, secret: &str) -> Result<(), StoreError>;
    fn delete(&self, account: &str) -> Result<(), StoreError>;
}

struct SystemStore;
impl CredentialStore for SystemStore {
    fn get(&self, account: &str) -> Result<Option<String>, StoreError> {
        let entry = keyring::Entry::new(SERVICE, account).map_err(|_| StoreError::Unavailable)?;
        match entry.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(StoreError::Unavailable),
        }
    }
    fn set(&self, account: &str, secret: &str) -> Result<(), StoreError> {
        keyring::Entry::new(SERVICE, account)
            .and_then(|entry| entry.set_password(secret))
            .map_err(|_| StoreError::Unavailable)
    }
    fn delete(&self, account: &str) -> Result<(), StoreError> {
        let entry = keyring::Entry::new(SERVICE, account).map_err(|_| StoreError::Unavailable)?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(StoreError::Unavailable),
        }
    }
}

pub(crate) fn normalize_model(value: &Value) -> Result<Value, String> {
    let field = |key| value.get(key).and_then(Value::as_str).unwrap_or("").trim();
    let provider = field("provider").to_ascii_lowercase();
    let model = field("model");
    if provider.is_empty() || provider == "none" || model.is_empty() {
        return Err("请先保存模型提供商、API 地址和模型名称".into());
    }
    let address = Url::parse(field("baseUrl")).map_err(|_| "模型 API 地址无效")?;
    // 仅回环地址允许明文 HTTP，且 API 地址本身不得携带认证信息或查询参数。
    let loopback = address.host_str().is_some_and(|host| {
        host == "localhost"
            || host == "[::1]"
            || host
                .parse::<std::net::IpAddr>()
                .is_ok_and(|ip| ip.is_loopback())
    });
    if !(address.scheme() == "https" || address.scheme() == "http" && loopback)
        || !address.username().is_empty()
        || address.password().is_some()
        || address.query().is_some()
        || address.fragment().is_some()
    {
        return Err(
            "模型 API 地址须使用 HTTPS（本机回环地址可用 HTTP），且不能包含凭据、查询或片段".into(),
        );
    }
    Ok(json!({"provider":provider,"baseUrl":address.as_str().trim_end_matches('/'),"model":model}))
}

fn scope(root: &Path, model: &Value) -> String {
    // A model-name change on the same provider endpoint may reuse its credential.
    let identity = json!([root.to_string_lossy(), model["provider"], model["baseUrl"]]);
    format!("{:x}", Sha256::digest(identity.to_string().as_bytes()))
}

pub(crate) struct Credentials {
    store: Arc<dyn CredentialStore>,
    // 会话密钥不落盘，覆盖或移除时由 Zeroizing 清理该字符串持有的内存。
    sessions: Mutex<HashMap<String, Zeroizing<String>>>,
}

impl Default for Credentials {
    fn default() -> Self {
        Self::new(Arc::new(SystemStore))
    }
}

impl Credentials {
    fn new(store: Arc<dyn CredentialStore>) -> Self {
        Self {
            store,
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub(crate) fn status(&self, root: &Path, model: &Value) -> Value {
        let account = scope(root, model);
        // 显式设置的会话值优先于钥匙串，但状态接口始终不返回密钥内容。
        if self
            .sessions
            .lock()
            .expect("credential session lock")
            .contains_key(&account)
        {
            return json!({"configured":true,"storage":"session","available":true});
        }
        match self.store.get(&account) {
            Ok(secret) => {
                let configured = secret.as_ref().is_some_and(|value| !value.is_empty());
                let _secret = secret.map(Zeroizing::new);
                json!({"configured":configured,"storage":if configured {"keychain"} else {"none"},"available":true})
            }
            Err(_) => json!({"configured":false,"storage":"none","available":false}),
        }
    }

    pub(crate) fn handle(
        &self,
        method: &str,
        params: &Value,
        root: &Path,
        model: &Value,
    ) -> Result<Value, String> {
        let object = params.as_object().ok_or("凭据请求参数无效")?;
        let account = scope(root, model);
        match method {
            "model.credential.status" if object.is_empty() => Ok(self.status(root, model)),
            "model.credential.set" if object.len() == 2 => {
                let secret = params["secret"].as_str().ok_or("密钥必须是字符串")?;
                if secret.trim().is_empty()
                    || secret.len() > 8192
                    || secret.chars().any(char::is_control)
                {
                    return Err("密钥为空、过长或包含控制字符".into());
                }
                match params["storage"].as_str() {
                    Some("keychain") => {
                        // 先确认系统存储成功，再撤掉会话覆盖；失败不静默改变存储策略。
                        self.store.set(&account, secret).map_err(|_| UNAVAILABLE)?;
                        self.sessions
                            .lock()
                            .expect("credential session lock")
                            .remove(&account);
                    }
                    Some("session") => {
                        // Explicit session choice never writes a keychain entry or plaintext file.
                        self.sessions
                            .lock()
                            .expect("credential session lock")
                            .insert(account, Zeroizing::new(secret.to_owned()));
                    }
                    _ => return Err("请选择系统凭据存储或仅本次桌面会话".into()),
                }
                Ok(self.status(root, model))
            }
            "model.credential.delete" if object.is_empty() => {
                self.sessions
                    .lock()
                    .expect("credential session lock")
                    .remove(&account);
                self.store.delete(&account).map_err(|_| UNAVAILABLE)?;
                Ok(self.status(root, model))
            }
            _ => Err("凭据请求参数无效".into()),
        }
    }

    pub(crate) fn resolve(
        &self,
        root: &Path,
        model: &Value,
    ) -> Result<Option<Zeroizing<String>>, String> {
        let account = scope(root, model);
        if let Some(secret) = self
            .sessions
            .lock()
            .expect("credential session lock")
            .get(&account)
        {
            return Ok(Some(Zeroizing::new(secret.to_string())));
        }
        self.store
            .get(&account)
            .map(|secret| secret.map(Zeroizing::new))
            .map_err(|_| UNAVAILABLE.into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Default)]
    struct MemoryStore(Mutex<HashMap<String, String>>);
    impl CredentialStore for MemoryStore {
        fn get(&self, account: &str) -> Result<Option<String>, StoreError> {
            Ok(self.0.lock().unwrap().get(account).cloned())
        }
        fn set(&self, account: &str, secret: &str) -> Result<(), StoreError> {
            self.0.lock().unwrap().insert(account.into(), secret.into());
            Ok(())
        }
        fn delete(&self, account: &str) -> Result<(), StoreError> {
            self.0.lock().unwrap().remove(account);
            Ok(())
        }
    }
    fn model(address: &str) -> Value {
        normalize_model(&json!({"provider":"openai-compatible","baseUrl":address,"model":"test"}))
            .unwrap()
    }

    #[test]
    fn credentials_are_scoped_and_never_returned_in_public_status() {
        let store = Arc::new(MemoryStore::default());
        let credentials = Credentials::new(store.clone());
        let root = Path::new("/synthetic/one");
        let profile = model("https://EXAMPLE.com:443/v1/");
        let status = credentials
            .handle(
                "model.credential.set",
                &json!({"secret":"sentinel-credential","storage":"keychain"}),
                root,
                &profile,
            )
            .unwrap();
        assert_eq!(
            status,
            json!({"configured":true,"storage":"keychain","available":true})
        );
        assert!(!status.to_string().contains("sentinel"));
        assert_eq!(
            credentials
                .resolve(root, &profile)
                .unwrap()
                .as_deref()
                .map(String::as_str),
            Some("sentinel-credential")
        );
        assert!(credentials
            .resolve(Path::new("/synthetic/two"), &profile)
            .unwrap()
            .is_none());
        assert!(credentials
            .resolve(root, &model("https://other.example/v1"))
            .unwrap()
            .is_none());
        credentials
            .handle("model.credential.delete", &json!({}), root, &profile)
            .unwrap();
        assert!(store.0.lock().unwrap().is_empty());
    }

    #[test]
    fn explicit_session_storage_does_not_persist_and_new_hosts_do_not_inherit_it() {
        let store = Arc::new(MemoryStore::default());
        let credentials = Credentials::new(store.clone());
        let root = Path::new("/synthetic");
        let profile = model("https://example.com/v1");
        credentials
            .handle(
                "model.credential.set",
                &json!({"secret":"session-secret","storage":"session"}),
                root,
                &profile,
            )
            .unwrap();
        assert_eq!(credentials.status(root, &profile)["storage"], "session");
        assert!(store.0.lock().unwrap().is_empty());
        assert!(Credentials::new(store)
            .resolve(root, &profile)
            .unwrap()
            .is_none());
        assert!(credentials
            .handle("model.credential.get", &json!({}), root, &profile)
            .is_err());
    }

    #[test]
    fn unavailable_keychains_never_silently_fall_back_to_session_storage() {
        struct UnavailableStore;
        impl CredentialStore for UnavailableStore {
            fn get(&self, _: &str) -> Result<Option<String>, StoreError> {
                Err(StoreError::Unavailable)
            }
            fn set(&self, _: &str, _: &str) -> Result<(), StoreError> {
                Err(StoreError::Unavailable)
            }
            fn delete(&self, _: &str) -> Result<(), StoreError> {
                Err(StoreError::Unavailable)
            }
        }
        let credentials = Credentials::new(Arc::new(UnavailableStore));
        let root = Path::new("/synthetic");
        let profile = model("https://example.com/v1");
        assert_eq!(
            credentials.status(root, &profile),
            json!({"configured":false,"storage":"none","available":false})
        );
        let failure = credentials
            .handle(
                "model.credential.set",
                &json!({"secret":"never-persist-sentinel","storage":"keychain"}),
                root,
                &profile,
            )
            .unwrap_err();
        assert_eq!(failure, UNAVAILABLE);
        assert!(!failure.contains("sentinel"));
        assert!(credentials.sessions.lock().unwrap().is_empty());
        assert!(credentials.resolve(root, &profile).is_err());
        assert_eq!(
            credentials
                .handle(
                    "model.credential.set",
                    &json!({"secret":"explicit-session-sentinel","storage":"session"}),
                    root,
                    &profile,
                )
                .unwrap()["storage"],
            "session"
        );
        assert_eq!(
            credentials
                .resolve(root, &profile)
                .unwrap()
                .as_deref()
                .map(String::as_str),
            Some("explicit-session-sentinel")
        );
    }

    #[test]
    fn endpoints_reject_secret_bearing_and_insecure_remote_urls() {
        for address in [
            "http://remote.example/v1",
            "https://user:pass@example.com/v1",
            "https://example.com/v1?key=secret",
            "https://example.com/v1#secret",
        ] {
            assert!(normalize_model(
                &json!({"provider":"openai-compatible","baseUrl":address,"model":"test"})
            )
            .is_err());
        }
        assert_eq!(
            model("https://EXAMPLE.com:443/v1/")["baseUrl"],
            "https://example.com/v1"
        );
        assert_eq!(
            model("http://127.0.0.1:1234/v1")["baseUrl"],
            "http://127.0.0.1:1234/v1"
        );
    }
}
