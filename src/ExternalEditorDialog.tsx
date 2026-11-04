import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { Modal } from "./Modal";
import { remoteText, type RemoteKey } from "./remoteText";
import type { Language } from "./i18n";

// Deliberately independent of Monaco: opening an external editor never loads it.
export function ExternalEditorDialog({ id, initialPath, language, onClose }: { id: string; initialPath: string; language: Language; onClose: () => void }) {
  const tr = (en: string, de: string) => language === "de" ? de : en;
  const token = useRef(""), [busy, setBusy] = useState(true), [error, setError] = useState(""), [text, setText] = useState<string | null>(null), [saved, setSaved] = useState(false);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const doc = await invoke<{token: string}>("editor_open", { id, path: initialPath });
        if (!alive) { await invoke("editor_close", { id, token: doc.token }); return; }
        token.current = doc.token;
        await invoke("editor_external", { id, token: doc.token });
      } catch (e) { if (alive) setError(String(e)); }
      finally { if (alive) setBusy(false); }
    })();
    return () => { alive = false; if (token.current) void invoke("editor_close", { id, token: token.current }).catch(() => {}); };
  }, [id, initialPath]);
  useEffect(() => { let stopped = false; let stop: (() => void) | undefined; try { void getCurrentWindow().onCloseRequested(event => { if (!window.confirm(tr("Close TermiX? External changes not saved to the server will remain unsynchronised.", "TermiX schließen? Nicht auf dem Server gespeicherte externe Änderungen bleiben unsynchronisiert."))) event.preventDefault(); }).then(unlisten => { if (stopped) unlisten(); else stop = unlisten; }).catch(() => {}); } catch { /* browser tests */ } return () => { stopped = true; stop?.(); }; }, []);
  async function run(save: boolean) {
    if (busy || !token.current) return;
    setBusy(true); setError(""); setSaved(false);
    try {
      if (save && text !== null) { await invoke("editor_save", { id, token: token.current, text }); setSaved(true); }
      else setText(await invoke<string>("editor_reload_external", { id, token: token.current }));
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }
  return <Modal title={tr("External editor", "Externer Editor")} closeLabel={tr("Close editor", "Editor schließen")} busy={busy} onClose={() => { if (!busy && window.confirm(tr("Close the external editor first. Remove this working copy? Unsaved external changes will be lost.", "Schließe zuerst den externen Editor. Arbeitskopie entfernen? Ungespeicherte externe Änderungen gehen verloren."))) onClose(); }} footer={<><button className="btn secondary" disabled={busy || !token.current} onClick={() => void run(false)}>{tr("Reload external file", "Externe Datei neu laden")}</button><button className="btn primary" disabled={busy || text === null} onClick={() => void run(true)}>{tr("Save to server", "Auf Server speichern")}</button></>}>
    <p>{initialPath}</p><p>{tr("Edit in your configured application, then reload here to review and explicitly save to the server. Nothing is uploaded automatically. Closing this dialog removes the working copy.", "Bearbeite die Datei im gewählten Programm, lade sie hier zur Kontrolle neu und speichere ausdrücklich auf dem Server. Es wird nichts automatisch hochgeladen. Schließen dieses Dialogs entfernt die Arbeitskopie.")}</p>
    {busy && <p role="status">{tr("Working…", "Wird ausgeführt…")}</p>}{text !== null && <textarea className="external-review" readOnly aria-label={tr("External file preview", "Vorschau der externen Datei")} value={text}/>}
    {saved && <p role="status">{tr("Saved to server", "Auf dem Server gespeichert")}</p>}{error && <p role="alert">{remoteText(language, error as RemoteKey)}</p>}
  </Modal>;
}
