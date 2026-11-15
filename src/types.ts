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
  favorite?: boolean;
  lastUsed?: number;
  shellProfile?: string;
  fontSize?: number;
}

export interface SessionFolder { id: string; name: string }
export interface SessionCatalog { schemaVersion: 2; revision: number; folders: SessionFolder[]; sessions: Session[] }

export interface TerminalTab {
  temporary?: boolean;
  pinned?: boolean;
  color?: string;
  transportId?: string;
  profile?: string;
  fontSize?: number;
  connection?: Session;
  id: string;
  title: string;
  sessionId?: string;
  kind: SessionKind;
}

