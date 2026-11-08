import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Command, Terminal, X } from "lucide-react";
import type { Preferences } from "./services/preferences";
import type { ShellProfile } from "./services/terminal";
import { errorText, t, type Message } from "./i18n";
import { chooseEditor, detectEditor } from "./services/editors";

const stages: Message[] = ["language", "shell", "appearance", "editor"];
export function PreferencesDialog({ mode, profiles, initial, onSave, onClose, onPreview }: {
  mode: "setup" | "settings"; profiles: ShellProfile[]; initial: Preferences;
  onSave: (value: Preferences) => Promise<void>; onClose?: () => void; onPreview: (value: Preferences | null) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [step, setStep] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [finding, setFinding] = useState(false), [editorNote, setEditorNote] = useState<Message | null>(null);
  const editorRequest = useRef(0);
  const panel = useRef<HTMLDivElement>(null), title = useRef<HTMLHeadingElement>(null);
  const setup = mode === "setup", lang = draft.language, tr = (key: Message) => t(lang, key);
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => { if (mode === "settings") requestAnimationFrame(() => { if (previous?.isConnected) previous.focus(); }); };
  }, []);
  useEffect(() => () => { editorRequest.current++; onPreview(null); }, []);
  useEffect(() => { if (setup || document.activeElement?.getAttribute("role") !== "tab") title.current?.focus(); }, [step]);
  useEffect(() => { onPreview(draft); }, [draft]);
  const edit = (value: Partial<Preferences>) => setDraft(old => ({ ...old, ...value }));
  const findEditor = async (editor: Preferences["editor"]) => {
    const request = ++editorRequest.current; setFinding(true); setEditorNote(null); setError("");
    try { const path = await detectEditor(editor); if (request === editorRequest.current) { if (path) edit({ editorPath: path }); setEditorNote(path ? "editorFound" : "editorNotFound"); } }
    catch (e) { if (request === editorRequest.current) setError(String(e)); }
    finally { if (request === editorRequest.current) setFinding(false); }
  };
  const selectEditor = (editor: Preferences["editor"]) => {
    editorRequest.current++; setFinding(false); setEditorNote(null); edit({ editor, editorPath: "", editorOpenMode: "integrated" });
    if (editor === "notepad++" || editor === "vscode") void findEditor(editor);
  };
  const browseEditor = async () => {
    const request = ++editorRequest.current; setFinding(true); setEditorNote(null); setError("");
    try { const path = await chooseEditor(); if (path && request === editorRequest.current) edit({ editorPath: path }); }
    catch (e) { if (request === editorRequest.current) setError(String(e)); }
    finally { if (request === editorRequest.current) setFinding(false); }
  };
  const save = async () => {
    setBusy(true); setError("");
    if (!/^#[a-f0-9]{6}$/i.test(draft.accent)) { setError("invalid_accent"); setBusy(false); return; }
    try { await onSave({ ...draft, schemaVersion: 2, setupComplete: true, setupVersion: 2 }); }
    catch (e) { setError(String(e)); setBusy(false); }
  };
  const visible = (index: number) => step === index;
  return <div className="preferences-backdrop" onKeyDown={event => {
    if (event.key === "Escape" && !busy && !setup) onClose?.();
    if (event.key !== "Tab") return;
    const controls = panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled])');
    if (!controls?.length) return;
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === title.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }}>
    <div ref={panel} className={`preferences-panel ${setup?"":"settings-fixed"}`} role="dialog" aria-modal="true" aria-labelledby="preferences-title">
      <div className="preferences-brand"><img src="/termix.svg" alt=""/><span>TermiX</span><span className="preferences-eyebrow">{tr(setup ? "firstSteps" : "settings")}</span>{!setup && <button className="icon-button" aria-label={tr("closeSettings")} disabled={busy} onClick={onClose}><X size={18}/></button>}</div>
      {!setup && <div className="settings-tabs" role="tablist" aria-label={tr("settings")} onKeyDown={e => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return; const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")]; const index = buttons.indexOf(e.target as HTMLButtonElement); if (index < 0) return; e.preventDefault(); const next = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : (index + (e.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length; buttons[next].focus(); setStep(next); }}>{[...stages, "files" as const].map((key, i) => <button role="tab" tabIndex={i === step ? 0 : -1} key={key} aria-selected={i === step} onClick={() => setStep(i)}>{key === "files" ? (lang === "de" ? "Dateien" : "Files") : tr(key)}</button>)}</div>}
      {setup && <div className="setup-progress four-steps">{stages.map((key, i) => <span key={key} className={i === step ? "current" : i < step ? "complete" : ""}>{String(i + 1).padStart(2, "0")} · {tr(key)}</span>)}</div>}
      <div className="preferences-content">
        <h1 ref={title} tabIndex={-1} id="preferences-title">{tr(!setup ? "workspaceSettings" : (["languageTitle", "terminalTitle", "appearanceTitle", "editorTitle"] as Message[])[step])}</h1>
        <p className="preferences-intro">{tr(!setup ? "settingsIntro" : (["languageIntro", "terminalIntro", "appearanceIntro", "editorIntro"] as Message[])[step])}</p>
        {visible(0) && <section className="preference-section"><h2 id="language-label">{tr("language")}</h2><div className="segmented" role="group" aria-labelledby="language-label">{(["en", "de"] as const).map(value => <button key={value} disabled={busy} type="button" aria-pressed={lang === value} onClick={() => edit({ language: value })}>{value === "en" ? "English" : "Deutsch"}</button>)}</div></section>}
        {visible(1) && <section className="preference-section" aria-labelledby="shell-label"><h2 id="shell-label">{tr("shell")}</h2><div className="profile-options">{profiles.map(p => <label key={p.id} className={`profile-card ${draft.defaultShell === p.id ? "selected" : ""}`}>
          <input type="radio" disabled={busy} name="default-shell" value={p.id} checked={draft.defaultShell === p.id} onChange={() => edit({ defaultShell: p.id })}/>
          <div className="profile-symbol">{p.id === "cmd" ? <Command size={22}/> : <Terminal size={22}/>}</div><div className="profile-description"><strong>{p.name}</strong><span>{tr(p.id === "powershell" ? "powershell" : p.id === "cmd" ? "cmd" : "sh")}</span></div><span className="profile-check">{draft.defaultShell === p.id && <Check size={13}/>}</span>
        </label>)}</div></section>}
        {visible(2) && <section className="preference-section">
          <label className="field"><span>{lang === "de" ? "Terminal-Farbschema" : "Terminal colour scheme"}</span><select aria-label={lang === "de" ? "Terminal-Farbschema" : "Terminal colour scheme"} value={draft.terminalPalette} onChange={e => edit({ terminalPalette: e.target.value as Preferences["terminalPalette"] })}><option value="auto">{tr("system")}</option><option value="dark">{tr("dark")}</option><option value="light">{tr("light")}</option></select></label>
          <h2 id="theme-label">{tr("theme")}</h2><div className="segmented" role="group" aria-labelledby="theme-label">{(["system", "dark", "light"] as const).map(value => <button disabled={busy} key={value} type="button" aria-pressed={draft.theme === value} onClick={() => edit({ theme: value })}>{tr(value)}</button>)}</div><p className="preferences-note">{tr("autoNote")}</p>
          <div className="preference-heading spaced"><h2 id="ui-scale-label">{tr("uiScale")}</h2><output>{draft.uiScale}%</output></div><input className="font-slider" disabled={busy} aria-labelledby="ui-scale-label" type="range" min="100" max="150" step="5" value={draft.uiScale} onChange={e => edit({ uiScale: Number(e.target.value) })}/><p className="preferences-note">{tr("uiScaleNote")}</p>
          <h2 className="spaced" id="accent-label">{tr("accent")}</h2><div className="accent-options">{["#71c9bd", "#5b9cf5", "#b692f6", "#ef9b63", "#e87da7"].map(colour => <button disabled={busy} key={colour} className="colour-swatch" aria-label={colour} aria-pressed={draft.accent.toLowerCase() === colour} style={{ background: colour }} onClick={() => edit({ accent: colour })}>{draft.accent.toLowerCase() === colour && <Check size={15}/>}</button>)}<label className="custom-colour">{tr("customColour")}<input disabled={busy} aria-label={tr("customColour")} type="color" value={/^#[a-f0-9]{6}$/i.test(draft.accent) ? draft.accent : "#71c9bd"} onChange={e => edit({ accent: e.target.value })}/></label></div>
          <div className="preference-heading spaced"><h2 id="font-label">{tr("font")}</h2><output>{draft.fontSize} px</output></div><input className="font-slider" disabled={busy} aria-labelledby="font-label" type="range" min="11" max="22" value={draft.fontSize} onChange={e => edit({ fontSize: Number(e.target.value) })}/><div className="font-scale"><span>{tr("compact")}</span><span>{tr("spacious")}</span></div>
          <div className="terminal-preview" style={{ fontSize: draft.fontSize }} aria-label={tr("preview")}><div><span className="preview-prompt">{draft.defaultShell === "cmd" ? "C:\\Workspace>" : draft.defaultShell === "sh" ? "$" : "PS C:\\Workspace>"}</span> echo {tr("hello")}</div><div className="preview-output">{tr("hello")}</div><div><span className="preview-cursor"/></div></div>
        </section>}
        {visible(3) && <label className="check-field"><input type="checkbox" checked={draft.externalFileReminders ?? true} onChange={e=>edit({externalFileReminders:e.target.checked})}/><span>{lang==="de"?"Hinweis auf offene externe Dateien anzeigen":"Show open external file reminders"}</span></label>}
        {visible(3) && <section className="preference-section"><label className="field"><span>{tr("editor")}</span><select aria-label={tr("editor")} disabled={busy || finding} value={draft.editor} onChange={e => selectEditor(e.target.value as Preferences["editor"])}><option value="integrated">{tr("integrated")}</option><option value="notepad++">Notepad++</option><option value="vscode">Visual Studio Code</option><option value="custom">{tr("customEditor")}</option></select></label>
          {draft.editor !== "integrated" && <><label className="field"><span>{tr("editorPath")}</span><input disabled={busy} value={draft.editorPath} placeholder="C:\Tools\Editor.exe" onChange={e => { editorRequest.current++; setFinding(false); setEditorNote(null); edit({ editorPath: e.target.value }); }}/></label><div className="editor-actions"><button className="btn secondary" disabled={busy || finding} onClick={() => void browseEditor()}>{tr("browse")}</button>{draft.editor !== "custom" && <button className="btn secondary" disabled={busy || finding} onClick={() => void findEditor(draft.editor)}>{tr("detectEditor")}</button>}</div><p className="preferences-note" role="status">{finding ? tr("detectingEditor") : editorNote ? tr(editorNote) : tr("editorPathNote")}</p></>}
          <label className="field"><span>{lang === "de" ? "Dateien öffnen mit" : "Open files with"}</span><select aria-label={lang === "de" ? "Dateien öffnen mit" : "Open files with"} value={draft.editorOpenMode} onChange={e => edit({ editorOpenMode: e.target.value as Preferences["editorOpenMode"] })}><option value="integrated">{tr("integrated")}</option><option value="external" disabled={draft.editor === "integrated" || !draft.editorPath}>{lang === "de" ? "Direkt im externen Editor" : "Directly in external editor"}</option></select></label><p className="preferences-note">{tr("editorNote")}</p></section>}
        {!setup && visible(4) && <section className="preference-section">          <label className="field"><span>{lang === "de" ? "SFTP-Layout" : "SFTP layout"}</span><select aria-label={lang === "de" ? "SFTP-Layout" : "SFTP layout"} value={draft.sftpLayout} onChange={e => edit({ sftpLayout: e.target.value as Preferences["sftpLayout"] })}><option value="shared">{lang === "de" ? "Gemeinsame Seitenleiste" : "Shared sidebar"}</option><option value="panel">{lang === "de" ? "Separater Bereich" : "Separate panel"}</option></select></label>
          <label className="field"><span>{lang === "de" ? "SFTP-Position" : "SFTP position"}</span><select disabled={busy || draft.sftpLayout === "shared"} aria-label={lang === "de" ? "SFTP-Position" : "SFTP position"} value={draft.sftpSide} onChange={e => edit({ sftpSide: e.target.value as "left" | "right" })}><option value="left">{lang === "de" ? "Links" : "Left"}</option><option value="right">{lang === "de" ? "Rechts" : "Right"}</option></select></label>
          <p className="preferences-note">{lang === "de" ? "Die gemeinsame Seitenleiste bleibt links. Links/Rechts gilt für den separaten Bereich." : "The shared sidebar stays on the left. Left/right placement applies to the separate panel."}</p><label className="field"><span>{lang === "de" ? "SFTP-Startverzeichnis" : "SFTP starting directory"}</span><input aria-label={lang === "de" ? "SFTP-Startverzeichnis" : "SFTP starting directory"} value={draft.sftpStart} onChange={e => edit({ sftpStart: e.target.value })}/></label><p className="preferences-note">{lang === "de" ? "Ein Punkt verwendet das Startverzeichnis des SSH-Benutzers. Ein absoluter Pfad öffnet dein Wunschverzeichnis." : "A dot uses the SSH user's starting directory. Enter an absolute path to choose another directory."}</p>
</section>}
        {error && <div className="preferences-error" role="alert">{errorText(error, lang)}</div>}
      </div>
      <footer className="preferences-footer"><span>{tr(setup ? "later" : "localSaved")}</span><div className="preferences-actions">
        {setup && step > 0 && <button className="btn secondary" disabled={busy} onClick={() => setStep(v => v - 1)}><ArrowLeft size={15}/>{tr("back")}</button>}
        {!setup && <button className="btn secondary" disabled={busy} onClick={onClose}>{tr("cancel")}</button>}
        <button className="btn primary" disabled={busy || finding} onClick={() => setup && step < 3 ? setStep(v => v + 1) : void save()}>{busy ? tr("saving") : tr(setup ? step < 3 ? "next" : "finish" : "saveChanges")}{!busy && (setup && step < 3 ? <ArrowRight size={15}/> : <Check size={15}/>)}</button>
      </div></footer>
    </div>
  </div>;
}

