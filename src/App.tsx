import { useEffect, useMemo, useState } from "react";
import { TerminalPane } from "./TerminalPane";
import { terminalApi, type ShellProfile } from "./services/terminal";
import { Activity, ChevronDown, Folder, HardDrive, Laptop, Plus, Search, Server, Settings, Shield, Terminal, X } from "lucide-react";
import { deleteSession, listSessions, saveSession } from "./services/sessions";
import type { Session, SessionKind, TerminalTab } from "./types";

const makeId = () => crypto.randomUUID();

function App() {
  const [profiles, setProfiles] = useState<ShellProfile[]>([]);
  const [profile, setProfile] = useState("powershell");
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
  const [status, setStatus] = useState("Bereit");

  async function refresh() {
    try { setSessions(await listSessions()); }
    catch { setStatus("Backend noch nicht initialisiert"); }
  }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    let cancelled = false;
    void terminalApi.profiles().then(available => {
      if (cancelled || !available.length) return;
      setProfiles(available); setProfile(available[0].id);
      const tab: TerminalTab = { id: makeId(), title: available[0].name, kind: "local", profile: available[0].id };
      setTabs([tab]); setActiveTab(tab.id);
    }).catch(e => { if (!cancelled) setStatus(`Terminalprofile nicht verfügbar: ${String(e)}`); });
    return () => { cancelled = true; };
  }, []);

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
      <div className="brand"><div className="brand-mark"><Terminal size={17}/></div><span>TermiX</span><span className="version">0.2.0</span></div>
      <div className="topbar-center"><span className="connection-dot"/>{status}</div>
      <div className="topbar-actions"><button className="icon-button" title="Einstellungen"><Settings size={17}/></button></div>
    </header>
    <div className="workspace">
      <aside className="sidebar">
        <div className="side-heading"><span>WORKSPACE</span><button className="icon-button small" onClick={() => setDialog(true)} title="Session hinzufügen"><Plus size={16}/></button></div>
        <div className="search"><Search size={15}/><input placeholder="Sessions suchen..." value={query} onChange={e => setQuery(e.target.value)}/></div>
        <div className="nav-section"><div className="section-label"><ChevronDown size={13}/> CONNECTIONS</div>
          <button className="nav-item selected"><Server size={15}/> Alle Sessions <span className="count">{sessions.length}</span></button>
          <select aria-label="Lokales Shellprofil" value={profile} onChange={e => setProfile(e.target.value)}>{profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <button className="nav-item" disabled={!profiles.length} onClick={addLocalTab}><Laptop size={15}/> Local Terminal</button>
          <button className="nav-item"><Folder size={15}/> SFTP Transfers</button>
        </div>
        <div className="session-section">
          <div className="section-label"><ChevronDown size={13}/> SAVED SESSIONS</div>
          {filtered.map(s => <div className="session-row" key={s.id}>
            <button className="session-open" onClick={() => openSession(s)}>
              <span className={`session-dot ${s.kind}`}/><span className="session-text"><b>{s.name}</b><small>{s.username ? `${s.username}@` : ""}{s.host || "Local"}</small></span>
            </button>
            <button className="delete-session" title="Session löschen" onClick={() => void removeSession(s.id)}><X size={13}/></button>
          </div>)}
          {filtered.length === 0 && <div className="empty">Keine gespeicherten Sessions</div>}
        </div>
        <div className="sidebar-bottom"><div className="secure"><Shield size={14}/> Local-first storage</div><div className="sidebar-version">TermiX · Cross-platform</div></div>
      </aside>
      <main className="main">
        <div className="tabbar">
          {tabs.map(t => <button key={t.id} className={`tab ${activeTab === t.id ? "active" : ""}`} onClick={() => setActiveTab(t.id)}>
            <Terminal size={14}/><span>{t.title}</span>{<span className="tab-close" onClick={e => { e.stopPropagation(); closeTab(t.id); }}><X size={12}/></span>}
          </button>)}
          <button className="new-tab" disabled={!profiles.length} onClick={addLocalTab} title="Neuer Tab"><Plus size={16}/></button>
        </div>
        <div className="terminal-area">
          {tabs.length === 0 && <div className="empty"><button className="btn primary" disabled={!profiles.length} onClick={addLocalTab}>Lokales Terminal öffnen</button></div>}
          {tabs.map(t => <div key={t.id} className="terminal-layer" style={{ display: activeTab === t.id ? "block" : "none" }}><TerminalPane tab={t} active={activeTab === t.id}/></div>)}
        </div>
        <footer className="statusbar"><span><Activity size={13}/> {status}</span><span><HardDrive size={13}/> {sessions.length} Sessions</span><span>UTF-8</span></footer>
      </main>
    </div>
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
