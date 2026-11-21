import type { Page } from "@playwright/test";
export async function mockDesktop(page: Page, configured = false, legacy = false) {
  await page.addInitScript(({ configured, legacy }) => {
    const mock = window as any;
    mock.callbacks={};mock.listeners={};mock.callbackId=0;mock.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:(event:string,id:number)=>{delete mock.listeners[id];}};
    mock.testCalls = []; mock.failSave = false; mock.failLibrary = false; mock.hostStatus = "unknown"; mock.sshDelay = false;
    mock.catalog = JSON.parse(localStorage.getItem("test-catalog") ?? 'null') ?? { schemaVersion: 2, revision: 0, folders: [], sessions: [] };
    const seed = () => {
      if (mock.savedSessions && !mock.seedLoaded) {
        mock.seedLoaded = true; mock.catalog.sessions = structuredClone(mock.savedSessions);
        for (const s of mock.catalog.sessions) { if (s.group && !mock.catalog.folders.some((f: any) => f.id === s.group)) mock.catalog.folders.push({ id: s.group, name: s.group }); }
      }
    };
    const persist = () => { mock.catalog.revision++; localStorage.setItem("test-catalog", JSON.stringify(mock.catalog)); return structuredClone(mock.catalog); };
    mock.__TAURI_INTERNALS__ = { transformCallback:(fn:any)=>{const id=++mock.callbackId;mock.callbacks[id]=fn;return id;},unregisterCallback:(id:number)=>{delete mock.callbacks[id];}, metadata: { currentWindow: { label: "main" } }, invoke: async (command: string, args: any) => {
      if(command==="plugin:event|listen"){mock.listeners[args.handler]=args;return args.handler;}if(command==="plugin:event|unlisten")return;
      mock.testCalls.push({ command, args: args ? structuredClone(args) : args });
      if(command==="tunnel_list")return mock.tunnels??[];
      if(command==="tunnel_start"){if(mock.tunnelFailure)throw "tunnel_refused";const value={id:crypto.randomUUID(),config:args.config,state:"running",connections:0};mock.tunnels=[...(mock.tunnels??[]),value];return value;}
      if(command==="tunnel_stop"){mock.tunnels=(mock.tunnels??[]).filter((t:any)=>t.id!==args.id);return;}
      if(command==="ssh_monitor"){if(mock.monitorFailure)throw "monitor_unavailable";mock.monitorTick=(mock.monitorTick??0)+1;return {windows:mock.windowsMonitor??false,cpuBusyBasisPoints:mock.windowsMonitor?3700:mock.macCpuBasisPoints??null,cpuTotal:(mock.macMonitor||mock.windowsMonitor)?null:100+mock.monitorTick*10,cpuIdle:(mock.macMonitor||mock.windowsMonitor)?null:70+mock.monitorTick*5,memoryTotal:2147483648,memoryUsed:1073741824,diskTotal:100000,diskUsed:78000,uptime:172800,received:(mock.freeBsdMonitor&&!mock.freeBsdNetwork||mock.macMonitor&&!mock.macNetwork||mock.windowsMonitor)?null:mock.monitorTick*1000000,sent:(mock.freeBsdMonitor&&!mock.freeBsdNetwork||mock.macMonitor&&!mock.macNetwork||mock.windowsMonitor)?null:mock.monitorTick*500000,sshSessions:(mock.freeBsdMonitor||mock.macMonitor||mock.windowsMonitor)?null:3,users:mock.windowsMonitor?null:2};}
      if (command === "terminal_profiles") return [{ id: "powershell", name: "Windows PowerShell" }, { id: "cmd", name: "CMD" }];
      if (command === "open_rdp_session" || command === "create_session_shortcut") return;
      if (command === "take_launch_session") return mock.launchSession ?? null;
      if (command === "sftp_local_open" || command === "sftp_local_list") {
        if (command === "sftp_local_list" && args.token === "docs-token") {
          return {path: "C:\\Local\\Docs", canGoUp: true, truncated: false, entries: [{name: "notes.txt", directory: false, size: 16, token: "notes-token"}]};
        }
        return {path: "C:\\Local", canGoUp: false, truncated: false, entries: [{name: "Docs", directory: true, size: null, token: "docs-token"}]};
      }
      if (command === "ping_session") return {address: "2001:db8::42", roundTripMs: mock.pingRoundTrip ?? null};
      if (command === "get_snippets") return JSON.parse(localStorage.getItem("test-commands") ?? '{"schemaVersion":1,"entries":[]}');
      if (command === "save_snippets") { if(mock.failCommands) throw "snippets_save_failed"; localStorage.setItem("test-commands",JSON.stringify(args.library)); return structuredClone(args.library); }
      if (command === "pick_snippet_import") return mock.incomingCommands ?? null;
      if (command === "import_snippets") { localStorage.setItem("test-commands", JSON.stringify(args.library)); return structuredClone(args.library); }
      if (command === "export_snippets") return true;
      if (command === "editor_external") { if(mock.externalDelay) await new Promise(resolve=>setTimeout(resolve,200)); return "original"; }
      if (command === "editor_external_state") { const digest=mock.externalVersion??"original"; return {digest,text:args.previousDigest===digest?null:mock.externalText??mock.editorText??"original text\n"}; }
      if (command === "sftp_file_action") { mock.lastFileAction=structuredClone(args); return; }
      if (command === "get_workspace") return JSON.parse(localStorage.getItem("test-workspace") ?? "null");
      if (command === "save_workspace") { localStorage.setItem("test-workspace", JSON.stringify(args.workspace)); return; }
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
      if (command === "sftp_list") { if (mock.sftpFailure) throw mock.sftpFailure; if (mock.sftpListings?.[args.path]) return mock.sftpListings[args.path]; return { path: args.path === "." ? "/home/test" : args.path, entries: [{ name: "docs", path: "/home/test/docs", directory: true, link: false }, { name: "hello.txt", path: "/home/test/hello.txt", size: 15, directory: false, link: false }] }; }
      if (command === "sftp_progress") return structuredClone(mock.sftpProgress ?? null);
      if (command === "sftp_upload" || command === "sftp_local_upload" || command === "sftp_dropped_upload" || command === "sftp_upload_folder" || command === "sftp_download") { mock.sftpProgress = { id: "transfer-test", name: "hello.txt", direction: command !== "sftp_download" ? "upload" : "download", state: "running", bytes: 5, total: 15 }; return "transfer-test"; }
      if (command === "sftp_pause_transfer") { mock.sftpProgress.state = args.paused ? "paused" : "running"; return; }
      if (command === "sftp_cancel") { mock.sftpProgress.state = "cancelled"; return; }
      if (command === "open_terminal") return `terminal-${mock.testCalls.length}`;
      if (command === "read_terminal" && args.id.startsWith("ssh-") && mock.disconnectSsh) {
        return { type: "exit", code: null };
      }
      if(command==="read_terminal"&&args.id.startsWith("ssh-")&&mock.sshTerminalOutput){const text=mock.sshTerminalOutput;mock.sshTerminalOutput="";return{type:"data",bytes:Array.from(new TextEncoder().encode(text))};}
      if (command === "read_terminal" && mock.terminalOutput) { const text = mock.terminalOutput; mock.terminalOutput = ""; return {type: "data", bytes: Array.from(new TextEncoder().encode(text))}; }
      if (command === "read_terminal") return new Promise(resolve => setTimeout(() => resolve({ type: "pending" }), 50));
      if (command === "ssh_probe") return { ticket: "test-ticket", host: "example.test", port: 22, algorithm: "Ed25519", fingerprint: "SHA256:new-test-fingerprint", previousFingerprint: mock.hostStatus === "changed" ? "SHA256:old-test-fingerprint" : null, status: mock.hostStatus };
      if (command === "ssh_open") return mock.sshDelay ? new Promise(resolve => { mock.resolveSsh = resolve; }) : "ssh-test-connection";
      return undefined;
    } };
  }, { configured, legacy });
}
export async function preview(page: Page, name: string) { if (process.env.TERMIX_PREVIEW_DIR) await page.screenshot({ path: `${process.env.TERMIX_PREVIEW_DIR}/${name}.png`, animations: "disabled" }); }
