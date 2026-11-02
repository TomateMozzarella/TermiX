import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { connectTerminal, terminalApi } from "./services/terminal";
import type { TerminalTab } from "./types";
import { terminalTheme, type ResolvedTheme } from "./appearance";
import { errorText, t, type Language } from "./i18n";

export function TerminalPane({ tab, active, fontSize, theme, accent, language, onReconnect }: { tab: TerminalTab; active: boolean; fontSize: number; theme: ResolvedTheme; accent: string; language: Language; onReconnect: () => void }) {
  const [ended, setEnded] = useState(false);
  const visual = useRef({ theme, accent, language }); visual.current = { theme, accent, language };
  const host = useRef<HTMLDivElement>(null);
  const focus = useRef<() => void>(() => {});
  const appearance = useRef<(size: number, theme: ResolvedTheme, accent: string) => void>(() => {});
  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    const terminal = new Terminal({ cursorBlink: true, scrollback: 5000,
      fontFamily: '"Cascadia Code", Consolas, monospace', fontSize,
      theme: terminalTheme(visual.current.theme, visual.current.accent) });
    const fit = new FitAddon(); terminal.loadAddon(fit); terminal.open(element);
    const fitVisible = () => {
      if (element.clientWidth && element.clientHeight) fit.fit();
    };
    fitVisible();
    appearance.current = (size, theme, accent) => { terminal.options.fontSize = size; terminal.options.theme = terminalTheme(theme, accent); fitVisible(); };
    if (tab.kind !== "local" && !(tab.kind === "ssh" && tab.transportId)) {
      terminal.writeln(t(visual.current.language, "unavailable"));
      return () => { appearance.current = () => {}; terminal.dispose(); };
    }
    let alive = true;
    const api = tab.transportId ? { ...terminalApi, open: async () => tab.transportId! } : terminalApi;
    const connection = connectTerminal(api, tab.profile ?? "powershell",
      terminal.cols, terminal.rows,
      bytes => new Promise<void>(resolve => { if (alive) terminal.write(bytes, resolve); else resolve(); }),
      message => { if (alive) { terminal.writeln(`\r\n[${message}]`); setEnded(true); } },
      (kind, value) => kind === "exit" ? `${t(visual.current.language, "end")}${value === null ? "" : ` (Exit ${value})`}` : `${t(visual.current.language, "terminalError")}: ${errorText(value, visual.current.language)}`);
    const input = terminal.onData(text => connection.write(text));
    const resized = terminal.onResize(({ cols, rows }) => connection.resize(cols, rows));
    const observer = new ResizeObserver(fitVisible); observer.observe(element);
    focus.current = () => { fitVisible(); terminal.focus(); };
    return () => {
      alive = false; focus.current = () => {};
      appearance.current = () => {};
      observer.disconnect(); input.dispose(); resized.dispose(); connection.dispose(); terminal.dispose();
    };
  }, [tab.id, tab.kind, tab.profile, tab.transportId]);
  useEffect(() => { if (active) focus.current(); }, [active]);
  useEffect(() => { appearance.current(fontSize, theme, accent); }, [fontSize, theme, accent]);
  return <>{tab.kind === "ssh" && ended && <div className="terminal-reconnect"><button className="btn secondary" onClick={onReconnect}>{t(language, "reconnect")}</button></div>}<div ref={host} className="terminal-host" /></>;
}
