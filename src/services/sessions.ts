import { invoke } from "@tauri-apps/api/core";
import type { Session, SessionCatalog, SessionFolder } from "../types";

export const listSessions = () => invoke<Session[]>("list_sessions");
export const saveSession = (session: Session) => invoke<Session>("save_session", { session });
export const deleteSession = (id: string) => invoke<void>("delete_session", { id });
export const getCatalog = () => invoke<SessionCatalog>("get_catalog");
export const reloadCatalog = () => invoke<SessionCatalog>("reload_catalog");
export const saveFolder = (folder: SessionFolder) => invoke<SessionCatalog>("save_folder", { folder });
export const deleteFolder = (id: string) => invoke<SessionCatalog>("delete_folder", { id });
export const touchSession = (id: string) => invoke<SessionCatalog>("touch_session", { id });
export const pickSessionImport = () => invoke<SessionCatalog | null>("pick_session_import");
export const importSessions = (catalog: SessionCatalog) => invoke<SessionCatalog>("import_sessions", { catalog });
export const exportSessions = () => invoke<boolean>("export_sessions");
