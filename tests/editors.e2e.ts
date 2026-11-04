import { test, expect } from "@playwright/test";
import { mockDesktop, preview } from "./desktop";
async function connected(page: import('@playwright/test').Page) {
 await mockDesktop(page, true); await page.addInitScript(() => { (window as any).hostStatus = 'known'; (window as any).savedSessions = [{ id: 'e1', name: 'Editor host', host: 'example.test', port: 22, username: 'test', kind: 'ssh', group: '' }]; });
 await page.goto('/'); await page.getByRole('button', { name: 'Open session: Editor host', exact: true }).click(); await page.getByRole('button', { name: 'Connect', exact: true }).click(); await page.getByRole('button', { name: 'Files', exact: true }).click();
}
test('SFTP placement/start path settings persist without respawning the terminal', async ({ page }) => {
 await connected(page); const files = page.getByRole('region', { name: 'Files', exact: true }); await expect(files).toBeVisible();
 expect((await files.boundingBox())!.x).toBeLessThan((await page.locator('.terminal-area').boundingBox())!.x);
 await page.getByRole('button', { name: 'Settings', exact: true }).click(); await page.getByRole('tab', { name: 'Files', exact: true }).click(); await page.getByLabel('SFTP layout', {exact: true}).selectOption('panel'); await page.getByLabel('SFTP position', { exact: true }).selectOption('right'); await page.getByLabel('SFTP starting directory', { exact: true }).fill('/srv'); await page.getByRole('tab', {name: 'Appearance', exact: true}).click(); await page.getByLabel('Terminal colour scheme', { exact: true }).selectOption('dark'); await page.getByRole('button', { name: 'Save changes', exact: true }).click();
 expect((await files.boundingBox())!.x).toBeGreaterThan((await page.locator('.terminal-area').boundingBox())!.x);
 await page.getByRole('button', { name: 'Close file browser', exact: true }).click(); await page.getByRole('button', { name: 'Files', exact: true }).click(); await expect(page.getByLabel('Remote directory', { exact: true })).toHaveValue('/srv');
 expect(await page.evaluate(() => (window as any).testCalls.filter((c: any) => c.command === 'open_terminal').length)).toBe(1);
});
test('sidebar and SFTP context menus create folders', async ({ page }) => {
 await connected(page); await page.getByRole('button', {name: 'Sessions', exact: true}).click(); await page.locator('.sidebar').click({ button: 'right' }); await page.getByRole('menuitem', { name: 'New folder', exact: true }).click(); await page.getByLabel('Folder name', { exact: true }).fill('Operations'); await page.getByRole('button', { name: 'Save folder', exact: true }).click(); await expect(page.getByRole('button', { name: 'Operations', exact: true })).toBeVisible();
 await page.getByRole('button', {name: 'Files', exact: true}).click(); await page.locator('.sftp-list').click({ button: 'right', position: { x: 20, y: 120 } }); await page.getByRole('menuitem', { name: 'New folder', exact: true }).click(); await page.getByLabel('Folder name', { exact: true }).fill('new-remote'); await page.getByRole('button', { name: 'Create', exact: true }).click(); await expect.poll(() => page.evaluate(() => (window as any).createdFolder)).toBe('new-remote');
});
test('Monaco editing saves explicitly and a server conflict preserves the dirty buffer', async ({ page }) => {
 await connected(page); await page.getByRole('button', { name: 'Edit: hello.txt', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'Remote editor', exact: true }); await expect(dialog.locator('.monaco-editor')).toBeVisible();
 const editor = dialog.locator('.monaco-editor textarea').first(); await editor.focus(); await page.keyboard.press('Control+A'); await page.keyboard.type('my new content');
 expect(await page.evaluate(() => (window as any).editorSaved)).toBeUndefined(); await dialog.getByRole('button', { name: 'Save to server', exact: true }).click(); await expect.poll(() => page.evaluate(() => (window as any).editorSaved)).toBe('my new content');
 await editor.focus(); await page.keyboard.press('Control+End'); await page.keyboard.type(' pending'); await page.evaluate(() => { (window as any).editorConflict = true; }); await dialog.getByRole('button', { name: 'Save to server', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('server file changed'); await expect(dialog.getByRole('tab')).toContainText('•'); await preview(page, 'TermiX-0.6.0-Editor');
 await page.setViewportSize({ width: 900, height: 600 }); await page.evaluate(() => document.documentElement.style.setProperty('--ui-scale', '1.5')); await expect(dialog.getByRole('button', { name: 'Save to server', exact: true })).toBeInViewport({ ratio: 1 });

 page.once('dialog', d => d.dismiss()); await dialog.getByRole('button', { name: 'Close editor', exact: true }).click(); await expect(dialog).toBeVisible();
 page.once('dialog', d => d.accept()); await dialog.getByRole('button', { name: 'Reload server file', exact: true }).click(); await expect(dialog.getByRole('button', { name: 'Save to server', exact: true })).toBeDisabled(); await expect(dialog.getByRole('tab')).not.toContainText('•');
});
