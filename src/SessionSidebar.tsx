import { useState } from "react";
import { ChevronDown, Clock, Copy, Download, Folder, FolderPlus, HardDrive, Laptop, MoreHorizontal, Pencil, Plus, Search, Server, Shield, Star, Trash2, Upload } from "lucide-react";
import { ContextMenu } from "./ContextMenu";
import { t, type Language } from "./i18n";
import type { Session, SessionCatalog, SessionFolder } from "./types";
export type SessionView = "all" | "favorites" | "recent" | "unassigned" | `folder:${string}`;
export function SessionSidebar({ catalog, sessions, language, view, setView, query, setQuery, configured, busy, onNew, onOpen, onEdit, onDuplicate, onFavorite, onDelete, onLocal, onFolder, onDeleteFolder, onImport, onExport, onMove, onConnectAs, onSftp }: {
  catalog: SessionCatalog; sessions: Session[]; language: Language; view: SessionView; setView: (view: SessionView) => void; query: string; setQuery: (value: string) => void; configured: boolean; busy: boolean;
  onFiles: () => void; hasSsh: boolean; onMove: (session: Session, folder: string) => void; onNew: (folder?: string) => void; onOpen: (s: Session) => void; onEdit: (s: Session) => void; onDuplicate: (s: Session) => void; onFavorite: (s: Session) => void; onDelete: (s: Session) => void; onLocal: () => void; onFolder: (folder?: SessionFolder) => void; onDeleteFolder: (folder: SessionFolder) => void; onImport: (folder?: SessionFolder) => void; onExport: (scope?: {sessionId?: string; folderId?: string}) => void; onConnectAs: (s: Session) => void; onSftp: (s: Session) => void;
}) {
  const [context, setContext] = useState<{ x: number; y: number; session?: Session; folder?: SessionFolder; more?: boolean } | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ connections: true });
  const heading = (key: "connections" | "folders" | "savedSessions") => <button className="section-label collapse-heading" aria-expanded={!collapsed[key]} onClick={() => setCollapsed(old => ({ ...old, [key]: !old[key] }))}><ChevronDown size={15} style={{ transform: collapsed[key] ? "rotate(-90deg)" : undefined }}/>{tr(key)}</button>;
  const drop = (folder: string) => ({ onDragOver: (e: React.DragEvent) => { if (!busy && e.dataTransfer.types.includes("application/x-termix-session")) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }, onDrop: (e: React.DragEvent) => { e.preventDefault(); const session = catalog.sessions.find(s => s.id === e.dataTransfer.getData("application/x-termix-session")); if (session && !busy && session.group !== folder) onMove(session, folder); } });
  const tr = (key: Parameters<typeof t>[1]) => t(language, key);
  const ui = (en: string, de: string) => language === "de" ? de : en;
  const rowMenu = (event: React.MouseEvent, target: {session?: Session; folder?: SessionFolder}) => {
    event.preventDefault();
    event.stopPropagation();
    if (!busy) setContext({x: event.clientX, y: event.clientY, ...target});
  };
  const session = context?.session;
  const folder = context?.folder;
  const sessionActions = session ? [
    {icon: Server, label: tr("openSession"), action: () => onOpen(session)},
    ...(session.kind === "ssh" ? [
      {icon: Server, label: ui("Connect as…", "Verbinden als …"), action: () => onConnectAs(session)},
      {icon: Folder, label: ui("Open SFTP", "SFTP öffnen"), action: () => onSftp(session)},
    ] : []),
    {label: ui("Manage", "Verwalten"), heading: true},
    {icon: Pencil, label: tr("editSession"), action: () => onEdit(session)},
    {icon: Star, label: tr(session.favorite ? "removeFavorite" : "addFavorite"), action: () => onFavorite(session)},
    {icon: Copy, label: tr("duplicateSession"), action: () => onDuplicate(session)},
    {icon: Upload, label: ui("Export this session", "Diese Sitzung exportieren"), action: () => onExport({sessionId: session.id})},
    {icon: Trash2, label: tr("deleteSession"), action: () => onDelete(session)},
  ] : [];
  const folderActions = folder ? [
    {icon: Plus, label: ui("New session in folder", "Neue Sitzung im Ordner"), action: () => onNew(folder.id)},
    {icon: FolderPlus, label: tr("addFolder"), action: () => onFolder()},
    {icon: ChevronDown, label: expanded[folder.id] ? ui("Collapse folder", "Ordner zuklappen") : ui("Expand folder", "Ordner aufklappen"), action: () => setExpanded(old => ({...old, [folder.id]: !old[folder.id]}))},
    {label: ui("Manage", "Verwalten"), heading: true},
    {icon: Pencil, label: tr("renameFolder"), action: () => onFolder(folder)},
    {icon: Download, label: ui("Import into this folder", "In diesen Ordner importieren"), action: () => onImport(folder)},
    {icon: Upload, label: ui("Export this folder", "Diesen Ordner exportieren"), action: () => onExport({folderId: folder.id})},
    {icon: Trash2, label: tr("deleteFolder"), action: () => onDeleteFolder(folder)},
  ] : [];
  return <aside className="sidebar" onContextMenu={e => { if (busy) return; e.preventDefault(); setContext({ x: e.clientX, y: e.clientY }); }}><div className="sidebar-scroll">
    <div className="side-heading"><span>{tr("workspace")}</span><div className="side-actions"><button className="icon-button" disabled={!configured || busy} onClick={() => onFolder()} aria-label={tr("addFolder")} title={tr("addFolder")}><FolderPlus size={19}/></button><button className="icon-button" disabled={!configured || busy} onClick={() => onNew()} aria-label={tr("addSession")} title={tr("addSession")}><Plus size={20}/></button></div></div>
    <div className="search"><Search size={18}/><input aria-label={tr("search")} placeholder={tr("search")} value={query} onChange={e => setQuery(e.target.value)}/></div>
    <nav className="nav-section" aria-label={tr("connections")}>{heading("connections")}<div hidden={collapsed.connections}>
      <button className={`nav-item ${view === "all" ? "selected" : ""}`} aria-label={tr("allSessions")} onClick={() => setView("all")}><Server size={18}/>{tr("allSessions")}<span className="count" aria-hidden="true">{catalog.sessions.length}</span></button>
      <button className={`nav-item ${view === "favorites" ? "selected" : ""}`} onClick={() => setView("favorites")}><Star size={18}/>{tr("favorites")}</button>
      <button className={`nav-item ${view === "recent" ? "selected" : ""}`} onClick={() => setView("recent")}><Clock size={18}/>{tr("recent")}</button>
      <button className="nav-item" disabled={!configured} onClick={onLocal}><Laptop size={18}/>{tr("localTerminal")}</button>
    </div></nav>
    <nav className="folder-section" aria-label={tr("folders")}>{heading("folders")}<div hidden={collapsed.folders}><button {...drop("")} className={`nav-item ${view === "unassigned" ? "selected" : ""}`} onClick={() => setView("unassigned")}><HardDrive size={17}/>{tr("unassigned")}</button>
      {[...catalog.folders].sort((a, b) => a.name.localeCompare(b.name, language)).map(folder => <div key={folder.id} className="folder-tree" {...drop(folder.id)} onContextMenu={e => rowMenu(e, {folder})}><div className="folder-row"><button className="icon-button" aria-label={`${expanded[folder.id] ? (language === "de" ? "Ordner zuklappen" : "Collapse folder") : (language === "de" ? "Ordner aufklappen" : "Expand folder")}: ${folder.name}`} aria-expanded={!!expanded[folder.id]} onClick={() => setExpanded(old => ({ ...old, [folder.id]: !old[folder.id] }))}><ChevronDown size={15} style={{ transform: expanded[folder.id] ? undefined : "rotate(-90deg)" }}/></button><button className={`nav-item ${view === `folder:${folder.id}` ? "selected" : ""}`} aria-label={folder.name} title={folder.name} onClick={() => setView(`folder:${folder.id}`)}><Folder size={17}/><span>{folder.name}</span><span className="count" aria-hidden="true">{catalog.sessions.filter(s => s.group === folder.id).length}</span></button><button className="icon-button" disabled={busy} aria-label={`${tr("renameFolder")}: ${folder.name}`} onClick={() => onFolder(folder)}><Pencil size={15}/></button><button className="icon-button" disabled={busy} aria-label={`${tr("deleteFolder")}: ${folder.name}`} onClick={() => onDeleteFolder(folder)}><Trash2 size={15}/></button></div>{expanded[folder.id] && <div className="folder-children">{catalog.sessions.filter(s => s.group === folder.id && `${s.name} ${s.host}`.toLocaleLowerCase(language).includes(query.toLocaleLowerCase(language))).map(session => <div className="session-row" key={session.id} onContextMenu={e => rowMenu(e, {session})} draggable={!busy} onDragStart={e => { e.dataTransfer.setData("application/x-termix-session", session.id); e.dataTransfer.effectAllowed = "move"; }}><button className="session-open" onClick={() => onOpen(session)} title={session.host}>{session.name}</button><button className="icon-button" aria-label={`${tr("editSession")} (${folder.name}): ${session.name}`} onClick={() => onEdit(session)}><Pencil size={15}/></button></div>)}</div>}</div>)}
    </div></nav>
    <section className="session-section">{heading("savedSessions")}<div hidden={collapsed.savedSessions && !query.trim()}>{sessions.map(session => <div className="session-row" key={session.id} onContextMenu={e => rowMenu(e, {session})} draggable={!busy} onDragStart={e => { e.dataTransfer.setData("application/x-termix-session", session.id); e.dataTransfer.effectAllowed = "move"; }}>
      <button className={`icon-button favorite-button ${session.favorite ? "is-favorite" : ""}`} disabled={busy} title={tr(session.favorite ? "removeFavorite" : "addFavorite")} aria-label={`${tr(session.favorite ? "removeFavorite" : "addFavorite")}: ${session.name}`} onClick={() => onFavorite(session)}><Star size={17} fill={session.favorite ? "currentColor" : "none"}/></button>
      <button className="session-open" aria-label={`${tr("openSession")}: ${session.name}`} title={`${session.name}\n${session.username ? `${session.username}@` : ""}${session.host}${session.lastUsed ? `\n${new Date(session.lastUsed * 1000).toLocaleString(language)}` : ""}`} onClick={() => onOpen(session)}><span className="session-text"><b>{session.name}</b><small>{session.kind === "local" ? tr("localTerminal") : `${session.username ? `${session.username}@` : ""}${session.host}${session.port !== 22 ? `:${session.port}` : ""}`}</small></span></button>
      <button className="icon-button edit-session" disabled={busy} title={tr("editSession")} aria-label={`${tr("editSession")}: ${session.name}`} onClick={() => onEdit(session)}><Pencil size={17}/></button>
      <button className="icon-button" disabled={busy} title={tr("moreSession")} aria-label={`${tr("moreSession")}: ${session.name}`} aria-haspopup="menu" aria-expanded={context?.session?.id === session.id && !!context.more} onClick={event => {
        const bounds = event.currentTarget.getBoundingClientRect();
        setContext({x: bounds.left, y: bounds.bottom, session, more: true});
      }}><MoreHorizontal size={19}/></button>
    </div>)}{!sessions.length && <div className="empty">{tr(catalog.sessions.length ? "noFolderSessions" : "noSessions")}</div>}</div></section>
  </div>{context && <ContextMenu {...context} onClose={() => setContext(null)} items={session ? sessionActions : folder ? folderActions : [{ label: language === "de" ? "Erstellen" : "Create", heading: true }, { icon: Plus, label: tr("addSession"), action: () => onNew(), disabled: !configured }, { icon: FolderPlus, label: tr("addFolder"), action: () => onFolder(), disabled: !configured }, { label: language === "de" ? "Bibliothek" : "Library", heading: true }, { icon: Download, label: tr("importSessions"), action: () => onImport() }, { icon: Upload, label: tr("exportSessions"), action: () => onExport(), disabled: !catalog.sessions.length }, { icon: ChevronDown, label: language === "de" ? "Alle Gruppen einklappen" : "Collapse all sections", action: () => setCollapsed({ connections: true, folders: true, savedSessions: true }) }]}/> }<div className="sidebar-bottom"><div className="library-transfer"><button className="btn secondary" disabled={busy} onClick={() => onImport()} title={tr("importSessions")}><Download size={17}/>{tr("importAction")}</button><button className="btn secondary" disabled={busy || !catalog.sessions.length} onClick={() => onExport()} title={tr("exportSessions")}><Upload size={17}/>{tr("exportAction")}</button></div><div className="secure"><Shield size={15}/>{tr("localStorage")}</div><div className="sidebar-version">{tr("tagline")}</div></div></aside>;
}
