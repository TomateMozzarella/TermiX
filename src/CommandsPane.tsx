import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ContextMenu } from "./ContextMenu";
import { Circle, Download, Play, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { Modal, useConfirmation } from "./Modal";
import type { Language } from "./i18n";
type Command = {
    id: string;
    name: string;
    text: string;
};
type Library = {
    schemaVersion: 1;
    entries: Command[];
};
export function CommandsPane({ language, target, targetId, onRun }: {
    language: Language;
    target: string;
    targetId: string;
    onRun: (text: string, focus?: boolean) => Promise<boolean>;
}) {
    const confirmation = useConfirmation(language);
    const tr = (en: string, de: string) => language === "de" ? de : en;
    const [context, setContext] = useState<{
        x: number;
        y: number;
        command: Command;
    } | null>(null);
    const [library, setLibrary] = useState<Library>({ schemaVersion: 1, entries: [] }), [draft, setDraft] = useState<Command | null>(null), [query, setQuery] = useState(""), [busy, setBusy] = useState(true), [error, setError] = useState("");
    const [incoming, setIncoming] = useState<Library | null>(null);
    const [notice, setNotice] = useState("");
    const [recording, setRecording] = useState<{targetId: string; steps: string[]} | null>(null);
    const [recordInput, setRecordInput] = useState("");
    const [sending, setSending] = useState(false);
    useEffect(() => { let alive = true; void invoke<Library>("get_snippets").then(value => { if (alive)
        setLibrary(value); }).catch(() => { if (alive)
        setError(tr("Commands could not be loaded.", "Befehle konnten nicht geladen werden.")); }).finally(() => { if (alive)
        setBusy(false); }); return () => { alive = false; }; }, []);
    async function save(entries: Command[]) { setBusy(true); setError(""); try {
        setLibrary(await invoke<Library>("save_snippets", { library: { schemaVersion: 1, entries } }));
        setDraft(null);
    }
    catch (e) {
        setError(String(e).includes("secret") ? tr("Never store passwords, tokens or private keys here.", "Hier keine Passwörter, Tokens oder privaten Schlüssel speichern.") : tr("Commands could not be saved. Check the name and command.", "Befehle konnten nicht gespeichert werden. Prüfe Name und Befehl."));
    }
    finally {
        setBusy(false);
    } }
    async function transfer(action: () => Promise<void>) {
        setBusy(true);
        setError("");
        setNotice("");
        try { await action(); }
        catch (cause) {
            setError(String(cause).includes("secret")
                ? tr("The file contains a suspected secret.", "Die Datei enthält vermutlich Zugangsdaten.")
                : tr("Command transfer failed. Check the file format and the 100-command limit.", "Die Befehle konnten nicht übertragen werden. Prüfe das Dateiformat und die Grenze von 100 Befehlen."));
        } finally { setBusy(false); }
    }
    async function run(c: Command) {
        try {
            if (await onRun(c.text + "\r")) return;
        } catch { /* Report a failed write the same way as a closed terminal. */ }
        setError(tr("The terminal is not ready or has closed.", "Das Terminal ist noch nicht bereit oder geschlossen."));
    }
    async function recordStep() {
        if (!recording || recording.targetId !== targetId || !target || sending) return;
        const text = recordInput.trim();
        if (!text || /[\x00-\x1f\x7f]/.test(text)) return;
        if (new TextEncoder().encode([...recording.steps, text].join("\n")).length > 4096) {
            setError(tr("The recording may contain up to 4,096 bytes.", "Die Aufzeichnung darf höchstens 4.096 Byte enthalten."));
            return;
        }
        setSending(true);
        setError("");
        try {
            if (!await onRun(text + "\r", false)) throw new Error("terminal_closed");
            setRecording({...recording, steps: [...recording.steps, text]});
            setRecordInput("");
        } catch {
            setError(tr("The terminal is not ready or has closed.", "Das Terminal ist noch nicht bereit oder geschlossen."));
        } finally {
            setSending(false);
        }
    }
    async function remove(c: Command) { if (await confirmation.confirm(tr("Delete saved command?", "Gespeicherten Befehl löschen?")))
        void save(library.entries.filter(x => x.id !== c.id)); }
    return <section className="command-pane" aria-label={tr("Saved commands", "Gespeicherte Befehle")}>{confirmation.dialog}<header><strong>{tr("Commands", "Befehle")}</strong><button className="icon-button" aria-label={tr("Record macro", "Makro aufzeichnen")} title={tr("Record macro", "Makro aufzeichnen")} disabled={busy || !target || !!recording || !!draft || library.entries.length >= 100} onClick={() => {setError(""); setRecordInput(""); setRecording({targetId, steps: []});}}><Circle size={17}/></button><button className="icon-button" title={tr("New command", "Neuer Befehl")} aria-label={tr("New command", "Neuer Befehl")} disabled={busy || !!recording || !!draft || library.entries.length >= 100} onClick={() => setDraft({ id: crypto.randomUUID(), name: "", text: "" })}><Plus size={18}/></button></header><div className="library-transfer command-transfer">
        <button className="btn secondary" disabled={busy} onClick={() => void transfer(async () => {
            setIncoming(await invoke<Library | null>("pick_snippet_import"));
        })}><Download size={16}/>{tr("Import", "Importieren")}</button>
        <button className="btn secondary" disabled={busy || !library.entries.length} onClick={() => void transfer(async () => {
            if (await invoke<boolean>("export_snippets")) setNotice(tr("Commands exported.", "Befehle exportiert."));
        })}><Upload size={16}/>{tr("Export", "Exportieren")}</button>
    </div><p className="command-target">{tr("Target", "Ziel")}: <strong>{target || tr("No terminal selected", "Kein Terminal ausgewählt")}</strong></p><input aria-label={tr("Search commands", "Befehle suchen")} placeholder={tr("Search commands…", "Befehle suchen …")} value={query} onChange={e => setQuery(e.target.value)}/>{error && !incoming && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
 {recording && <form className="command-form" onSubmit={event => { event.preventDefault(); void recordStep(); }}>
    <strong>{tr("Recording macro", "Makroaufzeichnung")} · {recording.steps.length}</strong>
    <p>{tr("Only commands sent from this box are recorded. Enter commands without secrets and wait for the shell prompt before sending each step.", "Nur aus diesem Feld gesendete Befehle werden aufgezeichnet. Gib Befehle ohne Zugangsdaten ein und warte vor jedem Schritt auf die Eingabeaufforderung.")}</p>
    {targetId !== recording.targetId && <p role="status">{tr("Return to the original terminal to continue recording.", "Wechsle zum ursprünglichen Terminal zurück, um weiter aufzuzeichnen.")}</p>}
    <label>{tr("Command to record", "Aufzuzeichnender Befehl")}<input maxLength={4096} value={recordInput} disabled={sending || targetId !== recording.targetId} onChange={event => setRecordInput(event.target.value)}/></label>
    <button className="btn primary" disabled={sending || !target || targetId !== recording.targetId || !recordInput.trim()}>{tr("Send and record", "Senden und aufzeichnen")}</button>
    <button type="button" className="btn secondary" disabled={sending || !recording.steps.length} onClick={() => {setDraft({id: crypto.randomUUID(), name: "", text: recording.steps.join("\n")}); setRecording(null);}}>{tr("Review recording", "Aufzeichnung prüfen")}</button>
    <button type="button" className="btn secondary" disabled={sending} onClick={() => {setRecording(null); setRecordInput("");}}>{tr("Discard recording", "Aufzeichnung verwerfen")}</button>
 </form>}
 {draft && <form className="command-form" onSubmit={e => { e.preventDefault(); void save([...library.entries.filter(c => c.id !== draft.id), draft]); }}><label>{tr("Name", "Name")}<input maxLength={80} required value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></label><label>{tr("Command", "Befehl")}<textarea rows={4} maxLength={4096} required value={draft.text} onChange={e => setDraft({ ...draft, text: e.target.value })}/></label><button className="btn primary" disabled={busy}>{tr("Save command", "Befehl speichern")}</button><button type="button" className="btn secondary" disabled={busy} onClick={() => setDraft(null)}>{tr("Cancel", "Abbrechen")}</button></form>}
 <div className="saved-command-list">{library.entries.filter(c => (c.name + " " + c.text).toLocaleLowerCase(language).includes(query.toLocaleLowerCase(language))).map(c => <article key={c.id} onContextMenu={e => { e.preventDefault(); setContext({ x: e.clientX, y: e.clientY, command: c }); }}><button className="command-name" title={c.text} disabled={busy || !!recording || !target} onDoubleClick={() => run(c)}>{c.name}</button><div><button className="icon-button" aria-label={`${tr("Run", "Ausführen")}: ${c.name}`} title={tr("Run in the selected terminal", "Im gewählten Terminal ausführen")} disabled={busy || !!recording || !target} onClick={() => run(c)}><Play size={17}/></button><button className="icon-button" aria-label={`${tr("Edit command", "Befehl bearbeiten")}: ${c.name}`} disabled={busy || !!recording} onClick={() => setDraft({ ...c })}><Pencil size={16}/></button><button className="icon-button" aria-label={`${tr("Delete command", "Befehl löschen")}: ${c.name}`} disabled={busy} onClick={() => remove(c)}><Trash2 size={16}/></button></div></article>)}</div><small>{tr("Saved locally. Never store secrets. Nothing runs automatically.", "Lokal gespeichert. Keine Zugangsdaten eintragen. Keine automatische Ausführung.")}</small>{incoming && <Modal title={tr("Import commands", "Befehle importieren")} closeLabel={tr("Cancel", "Abbrechen")}
        busy={busy} onClose={() => { setIncoming(null); setError(""); }}
        footer={<button className="btn primary" disabled={busy || !incoming.entries.length} onClick={() => void transfer(async () => {
            setLibrary(await invoke<Library>("import_snippets", { library: incoming }));
            setIncoming(null);
            setNotice(tr("Commands imported.", "Befehle importiert."));
        })}>{tr("Add commands", "Befehle hinzufügen")}</button>}>
        <p>{tr("Existing commands are kept. Identical commands are skipped.", "Vorhandene Befehle bleiben erhalten. Identische Befehle werden übersprungen.")}</p>
        <ul className="multi-targets">{incoming.entries.map(command => <li key={command.id}><div><strong>{command.name}</strong><small>{command.text}</small></div></li>)}</ul>
        {error && <p role="alert">{error}</p>}
    </Modal>}{context && <ContextMenu {...context} onClose={() => setContext(null)} items={[{ icon: Play, label: tr("Run", "Ausführen"), disabled: busy || !!recording || !target, action: () => run(context.command) }, { icon: Pencil, label: tr("Edit command", "Befehl bearbeiten"), disabled: busy || !!recording, action: () => setDraft({ ...context.command }) }, { icon: Trash2, label: tr("Delete command", "Befehl löschen"), disabled: busy, action: () => remove(context.command) }]}/>}</section>;
}
