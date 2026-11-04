import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowUp, Download, File, Folder, RefreshCw, Upload, X, Pencil, FolderPlus } from "lucide-react";
import { Modal } from "./Modal";
import { ContextMenu } from "./ContextMenu";
import { remoteText, type RemoteKey } from "./remoteText";
import type { Language } from "./i18n";
type Entry = { name: string; path: string; directory: boolean; link: boolean; size?: number; modified?: number };
type Listing = { path: string; entries: Entry[] };
type Progress = { id: string; name: string; direction: string; state: string; bytes: number; total: number; error?: string };
export function SftpPane({ id, language, initialPath, onEdit, onClose }: { id: string; language: Language; initialPath: string; theme: "light" | "dark"; onEdit: (path: string) => void; onClose: () => void }) {
  const [context, setContext] = useState<{ x: number; y: number; entry?: Entry } | null>(null), [newFolder, setNewFolder] = useState<string | null>(null);
  const tr = (key: RemoteKey) => remoteText(language, key);
  const [listing, setListing] = useState<Listing>({ path: ".", entries: [] }), [input, setInput] = useState("."), [busy, setBusy] = useState(false), [error, setError] = useState(""), [progress, setProgress] = useState<Progress | null>(null), [overwrite, setOverwrite] = useState(false);
  const [tree, setTree] = useState<Record<string, Entry[]>>({}), [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const epoch = useRef(0), alive = useRef(true), currentPath = useRef(".");
  const failure = (value: unknown) => { if (alive.current) setError(String(value)); };
  async function navigate(path: string) {
    const request = ++epoch.current; setBusy(true); setError("");
    try { const result = await invoke<Listing>("sftp_list", { id, path }); if (alive.current && epoch.current === request) { setTree({}); setExpanded({}); setListing(result); setInput(result.path); currentPath.current = result.path; } }
    catch (e) { if (epoch.current === request) failure(e); }
    finally { if (alive.current && epoch.current === request) setBusy(false); }
  }
  useEffect(() => { alive.current = true; void navigate(initialPath); let timer: ReturnType<typeof setTimeout>; let previous = "";
    const poll = async () => { try { const value = await invoke<Progress | null>("sftp_progress", { id }); if (!alive.current) return; setProgress(value); if (value && value.state !== "running" && previous === "running") void navigate(currentPath.current); previous = value?.state ?? ""; } catch (e) { failure(e); } if (alive.current) timer = setTimeout(poll, 600); };
    void poll(); return () => { alive.current = false; ++epoch.current; clearTimeout(timer); };
  }, [id]);
  const running = progress?.state === "running";
  async function upload() { setBusy(true); setError(""); try { await invoke("sftp_upload", { id, directory: listing.path, overwrite }); } catch (e) { failure(e); } finally { if (alive.current) setBusy(false); } }
  async function download(path: string) { setBusy(true); setError(""); try { await invoke("sftp_download", { id, path }); } catch (e) { failure(e); } finally { if (alive.current) setBusy(false); } }
  async function expand(entry: Entry) {
    if (busy || running) return;
    if (expanded[entry.path]) { setExpanded(old => ({ ...old, [entry.path]: false })); return; }
    if (tree[entry.path]) { setExpanded(old => ({ ...old, [entry.path]: true })); return; }
    const request = epoch.current; setBusy(true); setError("");
    try { const result = await invoke<Listing>("sftp_list", { id, path: entry.path }); if (alive.current && epoch.current === request) { if (listing.entries.length + Object.values(tree).reduce((n, entries) => n + entries.length, 0) + result.entries.length > 5000) throw new Error("sftp_too_many"); setTree(old => ({ ...old, [entry.path]: result.entries })); setExpanded(old => ({ ...old, [entry.path]: true })); } }
    catch (e) { failure(e); } finally { if (alive.current) setBusy(false); }
  }
  const rows = (entries: Entry[]) => { const result: {entry: Entry; depth: number}[] = [], seen = new Set<string>(); const visit = (items: Entry[], depth: number) => { for (const entry of items) { if (result.length >= 5000) break; if (seen.has(entry.path)) continue; seen.add(entry.path); result.push({entry, depth}); if (depth < 12 && expanded[entry.path]) visit(tree[entry.path] ?? [], depth + 1); } }; visit(entries, 0); return result; };
  const message = (code: string) => remoteText(language, code as RemoteKey);
  return <section className="sftp-pane" aria-label={tr("files")}>
    <header className="sftp-heading"><span><Folder size={18}/> SFTP <small>{tr("sameConnection")}</small></span><button className="icon-button" aria-label={tr("closeFiles")} onClick={onClose}><X size={18}/></button></header><div className="sftp-body">
    <form className="sftp-path" onSubmit={e => { e.preventDefault(); if (!busy && !running) void navigate(input); }}><button type="button" className="icon-button" disabled={busy || running} aria-label={tr("parent")} onClick={() => void navigate(`${listing.path}/..`)}><ArrowUp size={18}/></button><input aria-label={tr("remotePath")} value={input} onChange={e => setInput(e.target.value)}/><button type="submit" className="icon-button" disabled={busy || running} aria-label={tr("refresh")}><RefreshCw size={17}/></button></form>
    <div className="sftp-actions"><button className="btn secondary" disabled={busy || running} onClick={() => { setError(""); setNewFolder(""); }}><FolderPlus size={16}/>{language === "de" ? "Neuer Ordner" : "New folder"}</button><button className="btn secondary" disabled={busy || running} onClick={() => void upload()}><Upload size={16}/>{tr("upload")}</button><label><input type="checkbox" checked={overwrite} disabled={busy || running} onChange={e => setOverwrite(e.target.checked)}/>{tr("overwrite")}</label></div>
    <p className="sftp-hint">{tr("pickerHint")}</p>
    {(error || progress?.error) && <p className="sftp-error" role="alert">{message(error || progress!.error!)}</p>}
    <div className="sftp-list" aria-busy={busy} onContextMenu={e => { e.preventDefault(); if (!busy && !running) setContext({ x: e.clientX, y: e.clientY }); }}>{rows(listing.entries).map(({entry, depth}) => <div className="sftp-row" style={{ paddingLeft: depth * 16 }} key={entry.path} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); if (!busy && !running) setContext({ x: e.clientX, y: e.clientY, entry }); }} draggable={!entry.directory && !entry.link && !running} onDragStart={e => { e.dataTransfer.setData("application/x-termix-remote", JSON.stringify({ id, path: entry.path })); }}>
      {entry.directory && !entry.link && <button className="icon-button" disabled={busy || running || depth >= 12} aria-label={`${language === "de" ? "Ordner aufklappen" : "Expand folder"}: ${entry.name}`} aria-expanded={!!expanded[entry.path]} onClick={() => void expand(entry)}>{expanded[entry.path] ? "▾" : "▸"}</button>}<button className="sftp-entry" disabled={busy || running || entry.link} title={entry.path} onClick={() => entry.directory ? void navigate(entry.path) : onEdit(entry.path)}>{entry.directory ? <Folder size={18}/> : <File size={17}/>}<span>{entry.name}{entry.link ? " ↗" : ""}</span><small>{entry.directory ? "" : entry.size?.toLocaleString(language)} {entry.directory ? "" : "B"}</small></button>{!entry.directory && !entry.link && <button className="icon-button" disabled={busy || running} aria-label={`${language === "de" ? "Bearbeiten" : "Edit"}: ${entry.name}`} onClick={() => onEdit(entry.path)}><Pencil size={16}/></button>}{!entry.directory && !entry.link && <button className="icon-button" disabled={busy || running} aria-label={`${tr("download")}: ${entry.name}`} onClick={() => void download(entry.path)}><Download size={16}/></button>}
    </div>)}{!listing.entries.length && <p className="sftp-hint">{busy ? tr("loading") : tr("empty")}</p>}</div>
    <div className="sftp-drop" onDragOver={e => { if (!running && e.dataTransfer.types.includes("application/x-termix-remote")) e.preventDefault(); }} onDrop={e => { e.preventDefault(); try { const item = JSON.parse(e.dataTransfer.getData("application/x-termix-remote")); if (item.id === id && typeof item.path === "string" && !running) void download(item.path); } catch { /* unrelated drag */ } }}><Download size={17}/>{tr("dropDownload")}</div>
    </div>{progress && <div className="sftp-progress" role="status"><div><span>{progress.name} · {message(progress.state)}</span>{running && <button className="btn secondary" onClick={() => void invoke("sftp_cancel", { id, transfer: progress.id }).catch(failure)}>{tr("cancel")}</button>}</div><progress max={Math.max(progress.total, progress.bytes, 1)} value={progress.bytes}/><small>{progress.bytes.toLocaleString(language)} / {progress.total.toLocaleString(language)} B</small></div>}
    {context && <ContextMenu {...context} onClose={() => setContext(null)} items={[{ label: language === "de" ? "Neuer Ordner" : "New folder", action: () => { setError(""); setNewFolder(""); } }, { label: tr("upload"), action: () => void upload() }, { label: tr("refresh"), action: () => void navigate(listing.path) }, ...(context.entry && !context.entry.directory && !context.entry.link ? [{ label: language === "de" ? "Bearbeiten" : "Edit", action: () => onEdit(context.entry!.path) }, { label: tr("download"), action: () => void download(context.entry!.path) }] : []) ]}/>}
    {newFolder !== null && <Modal title={language === "de" ? "Neuer Ordner" : "New folder"} closeLabel={tr("cancel")} busy={busy} onClose={() => setNewFolder(null)} footer={<button className="btn primary" disabled={busy || !newFolder.trim()} onClick={() => { setBusy(true); setError(""); void invoke("sftp_mkdir", { id, directory: listing.path, name: newFolder }).then(() => { setNewFolder(null); return navigate(listing.path); }).catch(failure).finally(() => setBusy(false)); }}>{language === "de" ? "Erstellen" : "Create"}</button>}><label className="field"><span>{language === "de" ? "Ordnername" : "Folder name"}</span><input value={newFolder} onChange={e => setNewFolder(e.target.value)} autoFocus/></label>{error && <p className="preferences-error" role="alert">{message(error)}</p>}</Modal>}
  </section>;
}
