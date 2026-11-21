import { normalizeAddress } from "./address";
import type { Session } from "./types";

export function readPuttySessions(file: ArrayBuffer, group: string): Session[] {
  const bytes = new Uint8Array(file);
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : "utf-8";
  const lines = new TextDecoder(encoding, {fatal: true}).decode(file).split(/\r?\n/);
  if (lines[0] !== "Windows Registry Editor Version 5.00" && lines[0] !== "REGEDIT4") return [];
  const sessions: Session[] = [];
  const names = new Set<string>();
  let name = "";
  let values = new Map<string, string>();
  function finish() {
    if (!name || names.has(name.toLowerCase()) || values.get("Protocol") !== '"ssh"') return;
    const proxy = values.get("ProxyMethod");
    if (proxy !== undefined && proxy !== "dword:00000000") return;
    const host = /^"([\w.:-]+)"$/.exec(values.get("HostName") ?? "")?.[1];
    const username = /^"([\w.-]{0,100})"$/.exec(values.get("UserName") ?? '""')?.[1];
    const port = /^dword:([0-9a-f]{8})$/i.exec(values.get("PortNumber") ?? "dword:00000016")?.[1];
    if (!host || !username || !port) return;
    try {
      const address = normalizeAddress(host.includes(":") ? `[${host}]` : host, Number.parseInt(port, 16));
      names.add(name.toLowerCase());
      sessions.push({id: crypto.randomUUID(), name, kind: "ssh", ...address, username, group, authMethod: "agent"});
    } catch { /* Invalid endpoint. */ }
  }
  for (const line of lines.slice(1)) {
    if (line.startsWith("[")) {
      finish();
      values = new Map();
      name = "";
      const key = /^\[HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\([^\\\]]+)\]$/i.exec(line);
      if (key) {
        // PuTTY escapes registry key bytes with %XX. Decode UTF-8 names when possible.
        let candidate: string;
        try { candidate = decodeURIComponent(key[1]).trim(); }
        catch { continue; }
        if (candidate.length <= 100 && !/[\x00-\x1f\x7f]/.test(candidate) && candidate.toLowerCase() !== "default settings") name = candidate;
      }
    } else if (name) {
      const setting = /^"([A-Za-z]+)"=(.+)$/.exec(line);
      if (setting && ["Protocol", "HostName", "UserName", "PortNumber", "ProxyMethod"].includes(setting[1])) {
        if (values.has(setting[1])) name = "";
        else values.set(setting[1], setting[2]);
      }
    }
  }
  finish();
  return sessions;
}
