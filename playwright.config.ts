import { randomUUID } from "node:crypto";
import { defineConfig } from "@playwright/test";

process.env.TERMIX_TEST_SERVER_TOKEN ??= randomUUID();
export default defineConfig({
  globalTeardown: "./scripts/stop-preview.mjs",
  testDir: "./tests", testMatch: "**/*.e2e.ts", fullyParallel: true,
  use: { browserName: "chromium", headless: true, baseURL: "http://127.0.0.1:1429", viewport: { width: 1280, height: 800 }, trace: "retain-on-failure" },
  webServer: { command: "node scripts/preview-test.mjs", timeout: 120000, url: "http://127.0.0.1:1429", reuseExistingServer: false },
  reporter: "list",
});
