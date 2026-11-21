import { expect, test } from "@playwright/test";
import { mockDesktop, preview } from "./desktop";

test("tab colour, scoped menus, command import and output viewer are reachable", async ({ page }) => {
  await mockDesktop(page, true);
  await page.addInitScript(() => {
    const mock = window as any;
    mock.savedSessions = [{ id: "console", name: "Test console", kind: "local", host: "", port: 22, username: "", group: "Lab" }];
    mock.incomingCommands = { schemaVersion: 1, entries: [{ id: "4c926461-778e-4ca9-abae-9f3acbdca371", name: "List files", text: "ls" }] };
    mock.terminalOutput = "Output available in the editor\r\n";
  });
  await page.goto("/");
  const button = (name: string) => page.getByRole("button", { name, exact: true });
  const action = (name: string) => page.getByRole("menuitem", { name, exact: true });
  await button("Lab").click({ button: "right" });
  await expect(action("New session in folder")).toBeVisible();
  await action("Export this folder").click();
  await expect.poll(() => page.evaluate(() => (window as any).testCalls.find((call: any) =>
    call.command === "export_sessions")?.args.folderId)).toBeTruthy();
  await button("Open session: Test console").click({ button: "right" });
  await action("Open session").click();
  await expect(page.locator(".xterm-rows")).toContainText("Output available in the editor");
  await page.getByRole("tab", { name: "Test console" }).click({ button: "right" });
  await action("Custom tab colour…").click();
  await page.getByLabel("Colour", { exact: true }).fill("#c04577");
  await button("Save changes").click();
  await expect(page.locator(".tab.active")).toHaveCSS("border-top-color", "rgb(192, 69, 119)");
  await page.locator(".terminal-host").click({ button: "right" });
  await action("Open output in editor").click();
  const output = page.getByRole("dialog", { name: "Terminal output · Test console" });
  await expect(output).toContainText("Output available in the editor");
  await output.getByRole("button", { name: "Close editor" }).click();
  await button("Commands").click();
  const commands = page.getByRole("region", { name: "Saved commands" });
  await commands.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Import commands" })).toContainText("ls");
  await button("Add commands").click();
  await expect(commands.getByRole("button", { name: "List files", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).testCalls.some((call: any) => call.command === "write_terminal"))).toBe(false);
  await commands.getByRole("button", { name: "Export", exact: true }).click();
  await expect(commands.getByRole("status")).toHaveText("Commands exported.");
});

test("search reveals sessions in folded folders and R opens SSH verification after exit", async ({ page }) => {
  await mockDesktop(page, true);
  await page.addInitScript(() => {
    const mock = window as any;
    mock.hostStatus = "known";
    mock.savedSessions = [{ id: "demo", name: "Server", kind: "ssh", host: "server.test", port: 22, username: "deploy", group: "Production" }];
  });
  await page.goto("/");
  const expand = page.getByRole("button", { name: "Expand folder: Production", exact: true });
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("textbox", { name: /search/i }).fill("deploy");
  await page.getByRole("button", { name: "Open session: Server", exact: true }).click();
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.evaluate(() => { (window as any).disconnectSsh = true; });
  await page.getByRole("button", { name: /^Reconnect/ }).focus();
  await page.keyboard.press("r");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).testCalls.filter((call: any) => call.command === "ssh_probe").length)).toBe(2);
  expect(await page.evaluate(() => (window as any).testCalls.filter((call: any) => call.command === "ssh_open").length)).toBe(1);
});

