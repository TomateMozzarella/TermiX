import { test, expect } from '@playwright/test';
import { mockDesktop, preview } from './desktop';
import { readFileSync } from 'node:fs';
const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
async function ssh(page: import('@playwright/test').Page) { await mockDesktop(page, true); await page.addInitScript(() => { const w = window as any; w.hostStatus = 'known'; w.savedSessions = [{ id: 'v9', name: 'Linux', kind: 'ssh', host: 'linux.test', port: 22, username: 'test', group: '' }]; w.terminalOutput = 'root@linux:~# https://example.test 192.168.1.2 WARNING\r\n'; }); await page.goto('/'); await page.getByRole('button', { name: 'Open session: Linux', exact: true }).click(); await page.getByRole('button', { name: 'Connect', exact: true }).click(); await page.evaluate(() => { (window as any).sshTerminalOutput = 'root@linux:~# https://example.test 192.168.1.2 WARNING\r\n'; }); }
test('production CSP with Tauri style hashes keeps cursor, terminal font and Monaco line layout', async ({ page }) => {
    const csp = config.app.security.csp.replace("style-src 'self' 'unsafe-inline';", "style-src 'self' 'unsafe-inline' 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';");
    await page.route('**/127.0.0.1:1429/', async (route) => { const response = await route.fetch(); await route.fulfill({ response, headers: { ...response.headers(), 'Content-Security-Policy': csp } }); });
    const violations: string[] = [];
    await page.exposeFunction('styleViolation', (s: string) => violations.push(s));
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => { if (e.violatedDirective.startsWith('style'))
        (window as any).styleViolation(e.violatedDirective); }));
    await ssh(page);
    await page.locator('.terminal-layer:visible .xterm').click({ position: { x: 20, y: 20 } });
    await expect(page.locator('.terminal-layer:visible .xterm-cursor')).toBeVisible();
    await expect.poll(() => page.locator('.terminal-layer:visible .xterm-rows').evaluate(e => getComputedStyle(e).fontFamily)).toContain('Consolas');
    await expect(page.locator('.terminal-layer:visible .xterm-rows')).toContainText('https://example.test');
    await expect.poll(() => page.locator('.terminal-layer:visible .xterm-rows span').evaluateAll(es => es.some(e => getComputedStyle(e).color === 'rgb(22, 110, 122)'))).toBe(true);
    await page.getByRole('button', { name: 'SFTP', exact: true }).click();
    await page.evaluate(() => { (window as any).editorText = 'services:\n  app:\n    image: nginx\n'; });
    await page.getByRole('button', { name: 'Edit: hello.txt', exact: true }).click();
    const editor = page.locator('.monaco-editor').first();
    await expect(editor.locator('.view-line')).toHaveCount(4);
    const lines = await editor.locator('.view-line').all();
    const a = await lines[0].boundingBox(), b = await lines[1].boundingBox();
    expect(b!.y - a!.y).toBeGreaterThan(10);
    expect(violations).toEqual([]);
    await preview(page, 'TermiX-0.9.0-Editor');
});
test('Linux monitoring, back mouse button and compact command context actions', async ({ page }) => {
    await ssh(page);
    const monitor = page.getByRole('complementary', { name: 'Remote monitoring', exact: true });
    await expect(monitor).toContainText('SSH 3');
    await expect(monitor).toContainText('78%');
    await monitor.getByRole('button', { name: 'Monitoring', exact: false }).click();
    const count = await page.evaluate(() => (window as any).testCalls.filter((c: any) => c.command === 'ssh_monitor').length);
    await page.waitForTimeout(5100);
    expect(await page.evaluate(() => (window as any).testCalls.filter((c: any) => c.command === 'ssh_monitor').length)).toBe(count);
    await page.evaluate(() => { (window as any).monitorFailure = true; });
    await monitor.getByRole('button', { name: 'Monitoring', exact: false }).click();
    await expect(monitor.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
    await page.evaluate(() => { (window as any).monitorFailure = false; });
    await monitor.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(monitor).toContainText('SSH 3');
    await page.getByRole('button', { name: 'SFTP', exact: true }).click();
    await page.getByRole('button', { name: 'docs', exact: true }).dblclick();
    await expect(page.getByLabel('Remote directory', { exact: true })).toHaveValue('/home/test/docs');
    await page.evaluate(() => window.dispatchEvent(new MouseEvent('mouseup', { button: 3, cancelable: true })));
    await expect(page.getByLabel('Remote directory', { exact: true })).toHaveValue('/home/test');
    await page.getByRole('button', { name: 'Commands', exact: true }).click();
    await page.getByRole('button', { name: 'New command', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill('Update');
    await page.getByLabel('Command', { exact: true }).fill('sudo apt update');
    await page.getByRole('button', { name: 'Save command', exact: true }).click();
    const command = page.getByRole('button', { name: 'Update', exact: true });
    await expect(page.locator('.saved-command-list pre')).toHaveCount(0);
    expect((await command.boundingBox())!.height).toBeLessThan(45);
    await command.click({ button: 'right' });
    await expect(page.getByRole('menuitem', { name: 'Edit command', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    page.once('dialog', d => d.accept());
    await command.dblclick();
    await expect.poll(() => page.evaluate(() => (window as any).testCalls.some((c: any) => c.command === 'write_terminal'))).toBe(true);
    await preview(page, 'TermiX-0.9.0-Commands');
});
test("settings keep their dimensions across categories and scroll the content", async ({ page }) => { await page.setViewportSize({ width: 1000, height: 650 }); await mockDesktop(page, true); await page.goto("/"); await page.getByRole("button", { name: "Settings", exact: true }).click(); const panel = page.getByRole("dialog"); const box = await panel.boundingBox(); for (const tab of await panel.getByRole("tab").all()) {
    await tab.click();
    const current = await panel.boundingBox();
    expect(Math.abs(current!.height - box!.height)).toBeLessThan(2);
    expect(current!.width).toBe(box!.width);
} await panel.getByRole("tab", { name: "Appearance", exact: true }).click(); expect(await panel.locator(".preferences-content").evaluate(e => e.scrollHeight > e.clientHeight)).toBe(true); await expect(panel.getByRole("button", { name: "Save changes", exact: true })).toBeInViewport(); });
test("six terminals share a grid without restarting; one close listener respects unsaved buffers", async ({ page }) => { await ssh(page); for (let i = 0; i < 4; i++)
    await page.getByRole("button", { name: "New tab", exact: true }).click(); await expect(page.locator(".tab")).toHaveCount(6); await page.locator(".tab").nth(1).click({ button: "right" }); await page.getByRole("menuitem", { name: "Show up to 6 terminals", exact: true }).click(); await expect(page.locator(".terminal-layer:visible")).toHaveCount(6); const boxes = await page.locator(".terminal-layer:visible").evaluateAll(es => es.map(e => { const r = e.getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y)}`; })); expect(new Set(boxes).size).toBe(6); await expect(page.locator(".split-pane-heading")).toHaveCount(6); await page.locator(".tab").last().click({ button: "middle" }); await expect(page.locator(".terminal-layer:visible")).toHaveCount(5); expect(await page.evaluate(() => (window as any).testCalls.filter((c: any) => c.command === "open_terminal").length)).toBe(5); await page.getByRole("button", { name: "SFTP", exact: true }).click(); await page.getByRole("button", { name: "Edit: hello.txt", exact: true }).click(); await page.locator(".monaco-editor textarea").first().focus(); await page.keyboard.press("Control+End"); await page.keyboard.type("dirty"); const close = () => page.evaluate(async () => { const w = window as any; const entries = Object.values(w.listeners).filter((e: any) => e.event === "tauri://close-requested") as any[]; if (entries.length !== 1)
    throw Error(`Expected one close listener, got ${entries.length}`); await w.callbacks[entries[0].handler]({ event: "tauri://close-requested", id: entries[0].handler, payload: {} }); }); page.once("dialog", d => d.dismiss()); await close(); expect(await page.evaluate(() => (window as any).testCalls.some((c: any) => c.command === "plugin:window|destroy"))).toBe(false); page.once("dialog", d => d.accept()); await close(); expect(await page.evaluate(() => (window as any).testCalls.some((c: any) => c.command === "plugin:window|destroy"))).toBe(true); });

