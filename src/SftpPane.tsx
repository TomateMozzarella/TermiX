import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowUp, Download, File, Folder, RefreshCw, Upload, X, Pencil, FolderPlus, FolderUp, FilePlus, Trash2 } from "lucide-react";
import { Modal, useConfirmation } from "./Modal";
import { ContextMenu } from "./ContextMenu";
import { remoteText, type RemoteKey } from "./remoteText";
import type { Language } from "./i18n";
type Entry = { name: string; path: string; directory: boolean; link: boolean; size?: number; modified?: number };
type Listing = { path: string; entries: Entry[] };
type LocalListing = {path: string; canGoUp: boolean; truncated: boolean; entries: {name: string; directory: boolean; size: number | null; token: string | null}[]};
const DROP_LIMIT = 8 * 1024 * 1024;
type Progress = { id: string; name: string; direction: string; state: string; bytes: number; total: number; error?: string; skippedLinks?:number };
export function SftpPane({ id, language, initialPath, onEdit, onClose }: { id: string; language: Language; initialPath: string; theme: "light" | "dark"; onEdit: (path: string) => void; onClose: () => void }) {
  const confirmation = useConfirmation(language);
  const [selected,setSelected]=useState<Entry|null>(null),[newFile,setNewFile]=useState<string|null>(null);
  const [context, setContext] = useState<{ x: number; y: number; entry?: Entry } | null>(null), [newFolder, setNewFolder] = useState<string | null>(null);
  const tr = (key: RemoteKey) => remoteText(language, key);
  const [listing, setListing] = useState<Listing>({ path: ".", entries: [] }), [input, setInput] = useState("."), [busy, setBusy] = useState(false), [error, setError] = useState(""), [progress, setProgress] = useState<Progress | null>(null), [overwrite, setOverwrite] = useState(false);
  const [tree, setTree] = useState<Record<string, Entry[]>>({}), [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const history=useRef<string[]>([]),returning=useRef(false);
  const epoch = useRef(0), alive = useRef(true), currentPath = useRef(".");
  const failure = (value: unknown) => { if (alive.current) setError(String(value)); };
  async function navigate(path: string) {
    const request = ++epoch.current; setBusy(true); setError("");
    try { const result = await invoke<Listing>("sftp_list", { id, path }); if (alive.current && epoch.current === request) { if(!returning.current&&currentPath.current!=="."&&currentPath.current!==result.path)history.current.push(currentPath.current);returning.current=false;setSelected(null); setTree({}); setExpanded({}); setListing(result); setInput(result.path); currentPath.current = result.path; } }
    catch (e) { if (epoch.current === request) failure(e); }
    finally { if (alive.current && epoch.current === request) setBusy(false); }
  }
  useEffect(() => { alive.current = true; void navigate(initialPath); let timer: ReturnType<typeof setTimeout>; let previous = "";
    const poll = async () => { try { const value = await invoke<Progress | null>("sftp_progress", { id }); if (!alive.current) return; setProgress(value); if (value && !["running", "paused"].includes(value.state) && ["running", "paused"].includes(previous)) void navigate(currentPath.current); previous = value?.state ?? ""; } catch (e) { failure(e); } if (alive.current) timer = setTimeout(poll, 600); };
    void poll(); return () => { alive.current = false; ++epoch.current; clearTimeout(timer); };
  }, [id]);
  useEffect(()=>{const back=(event:MouseEvent)=>{if(event.button===3){event.preventDefault();const previous=history.current.pop();if(previous){returning.current=true;void navigate(previous);}}};window.addEventListener("mouseup",back);const block=(e:MouseEvent)=>{if(e.button===3)e.preventDefault();};window.addEventListener("mousedown",block);window.addEventListener("auxclick",block);return()=>{window.removeEventListener("mouseup",back);window.removeEventListener("mousedown",block);window.removeEventListener("auxclick",block);};},[id]);
  const [localOpen, setLocalOpen] = useState(false);
  const [local, setLocal] = useState<LocalListing | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  async function browseLocal(action: "choose" | "up" | "refresh", token?: string) {
    setLocalBusy(true);
    setLocalError("");
    try {
      const result = action === "choose"
        ? await invoke<LocalListing | null>("sftp_local_open", {id})
        : await invoke<LocalListing>("sftp_local_list", {id, token: token ?? null, up: action === "up"});
      if (alive.current && result) setLocal(result);
    } catch (error) {
      if (alive.current) setLocalError(String(error));
    } finally {
      if (alive.current) setLocalBusy(false);
    }
  }
  const ui = (english: string, german: string) => language === "de" ? german : english;
  const paused = progress?.state === "paused";
  const running = progress?.state === "running" || paused;
  const [dropped, setDropped] = useState<{file: File; directory: string; overwrite: boolean} | null>(null);
  async function confirmDrop() {
    if (!dropped || busy || running) return;
    const {file, directory, overwrite} = dropped;
    setDropped(null);
    setBusy(true);
    setError("");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!alive.current) return;
      if (bytes.length > DROP_LIMIT) throw "sftp_drop_size";
      const parts: string[] = [];
      for (let offset = 0; offset < bytes.length; offset += 24576) {
        parts.push(btoa(String.fromCharCode(...bytes.subarray(offset, offset + 24576))));
      }
      await invoke("sftp_dropped_upload", {id, directory, overwrite, name: file.name, encoded: parts.join("")});
    } catch (error) { failure(error); }
    finally { if (alive.current) setBusy(false); }
  }
  async function uploadLocal(token: string, folder = false) {
    setBusy(true);
    setLocalError("");
    try { await invoke("sftp_local_upload", {id, token, directory: listing.path, overwrite, ...(folder ? {folder} : {})}); }
    catch (error) { if (alive.current) setLocalError(String(error)); }
    finally { if (alive.current) setBusy(false); }
  }
  async function upload() { setBusy(true); setError(""); try { await invoke("sftp_upload", { id, directory: listing.path, overwrite }); } catch (e) { failure(e); } finally { if (alive.current) setBusy(false); } }
  async function uploadFolder(){setBusy(true);setError("");try{await invoke("sftp_upload_folder",{id,directory:listing.path,overwrite});}catch(e){failure(e);}finally{if(alive.current)setBusy(false);}}
  async function download(path: string, useLocalFolder = false) { setBusy(true); setError(""); try { await invoke("sftp_download", { id, path, ...(useLocalFolder ? {useLocalFolder} : {}) }); } catch (e) { failure(e); } finally { if (alive.current) setBusy(false); } }
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
    {confirmation.dialog}
    <header className="sftp-heading"><span><Folder size={18}/> SFTP <small>{tr("sameConnection")}</small></span><button className="icon-button" aria-label={tr("closeFiles")} onClick={onClose}><X size={18}/></button></header><div className="sftp-body">
    <form className="sftp-path" onSubmit={e => { e.preventDefault(); if (!busy && !running) void navigate(input); }}><button type="button" className="icon-button" disabled={busy || running} aria-label={tr("parent")} onClick={() => void navigate(`${listing.path}/..`)}><ArrowUp size={18}/></button><input aria-label={tr("remotePath")} value={input} onChange={e => setInput(e.target.value)}/></form>
    <div className="sftp-toolbar" role="toolbar" aria-label={language==="de"?"Dateiaktionen":"File actions"}>
      <button className="icon-button" aria-label={tr("download")} title={tr("download")} disabled={busy||running||!selected||selected.directory||selected.link} onClick={()=>selected&&void download(selected.path)}><Download size={18}/></button>
      <button className="icon-button" aria-label={tr("upload")} title={tr("upload")} disabled={busy||running} onClick={()=>void upload()}><Upload size={18}/></button>
      <button className="icon-button" aria-label={language==="de"?"Ordner hochladen":"Upload folder"} title={language==="de"?"Ordner hochladen":"Upload folder"} disabled={busy||running} onClick={()=>void uploadFolder()}><FolderUp size={18}/></button>
      <button className="icon-button" aria-label={tr("refresh")} title={tr("refresh")} disabled={busy||running} onClick={()=>void navigate(input)}><RefreshCw size={18}/></button>
      <button className="icon-button" aria-label={language==="de"?"Neue Datei":"New file"} title={language==="de"?"Neue Datei":"New file"} disabled={busy||running} onClick={()=>{setError("");setNewFile("");}}><FilePlus size={18}/></button>
      <button className="icon-button" aria-label={language==="de"?"Neuer Ordner":"New folder"} title={language==="de"?"Neuer Ordner":"New folder"} disabled={busy||running} onClick={()=>{setError("");setNewFolder("");}}><FolderPlus size={18}/></button>
      <button className="icon-button" aria-label={language==="de"?"Auswahl löschen":"Delete selected"} title={language==="de"?"Auswahl löschen (Ordner müssen leer sein)":"Delete selected (folders must be empty)"} disabled={busy||running||!selected||selected.link} onClick={async()=>{if(!selected||!await confirmation.confirm((language==="de"?"Auf dem Server löschen? ":"Delete on server? ")+selected.path))return;setBusy(true);void invoke("sftp_file_action",{id,path:selected.path,action:"delete"}).then(()=>navigate(listing.path)).catch(failure).finally(()=>setBusy(false));}}><Trash2 size={18}/></button>
    </div><details className="sftp-compact-options"><summary>{language==="de"?"Optionen":"Options"}</summary><label title={tr("pickerHint")}><input type="checkbox" checked={overwrite} disabled={busy||running} onChange={e=>setOverwrite(e.target.checked)}/>{language==="de"?"Dateien ersetzen":"Replace existing files"}</label></details>
    {(error || progress?.error) && <p className="sftp-error" role="alert">{message(error || progress!.error!)}</p>}
    <div className="sftp-list" aria-busy={busy} onContextMenu={e => { e.preventDefault(); if (!busy && !running) setContext({ x: e.clientX, y: e.clientY }); }}>{rows(listing.entries).map(({entry, depth}) => <div className={`sftp-row ${selected?.path===entry.path?"selected":""}`} onClick={()=>setSelected(entry)} style={{ paddingLeft: depth * 16 }} key={entry.path} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); if (!busy && !running) setContext({ x: e.clientX, y: e.clientY, entry }); }} draggable={!entry.directory && !entry.link && !running} onDragStart={e => { e.dataTransfer.setData("application/x-termix-remote", JSON.stringify({ id, path: entry.path })); }}>
      {entry.directory && !entry.link && <button className="icon-button" disabled={busy || running || depth >= 12} aria-label={`${language === "de" ? "Ordner aufklappen" : "Expand folder"}: ${entry.name}`} aria-expanded={!!expanded[entry.path]} onClick={() => void expand(entry)}>{expanded[entry.path] ? "▾" : "▸"}</button>}<button className="sftp-entry" disabled={busy || running || entry.link} title={entry.path} onClick={() => entry.directory ? void navigate(entry.path) : setSelected(entry)} onDoubleClick={()=>{if(!entry.directory)onEdit(entry.path);}} onKeyDown={e=>{if(e.key==="Enter"&&!entry.directory){e.preventDefault();onEdit(entry.path);}}}>{entry.directory ? <Folder size={18}/> : <File size={17}/>}<span>{entry.name}{entry.link ? " ↗" : ""}</span><small>{entry.directory ? "" : entry.size?.toLocaleString(language)} {entry.directory ? "" : "B"}</small></button>{!entry.directory && !entry.link && <button className="icon-button" disabled={busy || running} aria-label={`${language === "de" ? "Bearbeiten" : "Edit"}: ${entry.name}`} onClick={() => onEdit(entry.path)}><Pencil size={16}/></button>}{!entry.directory && !entry.link && <button className="icon-button" disabled={busy || running} aria-label={`${tr("download")}: ${entry.name}`} onClick={() => void download(entry.path)}><Download size={16}/></button>}
    </div>)}{!listing.entries.length && <p className="sftp-hint">{busy ? tr("loading") : tr("empty")}</p>}</div>
    <section className="sftp-local" aria-label={ui("Local files", "Lokale Dateien")}>
      <button className="btn secondary" aria-expanded={localOpen} onClick={() => setLocalOpen(open => !open)}><Folder size={16}/>{ui("Local files", "Lokale Dateien")}</button>
      {localOpen && <>
        <div className="sftp-local-toolbar">
          <button className="btn secondary" disabled={localBusy} onClick={() => void browseLocal("choose")}>{ui("Choose folder…", "Ordner wählen …")}</button>
          {local && <>
            <button className="icon-button" aria-label={ui("Download selected file to local folder", "Ausgewählte Datei in lokalen Ordner herunterladen")} title={ui("Download selected file to local folder", "Ausgewählte Datei in lokalen Ordner herunterladen")} disabled={localBusy || busy || running || !selected || selected.directory || selected.link} onClick={() => selected && void download(selected.path, true)}><Download size={16}/></button>
            <button className="icon-button" aria-label={ui("Local parent folder", "Übergeordneter lokaler Ordner")} disabled={localBusy || !local.canGoUp} onClick={() => void browseLocal("up")}><ArrowUp size={16}/></button>
            <button className="icon-button" aria-label={ui("Refresh local folder", "Lokalen Ordner aktualisieren")} disabled={localBusy} onClick={() => void browseLocal("refresh")}><RefreshCw size={16}/></button>
          </>}
        </div>
        {local && <>
          <p className="sftp-local-path" title={local.path}>{local.path}</p>
          <ul className="sftp-local-entries" aria-busy={localBusy}>
            {local.entries.map(entry => <li key={entry.name}>{entry.directory
              ? <div className="sftp-local-file"><button className="sftp-entry" disabled={localBusy} onClick={() => void browseLocal("refresh", entry.token!)}><Folder size={16}/><span>{entry.name}</span></button>
                {entry.token && <button className="icon-button" aria-label={`${ui("Upload folder", "Ordner hochladen")}: ${entry.name}`} title={ui("Upload folder", "Ordner hochladen")} disabled={busy || running || localBusy} onClick={() => void uploadLocal(entry.token!, true)}><FolderUp size={16}/></button>}</div>
              : <div className="sftp-local-file"><span className="sftp-entry"><File size={16}/><span>{entry.name}</span><small>{entry.size?.toLocaleString(language)} B</small></span>
                {entry.token && <button className="icon-button" aria-label={`${tr("upload")}: ${entry.name}`} title={tr("upload")} disabled={busy || running || localBusy} onClick={() => void uploadLocal(entry.token!)}><Upload size={16}/></button>}</div>}</li>)}
          </ul>
          {!local.entries.length && <small>{ui("No visible files or folders.", "Keine sichtbaren Dateien oder Ordner.")}</small>}
          {local.truncated && <small>{ui("Only the first 1,000 directory entries were inspected.", "Es wurden nur die ersten 1.000 Verzeichniseinträge geprüft.")}</small>}
        </>}
        {localError && <p role="alert" className="sftp-error">{message(localError)}</p>}
      </>}
    </section>
    <div className="sftp-drop" onDragOver={event => {
      if (event.dataTransfer.types.includes("Files")) {
        event.preventDefault();
        event.dataTransfer.dropEffect = busy || running ? "none" : "copy";
      }
    }} onDrop={event => {
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      if (busy || running || dropped || listing.path === ".") return;
      const files = event.dataTransfer.files;
      if (files.length !== 1 || event.dataTransfer.items[0]?.webkitGetAsEntry?.()?.isDirectory) {
        failure("sftp_drop_single");
        return;
      }
      const file = files[0];
      if (file.size > DROP_LIMIT) { failure("sftp_drop_size"); return; }
      setDropped({file, directory: listing.path, overwrite});
    }}><Upload size={17}/>{ui("Drop a local file to upload (up to 8 MiB)", "Lokale Datei zum Hochladen ablegen (bis 8 MiB)")}</div>
    {dropped && <Modal title={ui("Confirm file upload", "Dateiupload bestätigen")} closeLabel={ui("Cancel", "Abbrechen")} onClose={() => setDropped(null)} footer={<>
      <button className="btn secondary" onClick={() => setDropped(null)}>{ui("Cancel", "Abbrechen")}</button>
      <button className="btn primary" disabled={busy || running} onClick={() => void confirmDrop()}>{tr("upload")}</button>
    </>}>
      <p>{ui("File", "Datei")} · <strong>{dropped.file.name}</strong></p>
      <p>{ui("Server folder", "Serverordner")} · {dropped.directory}</p>
      {dropped.overwrite && <p>{ui("Existing files may be replaced.", "Vorhandene Dateien dürfen ersetzt werden.")}</p>}
    </Modal>}
    <div className="sftp-drop" onDragOver={e => { if (!running && e.dataTransfer.types.includes("application/x-termix-remote")) e.preventDefault(); }} onDrop={e => { e.preventDefault(); try { const item = JSON.parse(e.dataTransfer.getData("application/x-termix-remote")); if (item.id === id && typeof item.path === "string" && !running) void download(item.path); } catch { /* unrelated drag */ } }}><Download size={17}/>{tr("dropDownload")}</div>
    </div>{progress && <div className="sftp-progress" role="status"><div><span>{progress.name} · {message(progress.state)}</span>{running && <button className="btn secondary" onClick={() => void invoke("sftp_pause_transfer", {id, transfer: progress.id, paused: !paused}).catch(failure)}>{paused ? ui("Resume", "Fortsetzen") : ui("Pause", "Pausieren")}</button>}{running && <button className="btn secondary" onClick={() => void invoke("sftp_cancel", { id, transfer: progress.id }).catch(failure)}>{tr("cancel")}</button>}</div><progress max={Math.max(progress.total, progress.bytes, 1)} value={progress.bytes}/><small>{progress.bytes.toLocaleString(language)} / {progress.total.toLocaleString(language)} B</small>{!!progress.skippedLinks && <small>{language==="de"?"Übersprungene Verknüpfungen/Spezialdateien: ":"Skipped links/special files: "}{progress.skippedLinks}</small>}</div>}
    {context && <ContextMenu {...context} onClose={() => setContext(null)} items={[{ label: language === "de" ? "Übertragung" : "Transfer", heading: true }, { icon: FolderPlus, label: language === "de" ? "Neuer Ordner" : "New folder", action: () => { setError(""); setNewFolder(""); } }, { icon: Upload, label: tr("upload"), action: () => void upload() }, {icon: Upload,label:language==="de"?"Ordner hochladen":"Upload folder",action:()=>void uploadFolder()}, { label: language === "de" ? "Navigation" : "Navigation", heading: true }, { icon: RefreshCw, label: tr("refresh"), action: () => void navigate(listing.path) }, ...(context.entry && !context.entry.directory && !context.entry.link ? [{ label: language === "de" ? "Ausgewählte Datei" : "Selected file", heading: true }, { icon: Pencil, label: language === "de" ? "Bearbeiten" : "Edit", action: () => onEdit(context.entry!.path) }, { icon: Download, label: tr("download"), action: () => void download(context.entry!.path) }] : []) ]}/>}
    {newFile!==null&&<Modal title={language==="de"?"Neue Datei":"New file"} closeLabel={tr("cancel")} busy={busy} onClose={()=>setNewFile(null)} footer={<button className="btn primary" disabled={busy||!newFile.trim()||(newFile.includes("/")||newFile.includes(String.fromCharCode(92)))||newFile==="."||newFile===".."} onClick={()=>{setBusy(true);setError("");void invoke("sftp_file_action",{id,path:(listing.path.endsWith("/")?listing.path.slice(0,-1):listing.path)+"/"+newFile,action:"create"}).then(()=>{setNewFile(null);return navigate(listing.path);}).catch(failure).finally(()=>setBusy(false));}}>{language==="de"?"Erstellen":"Create"}</button>}><label className="field"><span>{language==="de"?"Dateiname":"File name"}</span><input value={newFile} maxLength={255} onChange={e=>setNewFile(e.target.value)} autoFocus/></label>{error&&<p role="alert">{message(error)}</p>}</Modal>}
    {newFolder !== null && <Modal title={language === "de" ? "Neuer Ordner" : "New folder"} closeLabel={tr("cancel")} busy={busy} onClose={() => setNewFolder(null)} footer={<button className="btn primary" disabled={busy || !newFolder.trim()} onClick={() => { setBusy(true); setError(""); void invoke("sftp_mkdir", { id, directory: listing.path, name: newFolder }).then(() => { setNewFolder(null); return navigate(listing.path); }).catch(failure).finally(() => setBusy(false)); }}>{language === "de" ? "Erstellen" : "Create"}</button>}><label className="field"><span>{language === "de" ? "Ordnername" : "Folder name"}</span><input value={newFolder} onChange={e => setNewFolder(e.target.value)} autoFocus/></label>{error && <p className="preferences-error" role="alert">{message(error)}</p>}</Modal>}
  </section>;
}
