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
}
