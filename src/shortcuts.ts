export const shortcutActions = {
  palette: ["Command palette", "Befehlspalette"],
  newTab: ["New local terminal", "Neues lokales Terminal"],
  connection: ["New connection", "Neue Verbindung"],
  split: ["Split view", "Ansicht teilen"],
  settings: ["Settings", "Einstellungen"],
  help: ["Help", "Hilfe"],
} as const;

export type ShortcutAction = keyof typeof shortcutActions;
export type Shortcuts = Record<ShortcutAction, string>;
export const defaultShortcuts: Shortcuts = {palette: "Ctrl+Shift+P", newTab: "", connection: "", split: "", settings: "", help: ""};
export const shortcutsStorageKey = "termix.workspaceShortcuts";
const supported = /^(?:Ctrl\+Shift\+[A-Z]|Ctrl\+Alt\+Shift\+[A-Z])$/;

export function readShortcuts(): Shortcuts {
  const result = {...defaultShortcuts};
  try {
    const value = JSON.parse(localStorage.getItem(shortcutsStorageKey) ?? "{}");
    for (const action of Object.keys(result) as ShortcutAction[]) {
      if (typeof value?.[action] === "string" && (value[action] === "" || supported.test(value[action]))) result[action] = value[action];
    }
    if (shortcutConflict(result)) return {...defaultShortcuts};
  } catch { return {...defaultShortcuts}; }
  return result;
}

export function shortcutConflict(shortcuts: Shortcuts): boolean {
  const assigned = Object.values(shortcuts).filter(Boolean);
  return new Set(assigned).size !== assigned.length;
}

export function workspaceShortcut(event: KeyboardEvent): string {
  if (!event.ctrlKey || !event.shiftKey || event.metaKey || event.isComposing || event.getModifierState("AltGraph")) return "";
  const code = /^Key([A-Z])$/.exec(event.code)?.[1] ?? "";
  return code ? `Ctrl+${event.altKey ? "Alt+" : ""}Shift+${code}` : "";
}
