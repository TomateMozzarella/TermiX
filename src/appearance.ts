import type { Preferences } from "./services/preferences";
export type ResolvedTheme = "light" | "dark";
export function resolvedTheme(theme: Preferences["theme"], dark: boolean): ResolvedTheme { return theme === "system" ? dark ? "dark" : "light" : theme; }
export function accentForeground(hex: string) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return "#102529";
  const linear = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  const luminance = .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
  // Choose the higher-contrast black/white foreground (at least 4.5:1).
  return (luminance + .05) / .05 >= 1.05 / (luminance + .05) ? "#000000" : "#ffffff";
}
export function terminalTheme(theme: ResolvedTheme, accent: string) {
  return theme === "light" ? { background: "#f7f9fc", foreground: "#233047", cursor: accentText(accent, "light"), selectionBackground: "#b7d0eb99", black: "#27334a", red: "#ae2540", green: "#236f48", yellow: "#866216", blue: "#235eac", magenta: "#8740a6", cyan: "#166e7a", white: "#d8dfeb", brightBlack: "#67758b", brightWhite: "#ffffff" } : { background: "#10141c", foreground: "#d7deea", cursor: accentText(accent, "dark"), selectionBackground: "#698ab455" };
}
export function accentText(hex: string, theme: ResolvedTheme): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return theme === "dark" ? "#d7deea" : "#233047";
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const luminance = (values: number[]) => values.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
  const bg = luminance(theme === "dark" ? [20, 29, 43] : [255, 255, 255]);
  for (let step = 0; step <= 20; step++) {
    const amount = step / 20, target = theme === "dark" ? 255 : 0;
    const values = rgb.map(v => Math.round(v + (target - v) * amount));
    const fg = luminance(values);
    if ((Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05) >= 4.5) return "#" + values.map(v => v.toString(16).padStart(2, "0")).join("");
  }
  return theme === "dark" ? "#ffffff" : "#000000";
}
