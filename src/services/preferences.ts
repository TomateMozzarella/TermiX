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
  editorOpenMode: "integrated" | "external";
  sftpLayout: "shared" | "panel";
  sftpSide: "left" | "right";
  sftpStart: string;
  terminalPalette: "auto" | "dark" | "light";
}

export const defaults = (shell: string): Preferences => ({ schemaVersion: 2, setupComplete: false, setupVersion: 0, defaultShell: shell, fontSize: 15, language: "en", theme: "system", accent: "#71c9bd", editor: "integrated", editorPath: "", uiScale: 100, editorOpenMode: "integrated", sftpLayout: "shared", sftpSide: "left", sftpStart: ".", terminalPalette: "auto" });

export const getPreferences = () => invoke<Preferences | null>("get_preferences");
export const savePreferences = (preferences: Preferences) => invoke<Preferences>("save_preferences", { preferences });
