import { invoke } from "@tauri-apps/api/core";

export interface ShellProfile { id: string; name: string }
export type TerminalOutput =
  | { type: "data"; bytes: number[] }
  | { type: "pending" }
  | { type: "exit"; code: number | null }
  | { type: "error"; message: string };

export const terminalApi = {
  profiles: () => invoke<ShellProfile[]>("terminal_profiles"),
  open: (profile: string, cols: number, rows: number) => invoke<string>("open_terminal", { profile, cols, rows }),
  read: (id: string) => invoke<TerminalOutput>("read_terminal", { id }),
  write: (id: string, data: number[]) => invoke<void>("write_terminal", { id, data }),
  resize: (id: string, cols: number, rows: number) => invoke<void>("resize_terminal", { id, cols, rows }),
  close: (id: string) => invoke<void>("close_terminal", { id }),
};

export type TerminalApi = typeof terminalApi;

// Separate the asynchronous process lifecycle from React. A tab can unmount
// while startup is pending (including React StrictMode); the late PTY is closed.
export function connectTerminal(api: TerminalApi, profile: string, cols: number, rows: number,
  output: (bytes: Uint8Array) => Promise<void>, ended: (message: string) => void) {
  let disposed = false;
  let id: string | undefined;
  let inputBytes = 0;
  let input = Promise.resolve();
  let desiredSize = { cols, rows };
  let resizing = false;

  const fail = (error: unknown) => {
    if (!disposed) ended(`Terminalfehler: ${String(error)}`);
    dispose();
  };
  const resize = async () => {
    if (!id || disposed || resizing) return;
    resizing = true;
    try {
      let sent;
      do { sent = desiredSize; await api.resize(id, sent.cols, sent.rows); }
      while (!disposed && sent !== desiredSize);
    } catch (e) { fail(e); }
    finally { resizing = false; }
  };
  const ready = api.open(profile, cols, rows).then(async opened => {
    id = opened;
    if (disposed) { await api.close(opened); return; }
    await resize();
    while (!disposed) {
      const result = await api.read(opened);
      if (disposed) break;
      if (result.type === "data") await output(new Uint8Array(result.bytes));
      else if (result.type === "error") throw new Error(result.message);
      else if (result.type === "exit") {
        ended(`Shell beendet${result.code === null ? "" : ` (Exit ${result.code})`}`);
        dispose();
      }
    }
  }).catch(fail);

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (id) void api.close(id).catch(() => { /* app shutdown / already closed */ });
  }

  return {
    ready,
    dispose,
    resize(cols: number, rows: number) {
      desiredSize = { cols, rows };
      void resize();
    },
    write(text: string) {
      if (disposed || !id) return;
      const bytes = new TextEncoder().encode(text);
      // Bound pending paste/input and preserve keystroke order across IPC calls.
      if (inputBytes + bytes.length > 256 * 1024) { fail("Eingabe überschreitet 256 KiB"); return; }
      inputBytes += bytes.length;
      input = input.then(async () => {
        for (let offset = 0; offset < bytes.length && !disposed; offset += 8192) {
          await api.write(id!, Array.from(bytes.subarray(offset, offset + 8192)));
        }
      }).catch(fail).finally(() => { inputBytes -= bytes.length; });
    },
  };
}
