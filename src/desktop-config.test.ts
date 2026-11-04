import { describe, expect, it } from "vitest";
import config from "../src-tauri/tauri.conf.json";
describe("Windows WebView integration", () => {
  it("passes HTML drag events through WebView2 rather than native file interception", () => { expect(config.app.windows.every(w => w.dragDropEnabled === false)).toBe(true); });
  it("keeps embedded editor workers local and preserves app-data identity on upgrades", () => { expect(config.app.security.csp).toContain("worker-src 'self' blob:"); expect(config.identifier).toBe("dev.termix.desktop"); });
});
