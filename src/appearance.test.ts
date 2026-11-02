import { describe, expect, it } from "vitest";
import { accentForeground, accentText, resolvedTheme } from "./appearance";
const lum = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
describe("accessible appearance", () => {
  it("follows the system only in automatic mode", () => { expect(resolvedTheme("system", false)).toBe("light"); expect(resolvedTheme("system", true)).toBe("dark"); expect(resolvedTheme("light", true)).toBe("light"); expect(resolvedTheme("dark", false)).toBe("dark"); });
  it("retains readable text for extreme and custom accents in both themes", () => {
    for (const colour of ["#000000", "#ffffff", "#ff0000", "#005533", "#b692f6", "#71c9bd"]) {
      expect(contrast(colour, accentForeground(colour))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(accentText(colour, "dark"), "#141d2b")).toBeGreaterThanOrEqual(4.5);
      expect(contrast(accentText(colour, "light"), "#ffffff")).toBeGreaterThanOrEqual(4.5);
    }
  });
});
