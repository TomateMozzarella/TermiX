import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ContextMenu } from "./ContextMenu";
import { Circle, Download, Play, Pencil, Plus, Square, Trash2, Upload } from "lucide-react";
import { Modal, useConfirmation } from "./Modal";
import type { Language } from "./i18n";
type Command = {
    id: string;
    name: string;
    text: string;
    recorded?: boolean;
};
type Library = {
    schemaVersion: 1;
    entries: Command[];
};
export function CommandsPane({ language, target, targetId, onRun, captureInput }: {
    language: Language;
    target: string;
    targetId: string;
    captureInput: (listener: ((id: string, text: string) => void) | null) => void;
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
    const [recording, setRecording] = useState<{targetId: string; target: string; text: string; stopped?: boolean} | null>(null);
    const recordingRef = useRef(recording);
    function updateRecording(value: typeof recording) {
        recordingRef.current = value;
        setRecording(value);
    }
    useEffect(() => () => captureInput(null), [captureInput]);
    function startRecording() {
        setError("");
        updateRecording({targetId, target, text: ""});
        captureInput((id, input) => {
            const saved = recordingRef.current;
            if (!saved || id !== saved.targetId) return;
            if (/[\x00-\x07\x09\x0b-\x0c\x0e-\x1f\x80-\x9f]/.test(input)) {
                captureInput(null);
                updateRecording({...saved, stopped: true});
                setError(tr("Recording stopped at a special key. Review the captured text before saving.", "Aufzeichnung bei einer Sondertaste gestoppt. Prüfe den aufgenommenen Text vor dem Speichern."));
                return;
            }
            let text = saved.text;
            for (const char of input.replace(/\r\n?/g, "\n")) {
                if ((char === "\x7f" || char === "\b") && !text.endsWith("\n")) {
                    text = Array.from(text).slice(0, -1).join("");
                } else if (char === "\n" || char >= " " && char !== "\x7f") {
                    text += char;
                }
            }
            if (new TextEncoder().encode(text).length > 4096) {
                captureInput(null);
                updateRecording({...saved, stopped: true});
                setError(tr("Recording paused at the 4,096-byte limit. Review or discard it.", "Aufzeichnung am Limit von 4.096 Byte angehalten. Prüfen oder verwerfen."));
                return;
            }
            updateRecording({...saved, text});
        });
        void onRun("");
    }
    function stopRecording(review: boolean) {
        const saved = recordingRef.current;
        captureInput(null);
        updateRecording(null);
        if (review && saved) setDraft({id: crypto.randomUUID(), name: "", text: saved.text, recorded: true});
    }
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
            const input = c.text.replace(/\r?\n/g, "\r");
            if (await onRun(c.recorded ? input : input + "\r")) return;
        } catch { /* Report a failed write the same way as a closed terminal. */ }
        setError(tr("The terminal is not ready or has closed.", "Das Terminal ist noch nicht bereit oder geschlossen."));
    }
    async function remove(c: Command) { if (await confirmation.confirm(tr("Delete saved command?", "Gespeicherten Befehl löschen?")))
        void save(library.entries.filter(x => x.id !== c.id)); }
    return <section className="command-pane" aria-label={tr("Saved commands", "Gespeicherte Befehle")}>{confirmation.dialog}<header><strong>{tr("Commands", "Befehle")}</strong><button className="icon-button" title={tr("New command", "Neuer Befehl")} aria-label={tr("New command", "Neuer Befehl")} disabled={busy || !!recording || !!draft || library.entries.length >= 100} onClick={() => setDraft({ id: crypto.randomUUID(), name: "", text: "" })}><Plus size={18}/></button></header><div className="library-transfer command-transfer">
        <button className="btn secondary" disabled={busy} onClick={() => void transfer(async () => {
            setIncoming(await invoke<Library | null>("pick_snippet_import"));
        })}><Download size={16}/>{tr("Import", "Importieren")}</button>
        <button className="btn secondary" disabled={busy || !library.entries.length} onClick={() => void transfer(async () => {
            if (await invoke<boolean>("export_snippets")) setNotice(tr("Commands exported.", "Befehle exportiert."));
        })}><Upload size={16}/>{tr("Export", "Exportieren")}</button>
    </div><p className="command-target">{tr("Target", "Ziel")}: <strong>{target || tr("No terminal selected", "Kein Terminal ausgewählt")}</strong></p><input aria-label={tr("Search commands", "Befehle suchen")} placeholder={tr("Search commands…", "Befehle suchen …")} value={query} onChange={e => setQuery(e.target.value)}/>{error && !incoming && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
 {!recording && <button className="btn secondary macro-record" disabled={busy || !target || !!draft || library.entries.length >= 100} onClick={startRecording}><Circle size={16}/>{tr("Record macro", "Makro aufzeichnen")}</button>}
 {recording && <section className="command-form macro-recording">
    <strong role="status">{recording.stopped ? tr("Recording stopped", "Aufzeichnung gestoppt") : tr("Recording terminal input", "Terminaleingaben werden aufgezeichnet")} · {recording.target}</strong>
    <p>{tr("Type in the terminal. Enter is shown as a new line. Stop before entering passwords or tokens. Special keys stop recording. Terminal output is omitted.", "Tippe im Terminal. Enter erscheint als Zeilenumbruch. Vor Passwörtern oder Tokens stoppen. Sondertasten stoppen die Aufnahme. Terminalausgaben werden ausgelassen.")}</p>
    <pre aria-label={tr("Recorded input", "Aufgezeichnete Eingaben")}>{recording.text.split("\n").map((line, index, lines) => <span key={index}>{line}{index < lines.length - 1 && <> ⏎{"\n"}</>}</span>)}</pre>
    <button type="button" className="btn secondary" disabled={!recording.text.trim()} onClick={() => stopRecording(true)}><Square size={14}/>{tr("Stop and review", "Stoppen und prüfen")}</button>
    <button type="button" className="btn secondary" onClick={() => stopRecording(false)}>{tr("Discard recording", "Aufzeichnung verwerfen")}</button>
 </section>}
 {draft && <form className="command-form" onSubmit={e => { e.preventDefault(); void save([...library.entries.filter(c => c.id !== draft.id), draft]); }}><label>{tr("Name", "Name")}<input maxLength={80} required value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></label><label>{tr("Command", "Befehl")}<textarea rows={4} maxLength={4096} required value={draft.text} onChange={e => setDraft({ ...draft, text: e.target.value })}/></label>{draft.recorded && <p className="preferences-note">{tr("Each line break sends Enter on playback. To submit the last line, end it with a line break.", "Jeder Zeilenumbruch sendet beim Abspielen Enter. Soll die letzte Zeile ausgeführt werden, setze danach einen Zeilenumbruch.")}</p>}<button className="btn primary" disabled={busy}>{tr("Save command", "Befehl speichern")}</button><button type="button" className="btn secondary" disabled={busy} onClick={() => setDraft(null)}>{tr("Cancel", "Abbrechen")}</button></form>}
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
