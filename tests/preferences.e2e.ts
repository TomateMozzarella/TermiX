import { test, expect, type Page } from "@playwright/test";

async function mockDesktop(page: Page, configured = false) {
  await page.addInitScript(({ configured }) => {
    const mock = window as unknown as { __TAURI_INTERNALS__: { invoke: (command: string, args: Record<string, unknown>) => Promise<unknown> }; testCalls: { command: string; args: Record<string, unknown> }[]; failSave: boolean };
    mock.testCalls = []; mock.failSave = false;
    mock.__TAURI_INTERNALS__ = {
      invoke: async (command, args) => {
        mock.testCalls.push({ command, args });
        if (command === "terminal_profiles") return [{ id: "powershell", name: "Windows PowerShell" }, { id: "cmd", name: "CMD" }];
        if (command === "get_preferences") {
          const stored = localStorage.getItem("test-preferences");
          return stored ? JSON.parse(stored) : configured ? { schemaVersion: 1, setupComplete: true, defaultShell: "powershell", fontSize: 15 } : null;
        }
        if (command === "save_preferences") {
          if (mock.failSave) throw "Speichern fehlgeschlagen. Bitte erneut versuchen.";
          localStorage.setItem("test-preferences", JSON.stringify(args.preferences));
          return args.preferences;
        }
        if (command === "list_sessions") return [];
        if (command === "open_terminal") return `terminal-${mock.testCalls.length}`;
        if (command === "read_terminal") return new Promise(() => {});
        return undefined;
      },
    };
  }, { configured });
}

test("first launch chooses shell, persists setup, and skips wizard after reload", async ({ page }) => {
  await mockDesktop(page); await page.goto("/");
  await expect(page.getByRole("dialog")).toBeVisible();
  if (process.env.TERMIX_PREVIEW_DIR) await page.screenshot({ path: `${process.env.TERMIX_PREVIEW_DIR}/TermiX-Setup.png`, animations: "disabled" });
  expect(await page.evaluate(() => (window as any).testCalls.filter((c: any) => c.command === "open_terminal").length)).toBe(0);
  await page.getByRole("radio", { name: /CMD/ }).check();
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mach es dir bequem." })).toBeVisible();
  if (process.env.TERMIX_PREVIEW_DIR) await page.screenshot({ path: `${process.env.TERMIX_PREVIEW_DIR}/TermiX-Schrift.png`, animations: "disabled" });
  await page.getByRole("slider").fill("17");
  await page.getByRole("button", { name: "Workspace öffnen" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^CMD/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).testCalls.filter((c: any) => c.command === "open_terminal").at(-1)?.args.profile)).toBe("cmd");
  await page.reload();
  await expect(page.getByRole("button", { name: /^CMD/ })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(page.getByText("Bereit", { exact: true })).toHaveCount(0);
});

test("settings affect new tabs, change font without respawning, and cancel preserves values", async ({ page }) => {
  await mockDesktop(page, true); await page.goto("/");
  await expect(page.getByRole("button", { name: /^Windows PowerShell/ })).toBeVisible();
  const count = await page.evaluate(() => (window as any).testCalls.filter((c: any) => c.command === "open_terminal").length);
  await page.getByRole("button", { name: "Einstellungen", exact: true }).click();
  if (process.env.TERMIX_PREVIEW_DIR) await page.screenshot({ path: `${process.env.TERMIX_PREVIEW_DIR}/TermiX-Einstellungen.png`, animations: "disabled" });
  await page.getByRole("radio", { name: /CMD/ }).check(); await page.getByRole("slider").fill("18");
  await page.getByRole("button", { name: "Änderungen speichern" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).testCalls.filter((c: any) => c.command === "open_terminal").length)).toBe(count);
  await expect(page.locator(".xterm-screen").first()).toBeVisible();
  await expect(page.locator(".statusbar")).toContainText("18 px");
  await page.getByRole("button", { name: "Neuer Tab", exact: true }).click();
  await expect(page.getByRole("button", { name: /^CMD/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).testCalls.filter((c: any) => c.command === "open_terminal").at(-1)?.args.profile)).toBe("cmd");
  await page.getByRole("button", { name: "Einstellungen", exact: true }).click();
  await page.getByRole("radio", { name: /Windows PowerShell/ }).check();
  await page.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await page.getByRole("button", { name: "Einstellungen", exact: true }).click();
  await expect(page.getByRole("radio", { name: /CMD/ })).toBeChecked();
});

test("save failure keeps setup open and permits retry", async ({ page }) => {
  await mockDesktop(page); await page.goto("/");
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page.evaluate(() => { (window as any).failSave = true; });
  await page.getByRole("button", { name: "Workspace öffnen" }).click();
  await expect(page.getByRole("alert")).toContainText("Speichern fehlgeschlagen");
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.evaluate(() => (window as any).testCalls.filter((c: any) => c.command === "open_terminal").length)).toBe(0);
  await page.evaluate(() => { (window as any).failSave = false; });
  await page.getByRole("button", { name: "Workspace öffnen" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("settings dialog traps keyboard focus and Escape returns to its opener", async ({ page }) => {
  await mockDesktop(page, true); await page.goto("/");
  const opener = page.getByRole("button", { name: "Einstellungen", exact: true });
  await opener.click(); await expect(page.getByRole("heading", { name: "Dein Workspace" })).toBeFocused();
  await page.keyboard.press("Shift+Tab"); await expect(page.getByRole("button", { name: "Änderungen speichern" })).toBeFocused();
  await page.keyboard.press("Tab"); await expect(page.getByRole("button", { name: "Einstellungen schließen" })).toBeFocused();
  await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0); await expect(opener).toBeFocused();
});
