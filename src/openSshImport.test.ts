import { expect, test } from "vitest";
import { readOpenSshSessions } from "./openSshImport";

test("imports explicit DNS and IPv6 endpoints without applying wildcard defaults", () => {
  const sessions = readOpenSshSessions("Host *\nPort 2222\nHost app\nHostName app.example.org\nUser ops\nHost db\nHostName ::1\nUser db\nPort 2200", "folder");
  expect(sessions).toMatchObject([
    { name: "app", host: "app.example.org", port: 22, username: "ops", group: "folder" },
    { name: "db", host: "::1", port: 2200, username: "db", group: "folder" },
  ]);
});

test("skips proxy commands, ambiguous hosts and invalid ports", () => {
  expect(readOpenSshSessions("Host proxy\nHostName proxy.example.org\nUser ops\nProxyCommand tool\nHost a b\nHostName app.example.org\nUser ops\nHost bad\nHostName bad.example.org\nUser ops\nPort 65536", "")).toEqual([]);
});
