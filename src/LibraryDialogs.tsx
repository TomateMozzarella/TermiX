import { useState } from "react";
import { Modal } from "./Modal";
import { errorText, t, type Language } from "./i18n";
import type { Session, SessionCatalog, SessionFolder } from "./types";

export function FolderDialog({ initial, language, onSave, onClose }: { initial: SessionFolder; language: Language; onSave: (folder: SessionFolder) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState(initial.name), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const tr = (key: Parameters<typeof t>[1]) => t(language, key);
  const save = async () => { setBusy(true); setError(""); try { await onSave({ ...initial, name: name.trim() }); } catch (e) { setError(String(e)); setBusy(false); } };
  return <Modal title={tr(initial.name ? "renameFolder" : "addFolder")} closeLabel={tr("closeDialog")} busy={busy} onClose={onClose} footer={<div className="modal-actions"><button className="btn secondary" disabled={busy} onClick={onClose}>{tr("cancel")}</button><button className="btn primary" disabled={busy || !name.trim()} onClick={() => void save()}>{tr("saveFolder")}</button></div>}>
    <label className="field"><span>{tr("folderName")}</span><input disabled={busy} value={name} maxLength={80} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && name.trim()) void save(); }}/></label>{error && <div role="alert" className="preferences-error">{errorText(error, language)}</div>}
  </Modal>;
}
export function ConfirmDialog({ title, note, language, onConfirm, onClose }: { title: string; note: string; language: Language; onConfirm: () => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const tr = (key: Parameters<typeof t>[1]) => t(language, key);
  return <Modal title={title} closeLabel={tr("closeDialog")} busy={busy} onClose={onClose} footer={<div className="modal-actions"><button className="btn secondary" disabled={busy} onClick={onClose}>{tr("cancel")}</button><button className="btn danger" disabled={busy} onClick={() => { setBusy(true); setError(""); void onConfirm().catch(e => { setError(String(e)); setBusy(false); }); }}>{tr("deleteAction")}</button></div>}><p className="preferences-intro">{note}</p>{error && <div role="alert" className="preferences-error">{errorText(error, language)}</div>}</Modal>;
}
export function ImportDialog({ catalog, language, onConfirm, onClose }: { catalog: SessionCatalog; language: Language; onConfirm: () => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const tr = (key: Parameters<typeof t>[1]) => t(language, key);
  return <Modal title={tr("importReview")} closeLabel={tr("closeDialog")} busy={busy} onClose={onClose} footer={<div className="modal-actions"><button className="btn secondary" disabled={busy} onClick={onClose}>{tr("cancel")}</button><button className="btn primary" disabled={busy || !catalog.sessions.length} onClick={() => { setBusy(true); setError(""); void onConfirm().catch(e => { setError(String(e)); setBusy(false); }); }}>{tr("importAction")} ({catalog.sessions.length})</button></div>}>
    <p className="preferences-intro">{tr("importNote")}</p><dl className="import-summary"><div><dt>{tr("importReady")}</dt><dd>{catalog.sessions.length}</dd></div><div><dt>{tr("importFolders")}</dt><dd>{catalog.folders.length}</dd></div></dl>
    <ul className="import-preview import-session-list" tabIndex={0} aria-label={tr("importReview")}>{catalog.sessions.map((s, i) => <li key={i}><strong>{s.name}</strong><span>{s.kind === "local" ? tr("localTerminal") : `${s.username}@${s.host}:${s.port}`}</span></li>)}</ul>
    {error && <div role="alert" className="preferences-error">{errorText(error, language)}</div>}
  </Modal>;
}

export function BatchSessionDialog({catalog, language, onClose, onOpen}: {
  catalog: SessionCatalog; language: Language; onClose: () => void; onOpen: (sessions: Session[]) => void;
}) {
  const [selection, setSelection] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const ui = (english: string, german: string) => language === "de" ? german : english;
  const sshSessions = catalog.sessions.filter(session => session.kind === "ssh");
  const matches = sshSessions.filter(session => `${session.name} ${session.host}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <Modal title={ui("Open multiple SSH sessions", "Mehrere SSH-Sitzungen öffnen")} closeLabel={t(language, "closeDialog")} onClose={onClose}
    footer={<div className="modal-actions">
      <button className="btn secondary" onClick={onClose}>{t(language, "cancel")}</button>
      <button className="btn primary" disabled={selection.length < 2} onClick={() => onOpen(selection.flatMap(id => sshSessions.find(session => session.id === id) ?? []))}>{ui("Open selected", "Auswahl öffnen")} ({selection.length})</button>
    </div>}>
    <p>{ui("Select up to 16 sessions. Verify and connect to each in order.", "Wähle bis zu 16 Sitzungen. Prüfe und öffne die Verbindungen nacheinander.")}</p>
    <label className="field"><span>{ui("Filter sessions", "Sitzungen filtern")}</span><input value={query} onChange={event => setQuery(event.target.value)}/></label>
    <ul className="import-preview">{matches.map(session => {
      const checked = selection.includes(session.id);
      return <li key={session.id}><label><input type="checkbox" checked={checked} disabled={!checked && selection.length >= 16}
        onChange={() => setSelection(previous => checked ? previous.filter(id => id !== session.id) : [...previous, session.id])}/> {session.name} · {session.host}:{session.port}</label></li>;
    })}</ul>
    {!matches.length && <p>{ui("No matching sessions.", "Keine passenden Sitzungen.")}</p>}
  </Modal>;
}
