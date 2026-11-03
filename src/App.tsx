import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Activity, HardDrive, Plus, Settings, Terminal, X } from "lucide-react";
import { PreferencesDialog } from "./PreferencesDialog";
import { SessionDialog } from "./SessionDialog";
import { SessionSidebar, type SessionView } from "./SessionSidebar";
import { ConfirmDialog, FolderDialog, ImportDialog } from "./LibraryDialogs";
import { defaults, getPreferences, savePreferences, type Preferences } from "./services/preferences";
import { terminalApi, type ShellProfile } from "./services/terminal";
import { deleteFolder, deleteSession, exportSessions, getCatalog, importSessions, pickSessionImport, saveFolder, saveSession, touchSession } from "./services/sessions";
import { resolvedTheme, accentForeground, accentText } from "./appearance";
import { errorText, t, type Message } from "./i18n";
import type { Session, SessionCatalog, SessionFolder, TerminalTab } from "./types";

const makeId = () => crypto.randomUUID();
const TerminalPane = lazy(() => import("./TerminalPane").then(module => ({ default: module.TerminalPane })));
const SshDialog = lazy(() => import("./SshDialog").then(module => ({ default: module.SshDialog })));
const emptyCatalog: SessionCatalog = { schemaVersion: 2, revision: 0, folders: [], sessions: [] };
export default function App() {
  const [profiles, setProfiles] = useState<ShellProfile[]>([]), [preferences, setPreferences] = useState<Preferences | null>(null), [preview, setPreview] = useState<Preferences | null>(null);
  const [preferencesMode, setPreferencesMode] = useState<"setup" | "settings" | null>(null), [startupError, setStartupError] = useState(""), [retry, setRetry] = useState(0);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const [catalog, setCatalog] = useState(emptyCatalog), [view, setView] = useState<SessionView>("all"), [query, setQuery] = useState("");
  const [tabs, setTabs] = useState<TerminalTab[]>([]), [activeTab, setActiveTab] = useState("");
  const [editor, setEditor] = useState<{ session: Session; editing: boolean } | null>(null), [folderEditor, setFolderEditor] = useState<SessionFolder | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "session" | "folder"; id: string; name: string } | null>(null), [incoming, setIncoming] = useState<SessionCatalog | null>(null);
  const [status, setStatus] = useState(""), [notice, setNotice] = useState<Message | null>(null), [busy, setBusy] = useState(false);
  const [sshTarget, setSshTarget] = useState<{ session: Session; replaces?: string } | null>(null);
  const visible = preview ?? preferences ?? defaults("powershell"), lang = visible.language, tr = (key: Message) => t(lang, key), theme = resolvedTheme(visible.theme, systemDark);
  const configured = !!preferences?.setupComplete && preferences.setupVersion === 2;
  const modalOpen = !!(preferencesMode || editor || folderEditor || confirm || incoming || sshTarget);
  const updateCatalog = (value: SessionCatalog) => setCatalog(old => value.revision >= old.revision ? value : old);
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
      await saveSession(value); updateCatalog(await getCatalog()); setEditor(null); setStatus("");
    } finally { setBusy(false); }
  }
  const rememberUse = (id: string) => { void touchSession(id).then(updateCatalog).catch(e => setStatus(String(e))); };
  function openSession(session: Session) {
    if (session.kind === "ssh") { setSshTarget({ session }); return; }
    if (session.kind !== "local" || !preferences) { setStatus(tr("unavailable")); return; }
    const tab = localTab(preferences, session); setTabs(old => [...old, tab]); setActiveTab(tab.id); rememberUse(session.id);
  }
  function addLocalTab() { if (!preferences || !configured) return; const tab = localTab(preferences); setTabs(old => [...old, tab]); setActiveTab(tab.id); }
  function closeTab(id: string) { setTabs(old => { const next = old.filter(t => t.id !== id); if (activeTab === id) setActiveTab(next[next.length - 1]?.id ?? ""); return next; }); }
  async function run(action: () => Promise<void>) { setBusy(true); setStatus(""); setNotice(null); try { await action(); } catch (e) { setStatus(String(e)); } finally { setBusy(false); } }
  function connected(id: string, details: Pick<Session, "username" | "authMethod" | "keyPath">) {
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
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><img className="brand-logo" src="/termix.svg" alt=""/><span>Termi<span className="brand-x">X</span></span><span className="version">0.4.0</span></div><div className="topbar-actions"><button className="settings-button" disabled={!preferences} onClick={() => setPreferencesMode("settings")} title={tr("settings")}><Settings size={18}/><span>{tr("settings")}</span></button></div></header>
    <div className="workspace"><SessionSidebar catalog={catalog} sessions={filtered} language={lang} view={view} setView={setView} query={query} setQuery={setQuery} configured={configured} busy={busy}
      onNew={createSession} onOpen={openSession} onEdit={session => setEditor({ session, editing: true })}
      onDuplicate={session => setEditor({ editing: false, session: { ...session, id: makeId(), name: `${session.name.slice(0, 100)} (${tr("copySuffix")})`, favorite: false, lastUsed: undefined } })}
      onFavorite={session => void run(async () => { await saveSession({ ...session, favorite: !session.favorite }); updateCatalog(await getCatalog()); })}
      onDelete={session => setConfirm({ kind: "session", id: session.id, name: session.name })} onLocal={addLocalTab}
      onFolder={folder => setFolderEditor(folder ?? { id: makeId(), name: "" })} onDeleteFolder={folder => setConfirm({ kind: "folder", id: folder.id, name: folder.name })}
      onImport={() => void run(async () => { const value = await pickSessionImport(); if (value) setIncoming(value); })}
      onExport={() => void run(async () => { if (await exportSessions()) setNotice("exportDone"); })}/>
      <main className="main"><div className="tabbar" role="tablist" aria-label="TermiX">{tabs.map(tab => <div key={tab.id} className={`tab ${activeTab === tab.id ? "active" : ""}`}><button role="tab" aria-selected={activeTab === tab.id} title={tab.connection?.host ? `${tab.title} · ${tab.connection.host}:${tab.connection.port}` : tab.title} onClick={() => setActiveTab(tab.id)}><Terminal size={16}/><span>{tab.title}</span></button><button className="tab-close" aria-label={`${tr("closeTab")}: ${tab.title}`} onClick={() => closeTab(tab.id)}><X size={15}/></button></div>)}<button className="new-tab" disabled={!configured} onClick={addLocalTab} title={tr("newTab")} aria-label={tr("newTab")}><Plus size={19}/></button></div>
      <div className="terminal-area">{startupError ? <div className="workspace-empty" role="alert"><h2>{tr("loadFailed")}</h2><p>{errorText(startupError, lang)}</p><button className="btn primary" onClick={() => setRetry(v => v + 1)}>{tr("retry")}</button></div> : !tabs.length && <div className="workspace-empty"><img src="/termix.svg" alt=""/><h2>{tr("emptyTitle")}</h2><p>{tr("emptyIntro")}</p><button className="btn primary" disabled={!configured} onClick={addLocalTab}><Plus size={18}/>{tr("openTerminal")}</button></div>}
      {tabs.map(tab => <div key={tab.id} className="terminal-layer" style={{ display: activeTab === tab.id ? "flex" : "none", flexDirection: "column" }}><Suspense fallback={<span role="status">{tr("openTerminal")}…</span>}><TerminalPane tab={tab} active={activeTab === tab.id && !modalOpen} fontSize={tab.fontSize ?? visible.fontSize} theme={theme} accent={visible.accent} language={lang} onReconnect={() => { const session = catalog.sessions.find(s => s.id === tab.sessionId) ?? tab.connection; if (session) setSshTarget({ session, replaces: tab.id }); }}/></Suspense></div>)}</div>
      <footer className="statusbar"><span title={status ? errorText(status, lang) : ""}><Activity size={15}/>{status ? errorText(status, lang) : notice ? tr(notice) : tabs.find(tab => tab.id === activeTab)?.kind === "ssh" ? "SSH" : tr("localWorkspace")}</span><span><HardDrive size={15}/>{catalog.sessions.length} {tr("sessions")}</span><span>{tabs.find(tab => tab.id === activeTab)?.fontSize ?? visible.fontSize} px<span className="status-divider">/</span>UTF-8</span></footer>
      {status && <div className="workspace-notice" role="alert"><span>{errorText(status, lang)}</span><button className="icon-button" aria-label={tr("closeDialog")} onClick={() => setStatus("")}><X size={17}/></button></div>}
    </main></div>
    {preferencesMode && preferences && <PreferencesDialog mode={preferencesMode} profiles={profiles} initial={preferences} onSave={applyPreferences} onPreview={setPreview} onClose={() => { setPreview(null); setPreferencesMode(null); }}/ >}
    {editor && <SessionDialog key={editor.session.id} initial={editor.session} editing={editor.editing} folders={catalog.folders} profiles={profiles} language={lang} onSave={persistSession} onClose={() => setEditor(null)}/>}
    {folderEditor && <FolderDialog initial={folderEditor} language={lang} onClose={() => setFolderEditor(null)} onSave={async folder => { updateCatalog(await saveFolder(folder)); setFolderEditor(null); }}/ >}
    {confirm && <ConfirmDialog title={`${tr(confirm.kind === "folder" ? "deleteFolder" : "deleteSession")} · ${confirm.name}`} note={tr(confirm.kind === "folder" ? "folderDeleteNote" : "confirmDeleteSession")} language={lang} onClose={() => setConfirm(null)} onConfirm={async () => {
      if (confirm.kind === "folder") { updateCatalog(await deleteFolder(confirm.id)); if (view === `folder:${confirm.id}`) setView("unassigned"); }
      else { await deleteSession(confirm.id); updateCatalog(await getCatalog()); }
      setConfirm(null);
    }}/ >}
    {incoming && <ImportDialog catalog={incoming} language={lang} onClose={() => setIncoming(null)} onConfirm={async () => { updateCatalog(await importSessions(incoming)); setIncoming(null); setNotice("importDone"); }}/ >}
    {sshTarget && <Suspense fallback={<div role="status">{tr("connecting")}</div>}><SshDialog session={sshTarget.session} language={lang} onClose={() => setSshTarget(null)} onConnected={connected}/></Suspense>}
  </div>;
}
