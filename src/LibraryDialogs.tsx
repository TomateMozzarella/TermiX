import { useState } from "react";
import { Modal } from "./Modal";
import { errorText, t, type Language } from "./i18n";
import type { SessionCatalog, SessionFolder } from "./types";

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
    <ul className="import-preview">{catalog.sessions.slice(0, 100).map((s, i) => <li key={i}><strong>{s.name}</strong><span>{s.kind === "local" ? tr("localTerminal") : `${s.username}@${s.host}:${s.port}`}</span></li>)}{catalog.sessions.length > 100 && <li>…</li>}</ul>
    {error && <div role="alert" className="preferences-error">{errorText(error, language)}</div>}
  </Modal>;
}
