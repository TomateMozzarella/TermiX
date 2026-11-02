import { invoke } from "@tauri-apps/api/core";
export interface HostProbe { ticket: string; host: string; port: number; algorithm: string; fingerprint: string; previousFingerprint: string | null; status: "known" | "unknown" | "changed" }
export interface SshAuth { username: string; method: "password" | "stored" | "key" | "agent"; password: string; keyPath: string; passphrase: string; savePassword: boolean }
export const sshApi = {
  probe: (host: string, port: number) => invoke<HostProbe>("ssh_probe", { host, port }),
  cancel: (ticket: string) => invoke<void>("ssh_cancel", { ticket }),
  open: (ticket: string, decision: string, confirmation: string, auth: SshAuth) => invoke<string>("ssh_open", { ticket, decision, confirmation, auth, cols: 80, rows: 24 }),
  forget: (host: string, port: number, username: string) => invoke<void>("ssh_forget_password", { host, port, username }),
};
