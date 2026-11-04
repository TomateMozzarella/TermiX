import type { Page } from "@playwright/test";
export async function mockDesktop(page: Page, configured = false, legacy = false) {
  await page.addInitScript(({ configured, legacy }) => {
    const mock = window as any;
    mock.testCalls = []; mock.failSave = false; mock.failLibrary = false; mock.hostStatus = "unknown"; mock.sshDelay = false;
    mock.catalog = JSON.parse(localStorage.getItem("test-catalog") ?? 'null') ?? { schemaVersion: 2, revision: 0, folders: [], sessions: [] };
    const seed = () => {
      if (mock.savedSessions && !mock.seedLoaded) {
        mock.seedLoaded = true; mock.catalog.sessions = structuredClone(mock.savedSessions);
        for (const s of mock.catalog.sessions) { if (s.group && !mock.catalog.folders.some((f: any) => f.id === s.group)) mock.catalog.folders.push({ id: s.group, name: s.group }); }
      }
    };
    const persist = () => { mock.catalog.revision++; localStorage.setItem("test-catalog", JSON.stringify(mock.catalog)); return structuredClone(mock.catalog); };
    mock.__TAURI_INTERNALS__ = { metadata: { currentWindow: { label: "main" } }, invoke: async (command: string, args: any) => {
      mock.testCalls.push({ command, args: args ? structuredClone(args) : args });
      if (command === "terminal_profiles") return [{ id: "powershell", name: "Windows PowerShell" }, { id: "cmd", name: "CMD" }];
      if (command === "get_preferences") {
        const stored = localStorage.getItem("test-preferences");
        return stored ? JSON.parse(stored) : legacy ? { schemaVersion: 1, setupComplete: true, defaultShell: "cmd", fontSize: 18 } : configured ? { schemaVersion: 2, setupVersion: 2, setupComplete: true, defaultShell: "powershell", fontSize: 15, language: "en", theme: "system", accent: "#71c9bd", editor: "integrated", editorPath: "", uiScale: 100 } : null;
      }
      if (command === "save_preferences") { if (mock.failSave) throw "preferences_save_failed"; localStorage.setItem("test-preferences", JSON.stringify(args.preferences)); return structuredClone(args.preferences); }
      if (command === "detect_editor") return mock.detectedEditorPath ?? null;
      if (command === "choose_editor") return mock.editorPickedPath ?? null;
      if (command === "get_catalog") { seed(); return structuredClone(mock.catalog); }
      if (command === "reload_catalog") { if (mock.externalCatalog) mock.catalog = structuredClone(mock.externalCatalog); return persist(); }
      if (command === "list_sessions") { seed(); return structuredClone(mock.catalog.sessions); }
      if (["save_session", "save_folder", "delete_session", "delete_folder", "import_sessions", "touch_session"].includes(command)) {
        if (mock.failLibrary) throw mock.libraryFailure ?? "session_save_failed";
        seed();
        if (command === "save_session") {
          const session = structuredClone(args.session), index = mock.catalog.sessions.findIndex((s: any) => s.id === session.id);
          session.lastUsed = index >= 0 ? mock.catalog.sessions[index].lastUsed : undefined;
          if (index >= 0) mock.catalog.sessions[index] = session; else mock.catalog.sessions.push(session);
          persist(); return structuredClone(session);
        }
        if (command === "save_folder") {
          if (mock.catalog.folders.some((f: any) => f.name.toLowerCase() === args.folder.name.toLowerCase() && f.id !== args.folder.id)) throw "folder_invalid";
          const index = mock.catalog.folders.findIndex((f: any) => f.id === args.folder.id);
          if (index >= 0) mock.catalog.folders[index] = args.folder; else mock.catalog.folders.push(args.folder);
        }
        if (command === "delete_folder") { mock.catalog.folders = mock.catalog.folders.filter((f: any) => f.id !== args.id); for (const s of mock.catalog.sessions) if (s.group === args.id) s.group = ""; }
        if (command === "delete_session") mock.catalog.sessions = mock.catalog.sessions.filter((s: any) => s.id !== args.id);
        if (command === "touch_session") { const session = mock.catalog.sessions.find((s: any) => s.id === args.id); if (session) session.lastUsed = Date.now() / 1000; }
        if (command === "import_sessions") {
          const map = new Map(); for (const folder of args.catalog.folders) { const id = crypto.randomUUID(); map.set(folder.id, id); mock.catalog.folders.push({ ...folder, id }); }
          mock.catalog.sessions.push(...args.catalog.sessions.map((s: any) => ({ ...s, id: crypto.randomUUID(), group: map.get(s.group) ?? "", lastUsed: undefined })));
        }
        return persist();
      }
      if (command === "pick_session_import") { if (mock.failImport) throw "session_import_fields"; return mock.importCatalog ?? null; }
      if (command === "export_sessions") { mock.exportedCatalog = structuredClone(mock.catalog); return true; }
      if (command === "editor_open") return { token: args.path, path: args.path, text: mock.editorText ?? "original text\n" };
      if (command === "editor_reload") return { token: args.token, path: args.token, text: "server changes" };
      if (command === "editor_save") { if (mock.editorConflict) throw "editor_conflict"; mock.editorSaved = args.text; return; }
      if (command === "editor_reload_external") return "external edit";
      if (command === "sftp_mkdir") { mock.createdFolder = args.name; return; }
      if (command === "sftp_list") { if (mock.sftpFailure) throw mock.sftpFailure; return { path: args.path === "." ? "/home/test" : args.path, entries: [{ name: "docs", path: "/home/test/docs", directory: true, link: false }, { name: "hello.txt", path: "/home/test/hello.txt", size: 15, directory: false, link: false }] }; }
      if (command === "sftp_progress") return mock.sftpProgress ?? null;
      if (command === "sftp_upload" || command === "sftp_download") { mock.sftpProgress = { id: "transfer-test", name: "hello.txt", direction: command === "sftp_upload" ? "upload" : "download", state: "running", bytes: 5, total: 15 }; return "transfer-test"; }
      if (command === "sftp_cancel") { mock.sftpProgress.state = "cancelled"; return; }
      if (command === "open_terminal") return `terminal-${mock.testCalls.length}`;
      if (command === "read_terminal") return new Promise(resolve => setTimeout(() => resolve({ type: "pending" }), 50));
      if (command === "ssh_probe") return { ticket: "test-ticket", host: "example.test", port: 22, algorithm: "Ed25519", fingerprint: "SHA256:new-test-fingerprint", previousFingerprint: mock.hostStatus === "changed" ? "SHA256:old-test-fingerprint" : null, status: mock.hostStatus };
      if (command === "ssh_open") return mock.sshDelay ? new Promise(resolve => { mock.resolveSsh = resolve; }) : "ssh-test-connection";
      return undefined;
    } };
  }, { configured, legacy });
}
export async function preview(page: Page, name: string) { if (process.env.TERMIX_PREVIEW_DIR) await page.screenshot({ path: `${process.env.TERMIX_PREVIEW_DIR}/${name}.png`, animations: "disabled" }); }
