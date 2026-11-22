import { AlignLeft, ArrowLeftRight, Maximize, GitCompare, ListOrdered, Minus, Search, Replace, WrapText, WandSparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/basic-languages/monaco.contribution";
import "monaco-editor/esm/vs/editor/contrib/find/browser/findController";
import "monaco-editor/esm/vs/editor/standalone/browser/quickAccess/standaloneGotoLineQuickAccess";
import "monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css";
import "monaco-editor/esm/vs/language/json/monaco.contribution";
import "monaco-editor/esm/vs/editor/contrib/format/browser/formatActions";
import "monaco-editor/esm/vs/language/css/monaco.contribution";
import "monaco-editor/esm/vs/language/html/monaco.contribution";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { useCloseGuard } from "./windowClosing";
import { invoke } from "@tauri-apps/api/core";
import { remoteText, type RemoteKey } from "./remoteText";
import type { Language } from "./i18n";
import { Modal, useConfirmation } from "./Modal";
import { X } from "lucide-react";
monaco.languages.json.jsonDefaults.setDiagnosticsOptions({validate: false, enableSchemaRequest: false, schemas: []});
function applyEditorTheme(theme: "light" | "dark") {
  const dark = theme === "dark";
  monaco.editor.defineTheme("termix-editor", {
    base: dark ? "vs-dark" : "vs", inherit: true, rules: [],
    colors: {
      "editor.background": dark ? "#10141c" : "#f5f7fa",
      "editor.lineHighlightBackground": dark ? "#1c2635" : "#e7edf5",
      "editor.findMatchBackground": dark ? "#51677b" : "#b6d8f6",
      "editor.findMatchHighlightBackground": dark ? "#354f6855" : "#8bb9e355",
    },
  });
  monaco.editor.setTheme("termix-editor");
}
type Document = { token: string; path: string; text: string; saved: string; external?: boolean; model?: monaco.editor.ITextModel };
(self as typeof self & { MonacoEnvironment: unknown }).MonacoEnvironment = { getWorker: (_moduleId: string, label: string) => {
  switch (label) {
    case "json": return new JsonWorker();
    case "css": return new CssWorker();
    case "html": return new HtmlWorker();
    default: return new EditorWorker();
  }
} };
export function OutputEditor({ title, text, language, theme, onClose }: { title: string; text: string; language: Language; theme: "light" | "dark"; onClose: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor>();
  const de = language === "de";
  useEffect(() => {
    const view = monaco.editor.create(host.current!, {
      value: text, language: "plaintext", readOnly: true, automaticLayout: true,
      minimap: { enabled: false }, scrollBeyondLastLine: false, fontSize: 15,
    });
    editor.current = view;
    return () => view.dispose();
  }, [text]);
  useEffect(() => { applyEditorTheme(theme); }, [theme]);
  return <Modal title={`${de ? "Terminalausgabe" : "Terminal output"} · ${title}`}
    closeLabel={de ? "Editor schließen" : "Close editor"} onClose={onClose} className="remote-editor-modal"
    footer={<span>{de ? "Schreibgeschützte Momentaufnahme" : "Read-only snapshot"}</span>}>
    <div className="editor-tools"><button className="btn secondary" onClick={() => void editor.current?.getAction("actions.find")?.run()}>{de ? "Suchen" : "Find"}</button></div>
    <div ref={host} className="monaco-host"/>
  </Modal>;
}

export function EditorDialog({ id, initialPath, request, visible, onHide, language, theme, externalAvailable }: { id: string; initialPath: string; request: string; visible: boolean; onHide: () => void; language: Language; theme: "light" | "dark"; externalAvailable: boolean }) {
  const de = language === "de", tr = (en: string, german: string) => de ? german : en;
  const confirmation = useConfirmation(language);
  const [docs, setDocs] = useState<Document[]>([]), [active, setActive] = useState(""), [path, setPath] = useState(initialPath), [busy, setBusy] = useState(false), [error, setError] = useState(""), [note, setNote] = useState("");
  const [indent, setIndent] = useState(2);
  const [wrap, setWrap] = useState(false);
  const [fullscreen, setFullscreen] = useState(false), [compare, setCompare] = useState(false), [originalToken, setOriginal] = useState(""), [modifiedToken, setModified] = useState("");
  const diffHost = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null), editor = useRef<monaco.editor.IStandaloneCodeEditor>(), live = useRef(true), current = useRef(docs); current.current = docs;
  const saveAction = useRef(() => {});
  const pendingOpen = useRef(Promise.resolve());
  const dirty = (d: Document) => d.text !== d.saved;
  function open(value: string) {
    pendingOpen.current = pendingOpen.current.then(() => live.current ? load(value) : undefined);
  }
  async function load(value: string) { setBusy(true); setError(""); try { const existing = current.current.find(d => d.path === value); if (existing) { setActive(existing.token); return; } const result = await invoke<{ token: string; path: string; text: string }>("editor_open", { id, path: value }); if (!live.current) { void invoke("editor_close", { id, token: result.token }); return; } const duplicate = current.current.find(d => d.path === result.path); if (duplicate) { void invoke("editor_close", { id, token: result.token }); setActive(duplicate.token); return; } const extension = result.path.split(".").pop()?.toLowerCase(); const languages: Record<string,string> = { js:"javascript", ts:"typescript", json:"json", yaml:"yaml", yml:"yaml", sh:"shell", py:"python", rs:"rust", md:"markdown", css:"css", html:"html", xml:"xml", toml:"ini", conf:"ini", ini:"ini", txt:"plaintext" }; const model = monaco.editor.createModel(result.text, languages[extension ?? ""] ?? "plaintext"); const document = { ...result, text: model.getValue(undefined, true), saved: model.getValue(undefined, true), model }; current.current = [...current.current, document]; setDocs(current.current); setPath(result.path); setActive(result.token); } catch (e) { setError(String(e)); } finally { if (live.current) setBusy(false); } }
  useEffect(() => { live.current = true; editor.current = monaco.editor.create(host.current!, { automaticLayout: true, fontSize: 15, minimap: { enabled: false }, scrollBeyondLastLine: false, theme: theme === "dark" ? "vs-dark" : "vs", model: null }); const changed = editor.current.onDidChangeModelContent(() => { const model = editor.current?.getModel(); setDocs(old => old.map(d => d.model === model ? { ...d, text: model!.getValue(undefined, true) } : d)); }); editor.current.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveAction.current()); return () => { live.current = false; changed.dispose(); editor.current?.dispose(); for (const d of current.current) { d.model?.dispose(); void invoke("editor_close", { id, token: d.token }).catch(() => {}); } }; }, [id]);
  useEffect(() => { applyEditorTheme(theme); }, [theme]);
  useEffect(() => { editor.current?.setModel(docs.find(d => d.token === active)?.model ?? null); editor.current?.focus(); }, [active]);
  useCloseGuard(()=>current.current.some(d=>d.text!==d.saved||d.external)?tr("Close TermiX and discard unsaved editor buffers?","TermiX schließen und ungespeicherte Editor-Inhalte verwerfen?"):null);
  useEffect(() => { if (!compare || !diffHost.current) return; const original = docs.find(d => d.token === originalToken)?.model, modified = docs.find(d => d.token === modifiedToken)?.model; if (!original || !modified) return; const diff = monaco.editor.createDiffEditor(diffHost.current, { automaticLayout: true, readOnly: true, originalEditable: false, renderSideBySide: true, minimap: { enabled: false } }); diff.setModel({ original, modified }); return () => diff.dispose(); }, [compare, originalToken, modifiedToken, docs.length]);
  useEffect(() => { setPath(initialPath); void open(initialPath); }, [id, request]);
  useEffect(() => { editor.current?.updateOptions({ wordWrap: wrap ? "on" : "off" }); }, [wrap]);
  useEffect(() => { if (visible) { editor.current?.layout(); editor.current?.focus(); } }, [visible]);
  useEffect(() => { for (const doc of docs) doc.model?.updateOptions({ tabSize: indent }); }, [indent, docs.length]);
  const document = docs.find(d => d.token === active);
  async function save() { if (!document || busy || compare) return; setBusy(true); setError(""); const text = document.text; setNote(""); try { await invoke("editor_save", { id, token: document.token, text }); if (live.current) { setDocs(old => old.map(d => d.token === document.token ? { ...d, saved: text } : d)); setNote(tr("Saved to server", "Auf dem Server gespeichert")); } } catch (e) { setError(String(e)); } finally { if (live.current) setBusy(false); } }
  saveAction.current = () => void save();
  async function reloadServer() { if (!document || busy || (dirty(document) && !await confirmation.confirm(tr("Discard this buffer and reload the current server file?", "Diesen Inhalt verwerfen und die aktuelle Serverdatei neu laden?")))) return; setBusy(true); setError(""); setNote(""); try { const fresh = await invoke<{token: string; path: string; text: string}>("editor_reload", { id, token: document.token }); document.model?.setValue(fresh.text); setDocs(old => old.map(d => d.token === document.token ? { ...d, text: document.model!.getValue(undefined, true), saved: document.model!.getValue(undefined, true) } : d)); } catch (e) { setError(String(e)); } finally { if (live.current) setBusy(false); } }
  async function closeDocument(token: string) { const doc = docs.find(d => d.token === token); if (!doc || busy || ((dirty(doc) || doc.external) && !await confirmation.confirm(tr("Discard unsaved changes and remove the external working copy?", "Ungespeicherte Änderungen verwerfen und externe Arbeitskopie entfernen?")))) return; doc.model?.dispose(); void invoke("editor_close", { id, token }).catch(() => {}); const remaining = docs.filter(d => d.token !== token); setDocs(remaining); setCompare(false); if (active === token) setActive(remaining[remaining.length - 1]?.token ?? ""); }
  async function external(reload: boolean) { if (!document || busy) return; if ((dirty(document) || (reload && document.external)) && !await confirmation.confirm(tr("Replace the integrated buffer with the external/server copy?", "Inhalt des integrierten Editors durch externe/Server-Kopie ersetzen?"))) return; setBusy(true); setError(""); try { if (reload) { const text = await invoke<string>("editor_reload_external", { id, token: document.token }); document.model?.setValue(text); } else { await invoke("editor_external", { id, token: document.token }); setDocs(old => old.map(d => d.token === document.token ? { ...d, external: true } : d)); } setNote(tr("External edits require Reload external file, then Save to server. Working copies can remain in your user temp directory after a crash.", "Externe Änderungen mit Externe Datei neu laden übernehmen und danach Auf Server speichern. Nach einem Absturz können Arbeitskopien im temporären Benutzerordner verbleiben.")); } catch (e) { setError(String(e)); } finally { if (live.current) setBusy(false); } }
  return <div hidden={!visible}><Modal title="TermiX Editor" closeLabel={tr("Close editor", "Editor schließen")} footer={<><div className="editor-footer"><span>{document?.path} · UTF-8</span><button className="btn secondary" disabled={!document || busy || compare} onClick={() => void reloadServer()}>{tr("Reload server file", "Serverdatei neu laden")}</button><button className="btn primary" disabled={!document || busy || compare || !dirty(document)} onClick={() => void save()}>{tr("Save to server", "Auf Server speichern")}</button>{externalAvailable && <button className="btn secondary" disabled={!document || busy || compare || document.external || dirty(document)} onClick={() => void external(false)}>{tr("External editor", "Externer Editor")}</button>}{document?.external && <button className="btn secondary" disabled={busy || compare} onClick={() => void external(true)}>{tr("Reload external file", "Externe Datei neu laden")}</button>}</div>{note && <p role="status" className="preferences-note">{note}</p>}{error && <p role="alert" className="preferences-error">{remoteText(language, error as RemoteKey)}</p>}<p className="preferences-note">{tr("Up to 8 open UTF-8 files per connection, 2 MiB each. Ctrl+S saves explicitly; server changes block overwriting. Search: Ctrl+F. Replace: Ctrl+H.", "Bis zu 8 offene UTF-8-Dateien je Verbindung, je 2 MiB. Strg+S speichert ausdrücklich; Änderungen auf dem Server verhindern Überschreiben. Suche: Strg+F. Ersetzen: Strg+H.")}</p></>} busy={busy} onClose={onHide} onBackdrop={onHide} headerActions={<button className="icon-button" aria-label={tr("Hide editor", "Editor ausblenden")} disabled={busy} onClick={onHide}><Minus size={20}/></button>} className={`remote-editor-modal ${fullscreen ? "editor-fullscreen" : compare ? "editor-comparing" : ""}`}><div className="editor-tools"><button className="btn secondary" aria-pressed={wrap} onClick={() => setWrap(v => !v)}><WrapText size={16}/>{tr("Word wrap", "Zeilenumbruch")}</button><button className="btn secondary" onClick={() => { setCompare(false); requestAnimationFrame(() => void editor.current?.getAction("editor.action.gotoLine")?.run()); }}><ListOrdered size={16}/>{tr("Go to line", "Zu Zeile springen")}</button><button className="btn secondary" onClick={() => { setCompare(false); void editor.current?.getAction("actions.find")?.run(); }}><Search size={16}/>{tr("Find", "Suchen")}</button><button className="btn secondary" onClick={() => { setCompare(false); void editor.current?.getAction("editor.action.startFindReplaceAction")?.run(); }}><Replace size={16}/>{tr("Replace", "Ersetzen")}</button><button className="btn secondary" disabled={docs.length < 2} aria-pressed={compare} onClick={() => { if (!compare) { setOriginal(docs.find(d => d.token !== active)?.token ?? ""); setModified(active); } setCompare(v => !v); }}><GitCompare size={16}/>{tr("Compare files", "Dateien vergleichen")}</button><button className="btn secondary" aria-pressed={fullscreen} onClick={() => setFullscreen(v => !v)}><Maximize size={16}/>{fullscreen ? tr("Restore editor", "Editor verkleinern") : tr("Maximize editor", "Editor maximieren")}</button><button className="btn secondary" disabled={busy || compare || !["json", "css", "html"].includes(document?.model?.getLanguageId() ?? "")} onClick={() => {
    void editor.current?.getAction("editor.action.formatDocument")?.run().catch(() => setNote(tr("Formatting failed.", "Formatieren fehlgeschlagen.")));
  }}><WandSparkles size={16}/>{tr("Format document", "Dokument formatieren")}</button><label className="editor-indent" title={tr("Columns used to display a tab character", "Anzahl der Spalten, die ein Tabulatorzeichen einnimmt")}><AlignLeft size={16}/><select aria-label={tr("Tab width", "Tabulatorbreite")} value={indent} onChange={e => setIndent(Number(e.target.value))}>{[2, 4, 8].map(size => <option key={size} value={size}>{tr("Tab", "Tab")} · {size}</option>)}</select></label></div>
  {compare && <div className="editor-compare-controls"><label>{tr("Original", "Original")}<select value={originalToken} onChange={e => setOriginal(e.target.value)}>{docs.map(d => <option key={d.token} disabled={d.token === modifiedToken} value={d.token}>{d.path}</option>)}</select></label><label>{tr("Compare with", "Vergleichen mit")}<select value={modifiedToken} onChange={e => setModified(e.target.value)}>{docs.map(d => <option key={d.token} disabled={d.token === originalToken} value={d.token}>{d.path}</option>)}</select></label><button className="icon-button" aria-label={tr("Swap files", "Dateien tauschen")} title={tr("Swap files", "Dateien tauschen")} onClick={() => { setOriginal(modifiedToken); setModified(originalToken); }}><ArrowLeftRight size={17}/></button></div>}<form className="editor-path" onSubmit={e => { e.preventDefault(); if (!busy) void open(path); }}><input aria-label={tr("Remote file path", "Entfernter Dateipfad")} value={path} onChange={e => setPath(e.target.value)}/><button className="btn secondary" disabled={busy}>{tr("Open file", "Datei öffnen")}</button></form><div className="editor-tabs" role="tablist">{docs.map(d => <div key={d.token}><button role="tab" aria-selected={active === d.token} onClick={() => { setPath(d.path); setActive(d.token); }} title={d.path}>{docs.some(other => other !== d && other.path.split("/").pop() === d.path.split("/").pop()) ? d.path : d.path.split("/").pop()}{dirty(d) ? " •" : ""}</button><button className="icon-button" aria-label={`${tr("Close file", "Datei schließen")}: ${d.path}`} disabled={busy} onClick={() => closeDocument(d.token)}><X size={15}/></button></div>)}</div><div ref={diffHost} className="monaco-host" style={{ display: compare ? "block" : "none" }}/><div ref={host} className="monaco-host" style={{ display: compare ? "none" : "block" }} onKeyDown={e => { if (e.key === "Escape") e.stopPropagation(); }}/></Modal>{confirmation.dialog}</div>;
}
