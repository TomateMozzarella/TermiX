import { test, expect } from "@playwright/test";
import { mockDesktop, preview } from "./desktop";

test("English is default; setup saves language, shell, appearance and editor; relaunch skips it", async ({ page }) => {
  await mockDesktop(page); await page.goto("/");
  await expect(page.getByRole("heading", { name: "Make yourself at home." })).toBeVisible();
  await expect(page.getByRole("button", { name: "English", exact: true })).toHaveAttribute("aria-pressed", "true");
  await preview(page, "TermiX-0.4.0-Language");
  expect(await page.evaluate(() => (window as any).testCalls.filter((c: any) => c.command === "open_terminal").length)).toBe(0);
  await page.getByRole("button", { name: "Deutsch", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Richte dich ein." })).toBeVisible();
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page.getByRole("radio", { name: /CMD/ }).check();
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page.getByRole("button", { name: "Dunkel", exact: true }).click();
  await page.getByRole("slider", { name: "Schriftgröße", exact: true }).fill("17");
  await page.getByLabel("Eigene Farbe", { exact: true }).fill("#b692f6");
  await page.setViewportSize({ width: 900, height: 600 });
  await expect(page.getByRole("button", { name: "Weiter", exact: true })).toBeInViewport({ ratio: 1 });
  await page.setViewportSize({ width: 1280, height: 800 });
  await preview(page, "TermiX-0.4.0-Design-Dark");
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page.getByLabel("Bevorzugter Editor", { exact: true }).selectOption("notepad++");
  await page.getByRole("button", { name: "Arbeitsbereich öffnen" }).click();
  await expect(page.locator(".terminal-layer")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".terminal-layer")).toHaveCount(0); await expect(page.getByRole("dialog")).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("test-preferences")!));
  expect(saved).toMatchObject({ language: "de", defaultShell: "cmd", fontSize: 17, editor: "notepad++", accent: "#b692f6", theme: "dark", setupVersion: 2 });
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sitzungen", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hilfe", exact: true }).click();
  const help = page.getByRole("dialog", { name: "Hilfe zu TermiX", exact: true });
  for (const label of ["Projektseite", "Versionshinweise", "Aktualisierungen", "Dokumentation"]) {
    await expect(help.getByRole("button", { name: label, exact: true })).toBeVisible();
  }
  await preview(page, "TermiX-0.11.1-Hilfe");
});

test("appearance and language apply without respawning terminals, cancellation restores preview", async ({ page }) => {
  await mockDesktop(page, true); await page.goto("/"); await page.getByRole("button", { name: "New tab", exact: true }).click(); await expect(page.getByRole("tab", { name: /^Windows PowerShell/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).testCalls.filter((c: any) => c.command === "open_terminal").length)).toBe(1);
  const count = await page.evaluate(() => (window as any).testCalls.filter((c: any) => c.command === "open_terminal").length);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Deutsch", exact: true }).click();
  await page.getByRole("tab", { name: "Standard-Terminal", exact: true }).click(); await page.getByRole("radio", { name: /CMD/ }).check(); await page.getByRole("tab", { name: "Darstellung", exact: true }).click(); await page.getByRole("slider", { name: "Schriftgröße", exact: true }).fill("18");
  await page.getByRole("button", { name: "Hell", exact: true }).click();
  await page.setViewportSize({ width: 900, height: 600 });
  await expect(page.getByRole("button", { name: "Änderungen speichern" })).toBeInViewport({ ratio: 1 });
  await page.setViewportSize({ width: 1280, height: 800 });
  await preview(page, "TermiX-0.4.0-Settings-Light");
  await page.getByRole("button", { name: "Änderungen speichern" }).click();
  expect(await page.evaluate(() => (window as any).testCalls.filter((c: any) => c.command === "open_terminal").length)).toBe(count);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Neuer Tab", exact: true }).click(); await expect(page.getByRole("tab", { name: /^CMD/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).testCalls.filter((c: any) => c.command === "open_terminal").at(-1)?.args.profile)).toBe("cmd");
  await page.getByRole("button", { name: "Einstellungen", exact: true }).click(); await page.getByRole("tab", { name: "Darstellung", exact: true }).click(); await page.getByRole("button", { name: "Dunkel", exact: true }).click(); await page.getByRole("tab", { name: "Sprache", exact: true }).click(); await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click(); await expect(page.locator("html")).toHaveAttribute("data-theme", "light"); await expect(page.getByRole("button", { name: "Einstellungen", exact: true })).toBeVisible();
});

test("automatic theme follows system changes while the shell keeps running", async ({ page }) => {
  await mockDesktop(page, true); await page.emulateMedia({ colorScheme: "light" }); await page.goto("/"); await page.getByRole("button", { name: "New tab", exact: true }).click(); await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("tab", { name: /^Windows PowerShell/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).testCalls.filter((c: any) => c.command === "open_terminal").length)).toBe(1);
  const count = await page.evaluate(() => (window as any).testCalls.filter((c: any) => c.command === "open_terminal").length);
  await page.emulateMedia({ colorScheme: "dark" }); await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => (window as any).testCalls.filter((c: any) => c.command === "open_terminal").length)).toBe(count);
});

test("legacy preferences retain shell and font and request the new setup once", async ({ page }) => {
  await mockDesktop(page, false, true); await page.goto("/"); await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("radio", { name: /CMD/ })).toBeChecked(); await page.getByRole("button", { name: "Continue", exact: true }).click(); await expect(page.getByRole("slider", { name: "Font size", exact: true })).toHaveValue("18");
});

test("save failure keeps setup open and supports retry without starting a shell", async ({ page }) => {
  await mockDesktop(page); await page.goto("/"); for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.evaluate(() => { (window as any).failSave = true; }); await page.getByRole("button", { name: "Open workspace", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Preferences could not be saved");
  expect(await page.evaluate(() => (window as any).testCalls.filter((c: any) => c.command === "open_terminal").length)).toBe(0);
  await page.evaluate(() => { (window as any).failSave = false; }); await page.getByRole("button", { name: "Open workspace", exact: true }).click(); await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("settings keyboard focus is trapped and returns to its opener", async ({ page }) => {
  await mockDesktop(page, true); await page.goto("/"); const opener = page.getByRole("button", { name: "Settings", exact: true }); await opener.click();
  await expect(page.getByRole("heading", { name: "Your workspace", exact: true })).toBeFocused(); await page.getByRole("tab", {name:"Language", exact:true}).focus(); await page.keyboard.press("ArrowRight"); await expect(page.getByRole("tab", {name:"Default terminal", exact:true})).toBeFocused(); await expect(page.getByRole("tab", {name:"Default terminal", exact:true})).toHaveAttribute("aria-selected", "true"); await page.getByRole("heading", {name:"Your workspace", exact:true}).focus(); await page.keyboard.press("Shift+Tab"); await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeFocused(); await page.keyboard.press("Tab"); await expect(page.getByRole("button", { name: "Close settings", exact: true })).toBeFocused(); await page.keyboard.press("Escape"); await expect(opener).toBeFocused();
});
