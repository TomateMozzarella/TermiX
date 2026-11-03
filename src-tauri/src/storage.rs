use crate::{
    error::AppError,
    models::{Catalog, Folder, Session, SessionKind},
};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

const MAX_BYTES: usize = 4 * 1024 * 1024;
fn invalid(code: &str) -> AppError {
    AppError::Validation(code.into())
}

pub struct SessionStore {
    path: PathBuf,
    catalog: Catalog,
    legacy: Option<Vec<u8>>,
    snapshot: Option<Vec<u8>>,
}

impl SessionStore {
    pub fn load(path: PathBuf) -> Result<Self, AppError> {
        let (catalog, legacy, snapshot) = match fs::File::open(&path) {
            Ok(file) => {
                let bytes = read_bounded(file)?;
                let value: serde_json::Value = serde_json::from_slice(&bytes)?;
                let legacy = value.is_array();
                let catalog = decode(value, false)?;
                (catalog, legacy.then_some(bytes.clone()), Some(bytes))
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (Catalog::default(), None, None),
            Err(e) => return Err(e.into()),
        };
        Ok(Self {
            path,
            catalog,
            legacy,
            snapshot,
        })
    }
    pub fn all(&self) -> Vec<Session> {
        self.catalog.sessions.clone()
    }
    pub fn catalog(&self) -> Catalog {
        self.catalog.clone()
    }
    pub fn reload(&mut self) -> Result<Catalog, AppError> {
        let latest = Self::load(self.path.clone())?;
        *self = latest;
        Ok(self.catalog())
    }
    pub fn upsert(&mut self, mut session: Session) -> Result<Session, AppError> {
        normalize_session(&mut session)?;
        let mut next = self.catalog.clone();
        if let Some(existing) = next.sessions.iter_mut().find(|s| s.id == session.id) {
            session.last_used = existing.last_used;
            *existing = session.clone();
        } else {
            session.last_used = None;
            next.sessions.push(session.clone());
        }
        self.commit(next)?;
        Ok(session)
    }
    pub fn delete(&mut self, id: &str) -> Result<(), AppError> {
        let mut next = self.catalog.clone();
        let before = next.sessions.len();
        next.sessions.retain(|s| s.id != id);
        if before == next.sessions.len() {
            return Err(invalid("session_missing"));
        }
        self.commit(next)
    }
    pub fn touch(&mut self, id: &str) -> Result<Catalog, AppError> {
        let mut next = self.catalog.clone();
        let session = next
            .sessions
            .iter_mut()
            .find(|s| s.id == id)
            .ok_or_else(|| invalid("session_missing"))?;
        session.last_used = Some(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
        );
        self.commit(next)?;
        Ok(self.catalog())
    }
    pub fn save_folder(&mut self, mut folder: Folder) -> Result<Catalog, AppError> {
        folder.name = folder.name.trim().into();
        let mut next = self.catalog.clone();
        if let Some(existing) = next.folders.iter_mut().find(|f| f.id == folder.id) {
            *existing = folder;
        } else {
            next.folders.push(folder);
        }
        self.commit(next)?;
        Ok(self.catalog())
    }
    pub fn delete_folder(&mut self, id: &str) -> Result<Catalog, AppError> {
        let mut next = self.catalog.clone();
        if !next.folders.iter().any(|f| f.id == id) {
            return Err(invalid("folder_missing"));
        }
        next.folders.retain(|f| f.id != id);
        for session in &mut next.sessions {
            if session.group == id {
                session.group.clear();
            }
        }
        self.commit(next)?;
        Ok(self.catalog())
    }
    pub fn export(&self) -> Result<Vec<u8>, AppError> {
        Ok(serde_json::to_vec_pretty(&self.catalog)?)
    }
    pub fn read_import(path: &Path) -> Result<Catalog, AppError> {
        let bytes = read_bounded(fs::File::open(path)?)?;
        decode(serde_json::from_slice(&bytes)?, true)
    }
    pub fn import(&mut self, mut incoming: Catalog) -> Result<Catalog, AppError> {
        validate(&incoming)?;
        let mut next = self.catalog.clone();
        let mut ids = HashMap::new();
        for folder in &mut incoming.folders {
            // Merge a matching folder by name, never overwrite a session by ID.
            let id = next
                .folders
                .iter()
                .find(|f| f.name.eq_ignore_ascii_case(&folder.name))
                .map(|f| f.id.clone())
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            ids.insert(folder.id.clone(), id.clone());
            if !next.folders.iter().any(|f| f.id == id) {
                next.folders.push(Folder {
                    id,
                    name: folder.name.clone(),
                });
            }
        }
        for mut session in incoming.sessions {
            session.id = uuid::Uuid::new_v4().to_string();
            if !session.group.is_empty() {
                session.group = ids
                    .get(&session.group)
                    .ok_or_else(|| invalid("folder_missing"))?
                    .clone();
            }
            session.last_used = None;
            next.sessions.push(session);
        }
        self.commit(next)?;
        Ok(self.catalog())
    }
    fn commit(&mut self, mut next: Catalog) -> Result<(), AppError> {
        // The OS releases this lock on process exit/crash. A separate lock file
        // keeps the lock stable while sessions.json is atomically replaced.
        let lock = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(self.path.with_file_name("sessions.lock"))?;
        lock.try_lock().map_err(|_| invalid("session_busy"))?;
        let current = match fs::File::open(&self.path) {
            Ok(file) => Some(read_bounded(file)?),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
            Err(e) => return Err(e.into()),
        };
        if current != self.snapshot {
            return Err(invalid("session_changed"));
        }
        next.revision = self.catalog.revision.saturating_add(1);
        for session in &mut next.sessions {
            normalize_session(session)?;
        }
        validate(&next)?;
        let bytes = serde_json::to_vec_pretty(&next)?;
        if bytes.len() > MAX_BYTES {
            return Err(invalid("session_limit"));
        }
        if let Some(original) = &self.legacy {
            let backup = self.path.with_file_name("sessions.v1.backup.json");
            match fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&backup)
            {
                Ok(mut file) => {
                    file.write_all(original)?;
                    file.sync_all()?;
                }
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                    if fs::read(&backup)? != *original {
                        return Err(invalid("session_backup_conflict"));
                    }
                }
                Err(e) => return Err(e.into()),
            }
        }
        crate::atomic::write(&self.path, &bytes)?;
        // Publish the new in-memory state only after the atomic write succeeds.
        self.catalog = next;
        self.legacy = None;
        self.snapshot = Some(bytes);
        Ok(())
    }
}

