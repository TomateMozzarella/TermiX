use super::*;
#[test]
fn concurrent_instances_and_external_edits_do_not_silently_overwrite_data() {
    let dir = directory();
    let path = dir.join("sessions.json");
    let mut first = SessionStore::load(path.clone()).unwrap();
    let mut second = SessionStore::load(path.clone()).unwrap();
    first.upsert(session("first")).unwrap();
    assert_eq!(
        second.upsert(session("second")).unwrap_err().to_string(),
        "session_changed"
    );
    second.reload().unwrap();
    second.upsert(session("second")).unwrap();
    assert_eq!(SessionStore::load(path.clone()).unwrap().all().len(), 2);
    let lock = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(dir.join("sessions.lock"))
        .unwrap();
    lock.try_lock().unwrap();
    assert_eq!(
        second.delete("second").unwrap_err().to_string(),
        "session_busy"
    );
    drop(lock);
    second.delete("second").unwrap();
    fs::write(&path, b"external change").unwrap();
    assert_eq!(
        second.delete("first").unwrap_err().to_string(),
        "session_changed"
    );
    assert_eq!(fs::read(path).unwrap(), b"external change");
    fs::remove_dir_all(dir).unwrap();
}
fn directory() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("termix-catalog-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&dir).unwrap();
    dir
}
fn session(id: &str) -> Session {
    serde_json::from_value(serde_json::json!({"id":id,"name":"Server","kind":"ssh","host":"https://SERVER.example/","port":22,"username":"user","group":""})).unwrap()
}

#[test]
fn migrates_legacy_groups_backs_up_and_edits_without_losing_identity() {
    let dir = directory();
    let path = dir.join("sessions.json");
    let mut legacy = session("existing");
    legacy.group = "Servers".into();
    let original = serde_json::to_vec(&vec![legacy]).unwrap();
    fs::write(&path, &original).unwrap();
    let mut store = SessionStore::load(path.clone()).unwrap();
    assert_eq!(fs::read(&path).unwrap(), original);
    assert_eq!(store.catalog().folders[0].name, "Servers");
    let mut edit = store.all().remove(0);
    edit.name = "Renamed".into();
    edit.favorite = true;
    let saved = store.upsert(edit).unwrap();
    assert_eq!(saved.id, "existing");
    assert_eq!(saved.host, "server.example");
    assert_eq!(
        fs::read(dir.join("sessions.v1.backup.json")).unwrap(),
        original
    );
    let reloaded = SessionStore::load(path).unwrap();
    assert_eq!(reloaded.all().len(), 1);
    assert!(reloaded.all()[0].favorite);
    fs::remove_dir_all(dir).unwrap();
}
#[test]
fn folder_rename_move_and_delete_preserve_sessions_and_recency() {
    let dir = directory();
    let mut store = SessionStore::load(dir.join("sessions.json")).unwrap();
    store
        .save_folder(Folder {
            id: "folder".into(),
            name: "Production".into(),
        })
        .unwrap();
    let mut first = session("one");
    first.group = "folder".into();
    store.upsert(first).unwrap();
    store.touch("one").unwrap();
    store
        .save_folder(Folder {
            id: "folder".into(),
            name: "Servers".into(),
        })
        .unwrap();
    assert_eq!(store.all()[0].group, "folder");
    assert!(store.all()[0].last_used.is_some());
    store.delete_folder("folder").unwrap();
    assert_eq!(store.all().len(), 1);
    assert!(store.all()[0].group.is_empty());
    assert!(SessionStore::load(dir.join("sessions.json"))
        .unwrap()
        .catalog()
        .folders
        .is_empty());
    fs::remove_dir_all(dir).unwrap();
}
#[test]
fn failed_write_and_invalid_import_leave_memory_and_disk_unchanged() {
    let dir = directory();
    let path = dir.join("sessions.json");
    let mut store = SessionStore::load(path.clone()).unwrap();
    store.upsert(session("one")).unwrap();
    let original = fs::read(&path).unwrap();
    let mut bad = session("one");
    bad.host = "https://user:secret@example.test/path".into();
    assert!(store.upsert(bad).is_err());
    assert_eq!(fs::read(&path).unwrap(), original);
    store.path = dir.join("missing/sessions.json");
    let mut edit = session("one");
    edit.name = "Unsaved".into();
    assert!(store.upsert(edit).is_err());
    assert_eq!(store.all()[0].name, "Server");
    let secret = serde_json::json!([{"id":"one","name":"Server","kind":"ssh","host":"example.test","port":22,"username":"user","group":"","password":"must-not-import"}]);
    assert!(decode(secret.clone(), true).is_err());
    assert!(decode(secret, false).is_err());
    fs::write(&path, b"corrupt").unwrap();
    assert!(SessionStore::load(path.clone()).is_err());
    assert_eq!(fs::read(path).unwrap(), b"corrupt");
    fs::remove_dir_all(dir).unwrap();
}
#[test]
fn import_merges_without_overwriting_ids_or_importing_history_and_export_has_no_secret_material() {
    let dir = directory();
    let mut store = SessionStore::load(dir.join("sessions.json")).unwrap();
    store.upsert(session("same-id")).unwrap();
    store.touch("same-id").unwrap();
    let mut incoming = store.catalog();
    incoming.sessions[0].name = "Imported".into();
    store.import(incoming).unwrap();
    let sessions = store.all();
    assert_eq!(sessions.len(), 2);
    assert_ne!(sessions[0].id, sessions[1].id);
    assert!(sessions[1].last_used.is_none());
    assert_eq!(sessions[0].name, "Server");
    let exported = String::from_utf8(store.export().unwrap()).unwrap();
    assert!(!exported.contains("password"));
    assert!(!exported.contains("PRIVATE KEY"));
    assert_eq!(
        decode(serde_json::from_str(&exported).unwrap(), true)
            .unwrap()
            .sessions
            .len(),
        2
    );
    fs::remove_dir_all(dir).unwrap();
}
