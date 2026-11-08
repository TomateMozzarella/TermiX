import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { terminalHighlights } from "./terminalHighlights";
import { SearchAddon } from "@xterm/addon-search";
import { ContextMenu } from "./ContextMenu";
import { FitAddon } from "@xterm/addon-fit";
import { connectTerminal, terminalApi } from "./services/terminal";
import type { TerminalTab } from "./types";
import { terminalTheme, type ResolvedTheme } from "./appearance";
import { errorText, t, type Language } from "./i18n";

export function TerminalPane({ tab, active, focusOnActivate, fontSize, theme, accent, language, onReconnect, onInputReady }: { tab: TerminalTab; active: boolean; focusOnActivate: boolean; fontSize: number; theme: ResolvedTheme; accent: string; language: Language; onReconnect: () => void; onInputReady?: (write: ((value: string) => void) | null) => void }) {
  const tr = (en: string, de: string) => language === "de" ? de : en;
  const [context, setContext] = useState<{x: number; y: number} | null>(null), [searchOpen, setSearchOpen] = useState(false), [query, setQuery] = useState(""), [found, setFound] = useState(true), [notice, setNotice] = useState(""), [sizeOffset, setSizeOffset] = useState(0);
  const controls = useRef<{ terminal: Terminal; search: SearchAddon }>();
  const [ended, setEnded] = useState(false);
  const visual = useRef({ theme, accent, language }); visual.current = { theme, accent, language };
  const host = useRef<HTMLDivElement>(null);
  const focus = useRef<(requestFocus: boolean) => void>(() => {});
  const appearance = useRef<(size: number, theme: ResolvedTheme, accent: string) => void>(() => {});
  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    const terminal = new Terminal({ cursorBlink: true, cursorStyle:"block",cursorInactiveStyle:"outline",allowProposedApi:true,scrollback: 5000,
      fontFamily: '"Cascadia Code", Consolas, monospace', fontSize,
      theme: terminalTheme(visual.current.theme, visual.current.accent) });
    const fit = new FitAddon(); terminal.loadAddon(fit); const search = new SearchAddon(); terminal.loadAddon(search); controls.current = { terminal, search }; terminal.open(element);const highlights=terminalHighlights(terminal,()=>visual.current);
    const fitVisible = () => {
      if (element.clientWidth && element.clientHeight) fit.fit();
    };
    fitVisible();
    appearance.current = (size, theme, accent) => { terminal.options.fontSize = size; terminal.options.theme = terminalTheme(theme, accent); fitVisible(); highlights.refresh(); };
    if (tab.kind !== "local" && !(tab.kind === "ssh" && tab.transportId)) {
      terminal.writeln(t(visual.current.language, "unavailable"));
      return () => { appearance.current = () => {}; highlights.dispose();terminal.dispose(); };
    }
    if(tab.kind==="ssh"&&tab.connection){const c=tab.connection;const clean=(s:string)=>s.replace(/[\x00-\x1f\x7f]/g,"").slice(0,200);terminal.writeln("\x1b[1;36mTermiX · SSH\x1b[0m");terminal.writeln("\x1b[32m"+clean(c.username)+"@"+clean(c.host)+":"+c.port+"\x1b[0m · "+(visual.current.language==="de"?"Hostschlüssel geprüft":"Host key verified"));terminal.writeln(visual.current.language==="de"?"Dateien bei Bedarf über SFTP öffnen.\r\n":"Open files through SFTP when needed.\r\n");}
    let alive = true;
    const api = tab.transportId ? { ...terminalApi, open: async () => tab.transportId! } : terminalApi;
    const connection = connectTerminal(api, tab.profile ?? "powershell",
      terminal.cols, terminal.rows,
      bytes => new Promise<void>(resolve => { if (alive) terminal.write(bytes, resolve); else resolve(); }),
      message => { if (alive) { terminal.writeln(`\r\n[${message}]`); setEnded(true); } },
      (kind, value) => kind === "exit" ? `${t(visual.current.language, "end")}${value === null ? "" : ` (Exit ${value})`}` : `${t(visual.current.language, "terminalError")}: ${errorText(value, visual.current.language)}`);
    onInputReady?.(value => { connection.write(value); terminal.focus(); });
    const input = terminal.onData(text => connection.write(text));
    const resized = terminal.onResize(({ cols, rows }) => connection.resize(cols, rows));
    const observer = new ResizeObserver(fitVisible); observer.observe(element);
    focus.current = requestFocus => { fitVisible(); if (requestFocus) terminal.focus(); };
    return () => {
      onInputReady?.(null); alive = false; controls.current = undefined; focus.current = () => {};
      appearance.current = () => {};
      observer.disconnect(); input.dispose(); resized.dispose(); connection.dispose(); terminal.dispose();
    };
  }, [tab.id, tab.kind, tab.profile, tab.transportId]);
  useEffect(() => { if (active) focus.current(focusOnActivate); }, [active, focusOnActivate]);
  useEffect(() => { appearance.current(Math.max(11, Math.min(32, fontSize + sizeOffset)), theme, accent); }, [fontSize, theme, accent, sizeOffset]);
  async function copy(all = false) { try { const terminal = controls.current?.terminal; if (!terminal) return; const value = all ? Array.from({length: terminal.buffer.active.length}, (_, i) => terminal.buffer.active.getLine(i)?.translateToString(true) ?? "").join("\n") : terminal.getSelection(); await navigator.clipboard.writeText(value); } catch { setNotice(tr("Clipboard unavailable; use the keyboard shortcut.", "Zwischenablage nicht verfügbar; verwende die Tastenkombination.")); } }
  async function paste() { try { const value = await navigator.clipboard.readText(); if (value.length > 262144) { setNotice(tr("Paste exceeds 256 KiB.", "Einfügen überschreitet 256 KiB.")); return; } if (/[\r\n]/.test(value) && !window.confirm(tr("Paste multiple lines into ", "Mehrere Zeilen einfügen in ") + tab.title + "?")) return; controls.current?.terminal.paste(value); } catch { setNotice(tr("Clipboard unavailable; use the keyboard shortcut.", "Zwischenablage nicht verfügbar; verwende die Tastenkombination.")); } }
  const find = (previous = false) => { if (!query) return; setFound(!!(previous ? controls.current?.search.findPrevious(query) : controls.current?.search.findNext(query))); };
  return <><div onKeyDown={e => { if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "f") { e.preventDefault(); setSearchOpen(true); } }}>{searchOpen && <form className="terminal-search" onSubmit={e => { e.preventDefault(); find(); }}><input autoFocus aria-label={tr("Find in terminal", "Im Terminal suchen")} value={query} onChange={e => setQuery(e.target.value)}/><button type="button" onClick={() => find(true)}>{tr("Previous", "Zurück")}</button><button>{tr("Next", "Weiter")}</button><button type="button" onClick={() => { setSearchOpen(false); controls.current?.search.clearDecorations(); }}>{tr("Close", "Schließen")}</button>{!found && <span role="status">{tr("No match", "Kein Treffer")}</span>}</form>}</div>{notice && <button className="terminal-reconnect" onClick={() => setNotice("")}>{notice}</button>}{context && <ContextMenu {...context} onClose={() => setContext(null)} items={[{label: tr("Copy", "Kopieren"), action: () => void copy()}, {label: tr("Copy all", "Alles kopieren"), action: () => void copy(true)}, {label: tr("Paste", "Einfügen"), action: () => void paste(), disabled: ended}, {label: tr("Select all", "Alles auswählen"), action: () => controls.current?.terminal.selectAll()}, {label: tr("Find", "Suchen"), action: () => setSearchOpen(true)}, {label: tr("Increase font size", "Schrift vergrößern"), action: () => setSizeOffset(v => Math.min(32 - fontSize, v + 1))}, {label: tr("Decrease font size", "Schrift verkleinern"), action: () => setSizeOffset(v => Math.max(11 - fontSize, v - 1))}, {label: tr("Reset font size", "Schrift zurücksetzen"), action: () => setSizeOffset(0)}, {label: tr("Clear scrollback", "Scrollback leeren"), action: () => { if (window.confirm(tr("Clear this terminal's visible scrollback?", "Sichtbaren Scrollback dieses Terminals leeren?"))) controls.current?.terminal.clear(); }}]}/>} {tab.kind === "ssh" && (ended || !tab.transportId) && <div className="terminal-reconnect"><button className="btn secondary" onClick={onReconnect}>{t(language, "reconnect")}</button></div>}<div ref={host} className="terminal-host" onContextMenu={e => { e.preventDefault(); setContext({ x: e.clientX, y: e.clientY }); }} /></>;
}

