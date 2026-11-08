import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ContextMenu } from "./ContextMenu";
import { Play, Pencil, Plus, Trash2 } from "lucide-react";
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
export function CommandsPane({ language, target, onRun }: {
    language: Language;
    target: string;
    onRun: (text: string) => boolean;
}) {
    const tr = (en: string, de: string) => language === "de" ? de : en;
    const [context, setContext] = useState<{
        x: number;
        y: number;
        command: Command;
    } | null>(null);
    const [library, setLibrary] = useState<Library>({ schemaVersion: 1, entries: [] }), [draft, setDraft] = useState<Command | null>(null), [query, setQuery] = useState(""), [busy, setBusy] = useState(true), [error, setError] = useState("");
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
    function run(c: Command) { if (!onRun(c.text + "\r"))
        setError(tr("The terminal is not ready or has closed.", "Das Terminal ist noch nicht bereit oder geschlossen.")); }
    function remove(c: Command) { if (window.confirm(tr("Delete saved command?", "Gespeicherten Befehl löschen?")))
        void save(library.entries.filter(x => x.id !== c.id)); }
    return <section className="command-pane" aria-label={tr("Saved commands", "Gespeicherte Befehle")}><header><strong>{tr("Commands", "Befehle")}</strong><button className="icon-button" title={tr("New command", "Neuer Befehl")} aria-label={tr("New command", "Neuer Befehl")} disabled={busy || library.entries.length >= 100} onClick={() => setDraft({ id: crypto.randomUUID(), name: "", text: "" })}><Plus size={18}/></button></header><p className="command-target">{tr("Target", "Ziel")}: <strong>{target || tr("No terminal selected", "Kein Terminal ausgewählt")}</strong></p><input aria-label={tr("Search commands", "Befehle suchen")} placeholder={tr("Search commands…", "Befehle suchen …")} value={query} onChange={e => setQuery(e.target.value)}/>{error && <p role="alert">{error}</p>}
 {draft && <form className="command-form" onSubmit={e => { e.preventDefault(); void save([...library.entries.filter(c => c.id !== draft.id), draft]); }}><label>{tr("Name", "Name")}<input maxLength={80} required value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></label><label>{tr("Command", "Befehl")}<textarea rows={4} maxLength={4096} required value={draft.text} onChange={e => setDraft({ ...draft, text: e.target.value })}/></label><button className="btn primary" disabled={busy}>{tr("Save command", "Befehl speichern")}</button><button type="button" className="btn secondary" disabled={busy} onClick={() => setDraft(null)}>{tr("Cancel", "Abbrechen")}</button></form>}
 <div className="saved-command-list">{library.entries.filter(c => (c.name + " " + c.text).toLocaleLowerCase(language).includes(query.toLocaleLowerCase(language))).map(c => <article key={c.id} onContextMenu={e => { e.preventDefault(); setContext({ x: e.clientX, y: e.clientY, command: c }); }}><button className="command-name" title={c.text} disabled={busy || !target} onDoubleClick={() => run(c)}>{c.name}</button><div><button className="icon-button" aria-label={`${tr("Run", "Ausführen")}: ${c.name}`} title={tr("Run in the selected terminal", "Im gewählten Terminal ausführen")} disabled={busy || !target} onClick={() => run(c)}><Play size={17}/></button><button className="icon-button" aria-label={`${tr("Edit command", "Befehl bearbeiten")}: ${c.name}`} disabled={busy} onClick={() => setDraft({ ...c })}><Pencil size={16}/></button><button className="icon-button" aria-label={`${tr("Delete command", "Befehl löschen")}: ${c.name}`} disabled={busy} onClick={() => remove(c)}><Trash2 size={16}/></button></div></article>)}</div><small>{tr("Saved locally. Never store secrets. Nothing runs automatically.", "Lokal gespeichert. Keine Zugangsdaten eintragen. Keine automatische Ausführung.")}</small>{context && <ContextMenu {...context} onClose={() => setContext(null)} items={[{ label: tr("Run", "Ausführen"), disabled: busy || !target, action: () => run(context.command) }, { label: tr("Edit command", "Befehl bearbeiten"), disabled: busy, action: () => setDraft({ ...context.command }) }, { label: tr("Delete command", "Befehl löschen"), disabled: busy, action: () => remove(context.command) }]}/>}</section>;
}
