import { invoke } from "@tauri-apps/api/core";
import type { Language } from "../i18n";

export interface Preferences {
  schemaVersion: 2;
  setupComplete: boolean;
  defaultShell: string;
  fontSize: number;
  setupVersion: number;
  language: Language;
  theme: "system" | "dark" | "light";
  accent: string;
  editor: "integrated" | "notepad++" | "vscode" | "custom";
  editorPath: string;
  uiScale: number;
}

export const defaults = (shell: string): Preferences => ({ schemaVersion: 2, setupComplete: false, setupVersion: 0, defaultShell: shell, fontSize: 15, language: "en", theme: "system", accent: "#71c9bd", editor: "integrated", editorPath: "", uiScale: 100 });

export const getPreferences = () => invoke<Preferences | null>("get_preferences");
export const savePreferences = (preferences: Preferences) => invoke<Preferences>("save_preferences", { preferences });
