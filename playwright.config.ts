import { randomUUID } from "node:crypto";
import { defineConfig } from "@playwright/test";

process.env.TERMIX_TEST_SERVER_TOKEN ??= randomUUID();
const previewUrl = `http://127.0.0.1:${process.env.TERMIX_TEST_PORT ?? "1429"}`;
export default defineConfig({
  globalTeardown: "./scripts/stop-preview.mjs",
  testDir: "./tests", testMatch: "**/*.e2e.ts", fullyParallel: true,
  use: { browserName: "chromium", headless: true, baseURL: previewUrl, viewport: { width: 1280, height: 800 }, trace: "retain-on-failure" },
  webServer: { command: "node scripts/preview-test.mjs", timeout: 120000, url: previewUrl, reuseExistingServer: false },
  reporter: "list",
});
