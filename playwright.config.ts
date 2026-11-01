import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests", testMatch: "**/*.e2e.ts", fullyParallel: true,
  use: { browserName: "chromium", headless: true, baseURL: "http://127.0.0.1:1420", viewport: { width: 1280, height: 800 }, trace: "retain-on-failure" },
  webServer: { command: "node node_modules/vite/bin/vite.js --host 127.0.0.1", url: "http://127.0.0.1:1420", reuseExistingServer: !process.env.CI },
  reporter: "list",
});
