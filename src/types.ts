export type SessionKind = "ssh" | "local" | "rdp" | "serial";

export interface Session {
  id: string;
  name: string;
  kind: SessionKind;
  host: string;
  port: number;
  username: string;
  group: string;
}

export interface TerminalTab {
  id: string;
  title: string;
  sessionId?: string;
  kind: SessionKind;
}
