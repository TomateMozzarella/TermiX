import { invoke } from "@tauri-apps/api/core";

export interface Preferences {
  schemaVersion: 1;
  setupComplete: boolean;
  defaultShell: string;
  fontSize: number;
}

export const getPreferences = () => invoke<Preferences | null>("get_preferences");
export const savePreferences = (preferences: Preferences) => invoke<Preferences>("save_preferences", { preferences });
