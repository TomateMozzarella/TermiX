# Codex / AI contributor instructions for TermiX

Read [docs/ROADMAP.md](docs/ROADMAP.md) and [README.md](README.md) before changing code. The roadmap is the authoritative handoff for product goals, verified current state, milestone ordering, security requirements, and decisions from user discussions.

## Current focus
**v0.3.0 SSH plus expanded onboarding/appearance is implemented as a verified Windows test build (2026-11-02).** See docs/ROADMAP.md for the exact delivered application commit, successful workflow and installer hash. All 34 automated tests and silent installer/desktop-shortcut checks passed. User installed-app validation and independent security review remain separate and pending; read docs/SECURITY.md. The next planned milestone is v0.4.0 session management. Keep local terminals and old saved sessions working; do not jump to SFTP/editor implementation.

## Latest UX decisions
- Modern, minimal, secure, fast and intuitive are persistent product priorities.
- English is the default; support English and German throughout the UI and settings. Setup asks language first, then shell, appearance and preferred editor; all remain editable later.
- Theme choices: automatic/system (default), dark and light. Support a few calm accent presets plus a custom colour with readable contrast. Appearance changes must not restart shells.
- Use a minimal flat >_ icon inspired by the user's terminal-symbol reference. Refresh this product's existing desktop/start-menu shortcuts with a separately named icon asset; do not clear global Windows icon caches or restart Explorer.
- Improve the Windows NSIS installer with matching icon, restrained header/sidebar artwork and English/German language choices. Do not claim modern web-style UI is possible in every native installer page.
- Preferred editor is a saved choice/reference only for now; Monaco, external editing and SFTP synchronization remain later milestones. Never execute editor paths during setup.
- Choose the default local shell in a first-run setup assistant, then change it in working settings. No raw shell dropdown in the sidebar.
- Use one shared logo source for the interface, title/taskbar icon and installer; preserve .ico bundling.
- Remove the floating top-bar “Bereit” label; keep a single meaningful footer status.
- Keep the dark interface consistent, readable and polished, including terminal scrollbars and font size. Changing settings must not restart running shells.
- Persist only typed non-secret preferences in Rust; validate and atomically replace settings. Test setup completion/relaunch, cancellation, save failures and tab continuity.

## Architecture
- Tauri 2 + Rust backend; React/TypeScript/Vite frontend; xterm.js renderer.
- Privileged processes and transports stay in Rust; UI uses narrowly scoped typed IPC.
- Preserve existing UI and session persistence unless migration is deliberate and tested.
- Windows 11 first, maintain future Linux portability.

## Required behavior
- Avoid security shortcuts: never persist secrets in JSON/localStorage, never auto-trust changed SSH host keys, never log passwords/private keys.
- When implementing SSH, prefer OS credential vault, agent and existing encrypted key files; see roadmap.
- Use tests and CI for every milestone. Keep the Windows installer working; do not regress .ico bundle config.
- Prefer minimal, auditable dependencies; review privileges and error handling.
- Do not claim planned features are already implemented.
- User wants GitHub Actions downloadable installers, not local compilation instructions.
- Update docs/ROADMAP.md and README.md when milestones or verified behavior change.
- The planned default embedded editor is Monaco; external editor configuration must allow Notepad++.

## Definition of done for v0.2.0
Real interactive local shell in the app, streaming bidirectional PTY data, resize support, correct terminal cleanup, multi-tab behavior, Windows installer build and tested error handling. WSL/pwsh/Git Bash can be optional discovery after PowerShell/CMD.
