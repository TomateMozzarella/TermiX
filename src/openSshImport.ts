import { normalizeAddress } from "./address";
import type { Session } from "./types";

// Import only self-contained entries with explicit endpoints and users.
export function readOpenSshSessions(config: string, group: string): Session[] {
  const lines = config.split(/\r?\n/).map(line => line.trim());
  const sessions: Session[] = [];
  const aliases = new Set<string>();
  let entry: Record<string, string> | undefined;
  function finish() {
    if (!entry || !entry.hostname || !entry.user || aliases.has(entry.host.toLowerCase())) return;
    if (!/^\d+$/.test(entry.port ?? "22") || !/^[\w.:-]+$/.test(entry.hostname) || !/^[\w.-]{1,100}$/.test(entry.user)) return;
    let address;
    try { address = normalizeAddress(entry.hostname.includes(":") ? `[${entry.hostname}]` : entry.hostname, Number(entry.port ?? "22")); }
    catch { return; }
    aliases.add(entry.host.toLowerCase());
    sessions.push({ id: crypto.randomUUID(), kind: "ssh", name: entry.host, host: address.host, port: address.port, username: entry.user, group, authMethod: "agent" });
  }
  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const match = /^([a-z]+)(?:\s*=\s*|\s+)(.*?)$/i.exec(line);
    if (!match) { entry = undefined; continue; }
    const key = match[1].toLowerCase();
    const value = match[2].split(/\s+#/, 1)[0];
    if (key === "host") {
      finish();
      entry = /^[\w.-]{1,100}$/.test(value) ? { host: value } : undefined;
    } else if (entry && ["hostname", "user", "port"].includes(key) && !Object.prototype.hasOwnProperty.call(entry, key)) {
      entry[key] = value;
    } else {
      entry = undefined;
    }
  }
  finish();
  return sessions;
}
