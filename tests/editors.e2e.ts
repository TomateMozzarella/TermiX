import { test, expect } from "@playwright/test";
import { mockDesktop, preview } from "./desktop";
async function connected(page: import('@playwright/test').Page) {
 await mockDesktop(page, true); await page.addInitScript(() => { (window as any).hostStatus = 'known'; (window as any).savedSessions = [{ id: 'e1', name: 'Editor host', host: 'example.test', port: 22, username: 'test', kind: 'ssh', group: '' }]; });
 await page.goto('/'); await page.getByRole('button', { name: 'Open session: Editor host', exact: true }).click(); await page.getByRole('button', { name: 'Connect', exact: true }).click(); await page.getByRole('button', { name: "SFTP", exact: true }).click();
}
test('a dropped file waits for confirmation before upload', async ({page}) => {
 await connected(page);
 const drop = page.getByText('Drop a local file to upload (up to 8 MiB)', {exact: true});
 const dataTransfer = await page.evaluateHandle(() => {
  const data = new DataTransfer();
  data.items.add(new File(['hello'], 'drop.txt'));
  return data;
 });
 await drop.dispatchEvent('drop', {dataTransfer});
 const dialog = page.getByRole('dialog', {name: 'Confirm file upload'});
 await expect(dialog).toContainText('drop.txt');
 await expect(dialog).toContainText('/home/test');
 expect(await page.evaluate(() => (window as any).testCalls.some((call: any) => call.command === 'sftp_dropped_upload'))).toBe(false);
 await dialog.getByRole('button', {name: 'Upload file…', exact: false}).click();
 await expect.poll(() => page.evaluate(() => (window as any).testCalls.find((call: any) => call.command === 'sftp_dropped_upload')?.args)).toMatchObject({
  name: 'drop.txt', encoded: 'aGVsbG8=', directory: '/home/test', overwrite: false,
 });
});

test('local SFTP browser opens a selected folder and navigates by token', async ({page}) => {
 await connected(page);
 const local = page.getByRole('region', {name: 'Local files', exact: true});
 await local.getByRole('button', {name: 'Local files', exact: true}).click();
 await local.getByRole('button', {name: 'Choose folder…'}).click();
 await expect(local.getByRole('button', {name: 'Local parent folder'})).toBeDisabled();
 await local.getByRole('button', {name: 'Docs', exact: true}).click();
 await expect(local).toContainText('notes.txt');
 expect(await page.evaluate(() => (window as any).testCalls.find((call: any) => call.command === 'sftp_local_list').args.token)).toBe('docs-token');
 await local.getByRole('button', {name: /Upload.*notes.txt/}).click();
 expect(await page.evaluate(() => {
  const args = (window as any).testCalls.find((call: any) => call.command === 'sftp_local_upload').args;
  return {token: args.token, overwrite: args.overwrite, directory: args.directory, path: args.path};
 })).toEqual({token: 'notes-token', overwrite: false, directory: '/home/test'});
 await local.getByRole('button', {name: 'Local parent folder'}).click();
 await expect(local.getByRole('button', {name: 'Docs', exact: true})).toBeVisible();
 await expect(local).not.toContainText('notes.txt');
 const path = local.getByRole('textbox', {name: 'Local folder path'});
 await path.fill('C:\\Local\\Docs');
 await path.press('Enter');
 await expect(local).toContainText('notes.txt');
 await local.getByRole('searchbox', {name: 'Search local files'}).fill('no match');
 await expect(local).not.toContainText('notes.txt');
});

test('local SFTP folder upload uses the listed folder token and remote directory', async ({page}) => {
 await connected(page);
 const local = page.getByRole('region', {name: 'Local files', exact: true});
 await local.getByRole('button', {name: 'Local files', exact: true}).click();
 await local.getByRole('button', {name: 'Choose folder…'}).click();
 await local.getByRole('button', {name: 'Upload folder: Docs', exact: true}).click();
 const args = await page.evaluate(() => (window as any).testCalls.find((call: any) => call.command === 'sftp_local_upload').args);
 expect(args).toMatchObject({token: 'docs-token', directory: '/home/test', overwrite: false, folder: true});
 expect(args.path).toBeUndefined();
 const transfer = page.locator('.sftp-progress');
 await transfer.getByRole('button', {name: 'Pause', exact: true}).click();
 await expect(transfer).toContainText('Paused');
 await expect(transfer.getByRole('progressbar')).toHaveAttribute('value', '5');
 await transfer.getByRole('button', {name: 'Resume', exact: true}).click();
 await expect(transfer).toContainText('Transferring');
});

