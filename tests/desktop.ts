import type { Page } from "@playwright/test";
export async function mockDesktop(page: Page, configured = false, legacy = false) {
  await page.addInitScript(({ configured, legacy }) => {
    const mock = window as any;
    mock.testCalls = []; mock.failSave = false; mock.hostStatus = "unknown"; mock.sshDelay = false;
    mock.__TAURI_INTERNALS__ = { metadata: { currentWindow: { label: "main" } }, invoke: async (command: string, args: any) => {
      mock.testCalls.push({ command, args: args ? structuredClone(args) : args });
      if (command === "terminal_profiles") return [{ id: "powershell", name: "Windows PowerShell" }, { id: "cmd", name: "CMD" }];
      if (command === "get_preferences") {
        const stored = localStorage.getItem("test-preferences");
        return stored ? JSON.parse(stored) : legacy ? { schemaVersion: 1, setupComplete: true, defaultShell: "cmd", fontSize: 18 } : configured ? { schemaVersion: 2, setupVersion: 2, setupComplete: true, defaultShell: "powershell", fontSize: 15, language: "en", theme: "system", accent: "#71c9bd", editor: "integrated", editorPath: "" } : null;
      }
      if (command === "save_preferences") { if (mock.failSave) throw "preferences_save_failed"; localStorage.setItem("test-preferences", JSON.stringify(args.preferences)); return args.preferences; }
      if (command === "list_sessions") return mock.savedSessions ?? [];
      if (command === "open_terminal") return `terminal-${mock.testCalls.length}`;
      if (command === "read_terminal") return new Promise(resolve => setTimeout(() => resolve({ type: "pending" }), 50));
      if (command === "ssh_probe") return { ticket: "test-ticket", host: "example.test", port: 22, algorithm: "Ed25519", fingerprint: "SHA256:new-test-fingerprint", previousFingerprint: mock.hostStatus === "changed" ? "SHA256:old-test-fingerprint" : null, status: mock.hostStatus };
      if (command === "ssh_open") return mock.sshDelay ? new Promise(resolve => { mock.resolveSsh = resolve; }) : "ssh-test-connection";
      return undefined;
    } };
  }, { configured, legacy });
}
export async function preview(page: Page, name: string) { if (process.env.TERMIX_PREVIEW_DIR) await page.screenshot({ path: `${process.env.TERMIX_PREVIEW_DIR}/${name}.png`, animations: "disabled" }); }
