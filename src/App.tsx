import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Activity, ChevronDown, Folder, HardDrive, Laptop, Plus, Search, Server, Settings, Shield, Terminal, X } from "lucide-react";
import { PreferencesDialog } from "./PreferencesDialog";
import { defaults, getPreferences, savePreferences, type Preferences } from "./services/preferences";
import { terminalApi, type ShellProfile } from "./services/terminal";
import { deleteSession, listSessions, saveSession } from "./services/sessions";
import { resolvedTheme, accentForeground, accentText } from "./appearance";
import { errorText, t, type Message } from "./i18n";
import type { Session, SessionKind, TerminalTab } from "./types";

const makeId = () => crypto.randomUUID();
const TerminalPane = lazy(() => import("./TerminalPane").then(module => ({ default: module.TerminalPane })));
const SshDialog = lazy(() => import("./SshDialog").then(module => ({ default: module.SshDialog })));
export default function App() {
  const [profiles, setProfiles] = useState<ShellProfile[]>([]), [preferences, setPreferences] = useState<Preferences | null>(null), [preview, setPreview] = useState<Preferences | null>(null);
  const [preferencesMode, setPreferencesMode] = useState<"setup" | "settings" | null>(null), [startupError, setStartupError] = useState(""), [retry, setRetry] = useState(0);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const [sessions, setSessions] = useState<Session[]>([]), [tabs, setTabs] = useState<TerminalTab[]>([]), [activeTab, setActiveTab] = useState("");
  const [query, setQuery] = useState(""), [dialog, setDialog] = useState(false), [name, setName] = useState(""), [host, setHost] = useState(""), [username, setUsername] = useState(""), [port, setPort] = useState("22"), [kind, setKind] = useState<SessionKind>("ssh");
  const [status, setStatus] = useState(""), [sshTarget, setSshTarget] = useState<{ session: Session; replaces?: string } | null>(null);
  const visible = preview ?? preferences ?? defaults("powershell"), lang = visible.language, tr = (key: Message) => t(lang, key), theme = resolvedTheme(visible.theme, systemDark);
  const configured = !!preferences?.setupComplete && preferences.setupVersion === 2;
  const profile = preferences?.defaultShell ?? "powershell";
  useEffect(() => { const media = window.matchMedia("(prefers-color-scheme: dark)"); const change = () => setSystemDark(media.matches); media.addEventListener("change", change); return () => media.removeEventListener("change", change); }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme; document.documentElement.lang = lang;
    document.documentElement.style.setProperty("--accent", visible.accent);
    document.documentElement.style.setProperty("--accent-foreground", accentForeground(visible.accent));
    document.documentElement.style.setProperty("--accent-ink", accentText(visible.accent, theme));
    // Native titlebar follows the same saved/previewed policy as the interface.
    try { void getCurrentWindow().setTheme(visible.theme === "system" ? null : visible.theme).catch(() => {}); } catch { /* browser tests have no native window */ }
  }, [theme, lang, visible.theme, visible.accent]);
  async function refresh() { try { setSessions(await listSessions()); } catch (e) { setStatus(String(e)); } }
  useEffect(() => { void refresh(); }, []);
  function localTab(value: Preferences): TerminalTab { return { id: makeId(), title: profiles.find(p => p.id === value.defaultShell)?.name ?? value.defaultShell, kind: "local", profile: value.defaultShell }; }
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
  const filtered = useMemo(() => sessions.filter(s => `${s.name} ${s.host} ${s.username} ${s.group}`.toLowerCase().includes(query.toLowerCase())), [sessions, query]);
  async function createSession() {
    if (kind === "ssh" && (!host.trim() || !username.trim() || !Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535)) { setStatus("invalid_host"); return; }
    const session: Session = { id: makeId(), name: name.trim() || host.trim() || tr("localTerminal"), kind, host: host.trim(), port: kind === "ssh" ? Number(port) : 22, username: username.trim(), group: "General" };
    try { await saveSession(session); await refresh(); setDialog(false); setName(""); setHost(""); setUsername(""); setPort("22"); setStatus(""); } catch (e) { setStatus(String(e)); }
  }
  async function removeSession(id: string) { try { await deleteSession(id); await refresh(); } catch (e) { setStatus(String(e)); } }
  function openSession(session: Session) {
    if (session.kind === "ssh") { setSshTarget({ session }); return; }
    const tab: TerminalTab = { id: makeId(), title: session.name, sessionId: session.id, kind: session.kind, profile };
    setTabs(old => [...old, tab]); setActiveTab(tab.id);
  }
  function addLocalTab() { if (!preferences || !configured) return; const tab = localTab(preferences); setTabs(old => [...old, tab]); setActiveTab(tab.id); }
  function closeTab(id: string) { setTabs(old => { const next = old.filter(t => t.id !== id); if (activeTab === id) setActiveTab(next[next.length - 1]?.id ?? ""); return next; }); }
  function connected(id: string, details: Pick<Session, "username" | "authMethod" | "keyPath">) {
    if (!sshTarget) { void terminalApi.close(id); return; }
    const tab: TerminalTab = { id: makeId(), title: sshTarget.session.name, sessionId: sshTarget.session.id, kind: "ssh", transportId: id };
    const replaces = sshTarget.replaces;
    const remembered = { ...sshTarget.session, ...details };
    setSessions(old => old.map(session => session.id === remembered.id ? remembered : session));
    void saveSession(remembered).catch(e => setStatus(String(e)));
    setTabs(old => replaces ? old.map(t => t.id === replaces ? tab : t) : [...old, tab]); setActiveTab(tab.id); setSshTarget(null);
  }
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><img className="brand-logo" src="/termix.svg" alt=""/><span>Termi<span className="brand-x">X</span></span><span className="version">0.3.0</span></div><div className="topbar-actions"><button className="settings-button" disabled={!preferences} onClick={() => setPreferencesMode("settings")} title={tr("settings")}><Settings size={16}/><span>{tr("settings")}</span></button></div></header>
    <div className="workspace"><aside className="sidebar">
      <div className="side-heading"><span>{tr("workspace")}</span><button className="icon-button small" disabled={!configured} onClick={() => setDialog(true)} title={tr("addSession")}><Plus size={16}/></button></div>
      <div className="search"><Search size={15}/><input placeholder={tr("search")} value={query} onChange={e => setQuery(e.target.value)}/></div>
      <div className="nav-section"><div className="section-label"><ChevronDown size={13}/>{tr("connections")}</div><button className="nav-item selected"><Server size={15}/>{tr("allSessions")}<span className="count">{sessions.length}</span></button><button className="nav-item" disabled={!configured} onClick={addLocalTab}><Laptop size={15}/>{tr("localTerminal")}</button><button className="nav-item planned" disabled><Folder size={15}/>SFTP<span className="planned-tag">{tr("planned")}</span></button></div>
      <div className="session-section"><div className="section-label"><ChevronDown size={13}/>{tr("savedSessions")}</div>{filtered.map(s => <div className="session-row" key={s.id}><button className="session-open" onClick={() => openSession(s)}><span className={`session-dot ${s.kind}`}/><span className="session-text"><b>{s.name}</b><small>{s.username ? `${s.username}@` : ""}{s.host || tr("localTerminal")}</small></span></button><button className="delete-session" title={tr("deleteSession")} onClick={() => void removeSession(s.id)}><X size={13}/></button></div>)}{!filtered.length && <div className="empty">{tr("noSessions")}</div>}</div>
      <div className="sidebar-bottom"><div className="secure"><Shield size={14}/>{tr("localStorage")}</div><div className="sidebar-version">{tr("tagline")}</div></div>
    </aside><main className="main"><div className="tabbar">{tabs.map(tab => <button key={tab.id} className={`tab ${activeTab === tab.id ? "active" : ""}`} onClick={() => setActiveTab(tab.id)}><Terminal size={14}/><span>{tab.title}</span><span className="tab-close" title={tr("closeTab")} onClick={e => { e.stopPropagation(); closeTab(tab.id); }}><X size={12}/></span></button>)}<button className="new-tab" disabled={!configured} onClick={addLocalTab} title={tr("newTab")}><Plus size={16}/></button></div>
      <div className="terminal-area">{startupError ? <div className="workspace-empty" role="alert"><h2>{tr("loadFailed")}</h2><p>{errorText(startupError, lang)}</p><button className="btn primary" onClick={() => setRetry(v => v + 1)}>{tr("retry")}</button></div> : !tabs.length && <div className="workspace-empty"><img src="/termix.svg" alt=""/><h2>{tr("emptyTitle")}</h2><p>{tr("emptyIntro")}</p><button className="btn primary" disabled={!configured} onClick={addLocalTab}><Plus size={16}/>{tr("openTerminal")}</button></div>}
      {tabs.map(tab => <div key={tab.id} className="terminal-layer" style={{ display: activeTab === tab.id ? "flex" : "none", flexDirection: "column" }}><Suspense fallback={<span role="status">{tr("openTerminal")}…</span>}><TerminalPane tab={tab} active={activeTab === tab.id} fontSize={visible.fontSize} theme={theme} accent={visible.accent} language={lang} onReconnect={() => { const session = sessions.find(s => s.id === tab.sessionId); if (session) setSshTarget({ session, replaces: tab.id }); }}/></Suspense></div>)}</div>
      <footer className="statusbar"><span><Activity size={13}/>{status ? errorText(status, lang) : tabs.find(tab => tab.id === activeTab)?.kind === "ssh" ? "SSH" : tr("localWorkspace")}</span><span><HardDrive size={13}/>{sessions.length} {tr("sessions")}</span><span>{visible.fontSize} px<span className="status-divider">/</span>UTF-8</span></footer>
    </main></div>
    {preferencesMode && preferences && <PreferencesDialog mode={preferencesMode} profiles={profiles} initial={preferences} onSave={applyPreferences} onPreview={setPreview} onClose={() => { setPreview(null); setPreferencesMode(null); }}/ >}
    {sshTarget && <Suspense fallback={<div role="status">{tr("connecting")}</div>}><SshDialog session={sshTarget.session} language={lang} onClose={() => setSshTarget(null)} onConnected={connected}/></Suspense>}
    {dialog && <div className="modal-backdrop" onKeyDown={e => { if (e.key === "Escape") setDialog(false); }} onMouseDown={e => { if (e.target === e.currentTarget) setDialog(false); }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="session-title"><div className="modal-title"><div><h2 id="session-title">{tr("newConnection")}</h2><p>{tr("connectionIntro")}</p></div><button className="icon-button" aria-label={tr("cancel")} onClick={() => setDialog(false)}><X size={17}/></button></div>
      <label>{tr("connectionType")}<select value={kind} onChange={e => setKind(e.target.value as SessionKind)}><option value="ssh">SSH</option><option value="local">{tr("localTerminal")}</option></select></label><label>{tr("displayName")}<input value={name} onChange={e => setName(e.target.value)} placeholder="Proxmox"/></label>
      {kind === "ssh" && <><div className="form-row"><label className="grow">{tr("hostname")}<input value={host} onChange={e => setHost(e.target.value)} placeholder="192.168.1.10"/></label><label className="port">{tr("port")}<input value={port} onChange={e => setPort(e.target.value)} inputMode="numeric"/></label></div><label>{tr("username")}<input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" placeholder="user"/></label></>}
      <p className="hint">{tr("metadataOnly")}</p>{status && <div role="alert" className="preferences-error">{errorText(status, lang)}</div>}<div className="modal-actions"><button className="btn secondary" onClick={() => setDialog(false)}>{tr("cancel")}</button><button className="btn primary" onClick={() => void createSession()}>{tr("saveSession")}</button></div>
    </div></div>}
  </div>;
}