fn read_bounded(file: fs::File) -> Result<Vec<u8>, AppError> {
    let mut bytes = Vec::new();
    file.take(MAX_BYTES as u64 + 1).read_to_end(&mut bytes)?;
    if bytes.len() > MAX_BYTES {
        return Err(invalid("session_limit"));
    }
    Ok(bytes)
}

fn text(value: &str, max: usize, allow_empty: bool) -> bool {
    (allow_empty || !value.trim().is_empty())
        && value.len() <= max
        && !value.chars().any(char::is_control)
}
fn normalize_session(session: &mut Session) -> Result<(), AppError> {
    session.name = session.name.trim().into();
    session.username = session.username.trim().into();
    if session.kind == SessionKind::Ssh {
        let endpoint =
            crate::address::normalize(&session.host, session.port).map_err(AppError::Validation)?;
        session.host = endpoint.host;
        session.port = endpoint.port;
        if !text(&session.username, 256, false) {
            return Err(invalid("invalid_username"));
        }
    }
    if !text(&session.id, 128, false)
        || !text(&session.name, 120, false)
        || !text(&session.group, 128, true)
        || !text(&session.host, 253, true)
        || !text(&session.username, 256, true)
        || session
            .key_path
            .as_ref()
            .is_some_and(|p| !text(p, 4096, true))
    {
        return Err(invalid("session_invalid"));
    }
    if session
        .auth_method
        .as_ref()
        .is_some_and(|m| !["agent", "password", "stored", "key"].contains(&m.as_str()))
    {
        return Err(invalid("session_invalid"));
    }
    if session
        .shell_profile
        .as_ref()
        .is_some_and(|p| !crate::terminal::profiles().iter().any(|s| s.id == p))
    {
        return Err(invalid("invalid_profile"));
    }
    if session.font_size.is_some_and(|n| !(11..=22).contains(&n)) {
        return Err(invalid("invalid_font"));
    }
    Ok(())
}
fn validate(catalog: &Catalog) -> Result<(), AppError> {
    if catalog.schema_version != 2 {
        return Err(invalid("session_version"));
    }
    if catalog.sessions.len() > 2000 || catalog.folders.len() > 200 {
        return Err(invalid("session_limit"));
    }
    let mut folder_ids = HashSet::new();
    let mut names = HashSet::new();
    for folder in &catalog.folders {
        if !text(&folder.id, 128, false)
            || !text(&folder.name, 80, false)
            || !folder_ids.insert(folder.id.clone())
            || !names.insert(folder.name.trim().to_lowercase())
        {
            return Err(invalid("folder_invalid"));
        }
    }
    let mut session_ids = HashSet::new();
    for session in &catalog.sessions {
        let mut normalized = session.clone();
        normalize_session(&mut normalized)?;
        if !session_ids.insert(session.id.clone()) {
            return Err(invalid("session_invalid"));
        }
        if !session.group.is_empty() && !folder_ids.contains(&session.group) {
            return Err(invalid("folder_missing"));
        }
    }
    Ok(())
}
fn decode(value: serde_json::Value, strict_import: bool) -> Result<Catalog, AppError> {
    // Legacy bytes are backed up verbatim, so reject unknown/credential fields
    // before creating that backup as well as before accepting imported files.
    if strict_import || value.is_array() {
        let sessions = if value.is_array() {
            value.as_array()
        } else {
            value.get("sessions").and_then(|v| v.as_array())
        }
        .ok_or_else(|| invalid("session_invalid"))?;
        const ALLOWED: &[&str] = &[
            "id",
            "name",
            "kind",
            "host",
            "port",
            "username",
            "group",
            "authMethod",
            "keyPath",
            "favorite",
            "lastUsed",
            "shellProfile",
            "fontSize",
        ];
        for session in sessions {
            if session
                .as_object()
                .is_none_or(|s| s.keys().any(|k| !ALLOWED.contains(&k.as_str())))
            {
                return Err(invalid("session_import_fields"));
            }
        }
    }
    let mut catalog = if value.is_array() {
        let mut catalog = Catalog {
            sessions: serde_json::from_value(value)?,
            ..Catalog::default()
        };
        let mut groups = HashMap::new();
        for session in &mut catalog.sessions {
            if !session.group.trim().is_empty() {
                let name = session.group.trim().to_owned();
                let id = groups.entry(name.to_lowercase()).or_insert_with(|| {
                    let id = uuid::Uuid::new_v4().to_string();
                    catalog.folders.push(Folder {
                        id: id.clone(),
                        name,
                    });
                    id
                });
                session.group = id.clone();
            } else {
                session.group.clear();
            }
        }
        catalog
    } else {
        serde_json::from_value::<Catalog>(value)?
    };
    for session in &mut catalog.sessions {
        normalize_session(session)?;
    }
    validate(&catalog)?;
    Ok(catalog)
}

#[cfg(test)]
mod tests;
