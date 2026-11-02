import { test, expect, type Page } from "@playwright/test";
import { mockDesktop, preview } from "./desktop";
async function start(page: Page, status: string) {
  await mockDesktop(page, true); await page.goto("/");
  await page.evaluate(status => { const w = window as any; w.hostStatus = status; w.savedSessions = [{ id: "session-test", name: "Test server", host: "example.test", port: 22, username: "test-user", kind: "ssh", group: "General" }]; }, status);
  // Refreshing the session list uses the same normal app refresh path.
  await page.getByRole("button", { name: "Add session", exact: true }).click();
  await page.getByLabel("Hostname / IP", { exact: true }).fill("example.test"); await page.getByLabel("Username", { exact: true }).fill("test-user"); await page.getByRole("button", { name: "Save session", exact: true }).click();
  await page.getByRole("button", { name: /Test server/ }).click();
}
test("unknown hosts require explicit trust before credentials appear", async ({ page }) => {
  await start(page, "unknown"); await expect(page.getByText(/This server is not known yet/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Trust server and continue", exact: true })).toBeDisabled(); await expect(page.getByLabel("Authentication", { exact: true })).toHaveCount(0);
  await preview(page, "TermiX-0.3.0-SSH-Verify");
  await page.getByRole("checkbox").check(); await page.getByRole("button", { name: "Trust server and continue", exact: true }).click(); await expect(page.getByLabel("Authentication", { exact: true })).toBeVisible();
});
test("changed host keys are blocked until fingerprint and exact hostname are confirmed", async ({ page }) => {
  await start(page, "changed"); await expect(page.getByText(/The server key has CHANGED/)).toBeVisible(); await expect(page.getByText("SHA256:old-test-fingerprint")).toBeVisible();
  const replace = page.getByRole("button", { name: "Replace trusted key and continue", exact: true }); await page.getByRole("checkbox").check(); await expect(replace).toBeDisabled();
  await page.getByLabel(/Type the hostname/).fill("wrong.test"); await expect(replace).toBeDisabled(); await page.getByLabel(/Type the hostname/).fill("example.test"); await expect(replace).toBeEnabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await page.evaluate(() => (window as any).testCalls.filter((c: any) => c.command === "ssh_open").length)).toBe(0);
});
test("password fields clear during authentication, no credentials enter preferences, late connection is closed", async ({ page }) => {
  await start(page, "known"); await page.getByLabel("Authentication", { exact: true }).selectOption("password");
  await page.getByLabel("Password", { exact: true }).fill("test-only-sensitive-value"); await page.evaluate(() => { (window as any).sshDelay = true; }); await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  expect(await page.evaluate(() => localStorage.getItem("test-preferences"))).toBeNull();
  await page.getByRole("button", { name: "Cancel", exact: true }).click(); await page.evaluate(() => (window as any).resolveSsh("ssh-late-result"));
  await expect.poll(() => page.evaluate(() => (window as any).testCalls.some((c: any) => c.command === "close_terminal" && c.args.id === "ssh-late-result"))).toBe(true);
});
