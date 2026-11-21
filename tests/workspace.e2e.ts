import { test, expect } from "@playwright/test";
import { mockDesktop, preview } from "./desktop";

test("move sessions into folders, collapse groups, resize and preserve terminals", async ({ page }) => {
  await mockDesktop(page, true);
  await page.addInitScript(() => { (window as any).savedSessions = [{ id: "s1", name: "Operations", kind: "local", host: "", port: 22, username: "", group: "Production" }]; });
  await page.goto("/");
  const session = page.getByRole("button", { name: "Open session: Operations", exact: true }); await expect(session).toBeVisible();
  await session.locator("..").dragTo(page.getByRole("button", { name: "Unassigned", exact: true }));
  await expect.poll(() => page.evaluate(() => (window as any).catalog.sessions[0].group)).toBe("");
  await session.locator("..").dragTo(page.getByRole("button", { name: "Production", exact: true }));
  await expect.poll(() => page.evaluate(() => (window as any).catalog.sessions[0].group)).toBe("Production");
  await page.getByRole("button", { name: "CONNECTIONS", exact: true }).click();
  for (const section of ["CONNECTIONS", "FOLDERS", "SAVED SESSIONS"]) { const button = page.getByRole("button", { name: section, exact: true }); await button.click(); await expect(button).toHaveAttribute("aria-expanded", "false"); await button.click(); }
  const separator = page.getByRole("separator", { name: "Resize sidebar" }); const before = await page.locator(".sidebar").boundingBox();
  await separator.focus(); await page.keyboard.press("ArrowRight"); await expect(separator).toHaveAttribute("aria-valuenow", "330"); expect((await page.locator(".sidebar").boundingBox())!.width).toBeGreaterThan(before!.width);
  expect(await page.evaluate(() => (window as any).testCalls.filter((c: any) => c.command === "open_terminal").length)).toBe(0);
});

test("drag tabs and middle click closes exactly that tab", async ({ page }) => {
  await mockDesktop(page, true); await page.goto("/"); await page.getByRole("button", { name: "New tab", exact: true }).click(); await page.getByRole("button", { name: "New tab", exact: true }).click();
  const tabs = page.getByRole("tab"); await expect(tabs).toHaveCount(2);
  await page.locator(".tab").last().dragTo(page.locator(".tab").first());
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await tabs.first().click({ button: "middle" }); await expect(tabs).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => (window as any).testCalls.filter((c: any) => c.command === "close_terminal").length)).toBe(1);
});

test("detaches and returns the live terminal without reopening its process", async ({page}) => {
  await mockDesktop(page, true);
  await page.addInitScript(() => { (window as any).terminalOutput = "preserved output\r\n"; });
  await page.goto("/");
  await page.getByRole("button", {name: "New tab", exact: true}).click();
  await expect(page.locator(".xterm-rows")).toContainText("preserved output");
  await page.locator(".tab").first().click({button: "right"});
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("menuitem", {name: "Detach terminal", exact: true}).click();
  const popup = await popupPromise;
  await expect(popup.locator(".xterm-rows")).toContainText("preserved output");
  await expect(page.locator(".xterm-rows")).toHaveCount(0);
  await popup.getByRole("textbox", {name: "Terminal input"}).press("x");
  await expect.poll(() => page.evaluate(() => (window as any).testCalls.filter((call: any) => call.command === "write_terminal").length)).toBeGreaterThan(0);
  await page.locator(".tab").first().click({button: "right"});
  await page.getByRole("menuitem", {name: "Rename tab", exact: true}).click();
  await page.getByLabel("Tab name", {exact: true}).fill("Detached shell");
  await page.getByRole("button", {name: "Save changes", exact: true}).click();
  await expect(popup).toHaveTitle("Detached shell · TermiX");
  await popup.getByRole("button", {name: "Return to workspace"}).click();
  await expect(page.locator(".xterm-rows")).toContainText("preserved output");
  expect(await page.evaluate(() => (window as any).testCalls.filter((call: any) => call.command === "open_terminal").length)).toBe(1);
});

test("detached SSH reconnect works with R and keeps the main verification dialog", async ({page}) => {
  await mockDesktop(page, true);
  await page.addInitScript(() => {
    (window as any).hostStatus = "known";
    (window as any).savedSessions = [{id: "server", name: "Detach SSH", host: "example.test", port: 22, username: "ops", kind: "ssh", group: ""}];
  });
  await page.goto("/");
  await page.getByRole("button", {name: "Open session: Detach SSH", exact: true}).click();
  await page.getByRole("button", {name: "Connect", exact: true}).click();
  await page.locator(".tab").first().click({button: "right"});
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("menuitem", {name: "Detach terminal", exact: true}).click();
  const popup = await popupPromise;
  await page.evaluate(() => { (window as any).disconnectSsh = true; });
  await expect(popup.getByRole("button", {name: /^Reconnect/})).toBeVisible();
  await popup.getByRole("textbox", {name: "Terminal input"}).press("r");
  await expect(page.getByRole("dialog")).toContainText("example.test");
});

test("browse SFTP through verified SSH, transfer progress, cancel and report errors", async ({ page }) => {
  await mockDesktop(page, true); await page.addInitScript(() => { (window as any).hostStatus = "known"; (window as any).savedSessions = [{ id: "s1", name: "Server", host: "example.test", port: 22, username: "test-user", kind: "ssh", group: "" }]; });
  await page.goto("/"); await expect(page.getByRole("button", { name: "SFTP", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Open session: Server", exact: true }).click(); await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("button", { name: "SFTP", exact: true }).click(); const files = page.getByRole("region", { name: "Files", exact: true }); await expect(files.getByText("hello.txt", { exact: true })).toBeVisible();
  await files.getByRole("button", { name: "docs", exact: true }).click(); await expect(files.getByRole("textbox", { name: "Remote directory" })).toHaveValue("/home/test/docs");
  await preview(page, "TermiX-0.6.0-SFTP");
  await files.getByRole("button", { name: "Download: hello.txt", exact: true }).click(); await expect(files.getByRole("progressbar")).toHaveAttribute("value", "5");
  await files.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(files.getByRole("status")).toContainText("Paused");
  await expect(files.getByRole("progressbar")).toHaveAttribute("value", "5");
  await files.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(files.getByRole("status")).toContainText("Transferring");
  await page.setViewportSize({ width: 900, height: 600 }); await page.evaluate(() => document.documentElement.style.setProperty("--ui-scale", "1.5")); await expect(files.getByRole("button", { name: "Cancel", exact: true })).toBeInViewport({ ratio: 1 }); await preview(page, "TermiX-0.6.0-Transfer-150pct");
  await files.getByRole("button", { name: "Cancel", exact: true }).click(); await expect(files.getByRole("status")).toContainText("Cancelled");
  await page.evaluate(() => { (window as any).sftpFailure = "sftp_permission"; }); await files.getByRole("button", { name: "Open / refresh directory" }).click(); await expect(files.getByRole("alert")).toContainText("Access denied");
  const calls = await page.evaluate(() => (window as any).testCalls); expect(calls.filter((c: any) => c.command === "ssh_open")).toHaveLength(1); expect(calls.filter((c: any) => c.command === "sftp_list").every((c: any) => c.args.id === "ssh-test-connection")).toBe(true);
});