test("empty startup and confirmed Multi-Execute send only to the visible split", async ({ page }) => {
  await mockDesktop(page, true);
  await page.goto("/");
  const button = (name: string) => page.getByRole("button", { name, exact: true });
  await expect(button("New tab")).toBeEnabled();
  await expect(page.locator(".terminal-layer")).toHaveCount(0);
  const writes = () => page.evaluate(() => (window as any).testCalls.filter((call: any) =>
    call.command === "write_terminal" && new TextDecoder().decode(Uint8Array.from(call.args.data)) === "hostname\r"));
  await button("New tab").click();
  await button("New tab").click();
  await button("New tab").click();
  await expect(button("Multi-Execute")).toBeDisabled();
  await button("Split view").click();
  await button("Side by side").click();
  await expect(button("Multi-Execute")).toBeEnabled();
  await button("Multi-Execute").click();
  await page.getByLabel("Command", { exact: true }).fill("hostname");
  await button("Review command").click();
  await expect(page.getByRole("dialog").locator("li")).toHaveCount(2);
  expect(await writes()).toHaveLength(0);
  await button("Send to all listed terminals").click();
  await expect(page.getByText("Sent to 2 terminals", { exact: true })).toBeVisible();
  expect(new Set((await writes()).map((call: any) => call.args.id)).size).toBe(2);
});

test("workspace controls show the selected layout and route each project link", async ({ page }) => {
  await mockDesktop(page, true);
  await page.goto("/");
  const button = (name: string) => page.getByRole("button", { name, exact: true });
  await button("New tab").click();
  await expect(button("CONNECTIONS")).toHaveAttribute("aria-expanded", "false");
  await button("Split view").click();
  await expect(button("Single terminal")).toHaveAttribute("aria-pressed", "true");
  await expect(button("6 Terminals")).toBeDisabled();
  await expect(page.getByRole("dialog").locator("footer")).toHaveCount(0);
  await page.keyboard.press("Escape");
  for (let index = 0; index < 5; index++) await button("New tab").click();
  await button("Split view").click();
  await preview(page, "TermiX-0.11.1-Split-layouts");
  await button("6 Terminals").click();
  const firstDivider = page.getByRole("separator", {name: "Resize terminal columns", exact: true});
  const secondDivider = page.getByRole("separator", {name: "Resize terminal columns 2 and 3", exact: true});
  await expect(firstDivider).toHaveAttribute("aria-valuenow", "33");
  await secondDivider.press("ArrowRight");
  await expect(secondDivider).toHaveAttribute("aria-valuenow", "72");
  await firstDivider.press("ArrowRight");
  await expect(firstDivider).toHaveAttribute("aria-valuenow", "38");
  await expect(secondDivider).toHaveAttribute("aria-valuenow", "72");
  await expect(page.locator(".split-pane-heading")).toHaveCount(6);
  await preview(page, "TermiX-0.11.1-Six-terminals");
  await button("Help").click();
  await preview(page, "TermiX-0.11.1-Help");
  for (const label of ["Project", "Changelog", "Updates", "Documentation"]) await button(label).click();
  expect(await page.evaluate(() => (window as any).testCalls
    .filter((call: any) => call.command === "open_project_link")
    .map((call: any) => call.args.page))).toEqual(["project", "changelog", "updates", "documentation"]);
  await page.keyboard.press("Escape");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 900, height: 650 });
  await button("Split view").click();
  await expect(button("6 Terminals")).toHaveAttribute("aria-pressed", "true");
  await preview(page, "TermiX-0.11.1-Split-layouts-dark");
  await button("Single terminal").click();
  await page.locator(".terminal-layer:visible .terminal-host").click({ button: "right" });
  await expect(page.getByRole("menu").locator(".menu-section-label").first()).toHaveCSS("border-top-width", "0px");
  await preview(page, "TermiX-0.11.1-Terminal-menu-dark");
  await page.keyboard.press("Escape");
  const strip = page.getByRole("tablist", { name: "TermiX" });
  const scrollPosition = () => strip.evaluate(element => element.scrollLeft);
  const before = await scrollPosition();
  await button("Scroll tabs left").click();
  await expect.poll(scrollPosition).toBeLessThan(before);
  await strip.hover();
  const after = await scrollPosition();
  await page.mouse.wheel(0, 240);
  await expect.poll(scrollPosition).toBeGreaterThan(after);
  await expect(button("New tab")).toBeInViewport();
  await button("Help").click();
  await preview(page, "TermiX-0.11.1-Help-dark");
});
