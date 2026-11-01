import { useEffect, useMemo, useState } from "react";
import { TerminalPane } from "./TerminalPane";
import { PreferencesDialog } from "./PreferencesDialog";
import { getPreferences, savePreferences, type Preferences } from "./services/preferences";
import { terminalApi, type ShellProfile } from "./services/terminal";
import { Activity, ChevronDown, Folder, HardDrive, Laptop, Plus, Search, Server, Settings, Shield, Terminal, X } from "lucide-react";
import { deleteSession, listSessions, saveSession } from "./services/sessions";
import type { Session, SessionKind, TerminalTab } from "./types";

const makeId = () => crypto.randomUUID();

function App() {
  const [profiles, setProfiles] = useState<ShellProfile[]>([]);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [preferencesMode, setPreferencesMode] = useState<"setup" | "settings" | null>(null);
  const [startupError, setStartupError] = useState("");
  const [retry, setRetry] = useState(0);
  const profile = preferences?.defaultShell ?? "powershell";
  const [sessions, setSessions] = useState<Session[]>([]);
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTab, setActiveTab] = useState("");
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState(false);
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [username, setUsername] = useState("");
  const [port, setPort] = useState("22");
  const [kind, setKind] = useState<SessionKind>("ssh");
  const [status, setStatus] = useState("");

  async function refresh() {
    try { setSessions(await listSessions()); }
    catch { setStatus("Backend noch nicht initialisiert"); }
  }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    let cancelled = false;
    setStartupError("");
    void Promise.all([terminalApi.profiles(), getPreferences()]).then(([available, saved]) => {
      if (cancelled || !available.length) return;
      setProfiles(available);
      const value = saved ?? { schemaVersion: 1, setupComplete: false, defaultShell: available[0].id, fontSize: 15 };
      setPreferences(value);
      if (!value.setupComplete) { setPreferencesMode("setup"); return; }
      const tab: TerminalTab = { id: makeId(), title: available.find(p => p.id === value.defaultShell)?.name ?? "Lokales Terminal", kind: "local", profile: value.defaultShell };
      setTabs([tab]); setActiveTab(tab.id);
    }).catch(e => { if (!cancelled) setStartupError(String(e)); });
    return () => { cancelled = true; };
  }, [retry]);

  async function applyPreferences(value: Preferences) {
    const saved = await savePreferences(value);
    const firstSetup = preferencesMode === "setup";
    setPreferences(saved); setPreferencesMode(null);
    if (firstSetup) {
      const tab: TerminalTab = { id: makeId(), title: profiles.find(p => p.id === saved.defaultShell)?.name ?? "Lokales Terminal", kind: "local", profile: saved.defaultShell };
      setTabs([tab]); setActiveTab(tab.id);
    }
  }

  const filtered = useMemo(() => sessions.filter(s =>
    `${s.name} ${s.host} ${s.username} ${s.group}`.toLowerCase().includes(query.toLowerCase())
  ), [sessions, query]);

  async function createSession() {
    const session: Session = {
      id: makeId(), name: name.trim() || host || "Neue Session", kind,
      host: host.trim(), port: Number(port) || 22, username: username.trim(), group: "Allgemein"
    };
    try {
      await saveSession(session);
      await refresh();
      setDialog(false); setName(""); setHost(""); setUsername(""); setPort("22");
    } catch (e) { setStatus(`Fehler: ${String(e)}`); }
  }

  async function removeSession(id: string) {
    try { await deleteSession(id); await refresh(); }
    catch (e) { setStatus(`Fehler: ${String(e)}`); }
  }

  function openSession(session: Session) {
    const tab: TerminalTab = { id: makeId(), title: session.name, sessionId: session.id, kind: session.kind, profile };
    setTabs(old => [...old, tab]); setActiveTab(tab.id);
    setStatus(`${session.name} ausgewählt`);
  }

  function addLocalTab() {
    const tab: TerminalTab = { id: makeId(), title: profiles.find(p => p.id === profile)?.name ?? "Local Terminal", kind: "local", profile };
    setTabs(old => [...old, tab]); setActiveTab(tab.id);
  }

  function closeTab(id: string) {
    setTabs(old => {
      const next = old.filter(t => t.id !== id);
      if (activeTab === id) setActiveTab(next[next.length - 1]?.id ?? "");
      return next;
    });
  }

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><img className="brand-logo" src="/termix.svg" alt=""/><span>Termi<span className="brand-x">X</span></span><span className="version">0.2.1</span></div>
      <div className="topbar-actions"><button className="settings-button" disabled={!preferences} onClick={() => setPreferencesMode("settings")} title="Einstellungen"><Settings size={16}/><span>Einstellungen</span></button></div>
    </header>
    <div className="workspace">
      <aside className="sidebar">
        <div className="side-heading"><span>WORKSPACE</span><button className="icon-button small" disabled={!preferences?.setupComplete} onClick={() => setDialog(true)} title="Session hinzufügen"><Plus size={16}/></button></div>
        <div className="search"><Search size={15}/><input placeholder="Sessions suchen..." value={query} onChange={e => setQuery(e.target.value)}/></div>
        <div className="nav-section"><div className="section-label"><ChevronDown size={13}/> VERBINDUNGEN</div>
          <button className="nav-item selected"><Server size={15}/> Alle Sessions <span className="count">{sessions.length}</span></button>
          <button className="nav-item" disabled={!preferences?.setupComplete} onClick={addLocalTab}><Laptop size={15}/> Lokales Terminal</button>
          <button className="nav-item planned" disabled title="SFTP folgt in einem späteren Meilenstein"><Folder size={15}/> SFTP Transfers <span className="planned-tag">Geplant</span></button>
        </div>
        <div className="session-section">
          <div className="section-label"><ChevronDown size={13}/> GESPEICHERTE SESSIONS</div>
          {filtered.map(s => <div className="session-row" key={s.id}>
            <button className="session-open" onClick={() => openSession(s)}>
              <span className={`session-dot ${s.kind}`}/><span className="session-text"><b>{s.name}</b><small>{s.username ? `${s.username}@` : ""}{s.host || "Local"}</small></span>
            </button>
            <button className="delete-session" title="Session löschen" onClick={() => void removeSession(s.id)}><X size={13}/></button>
          </div>)}
          {filtered.length === 0 && <div className="empty">Keine gespeicherten Sessions</div>}
        </div>
        <div className="sidebar-bottom"><div className="secure"><Shield size={14}/> Dein Workspace bleibt lokal</div><div className="sidebar-version">TermiX · Für deinen Workflow</div></div>
      </aside>
      <main className="main">
        <div className="tabbar">
          {tabs.map(t => <button key={t.id} className={`tab ${activeTab === t.id ? "active" : ""}`} onClick={() => setActiveTab(t.id)}>
            <Terminal size={14}/><span>{t.title}</span>{<span className="tab-close" onClick={e => { e.stopPropagation(); closeTab(t.id); }}><X size={12}/></span>}
          </button>)}
          <button className="new-tab" disabled={!preferences?.setupComplete} onClick={addLocalTab} title="Neuer Tab"><Plus size={16}/></button>
        </div>
        <div className="terminal-area">
          {startupError ? <div className="workspace-empty" role="alert"><h2>Workspace konnte nicht geladen werden</h2><p>{startupError}</p><button className="btn primary" onClick={() => setRetry(v => v + 1)}>Erneut versuchen</button></div> : tabs.length === 0 && <div className="workspace-empty"><img src="/termix.svg" alt=""/><h2>Platz für deinen nächsten Schritt.</h2><p>Öffne ein lokales Terminal und leg los.</p><button className="btn primary" disabled={!preferences?.setupComplete} onClick={addLocalTab}><Plus size={16}/> Terminal öffnen</button></div>}
          {tabs.map(t => <div key={t.id} className="terminal-layer" style={{ display: activeTab === t.id ? "block" : "none" }}><TerminalPane tab={t} active={activeTab === t.id} fontSize={preferences?.fontSize ?? 15}/></div>)}
        </div>
        <footer className="statusbar"><span><Activity size={13}/> {status || "Lokaler Workspace"}</span><span><HardDrive size={13}/> {sessions.length} Sessions</span><span>{preferences?.fontSize ?? 15} px <span className="status-divider">/</span> UTF-8</span></footer>
      </main>
    </div>
    {preferencesMode && preferences && <PreferencesDialog mode={preferencesMode} profiles={profiles} initial={preferences} onSave={applyPreferences} onClose={() => setPreferencesMode(null)}/>}
    {dialog && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setDialog(false); }}>
      <div className="modal">
        <div className="modal-title"><div><h2>Neue Verbindung</h2><p>Verbindung für deinen Workspace speichern</p></div><button className="icon-button" onClick={() => setDialog(false)}><X size={17}/></button></div>
        <label>Verbindungstyp<select value={kind} onChange={e => setKind(e.target.value as SessionKind)}><option value="ssh">SSH (geplant)</option><option value="local">Local Terminal</option><option value="rdp">RDP (geplant)</option><option value="serial">Serial (geplant)</option></select></label>
        <label>Anzeigename<input value={name} onChange={e => setName(e.target.value)} placeholder="z. B. Proxmox Server"/></label>
        <div className="form-row"><label className="grow">Hostname / IP<input value={host} onChange={e => setHost(e.target.value)} placeholder="192.168.1.10"/></label><label className="port">Port<input value={port} onChange={e => setPort(e.target.value)} inputMode="numeric"/></label></div>
        <label>Benutzername<input value={username} onChange={e => setUsername(e.target.value)} placeholder="root"/></label>
        <p className="hint">Passwörter und private Schlüssel werden in dieser Version bewusst noch nicht gespeichert.</p>
        <div className="modal-actions"><button className="btn secondary" onClick={() => setDialog(false)}>Abbrechen</button><button className="btn primary" onClick={() => void createSession()}>Session speichern</button></div>
      </div>
    </div>}
  </div>;
}

export default App;
