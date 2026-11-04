import { lazy, Suspense, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Activity, HardDrive, Plus, Settings, Terminal, X } from "lucide-react";
import { ContextMenu } from "./ContextMenu";
import { Modal } from "./Modal";
import { PreferencesDialog } from "./PreferencesDialog";
import { SessionDialog } from "./SessionDialog";
import { SessionSidebar, type SessionView } from "./SessionSidebar";
import { ConfirmDialog, FolderDialog, ImportDialog } from "./LibraryDialogs";
import { defaults, getPreferences, savePreferences, type Preferences } from "./services/preferences";
import { terminalApi, type ShellProfile } from "./services/terminal";
import { deleteFolder, deleteSession, exportSessions, getCatalog, importSessions, pickSessionImport, reloadCatalog, saveFolder, saveSession, touchSession } from "./services/sessions";
import { resolvedTheme, accentForeground, accentText } from "./appearance";
import { errorText, t, type Message } from "./i18n";
import type { Session, SessionCatalog, SessionFolder, TerminalTab } from "./types";

type Workspace = {schemaVersion: 1; tabs: {sessionId: string | null; profile: string | null; pinned: boolean; color: string | null}[]; active: number; sidebarWidth: number; filesWidth: number; verticalSplit: boolean};
const makeId = () => crypto.randomUUID();
const TerminalPane = lazy(() => import("./TerminalPane").then(module => ({ default: module.TerminalPane })));
const ExternalEditorDialog = lazy(() => import("./ExternalEditorDialog").then(module => ({ default: module.ExternalEditorDialog })));
const EditorDialog = lazy(() => import("./EditorDialog").then(module => ({ default: module.EditorDialog })));
const SftpPane = lazy(() => import("./SftpPane").then(module => ({ default: module.SftpPane })));
const SshDialog = lazy(() => import("./SshDialog").then(module => ({ default: module.SshDialog })));
const emptyCatalog: SessionCatalog = { schemaVersion: 2, revision: 0, folders: [], sessions: [] };
export default function App() {
  const [profiles, setProfiles] = useState<ShellProfile[]>([]), [preferences, setPreferences] = useState<Preferences | null>(null), [preview, setPreview] = useState<Preferences | null>(null);
  const [preferencesMode, setPreferencesMode] = useState<"setup" | "settings" | null>(null), [startupError, setStartupError] = useState(""), [retry, setRetry] = useState(0);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const [catalog, setCatalog] = useState(emptyCatalog), [view, setView] = useState<SessionView>("all"), [query, setQuery] = useState("");
  const [tabs, setTabs] = useState<TerminalTab[]>([]), [activeTab, setActiveTab] = useState("");
  const [remoteEditor, setRemoteEditor] = useState<{ id: string; path: string } | null>(null);
  const [filesOpen, setFilesOpen] = useState(false), [filesWidth, setFilesWidth] = useState(390);
  const activeTransport = tabs.find(tab => tab.id === activeTab)?.transportId;
  const [sidebarWidth, setSidebarWidth] = useState(310);
  const [previousWorkspace, setPreviousWorkspace] = useState<Workspace | null>(null), [workspaceReady, setWorkspaceReady] = useState(false);
  useEffect(() => { let alive = true; void invoke<Workspace | null>("get_workspace").then(value => { if (alive) setPreviousWorkspace(value); }).catch(() => {}).finally(() => { if (alive) setWorkspaceReady(true); }); return () => { alive = false; }; }, []);
  const inputs = useRef(new Map<string, (value: string) => void>());
  const [palette, setPalette] = useState(false), [commandQuery, setCommandQuery] = useState(""), [snippetsOpen, setSnippetsOpen] = useState(false), [snippets, setSnippets] = useState<{name: string; text: string}[]>([]), [snippetName, setSnippetName] = useState(""), [snippetText, setSnippetText] = useState(""), [snippetTarget, setSnippetTarget] = useState("");
  useEffect(() => { const handler = (e: globalThis.KeyboardEvent) => { if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "p" && !document.querySelector("[role=dialog]")) { e.preventDefault(); e.stopPropagation(); setPalette(true); } }; window.addEventListener("keydown", handler, true); return () => window.removeEventListener("keydown", handler, true); }, []);
  const [tabMenu, setTabMenu] = useState<{x: number; y: number; id: string} | null>(null), [rename, setRename] = useState<{id: string; title: string} | null>(null), [split, setSplit] = useState<string[] | null>(null), [verticalSplit, setVerticalSplit] = useState(false), [workspaceFull, setWorkspaceFull] = useState(false);
  const [keyboardTabs, setKeyboardTabs] = useState(false);
  const [editor, setEditor] = useState<{ session: Session; editing: boolean } | null>(null), [folderEditor, setFolderEditor] = useState<SessionFolder | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "session" | "folder"; id: string; name: string } | null>(null), [incoming, setIncoming] = useState<SessionCatalog | null>(null);
  const [status, setStatus] = useState(""), [notice, setNotice] = useState<Message | null>(null), [busy, setBusy] = useState(false);
  const [sshTarget, setSshTarget] = useState<{ session: Session; replaces?: string } | null>(null);
  const visible = preview ?? preferences ?? defaults("powershell"), lang = visible.language, tr = (key: Message) => t(lang, key), theme = resolvedTheme(visible.theme, systemDark);
  const configured = !!preferences?.setupComplete && preferences.setupVersion === 2;
  const modalOpen = !!(preferencesMode || editor || folderEditor || confirm || incoming || sshTarget || remoteEditor || rename || palette || snippetsOpen);
  const updateCatalog = (value: SessionCatalog) => setCatalog(old => value.revision >= old.revision ? value : old);
  const library = <T,>(request: Promise<T>): Promise<T> => request.catch(e => { setStatus(String(e)); throw e; });
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)"); const change = () => setSystemDark(media.matches);
    media.addEventListener("change", change); return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme; document.documentElement.lang = lang;
    for (const [name, value] of Object.entries({ "--accent": visible.accent, "--accent-foreground": accentForeground(visible.accent), "--accent-ink": accentText(visible.accent, theme), "--ui-scale": String(visible.uiScale / 100) })) document.documentElement.style.setProperty(name, value);
    try { void getCurrentWindow().setTheme(visible.theme === "system" ? null : visible.theme).catch(() => {}); } catch { /* browser workflow tests */ }
  }, [theme, lang, visible.theme, visible.accent, visible.uiScale]);
  useEffect(() => { let alive = true; void getCatalog().then(value => { if (alive) updateCatalog(value); }).catch(e => { if (alive) setStatus(String(e)); }); return () => { alive = false; }; }, []);
  function localTab(value: Preferences, session?: Session): TerminalTab {
    const profile = session?.shellProfile ?? value.defaultShell;
    return { id: makeId(), title: session?.name ?? profiles.find(p => p.id === profile)?.name ?? profile, kind: "local", profile, sessionId: session?.id, fontSize: session?.fontSize, connection: session };
  }
  useEffect(() => {
    let cancelled = false; setStartupError("");
    void Promise.all([terminalApi.profiles(), getPreferences()]).then(([available, saved]) => {
      if (cancelled) return; if (!available.length) throw new Error("invalid_profile");
      setProfiles(available);
      const value = saved ? { ...defaults(available[0].id), ...saved, schemaVersion: 2 as const } : defaults(available[0].id);
      setPreferences(value);
      if (!value.setupComplete || value.setupVersion < 2) { setPreferencesMode("setup"); return; }
      const tab: TerminalTab = { id: makeId(), title: available.find(p => p.id === value.defaultShell)?.name ?? value.defaultShell, kind: "local", profile: value.defaultShell };
      setTabs([tab]); setActiveTab(tab.id);
    }).catch(e => { if (!cancelled) setStartupError(String(e)); });
    return () => { cancelled = true; };
  }, [retry]);
  async function applyPreferences(value: Preferences) {
    const saved = await savePreferences(value), first = preferencesMode === "setup";
    setPreferences(saved); setPreview(null); setPreferencesMode(null);
    if (first) { const tab = localTab(saved); setTabs([tab]); setActiveTab(tab.id); }
  }
  const filtered = useMemo(() => {
    const folderNames = new Map(catalog.folders.map(f => [f.id, f.name]));
    return catalog.sessions.filter(s => {
      if (view === "favorites" && !s.favorite) return false;
      if (view === "recent" && !s.lastUsed) return false;
      if (view === "unassigned" && s.group) return false;
      if (view.startsWith("folder:") && s.group !== view.slice(7)) return false;
      return `${s.name} ${s.host} ${s.username} ${folderNames.get(s.group) ?? ""}`.toLocaleLowerCase(lang).includes(query.toLocaleLowerCase(lang));
    }).sort((a, b) => view === "recent" ? (b.lastUsed ?? 0) - (a.lastUsed ?? 0) : a.name.localeCompare(b.name, lang));
  }, [catalog, view, query, lang]);
  function createSession() {
    setEditor({ editing: false, session: { id: makeId(), name: "", kind: "ssh", host: "", port: 22, username: "", group: view.startsWith("folder:") ? view.slice(7) : "", authMethod: "agent" } });
  }
  async function persistSession(value: Session) {
    setBusy(true);
    try {
      await library(saveSession(value)); updateCatalog(await getCatalog()); setEditor(null); setStatus("");
    } finally { setBusy(false); }
  }
  const rememberUse = (id: string) => { void touchSession(id).then(updateCatalog).catch(e => setStatus(String(e))); };
  function openSession(session: Session) {
    setKeyboardTabs(false);
    if (session.kind === "ssh") { setSshTarget({ session }); return; }
    if (session.kind !== "local" || !preferences) { setStatus(tr("unavailable")); return; }
    const tab = localTab(preferences, session); setTabs(old => [...old, tab]); setActiveTab(tab.id); rememberUse(session.id);
  }
  function addLocalTab() { if (!preferences || !configured) return; setKeyboardTabs(false); const tab = localTab(preferences); setTabs(old => [...old, tab]); setActiveTab(tab.id); }
  function closeTab(id: string) { setTabs(old => { const next = old.filter(t => t.id !== id); if (activeTab === id) setActiveTab(next[next.length - 1]?.id ?? ""); return next; }); }
  async function run(action: () => Promise<void>) { setBusy(true); setStatus(""); setNotice(null); try { await action(); } catch (e) { setStatus(String(e)); } finally { setBusy(false); } }
  function connected(id: string, details: Pick<Session, "username" | "authMethod" | "keyPath">) {
    setKeyboardTabs(false);
    if (!sshTarget) { void terminalApi.close(id); return; }
    const snapshot = { ...sshTarget.session, ...details };
    const tab: TerminalTab = { id: makeId(), title: snapshot.name, sessionId: snapshot.id, kind: "ssh", transportId: id, fontSize: snapshot.fontSize, connection: snapshot };
    const replaces = sshTarget.replaces;
    const current = catalog.sessions.find(s => s.id === snapshot.id);
    if (current && current.host === snapshot.host && current.port === snapshot.port) {
      void saveSession({ ...current, ...details }).then(() => touchSession(snapshot.id)).then(updateCatalog).catch(e => setStatus(String(e)));
    }
    setTabs(old => replaces ? old.map(t => t.id === replaces ? tab : t) : [...old, tab]); setActiveTab(tab.id); setSshTarget(null);
  }
  useEffect(() => {
    if (!workspaceReady || !configured || !tabs.length) return;
    const timer = setTimeout(() => { const savedTabs = tabs.filter(t => t.sessionId || t.kind === "local"); void invoke("save_workspace", {workspace: {schemaVersion: 1, tabs: savedTabs.slice(0,16).map(t => ({sessionId: t.sessionId ?? null, profile: t.sessionId ? null : t.profile ?? visible.defaultShell, pinned: !!t.pinned, color: t.color ?? null})), active: Math.max(0, savedTabs.findIndex(t => t.id === activeTab)), sidebarWidth: Math.round(sidebarWidth), filesWidth: Math.round(filesWidth), verticalSplit}}).catch(() => {}); }, 500);
    return () => clearTimeout(timer);
  }, [tabs, activeTab, sidebarWidth, filesWidth, verticalSplit, workspaceReady, configured]);
  function restoreWorkspace() { if (!previousWorkspace || !preferences) return; const restored = previousWorkspace.tabs.flatMap(saved => { const session = catalog.sessions.find(s => s.id === saved.sessionId); if (saved.sessionId && !session) return []; const tab: TerminalTab = session?.kind === "ssh" ? {id: makeId(), title: session.name, kind: "ssh", sessionId: session.id, connection: session} : localTab({...preferences, defaultShell: saved.profile ?? preferences.defaultShell}, session); return [{...tab, pinned: saved.pinned, color: saved.color ?? undefined}]; }); setTabs(restored); setActiveTab(restored[Math.min(previousWorkspace.active, restored.length - 1)]?.id ?? ""); setSidebarWidth(Math.max(230, Math.min(window.innerWidth * .5, previousWorkspace.sidebarWidth))); setFilesWidth(Math.max(280, Math.min(window.innerWidth * .6, previousWorkspace.filesWidth))); setVerticalSplit(previousWorkspace.verticalSplit); setPreviousWorkspace(null); }
  function onTabsKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).getAttribute("role") !== "tab" || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length;
    setKeyboardTabs(true); setActiveTab(tabs[next].id); buttons[next].focus();
  }
  const menuTab = tabs.find(tab => tab.id === tabMenu?.id);
  function closeMany(ids: string[]) { const targets = tabs.filter(t => ids.includes(t.id) && !t.pinned); if (targets.length > 1 && !window.confirm(lang === "de" ? `${targets.length} Terminals schließen? Laufende Prozesse werden beendet.` : `Close ${targets.length} terminals? Running processes will end.`)) return; const remaining = tabs.filter(t => !targets.includes(t)); setTabs(remaining); if (!remaining.some(t => t.id === activeTab)) setActiveTab(remaining[remaining.length - 1]?.id ?? ""); setSplit(null); }
  function startSplit(id: string) { const next = tabs.find(tab => tab.id !== id); if (next) { setSplit([id, next.id]); setActiveTab(id); } }
  const splitVisible = split?.every(id => tabs.some(t => t.id === id)) && split.includes(activeTab) ? split : null;
  return <div className={`app-shell ${workspaceFull ? "workspace-full" : ""}`}>
    <header className="topbar"><div className="brand"><img className="brand-logo" src="/termix.svg" alt=""/><span>Termi<span className="brand-x">X</span></span><span className="version">0.7.0</span></div><div className="topbar-actions">{previousWorkspace?.tabs.length ? <button className="settings-button" onClick={restoreWorkspace}>{lang === "de" ? "Workspace wiederherstellen" : "Restore workspace"}</button> : null}<button className="settings-button" onClick={() => { setCommandQuery(""); setPalette(true); }}>{lang === "de" ? "Befehle" : "Commands"}</button><button className="settings-button" disabled={!activeTransport} aria-pressed={filesOpen} onClick={() => setFilesOpen(open => !open)}><HardDrive size={18}/>{lang === "de" ? "Dateien" : "Files"}</button><button className="settings-button" disabled={!preferences} onClick={() => setPreferencesMode("settings")} title={tr("settings")}><Settings size={18}/><span>{tr("settings")}</span></button></div></header>
    <div className="workspace" style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}><aside className="shared-sidebar" style={{ width: sidebarWidth }}><div className="settings-tabs" hidden={visible.sftpLayout !== "shared"}><button aria-pressed={!filesOpen} onClick={() => setFilesOpen(false)}>{lang === "de" ? "Sessions" : "Sessions"}</button><button disabled={!activeTransport} aria-pressed={filesOpen} onClick={() => setFilesOpen(true)}>SFTP</button></div><div className="sidebar-library" hidden={visible.sftpLayout === "shared" && filesOpen && !!activeTransport}><SessionSidebar catalog={catalog} sessions={filtered} language={lang} view={view} setView={setView} query={query} setQuery={setQuery} configured={configured} busy={busy}
      hasSsh={!!activeTransport} onFiles={() => setFilesOpen(true)} onMove={(session, group) => void run(async () => { await saveSession({ ...session, group }); updateCatalog(await getCatalog()); })} onNew={createSession} onOpen={openSession} onEdit={session => setEditor({ session, editing: true })}
      onDuplicate={session => setEditor({ editing: false, session: { ...session, id: makeId(), name: `${session.name.slice(0, 100)} (${tr("copySuffix")})`, favorite: false, lastUsed: undefined } })}
      onFavorite={session => void run(async () => { await saveSession({ ...session, favorite: !session.favorite }); updateCatalog(await getCatalog()); })}
      onDelete={session => setConfirm({ kind: "session", id: session.id, name: session.name })} onLocal={addLocalTab}
      onFolder={folder => setFolderEditor(folder ?? { id: makeId(), name: "" })} onDeleteFolder={folder => setConfirm({ kind: "folder", id: folder.id, name: folder.name })}
      onImport={() => void run(async () => { const value = await pickSessionImport(); if (value) setIncoming(value); })}
      onExport={() => void run(async () => { if (await exportSessions()) setNotice("exportDone"); })}/></div>{visible.sftpLayout === "shared" && filesOpen && activeTransport && <Suspense fallback={<span>SFTP…</span>}><SftpPane key={activeTransport} id={activeTransport} language={lang} initialPath={visible.sftpStart} theme={theme} onEdit={path => setRemoteEditor({ id: activeTransport, path })} onClose={() => setFilesOpen(false)}/></Suspense>}</aside>
      <div className="pane-resizer" role="separator" aria-label={lang === "de" ? "Seitenleiste vergrößern" : "Resize sidebar"} aria-orientation="vertical" aria-valuenow={sidebarWidth} tabIndex={0} onKeyDown={e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); setSidebarWidth(w => Math.max(230, Math.min(window.innerWidth * .5, w + (e.key === "ArrowRight" ? 20 : -20)))); } }} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) setSidebarWidth(Math.max(230, Math.min(window.innerWidth * .5, e.clientX))); }} onPointerUp={e => e.currentTarget.releasePointerCapture(e.pointerId)}/>
      <main className="main"><div className="tabbar" role="tablist" aria-label="TermiX" onKeyDown={onTabsKeyDown}>{tabs.map(tab => <div key={tab.id} style={{ borderTopColor: tab.color }} onContextMenu={e => { e.preventDefault(); setTabMenu({ x: e.clientX, y: e.clientY, id: tab.id }); }} className={`tab ${activeTab === tab.id ? "active" : ""}`} draggable onDragStart={e => { e.dataTransfer.setData("application/x-termix-tab", tab.id); e.dataTransfer.effectAllowed = "move"; }} onDragOver={e => { if (e.dataTransfer.types.includes("application/x-termix-tab")) e.preventDefault(); }} onDrop={e => { e.preventDefault(); const from = e.dataTransfer.getData("application/x-termix-tab"); setTabs(old => { const moved = old.find(t => t.id === from); if (!moved || from === tab.id) return old; const next = old.filter(t => t.id !== from); next.splice(next.findIndex(t => t.id === tab.id), 0, moved); return next; }); }} onAuxClick={e => { if (e.button === 1) { e.preventDefault(); closeTab(tab.id); } }} onMouseDown={e => { if (e.button === 1) e.preventDefault(); }}><button role="tab" tabIndex={activeTab === tab.id ? 0 : -1} aria-selected={activeTab === tab.id} title={tab.connection?.host ? `${tab.title} · ${tab.connection.host}:${tab.connection.port}` : tab.title} onClick={() => { setKeyboardTabs(false); setActiveTab(tab.id); }}><Terminal size={16}/><span>{tab.pinned ? "• " : ""}{tab.title}</span></button><button className="tab-close" aria-label={`${tr("closeTab")}: ${tab.title}`} onClick={() => closeTab(tab.id)}><X size={15}/></button></div>)}<button className="new-tab" disabled={!configured} onClick={addLocalTab} title={tr("newTab")} aria-label={tr("newTab")}><Plus size={19}/></button></div>
      <div className={`terminal-and-files sftp-${visible.sftpSide}`}><div className="terminal-area">{startupError ? <div className="workspace-empty" role="alert"><h2>{tr("loadFailed")}</h2><p>{errorText(startupError, lang)}</p><button className="btn primary" onClick={() => setRetry(v => v + 1)}>{tr("retry")}</button></div> : !tabs.length && <div className="workspace-empty"><img src="/termix.svg" alt=""/><h2>{tr("emptyTitle")}</h2><p>{tr("emptyIntro")}</p><button className="btn primary" disabled={!configured} onClick={addLocalTab}><Plus size={18}/>{tr("openTerminal")}</button></div>}
      {tabs.map(tab => <div key={tab.id} className="terminal-layer" onPointerDown={() => { if (splitVisible) setActiveTab(tab.id); }} style={{ display: activeTab === tab.id || splitVisible?.includes(tab.id) ? "flex" : "none", flexDirection: "column", ...(splitVisible?.includes(tab.id) ? { inset: "auto", top: verticalSplit ? `${splitVisible.indexOf(tab.id) * 50}%` : 0, left: verticalSplit ? 0 : `${splitVisible.indexOf(tab.id) * 50}%`, width: verticalSplit ? "100%" : "50%", height: verticalSplit ? "50%" : "100%", border: "1px solid var(--border)" } : {}) }}><Suspense fallback={<span role="status">{tr("openTerminal")}…</span>}><TerminalPane onInputReady={write => { if (write) inputs.current.set(tab.id, write); else inputs.current.delete(tab.id); }} tab={tab} active={activeTab === tab.id && !modalOpen} focusOnActivate={!keyboardTabs} fontSize={tab.fontSize ?? visible.fontSize} theme={visible.terminalPalette === "auto" ? theme : visible.terminalPalette} accent={visible.accent} language={lang} onReconnect={() => { const session = catalog.sessions.find(s => s.id === tab.sessionId) ?? tab.connection; if (session) setSshTarget({ session, replaces: tab.id }); }}/></Suspense></div>)}</div>{visible.sftpLayout === "panel" && filesOpen && activeTransport && <><div className="pane-resizer" role="separator" aria-label={lang === "de" ? "Dateibrowser vergrößern" : "Resize file browser"} aria-orientation="vertical" aria-valuenow={filesWidth} tabIndex={0} onKeyDown={e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); setFilesWidth(w => Math.max(280, Math.min(window.innerWidth * .6, w + (e.key === "ArrowLeft" ? 20 : -20)))); } }} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) setFilesWidth(Math.max(280, Math.min(window.innerWidth * .6, visible.sftpSide === "right" ? window.innerWidth - e.clientX : e.clientX - sidebarWidth - 6))); }} onPointerUp={e => e.currentTarget.releasePointerCapture(e.pointerId)}/><div className="files-container" style={{ width: filesWidth }}><Suspense fallback={<span>SFTP…</span>}><SftpPane key={activeTransport} id={activeTransport} language={lang} initialPath={visible.sftpStart} theme={theme} onEdit={path => setRemoteEditor({ id: activeTransport, path })} onClose={() => setFilesOpen(false)}/></Suspense></div></>}</div>
      <footer className="statusbar"><span title={status ? errorText(status, lang) : ""}><Activity size={15}/>{status ? errorText(status, lang) : notice ? tr(notice) : tabs.find(tab => tab.id === activeTab)?.kind === "ssh" ? "SSH" : tr("localWorkspace")}</span><span><HardDrive size={15}/>{catalog.sessions.length} {tr("sessions")}</span><span>{tabs.find(tab => tab.id === activeTab)?.fontSize ?? visible.fontSize} px<span className="status-divider">/</span>UTF-8</span></footer>
      {status && !modalOpen && <div className="workspace-notice" role="alert"><span>{errorText(status, lang)}</span>{status === "session_changed" && <button className="btn secondary" disabled={busy} onClick={() => void run(async () => { setCatalog(await reloadCatalog()); })}>{tr("reloadLibrary")}</button>}<button className="icon-button" aria-label={tr("closeDialog")} onClick={() => setStatus("")}><X size={17}/></button></div>}
    </main></div>
    {palette && <Modal title={lang === "de" ? "Befehlspalette" : "Command palette"} closeLabel={tr("cancel")} onClose={() => setPalette(false)} footer={<span>Ctrl+Shift+P</span>}><input autoFocus aria-label={lang === "de" ? "Befehl suchen" : "Search commands"} value={commandQuery} onChange={e => setCommandQuery(e.target.value)}/><div className="command-list">{[
      {name: tr("newTab"), action: addLocalTab}, {name: tr("settings"), action: () => setPreferencesMode("settings")}, {name: "SFTP", action: () => setFilesOpen(true)}, {name: lang === "de" ? "Terminals teilen" : "Split terminals", action: () => startSplit(activeTab)}, {name: lang === "de" ? "Teilung aufheben" : "Remove split", action: () => setSplit(null)}, {name: lang === "de" ? "Fokusansicht umschalten" : "Toggle focus view", action: () => setWorkspaceFull(v => !v)}, {name: lang === "de" ? "Befehlsbausteine" : "Command snippets", action: () => { setSnippetTarget(activeTab); setSnippetsOpen(true); }}
    ].filter(item => item.name.toLocaleLowerCase(lang).includes(commandQuery.toLocaleLowerCase(lang))).map(item => <button className="btn secondary" key={item.name} onClick={() => { setPalette(false); item.action(); }}>{item.name}</button>)}</div></Modal>}
    {snippetsOpen && <Modal title={lang === "de" ? "Befehlsbausteine" : "Command snippets"} closeLabel={tr("cancel")} onClose={() => setSnippetsOpen(false)} footer={<span>{lang === "de" ? "Nur für diese App-Sitzung. Keine Passwörter oder Schlüssel eintragen." : "For this app session only. Never enter passwords or keys."}</span>}><label className="field"><span>{lang === "de" ? "Zielterminal" : "Target terminal"}</span><select value={snippetTarget} onChange={e => setSnippetTarget(e.target.value)}>{tabs.map(tab => <option key={tab.id} value={tab.id}>{tab.title} · {tab.connection?.host ?? tab.profile ?? tab.kind}</option>)}</select></label><label className="field"><span>{lang === "de" ? "Name" : "Name"}</span><input maxLength={80} value={snippetName} onChange={e => setSnippetName(e.target.value)}/></label><label className="field"><span>{lang === "de" ? "Befehl" : "Command"}</span><textarea rows={4} maxLength={4096} value={snippetText} onChange={e => setSnippetText(e.target.value)}/></label><button className="btn secondary" disabled={!snippetName.trim() || !snippetText.trim() || snippets.length >= 50} onClick={() => { setSnippets(old => [...old, {name: snippetName.trim(), text: snippetText}]); setSnippetName(""); setSnippetText(""); }}>{lang === "de" ? "Baustein hinzufügen" : "Add snippet"}</button><div className="command-list">{snippets.map((snippet, i) => <div key={i}><strong>{snippet.name}</strong><pre>{snippet.text}</pre><button className="btn primary" disabled={!inputs.current.has(snippetTarget)} onClick={() => { const target = tabs.find(t => t.id === snippetTarget), input = inputs.current.get(snippetTarget); if (target && input && window.confirm((lang === "de" ? "Ausführen in " : "Run in ") + target.title + " · " + (target.connection?.host ?? target.profile ?? target.kind) + "?\n\n" + snippet.text)) input(snippet.text + "\r"); }}>{lang === "de" ? "Ausführen…" : "Run…"}</button><button className="btn secondary" onClick={() => setSnippets(old => old.filter((_, index) => index !== i))}>{lang === "de" ? "Entfernen" : "Remove"}</button></div>)}</div></Modal>}
    {tabMenu && menuTab && <ContextMenu {...tabMenu} onClose={() => setTabMenu(null)} items={[
      {label: lang === "de" ? "Tab umbenennen" : "Rename tab", action: () => setRename({id: menuTab.id, title: menuTab.title})},
      {label: lang === "de" ? "Tab duplizieren" : "Duplicate tab", action: () => { if (menuTab.connection) openSession(menuTab.connection); else if (preferences) { const tab = localTab({...preferences, defaultShell: menuTab.profile ?? preferences.defaultShell}); setTabs(old => [...old, tab]); setActiveTab(tab.id); } }},
      {label: lang === "de" ? "Anheften / lösen" : "Pin / unpin tab", action: () => setTabs(old => old.map(t => t.id === menuTab.id ? {...t, pinned: !t.pinned} : t))},
      ...["#5b9cf5", "#71c9bd", "#b692f6", "#ef9b63"].map(color => ({label: (lang === "de" ? "Tab-Farbe " : "Tab colour ") + color, action: () => setTabs(old => old.map(t => t.id === menuTab.id ? {...t, color} : t))})),
      {label: lang === "de" ? "Terminals teilen" : "Split terminals", disabled: tabs.length < 2, action: () => startSplit(menuTab.id)},
      {label: lang === "de" ? "Teilung drehen" : "Rotate split", disabled: !splitVisible, action: () => setVerticalSplit(v => !v)},
      {label: lang === "de" ? "Teilung aufheben" : "Remove split", disabled: !splitVisible, action: () => setSplit(null)},
      {label: lang === "de" ? "Fokusansicht umschalten" : "Toggle focus view", action: () => setWorkspaceFull(v => !v)},
      {label: lang === "de" ? "Tabs links schließen" : "Close tabs to the left", action: () => closeMany(tabs.slice(0, tabs.indexOf(menuTab)).map(t => t.id))},
      {label: lang === "de" ? "Tabs rechts schließen" : "Close tabs to the right", action: () => closeMany(tabs.slice(tabs.indexOf(menuTab) + 1).map(t => t.id))},
      {label: lang === "de" ? "Andere Tabs schließen" : "Close other tabs", action: () => closeMany(tabs.filter(t => t.id !== menuTab.id).map(t => t.id))},
      {label: lang === "de" ? "Alle unangehefteten Tabs schließen" : "Close all unpinned tabs", action: () => closeMany(tabs.map(t => t.id))},
      {label: tr("closeTab"), action: () => closeTab(menuTab.id)}
    ]}/>}
    {rename && <Modal title={lang === "de" ? "Tab umbenennen" : "Rename tab"} closeLabel={tr("cancel")} onClose={() => setRename(null)} footer={<button className="btn primary" disabled={!rename.title.trim()} onClick={() => { setTabs(old => old.map(t => t.id === rename.id ? {...t, title: rename.title.trim()} : t)); setRename(null); }}>{tr("saveChanges")}</button>}><input aria-label={lang === "de" ? "Tabname" : "Tab name"} maxLength={100} value={rename.title} onChange={e => setRename({...rename, title: e.target.value})}/></Modal>}
    {remoteEditor && <Suspense fallback={<div role="status">Editor…</div>}>{visible.editorOpenMode === "external" ? <ExternalEditorDialog id={remoteEditor.id} initialPath={remoteEditor.path} language={lang} onClose={() => setRemoteEditor(null)}/> : <EditorDialog id={remoteEditor.id} initialPath={remoteEditor.path} language={lang} theme={theme} externalAvailable={visible.editor !== "integrated" && !!visible.editorPath} onClose={() => setRemoteEditor(null)}/>}</Suspense>}
    {preferencesMode && preferences && <PreferencesDialog mode={preferencesMode} profiles={profiles} initial={preferences} onSave={applyPreferences} onPreview={setPreview} onClose={() => { setPreview(null); setPreferencesMode(null); }}/ >}
    {editor && <SessionDialog key={editor.session.id} initial={editor.session} editing={editor.editing} folders={catalog.folders} profiles={profiles} language={lang} onSave={persistSession} onClose={() => setEditor(null)}/>}
    {folderEditor && <FolderDialog initial={folderEditor} language={lang} onClose={() => setFolderEditor(null)} onSave={async folder => { updateCatalog(await library(saveFolder(folder))); setFolderEditor(null); }}/ >}
    {confirm && <ConfirmDialog title={`${tr(confirm.kind === "folder" ? "deleteFolder" : "deleteSession")} · ${confirm.name}`} note={tr(confirm.kind === "folder" ? "folderDeleteNote" : "confirmDeleteSession")} language={lang} onClose={() => setConfirm(null)} onConfirm={async () => {
      if (confirm.kind === "folder") { updateCatalog(await library(deleteFolder(confirm.id))); if (view === `folder:${confirm.id}`) setView("unassigned"); }
      else { await library(deleteSession(confirm.id)); updateCatalog(await getCatalog()); }
      setConfirm(null);
    }}/ >}
    {incoming && <ImportDialog catalog={incoming} language={lang} onClose={() => setIncoming(null)} onConfirm={async () => { updateCatalog(await library(importSessions(incoming))); setIncoming(null); setNotice("importDone"); }}/ >}
    {sshTarget && <Suspense fallback={<div role="status">{tr("connecting")}</div>}><SshDialog session={sshTarget.session} language={lang} onClose={() => setSshTarget(null)} onConnected={connected}/></Suspense>}
  </div>;
}