test('local SFTP download starts Save As with the active local folder', async ({page}) => {
 await connected(page);
 const local = page.getByRole('region', {name: 'Local files', exact: true});
 await local.getByRole('button', {name: 'Local files', exact: true}).click();
 await local.getByRole('button', {name: 'Choose folder…'}).click();
 const download = local.getByRole('button', {name: 'Download selected file to local folder'});
 await expect(download).toBeDisabled();
 await page.locator('.sftp-list').getByRole('button', {name: /^hello\.txt/}).click();
 await download.click();
 const args = await page.evaluate(() => (window as any).testCalls.find((call: any) => call.command === 'sftp_download').args);
 expect(args).toMatchObject({path: '/home/test/hello.txt', useLocalFolder: true});
 expect(args.directory).toBeUndefined();
});

test('SFTP placement/start path settings persist without respawning the terminal', async ({ page }) => {
 await connected(page); const files = page.getByRole('region', { name: 'Files', exact: true }); await expect(files).toBeVisible();
 expect((await files.boundingBox())!.x).toBeLessThan((await page.locator('.terminal-area').boundingBox())!.x);
 await page.getByRole('button', { name: 'Settings', exact: true }).click(); await page.getByRole('tab', { name: 'Files', exact: true }).click(); await page.getByLabel('SFTP layout', {exact: true}).selectOption('panel'); await page.getByLabel('SFTP position', { exact: true }).selectOption('right'); await page.getByLabel('SFTP starting directory', { exact: true }).fill('/srv'); await page.getByRole('tab', {name: 'Appearance', exact: true}).click(); await page.getByLabel('Terminal colour scheme', { exact: true }).selectOption('dark'); await page.getByRole('button', { name: 'Save changes', exact: true }).click();
 expect((await files.boundingBox())!.x).toBeGreaterThan((await page.locator('.terminal-area').boundingBox())!.x);
 await page.getByRole('button', { name: 'Close file browser', exact: true }).click(); await page.getByRole('button', { name: "SFTP", exact: true }).click(); await expect(page.getByLabel('Remote directory', { exact: true })).toHaveValue('/srv');
 expect(await page.evaluate(() => (window as any).testCalls.filter((c: any) => c.command === 'open_terminal').length)).toBe(0);
});
test('formats JSON without changing numeric literals or saving automatically', async ({ page }) => {
 await connected(page);
 await page.evaluate(() => { (window as any).editorText = '{"value":9007199254740993,"value":2}'; });
 await page.getByRole('button', { name: 'Edit: hello.txt', exact: true }).click();
 const dialog = page.getByRole('dialog', {name: 'TermiX Editor'});
 await dialog.getByLabel('Remote file path').fill('/home/test/sample.json');
 await dialog.getByRole('button', {name: 'Open file', exact: true}).click();
 await dialog.getByRole('button', {name: 'Format document'}).click();
 await expect(dialog.getByRole('tab', {name: 'sample.json •'})).toBeVisible();
 expect(await page.evaluate(() => (window as any).editorSaved)).toBeUndefined();
 await dialog.getByRole('button', {name: 'Save to server'}).click();
 await expect.poll(() => page.evaluate(() => (window as any).editorSaved)).toMatch(/\r?\n[ \t]+"value": 9007199254740993,\r?\n[ \t]+"value": 2/);
});
for (const sample of [
 { extension: 'css', input: 'body{color:red}', formatted: /body\s*\{\s+color: red/ },
 { extension: 'html', input: '<main><p>hello</p><p>world</p></main>', formatted: /<main>\s+<p>hello<\/p>\s+<p>world<\/p>/ },
]) {
 test(`formats ${sample.extension.toUpperCase()} on request`, async ({ page }) => {
  await connected(page);
  await page.evaluate(input => { (window as any).editorText = input; }, sample.input);
  await page.getByRole('button', { name: 'Edit: hello.txt', exact: true }).click();
  const dialog = page.getByRole('dialog', {name: 'TermiX Editor'});
  await dialog.getByLabel('Remote file path').fill(`/home/test/sample.${sample.extension}`);
  await dialog.getByRole('button', {name: 'Open file', exact: true}).click();
  await dialog.getByRole('button', {name: 'Format document'}).click();
  await dialog.getByRole('button', {name: 'Save to server'}).click();
  await expect.poll(() => page.evaluate(() => (window as any).editorSaved)).toMatch(sample.formatted);
 });
}
test('sidebar and SFTP context menus create folders', async ({ page }) => {
 await connected(page); await page.getByRole('button', {name: 'Sessions', exact: true}).click(); await page.locator('.side-heading').click({ button: 'right', position: { x: 10, y: 10 } }); await page.getByRole('menuitem', { name: 'New folder', exact: true }).click(); await page.getByLabel('Folder name', { exact: true }).fill('Operations'); await page.getByRole('button', { name: 'Save folder', exact: true }).click(); await expect(page.getByRole('button', { name: 'Operations', exact: true })).toBeVisible();
 await page.getByRole('button', {name: "SFTP", exact: true}).click(); await page.locator('.sftp-list').click({ button: 'right', position: { x: 20, y: 120 } }); await page.getByRole('menuitem', { name: 'New folder', exact: true }).click(); await page.getByLabel('Folder name', { exact: true }).fill('new-remote'); await page.getByRole('button', { name: 'Create', exact: true }).click(); await expect.poll(() => page.evaluate(() => (window as any).createdFolder)).toBe('new-remote');
});
test('Monaco editing saves explicitly and a server conflict preserves the dirty buffer', async ({ page }) => {
 await connected(page); await page.getByRole('button', { name: 'Edit: hello.txt', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'TermiX Editor', exact: true }); await expect(dialog.locator('.monaco-editor')).toBeVisible();
 const editor = dialog.locator('.monaco-editor textarea').first(); await editor.focus(); await page.keyboard.press('Control+A'); await page.keyboard.type('my new content');
 expect(await page.evaluate(() => (window as any).editorSaved)).toBeUndefined(); await dialog.getByRole('button', { name: 'Save to server', exact: true }).click(); await expect.poll(() => page.evaluate(() => (window as any).editorSaved)).toBe('my new content');
 await editor.focus(); await page.keyboard.press('Control+End'); await page.keyboard.type(' pending'); await page.evaluate(() => { (window as any).editorConflict = true; }); await dialog.getByRole('button', { name: 'Save to server', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('server file changed'); await expect(dialog.getByRole('tab')).toContainText('•'); await preview(page, 'TermiX-0.6.0-Editor');
 await page.setViewportSize({ width: 900, height: 600 }); await page.evaluate(() => document.documentElement.style.setProperty('--ui-scale', '1.5')); await expect(dialog.getByRole('button', { name: 'Save to server', exact: true })).toBeInViewport({ ratio: 1 });

 await dialog.getByRole('button', { name: 'Close editor', exact: true }).click(); await expect(dialog).toBeHidden(); await page.getByRole('button', {name:'TermiX Editor', exact:true}).click(); await expect(dialog).toBeVisible(); await expect(dialog.getByRole('tab')).toContainText('•');
 await dialog.getByRole('button', { name: 'Reload server file', exact: true }).click(); await page.getByRole('button', {name:'Confirm',exact:true}).click(); await expect(dialog.getByRole('button', { name: 'Save to server', exact: true })).toBeDisabled(); await expect(dialog.getByRole('tab')).not.toContainText('•');
});

test('retains same-named files from distinct paths and compares either order', async ({page}) => {
 await connected(page);
 await page.getByRole('button', {name: 'Edit: hello.txt', exact: true}).click();
 const dialog = page.getByRole('dialog', {name: 'TermiX Editor'});
 const path = dialog.getByRole('textbox', {name: 'Remote file path'});
 for (const directory of ['app', 'db']) {
  await path.fill(`/home/${directory}/docker-compose.yaml`);
  await path.press('Enter');
  await expect(dialog.getByRole('tab')).toHaveCount(directory === 'app' ? 2 : 3);
 }
 await expect(dialog.getByRole('tab', {name: '/home/app/docker-compose.yaml'})).toBeVisible();
 await expect(dialog.getByRole('tab', {name: '/home/db/docker-compose.yaml'})).toBeVisible();
 await dialog.getByRole('button', {name: 'Compare files'}).click();
 await dialog.getByRole('combobox', {name: 'Original', exact: true}).selectOption('/home/app/docker-compose.yaml');
 await expect(dialog.getByRole('combobox', {name: 'Compare with', exact: true})).toHaveValue('/home/db/docker-compose.yaml');
 await dialog.getByRole('button', {name: 'Swap files'}).click();
 await expect(dialog.getByRole('combobox', {name: 'Original', exact: true})).toHaveValue('/home/db/docker-compose.yaml');
 await page.mouse.click(2, 2);
 await expect(dialog).toBeHidden();
 await page.getByRole('button', {name: 'TermiX Editor', exact: true}).click();
 await expect(dialog.getByRole('tab')).toHaveCount(3);
});
