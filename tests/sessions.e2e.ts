import { test, expect, type Page } from "@playwright/test";
import { mockDesktop, preview } from "./desktop";
async function start(page: Page) { await mockDesktop(page, true); await page.goto("/"); await page.getByRole("button", { name: "New tab", exact: true }).click(); await expect(page.getByRole("tab", { name: "Windows PowerShell" })).toBeVisible(); }
async function createLocal(page: Page, name: string) {
  await page.getByRole("button", { name: "Add session", exact: true }).click();
  await page.getByLabel("Connection type", { exact: true }).selectOption("local");
  await page.getByLabel("Display name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Save session", exact: true }).click();
}

test("edit a session, preserve its ID and running terminal, duplicate and delete metadata", async ({ page }) => {
  await start(page); await createLocal(page, "Maintenance");
  const id = await page.evaluate(() => JSON.parse(localStorage.getItem("test-catalog")!).sessions[0].id);
  await page.getByRole("button", { name: "Open session: Maintenance", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Maintenance", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).testCalls.filter((c: any) => c.command === "open_terminal").length)).toBe(2);
  await page.getByRole("button", { name: "Edit session: Maintenance", exact: true }).click();
  await page.getByLabel("Display name", { exact: true }).fill("Operations");
  await page.getByLabel("Default terminal", { exact: true }).selectOption("cmd");
  await page.getByRole("button", { name: "Save session", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open session: Operations", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Maintenance", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).testCalls.filter((c: any) => c.command === "open_terminal").length)).toBe(2);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("test-catalog")!).sessions[0].id)).toBe(id);
  await page.getByRole("button", { name: "Open session: Operations", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).testCalls.filter((c: any) => c.command === "open_terminal").at(-1)?.args.profile)).toBe("cmd");
  await page.getByRole("button", { name: "More session actions: Operations", exact: true }).click(); await page.getByRole("menuitem", { name: "Duplicate session", exact: true }).click();
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue("Operations (copy)"); await page.getByRole("button", { name: "Save session", exact: true }).click();
  const ids = await page.evaluate(() => JSON.parse(localStorage.getItem("test-catalog")!).sessions.map((s: any) => s.id)); expect(new Set(ids).size).toBe(2);
  await page.getByRole("button", { name: "More session actions: Operations", exact: true }).click(); await page.getByRole("menuitem", { name: "Delete session", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click(); await expect(page.getByRole("button", { name: "Open session: Operations", exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Maintenance", exact: true })).toBeVisible();
});

test("folders survive relaunch, favorites and recent work, deleting a folder preserves sessions", async ({ page }) => {
  await start(page); await page.getByRole("button", { name: "New folder", exact: true }).click(); await page.getByLabel("Folder name", { exact: true }).fill("Homelab"); await page.getByRole("button", { name: "Save folder", exact: true }).click();
  await page.getByRole("button", { name: "Homelab", exact: true }).click(); await createLocal(page, "Console");
  await page.getByRole("button", { name: "Add to favorites: Console", exact: true }).click();
  await page.getByRole("button", { name: "CONNECTIONS", exact: true }).click();
  await page.getByRole("button", { name: "Favorites", exact: true }).click(); await expect(page.getByRole("button", { name: "Open session: Console", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open session: Console", exact: true }).click(); await page.getByRole("button", { name: "Recently used", exact: true }).click(); await expect(page.getByRole("button", { name: "Open session: Console", exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole("button", { name: "Homelab", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Rename folder: Homelab", exact: true }).click(); await page.getByLabel("Folder name", { exact: true }).fill("Servers"); await page.getByRole("button", { name: "Save folder", exact: true }).click();
  await page.getByRole("button", { name: "Servers", exact: true }).click(); await preview(page, "TermiX-0.4.0-Library-Light");
  await page.getByRole("button", { name: "Delete folder: Servers", exact: true }).click(); await expect(page.getByRole("dialog")).toContainText("They will not be deleted"); await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open session: Console", exact: true })).toBeVisible(); expect(await page.evaluate(() => JSON.parse(localStorage.getItem("test-catalog")!).sessions[0].group)).toBe("");
});

test("pasted HTTPS address becomes an SSH host, explicit ports are retained and paths are rejected", async ({ page }) => {
  await start(page); await page.getByRole("button", { name: "Add session", exact: true }).click();
  await page.getByLabel("Hostname / IP", { exact: true }).fill("https://SERVER.example/"); await expect(page.locator(".address-preview")).toContainText("server.example:22");
  await page.getByLabel("Username", { exact: true }).fill("user"); await page.getByRole("button", { name: "Save session", exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("test-catalog")!).sessions[0])).toMatchObject({ host: "server.example", port: 22 });
  await page.getByRole("button", { name: "Edit session: server.example", exact: true }).click(); await page.getByLabel("Hostname / IP", { exact: true }).fill("ssh://server.example:2222"); await page.getByRole("button", { name: "Save session", exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("test-catalog")!).sessions[0].port)).toBe(2222);
  await page.getByRole("button", { name: "Edit session: server.example", exact: true }).click(); await page.getByLabel("Hostname / IP", { exact: true }).fill("https://server.example/admin"); await page.getByRole("button", { name: "Save session", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Remove paths");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("test-catalog")!).sessions[0].host)).toBe("server.example");
});

test("save failure keeps edits visible and preserves saved sessions", async ({ page }) => {
  await start(page); await createLocal(page, "Keep me"); await page.getByRole("button", { name: "Edit session: Keep me", exact: true }).click(); await page.getByLabel("Display name", { exact: true }).fill("Unsaved");
  await page.evaluate(() => { (window as any).failLibrary = true; }); await page.getByRole("button", { name: "Save session", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("could not be saved");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("test-catalog")!).sessions[0].name)).toBe("Keep me");
  await page.evaluate(() => { (window as any).failLibrary = false; }); await page.getByRole("button", { name: "Save session", exact: true }).click(); await expect(page.getByRole("button", { name: "Open session: Unsaved", exact: true })).toBeVisible();
});

test("import requires preview confirmation, export uses metadata and invalid files leave the library intact", async ({ page }) => {
  await start(page); await createLocal(page, "Existing");
  await page.evaluate(() => { (window as any).importCatalog = { schemaVersion: 2, revision: 0, folders: [], sessions: [{ id: "imported", name: "Imported", kind: "ssh", host: "example.test", port: 22, username: "user", group: "" }] }; });
  await page.getByRole("button", { name: "Import", exact: true }).click(); await expect(page.getByRole("heading", { name: "Review import" })).toBeVisible(); expect(await page.evaluate(() => JSON.parse(localStorage.getItem("test-catalog")!).sessions.length)).toBe(1);
  await page.getByRole("button", { name: "Import (1)", exact: true }).click(); await expect(page.getByRole("button", { name: "Open session: Imported", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  expect(await page.evaluate(() => (window as any).exportedCatalog.sessions.map((s: any) => s.name))).toEqual(["Existing", "Imported"]);
  await page.evaluate(() => { (window as any).failImport = true; }); await page.getByRole("button", { name: "Import", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("unsupported or credential fields");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("test-catalog")!).sessions.length)).toBe(2);
});

test("UI scaling and editor discovery/manual override preserve terminal font and processes", async ({ page }) => {
  await start(page); await expect.poll(() => page.evaluate(() => (window as any).testCalls.filter((c: any) => c.command === "open_terminal").length)).toBe(1);
  await page.getByRole("button", { name: "CONNECTIONS", exact: true }).click();
  const initialSize = await page.getByRole("button", { name: "All sessions", exact: true }).evaluate(e => parseFloat(getComputedStyle(e).fontSize));
  await page.evaluate(() => { (window as any).detectedEditorPath = "C:\\Tools\\Notepad++\\notepad++.exe"; (window as any).editorPickedPath = "C:\\Other\\Editor.exe"; });
  await page.getByRole("button", { name: "Settings", exact: true }).click(); await page.getByRole("tab", {name: "Appearance", exact: true}).click(); await page.getByRole("slider", { name: "Interface size", exact: true }).fill("150");
  await page.getByRole("tab", {name: "Preferred editor", exact: true}).click(); await page.getByLabel("Preferred editor", { exact: true }).selectOption("notepad++"); await expect(page.getByLabel("Full path to the editor executable", { exact: true })).toHaveValue("C:\\Tools\\Notepad++\\notepad++.exe");
  await page.getByRole("button", { name: "Browse…", exact: true }).click(); await expect(page.getByLabel("Full path to the editor executable", { exact: true })).toHaveValue("C:\\Other\\Editor.exe");
  await page.setViewportSize({ width: 900, height: 600 }); await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeInViewport({ ratio: 1 }); await preview(page, "TermiX-0.4.0-Settings-150pct");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  expect(await page.getByRole("button", { name: "All sessions", exact: true }).evaluate(e => parseFloat(getComputedStyle(e).fontSize))).toBe(initialSize * 1.5);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("test-preferences")!))).toMatchObject({ uiScale: 150, fontSize: 15, editorPath: "C:\\Other\\Editor.exe" });
  expect(await page.evaluate(() => (window as any).testCalls.filter((c: any) => c.command === "open_terminal").length)).toBe(1);
  await page.reload(); await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("external library changes require an explicit reload instead of overwriting the newer state", async ({ page }) => {
  await start(page); await createLocal(page, "Original"); await page.getByRole("button", { name: "Edit session: Original", exact: true }).click(); await page.getByLabel("Display name", { exact: true }).fill("My draft");
  await page.evaluate(() => { const w = window as any; w.failLibrary = true; w.libraryFailure = "session_changed"; w.externalCatalog = structuredClone(w.catalog); w.externalCatalog.revision += 10; w.externalCatalog.sessions[0].name = "Other window"; });
  await page.getByRole("button", { name: "Save session", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("Another window");
  await page.getByRole("button", { name: "Cancel", exact: true }).click(); await page.getByRole("button", { name: "Reload library", exact: true }).click(); await expect(page.getByRole("button", { name: "Open session: Other window", exact: true })).toBeVisible();
});

test("session menus stay in the viewport and tab keyboard navigation retains focus", async ({ page }) => {
  await start(page); await createLocal(page, "Keyboard"); await page.setViewportSize({ width: 900, height: 600 });
  await page.getByRole("button", { name: "More session actions: Keyboard", exact: true }).click(); await expect(page.getByRole("menu")).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("menuitem", { name: "Duplicate session", exact: true })).toBeFocused(); await page.keyboard.press("ArrowDown"); await expect(page.getByRole("menuitem", { name: "Delete session", exact: true })).toBeFocused(); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "New tab", exact: true }).click(); const tabs = page.getByRole("tab"); await tabs.last().focus(); await page.keyboard.press("ArrowLeft"); await expect(tabs.first()).toBeFocused(); await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
});
