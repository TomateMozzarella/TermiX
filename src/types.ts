export type SessionKind = "ssh" | "local" | "rdp" | "serial";

export interface Session {
  id: string;
  name: string;
  kind: SessionKind;
  host: string;
  port: number;
  username: string;
  group: string;
  authMethod?: "agent" | "password" | "stored" | "key";
  keyPath?: string;
}

export interface TerminalTab {
  transportId?: string;
  profile?: string;
  id: string;
  title: string;
  sessionId?: string;
  kind: SessionKind;
}
