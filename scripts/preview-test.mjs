// Test the actual production assets; lazy editor dependencies must not trigger
// development-server dependency discovery/reloads during browser workflows.
import { spawnSync } from 'node:child_process';
for (const args of [['node_modules/typescript/bin/tsc'], ['node_modules/vite/bin/vite.js', 'build']]) {
  const result = spawnSync(process.execPath, args, {stdio: 'inherit'});
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const { preview } = await import('vite');
const token = process.env.TERMIX_TEST_SERVER_TOKEN;
if (!token) throw new Error('Missing browser-test server token');
const server = await preview({ preview: { host: '127.0.0.1', port: 1429, strictPort: true }, plugins: [{name:'test-preview-lifecycle', configurePreviewServer(server) {
  server.middlewares.use((request, response, next) => {
    if (request.method !== 'POST' || request.url !== '/__termix_test_shutdown' || request.headers['x-termix-test-token'] !== token) return next();
    response.writeHead(200); response.end('stopping');
    setTimeout(() => { server.httpServer.close(); process.exit(0); }, 100);
  });
}}] });
