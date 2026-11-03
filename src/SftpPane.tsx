import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowUp, Download, File, Folder, RefreshCw, Upload, X } from "lucide-react";
import { remoteText, type RemoteKey } from "./remoteText";
import type { Language } from "./i18n";
type Entry = { name: string; path: string; directory: boolean; link: boolean; size?: number; modified?: number };
type Listing = { path: string; entries: Entry[] };
type Progress = { id: string; name: string; direction: string; state: string; bytes: number; total: number; error?: string };
export function SftpPane({ id, language, onClose }: { id: string; language: Language; onClose: () => void }) {
  const tr = (key: RemoteKey) => remoteText(language, key);
  const [listing, setListing] = useState<Listing>({ path: ".", entries: [] }), [input, setInput] = useState("."), [busy, setBusy] = useState(false), [error, setError] = useState(""), [progress, setProgress] = useState<Progress | null>(null), [overwrite, setOverwrite] = useState(false);
  const epoch = useRef(0), alive = useRef(true), currentPath = useRef(".");
  const failure = (value: unknown) => { if (alive.current) setError(String(value)); };
  async function navigate(path: string) {
    const request = ++epoch.current; setBusy(true); setError("");
    try { const result = await invoke<Listing>("sftp_list", { id, path }); if (alive.current && epoch.current === request) { setListing(result); setInput(result.path); currentPath.current = result.path; } }
    catch (e) { if (epoch.current === request) failure(e); }
    finally { if (alive.current && epoch.current === request) setBusy(false); }
  }
  useEffect(() => { alive.current = true; void navigate("."); let timer: ReturnType<typeof setTimeout>; let previous = "";
    const poll = async () => { try { const value = await invoke<Progress | null>("sftp_progress", { id }); if (!alive.current) return; setProgress(value); if (value && value.state !== "running" && previous === "running") void navigate(currentPath.current); previous = value?.state ?? ""; } catch (e) { failure(e); } if (alive.current) timer = setTimeout(poll, 600); };
    void poll(); return () => { alive.current = false; ++epoch.current; clearTimeout(timer); };
  }, [id]);
  const running = progress?.state === "running";
  async function upload() { setBusy(true); setError(""); try { await invoke("sftp_upload", { id, directory: listing.path, overwrite }); } catch (e) { failure(e); } finally { if (alive.current) setBusy(false); } }
  async function download(path: string) { setBusy(true); setError(""); try { await invoke("sftp_download", { id, path }); } catch (e) { failure(e); } finally { if (alive.current) setBusy(false); } }
  const message = (code: string) => remoteText(language, code as RemoteKey);
  return <section className="sftp-pane" aria-label={tr("files")}>
    <header className="sftp-heading"><span><Folder size={18}/> SFTP <small>{tr("sameConnection")}</small></span><button className="icon-button" aria-label={tr("closeFiles")} onClick={onClose}><X size={18}/></button></header>
    <form className="sftp-path" onSubmit={e => { e.preventDefault(); if (!busy && !running) void navigate(input); }}><button type="button" className="icon-button" disabled={busy || running} aria-label={tr("parent")} onClick={() => void navigate(`${listing.path}/..`)}><ArrowUp size={18}/></button><input aria-label={tr("remotePath")} value={input} onChange={e => setInput(e.target.value)}/><button type="submit" className="icon-button" disabled={busy || running} aria-label={tr("refresh")}><RefreshCw size={17}/></button></form>
    <div className="sftp-actions"><button className="btn secondary" disabled={busy || running} onClick={() => void upload()}><Upload size={16}/>{tr("upload")}</button><label><input type="checkbox" checked={overwrite} disabled={busy || running} onChange={e => setOverwrite(e.target.checked)}/>{tr("overwrite")}</label></div>
    <p className="sftp-hint">{tr("pickerHint")}</p>
    {(error || progress?.error) && <p className="sftp-error" role="alert">{message(error || progress!.error!)}</p>}
    <div className="sftp-list" aria-busy={busy}>{listing.entries.map(entry => <div className="sftp-row" key={entry.path} draggable={!entry.directory && !entry.link && !running} onDragStart={e => { e.dataTransfer.setData("application/x-termix-remote", JSON.stringify({ id, path: entry.path })); }}>
      <button className="sftp-entry" disabled={busy || running || entry.link} title={entry.path} onClick={() => entry.directory ? void navigate(entry.path) : void download(entry.path)}>{entry.directory ? <Folder size={18}/> : <File size={17}/>}<span>{entry.name}{entry.link ? " ↗" : ""}</span><small>{entry.directory ? "" : entry.size?.toLocaleString(language)} {entry.directory ? "" : "B"}</small></button>{!entry.directory && !entry.link && <button className="icon-button" disabled={busy || running} aria-label={`${tr("download")}: ${entry.name}`} onClick={() => void download(entry.path)}><Download size={16}/></button>}
    </div>)}{!listing.entries.length && <p className="sftp-hint">{busy ? tr("loading") : tr("empty")}</p>}</div>
    <div className="sftp-drop" onDragOver={e => { if (!running && e.dataTransfer.types.includes("application/x-termix-remote")) e.preventDefault(); }} onDrop={e => { e.preventDefault(); try { const item = JSON.parse(e.dataTransfer.getData("application/x-termix-remote")); if (item.id === id && typeof item.path === "string" && !running) void download(item.path); } catch { /* unrelated drag */ } }}><Download size={17}/>{tr("dropDownload")}</div>
    {progress && <div className="sftp-progress" role="status"><div><span>{progress.name} · {message(progress.state)}</span>{running && <button className="btn secondary" onClick={() => void invoke("sftp_cancel", { id, transfer: progress.id }).catch(failure)}>{tr("cancel")}</button>}</div><progress max={Math.max(progress.total, progress.bytes, 1)} value={progress.bytes}/><small>{progress.bytes.toLocaleString(language)} / {progress.total.toLocaleString(language)} B</small></div>}
  </section>;
}
