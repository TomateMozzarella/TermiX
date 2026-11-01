use crate::{error::AppError, models::Session};
use std::{fs, path::PathBuf};

pub struct SessionStore {
    path: PathBuf,
    sessions: Vec<Session>,
}

impl SessionStore {
    pub fn load(path: PathBuf) -> Result<Self, AppError> {
        let sessions = if path.exists() {
            let content = fs::read_to_string(&path)?;
            serde_json::from_str(&content)?
        } else {
            Vec::new()
        };
        Ok(Self { path, sessions })
    }

    pub fn all(&self) -> Vec<Session> {
        self.sessions.clone()
    }

    pub fn upsert(&mut self, session: Session) -> Result<Session, AppError> {
        if let Some(existing) = self.sessions.iter_mut().find(|s| s.id == session.id) {
            *existing = session.clone();
        } else {
            self.sessions.push(session.clone());
        }
        self.persist()?;
        Ok(session)
    }

    pub fn delete(&mut self, id: &str) -> Result<(), AppError> {
        let before = self.sessions.len();
        self.sessions.retain(|s| s.id != id);
        if before == self.sessions.len() {
            return Err(AppError::NotFound(id.to_string()));
        }
        self.persist()
    }

    fn persist(&self) -> Result<(), AppError> {
        let json = serde_json::to_string_pretty(&self.sessions)?;
        let tmp = self.path.with_extension("json.tmp");
        fs::write(&tmp, json)?;
        fs::rename(tmp, &self.path)?;
        Ok(())
    }
}
