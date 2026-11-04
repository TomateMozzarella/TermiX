import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { include: ["monaco-editor/esm/vs/editor/editor.api", "monaco-editor/esm/vs/basic-languages/monaco.contribution", "monaco-editor/esm/vs/editor/contrib/find/browser/findController"] },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_"],
  build: { target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13" },
});
