import { normalizeAddress } from "./address";
import type { Session } from "./types";

export function readMobaSessions(config: string, group: string): Session[] {
  const sessions: Session[] = [];
  let bookmarks = false;
  for (const raw of config.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("[")) {
      bookmarks = /^\[Bookmarks(?:_\d+)?\]$/i.test(line);
      continue;
    }
    if (!bookmarks) continue;
    const entry = /^([^=]{1,100})=\s*#\d+#0%([\w.:-]+)%(\d{1,5})%([^%#]*)(?=[%#]|$)/.exec(line);
    if (!entry) continue;
    const [, rawName, host, port, user] = entry;
    const name = rawName.trim();
    const username = user === "<default>" ? "" : user;
    if (!name || /[\x00-\x1f\x7f]/.test(name) || !/^[\w.-]{1,100}$/.test(username)) continue;
    let address;
    try { address = normalizeAddress(host.includes(":") ? `[${host}]` : host, Number(port)); }
    catch { continue; }
    sessions.push({id: crypto.randomUUID(), kind: "ssh", name, ...address, username, group, authMethod: "agent"});
  }
  return sessions;
}
