import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { connectTerminal, terminalApi } from "./services/terminal";
import type { TerminalTab } from "./types";

export function TerminalPane({ tab, active }: { tab: TerminalTab; active: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const focus = useRef<() => void>(() => {});
  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    const terminal = new Terminal({ cursorBlink: true, scrollback: 5000,
      fontFamily: 'Consolas, "Cascadia Code", monospace', fontSize: 13,
      theme: { background: "#10141c", foreground: "#d7deea", cursor: "#8ab4f8" } });
    const fit = new FitAddon(); terminal.loadAddon(fit); terminal.open(element);
    const fitVisible = () => {
      if (element.clientWidth && element.clientHeight) fit.fit();
    };
    fitVisible();
    if (tab.kind !== "local") {
      terminal.writeln("Dieser Verbindungstyp ist geplant und noch nicht implementiert.");
      return () => terminal.dispose();
    }
    let alive = true;
    const connection = connectTerminal(terminalApi, tab.profile ?? "powershell",
      terminal.cols, terminal.rows,
      bytes => new Promise<void>(resolve => { if (alive) terminal.write(bytes, resolve); else resolve(); }),
      message => { if (alive) terminal.writeln(`\r\n[${message}]`); });
    const input = terminal.onData(text => connection.write(text));
    const resized = terminal.onResize(({ cols, rows }) => connection.resize(cols, rows));
    const observer = new ResizeObserver(fitVisible); observer.observe(element);
    focus.current = () => { fitVisible(); terminal.focus(); };
    return () => {
      alive = false; focus.current = () => {};
      observer.disconnect(); input.dispose(); resized.dispose(); connection.dispose(); terminal.dispose();
    };
  }, [tab.id, tab.kind, tab.profile]);
  useEffect(() => { if (active) focus.current(); }, [active]);
  return <div ref={host} className="terminal-host" />;
}
