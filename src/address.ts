export interface Endpoint { host: string; port: number }
export function normalizeAddress(input: string, fallback: number): Endpoint {
  if (input.length > 2048 || /[\x00-\x1f\x7f]/.test(input) || !Number.isInteger(fallback) || fallback < 1 || fallback > 65535) throw "invalid_host";
  let value = input.trim();
  if (value.includes("://")) {
    const index = value.indexOf("://"), scheme = value.slice(0, index).toLowerCase();
    if (!["http", "https", "ssh"].includes(scheme)) throw "address_scheme";
    value = value.slice(index + 3);
  }
  if (/[@%\\]/.test(value)) throw "address_credentials";
  if (/[?#]/.test(value)) throw "address_path";
  if (value.endsWith("/")) value = value.slice(0, -1);
  if (value.includes("/")) throw "address_path";
  const parsePort = (text: string) => { if (!/^\d+$/.test(text) || Number(text) < 1 || Number(text) > 65535) throw "invalid_host"; return Number(text); };
  let host = value, port = fallback;
  if (value.startsWith("[")) {
    const close = value.indexOf("]"); if (close < 0) throw "invalid_host";
    host = value.slice(1, close); const tail = value.slice(close + 1);
    if (!host.includes(":")) throw "invalid_host";
    if (tail) { if (!tail.startsWith(":")) throw "invalid_host"; port = parsePort(tail.slice(1)); }
  } else if ((value.match(/:/g) ?? []).length === 1) {
    const index = value.indexOf(":"); host = value.slice(0, index); port = parsePort(value.slice(index + 1));
  }
  if (host.includes(":")) {
    if (!/^[0-9a-f:.]+$/i.test(host)) throw "invalid_host";
    try { host = new URL(`http://[${host}]/`).hostname.slice(1, -1); } catch { throw "invalid_host"; }
  } else {
    host = host.replace(/\.$/, "").toLowerCase();
    if (/^[\d.]+$/.test(host)) {
      const octets = host.split(".");
      if (octets.length !== 4 || octets.some(o => !/^\d{1,3}$/.test(o) || Number(o) > 255 || (o.length > 1 && o.startsWith("0")))) throw "invalid_host";
    } else if (!host || host.length > 253 || host.split(".").some(l => !/^[a-z0-9_](?:[a-z0-9_-]*[a-z0-9_])?$/.test(l) || l.length > 63)) throw "invalid_host";
  }
  return { host, port };
}
