import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Command, Terminal, X } from "lucide-react";
import type { Preferences } from "./services/preferences";
import type { ShellProfile } from "./services/terminal";

export function PreferencesDialog({ mode, profiles, initial, onSave, onClose }: {
  mode: "setup" | "settings"; profiles: ShellProfile[]; initial: Preferences;
  onSave: (value: Preferences) => Promise<void>; onClose?: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const setup = mode === "setup";
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => { previous?.focus(); };
  }, []);
  useEffect(() => { title.current?.focus(); }, [step]);
  const save = async () => {
    setBusy(true); setError("");
    try { await onSave({ ...draft, setupComplete: true }); }
    catch (e) { setError(String(e)); setBusy(false); }
  };
  return <div className="preferences-backdrop" onKeyDown={event => {
    if (event.key === "Escape" && !busy && !setup) onClose?.();
    if (event.key !== "Tab") return;
    const controls = panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="0"]');
    if (!controls?.length) return;
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === title.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }}>
    <div ref={panel} className={`preferences-panel ${setup ? "setup-panel" : ""}`} role="dialog" aria-modal="true" aria-labelledby="preferences-title">
      <div className="preferences-brand"><img src="/termix.svg" alt=""/><span>TermiX</span><span className="preferences-eyebrow">{setup ? "ERSTE SCHRITTE" : "EINSTELLUNGEN"}</span>{!setup && <button className="icon-button" aria-label="Einstellungen schließen" disabled={busy} onClick={onClose}><X size={18}/></button>}</div>
      {setup && <div className="setup-progress"><span className={step === 0 ? "current" : "complete"}>01 · Dein Terminal</span><div/><span className={step === 1 ? "current" : ""}>02 · Dein Workspace</span></div>}
      <div className="preferences-content">
        <h1 ref={title} tabIndex={-1} id="preferences-title">{setup ? step === 0 ? "Dein Terminal. Deine Wahl." : "Mach es dir bequem." : "Dein Workspace"}</h1>
        <p className="preferences-intro">{setup ? step === 0 ? "Womit möchtest du arbeiten? Wähle die Shell für neue lokale Tabs. Du kannst sie später in den Einstellungen ändern." : "Wähle eine gut lesbare Schriftgröße. Alles lässt sich später anpassen." : "Passe dein Terminal an. Die Standard-Shell gilt für neue Tabs; offene Shells laufen weiter."}</p>
        {(!setup || step === 0) && <section className="preference-section" aria-labelledby="shell-label"><h2 id="shell-label">Standard-Terminal</h2><div className="profile-options">
          {profiles.map(p => <label key={p.id} className={`profile-card ${draft.defaultShell === p.id ? "selected" : ""}`}>
            <input type="radio" disabled={busy} name="default-shell" value={p.id} checked={draft.defaultShell === p.id} onChange={() => setDraft(v => ({ ...v, defaultShell: p.id }))}/>
            <div className="profile-symbol">{p.id === "cmd" ? <Command size={22}/> : <Terminal size={22}/>}</div>
            <div className="profile-description"><strong>{p.name}</strong><span>{p.id === "powershell" ? "Die vielseitige Shell für Windows und Automatisierung." : p.id === "cmd" ? "Die klassische Windows-Eingabeaufforderung." : "Deine lokale System-Shell."}</span></div>
            <span className="profile-check">{draft.defaultShell === p.id && <Check size={13}/>}</span>
          </label>)}
        </div></section>}
        {(!setup || step === 1) && <section className="preference-section" aria-labelledby="font-label"><div className="preference-heading"><h2 id="font-label">Schriftgröße</h2><output>{draft.fontSize} px</output></div>
          <input className="font-slider" disabled={busy} aria-labelledby="font-label" type="range" min="11" max="22" value={draft.fontSize} onChange={e => setDraft(v => ({ ...v, fontSize: Number(e.target.value) }))}/>
          <div className="font-scale"><span>Kompakt</span><span>Großzügig</span></div>
          <div className="terminal-preview" style={{ fontSize: draft.fontSize }} aria-label="Vorschau der Terminalschrift"><div><span className="preview-prompt">{draft.defaultShell === "cmd" ? "C:\\Workspace>" : "PS C:\\Workspace>"}</span> echo Hallo TermiX</div><div className="preview-output">Hallo TermiX</div><div><span className="preview-prompt">{draft.defaultShell === "cmd" ? "C:\\Workspace>" : "PS C:\\Workspace>"}</span> <span className="preview-cursor"/></div></div>
          <p className="preferences-note">{setup ? "Deine Einstellungen bleiben auf diesem Gerät." : "Schriftänderungen übernehmen offene Terminals sofort."}</p>
        </section>}
        {error && <div className="preferences-error" role="alert">{error}</div>}
      </div>
      <footer className="preferences-footer"><span>{setup ? "Du kannst alles später ändern." : "Lokal auf diesem Gerät gespeichert."}</span><div className="preferences-actions">
        {setup && step === 1 && <button className="btn secondary" disabled={busy} onClick={() => setStep(0)}><ArrowLeft size={15}/> Zurück</button>}
        {!setup && <button className="btn secondary" disabled={busy} onClick={onClose}>Abbrechen</button>}
        <button className="btn primary" disabled={busy} onClick={() => setup && step === 0 ? setStep(1) : void save()}>{busy ? "Wird gespeichert …" : setup ? step === 0 ? "Weiter" : "Workspace öffnen" : "Änderungen speichern"}{!busy && (setup && step === 0 ? <ArrowRight size={15}/> : <Check size={15}/>)}</button>
      </div></footer>
    </div>
  </div>;
}
