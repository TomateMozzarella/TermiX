use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionKind {
    Ssh,
    Local,
    Rdp,
    Serial,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub name: String,
    pub kind: SessionKind,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub group: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth_method: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub key_path: Option<String>,
}

#[cfg(test)]
mod tests {
    #[test]
    fn legacy_sessions_load_and_secret_fields_are_not_serialized() {
        let json = serde_json::json!({ "id":"one", "name":"server", "kind":"ssh", "host":"example.test", "port":22, "username":"user", "group":"General", "password":"never-persist-this", "passphrase":"never-persist-passphrase", "authMethod":"key", "keyPath":"C:\\keys\\existing-key" });
        let session: super::Session = serde_json::from_value(json).unwrap();
        let serialized = serde_json::to_string(&session).unwrap();
        assert!(!serialized.contains("never-persist"));
        assert!(!serialized.contains("password"));
        assert!(serialized.contains("existing-key"));
        let legacy: super::Session = serde_json::from_str(r#"{"id":"one","name":"local","kind":"local","host":"","port":22,"username":"","group":"General"}"#).unwrap();
        assert!(legacy.auth_method.is_none());
        assert!(legacy.key_path.is_none());
    }
}
