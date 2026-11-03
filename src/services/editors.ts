import { invoke } from "@tauri-apps/api/core";
export const chooseEditor = () => invoke<string | null>("choose_editor");
export const detectEditor = (editor: string) => invoke<string | null>("detect_editor", { editor });
