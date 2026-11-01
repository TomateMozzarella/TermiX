import { invoke } from "@tauri-apps/api/core";
import type { Session } from "../types";

export const listSessions = () => invoke<Session[]>("list_sessions");
export const saveSession = (session: Session) => invoke<Session>("save_session", { session });
export const deleteSession = (id: string) => invoke<void>("delete_session", { id });
