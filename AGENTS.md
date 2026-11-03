# Codex / AI contributor instructions for TermiX

Read [docs/ROADMAP.md](docs/ROADMAP.md) and [README.md](README.md) before changing code. The roadmap is the authoritative handoff for product goals, verified current state, milestone ordering, security requirements, and decisions from user discussions.

## Current focus
**v0.4.0 is implemented, tested, integrated into main and published as a GitHub development prerelease (2026-11-03).** Application/tag commit: fb51f303d07f3ea375156be3af57679d3a6720ac. All 80 tests passed, plus EXE/MSI packaging and silent installation verifying executable version 0.4.0 and desktop-shortcut icon. See docs/ROADMAP.md and docs/SECURITY.md for provenance, scope and remaining installed interactive checks/security review.

The active milestone is v0.5.0 SFTP/file browsing plus the 2026-11-03 workspace feedback: session-folder drag/drop, sidebar/file-panel resizing, collapsible groups, tab reorder and middle-click close. Monitoring is recorded as a Linux-first v0.5.x follow-up with explicit support/error states. Do not claim it is implemented. Start future work from main and preserve the local/SSH terminals, session catalog migration, settings and strict credential/host-key boundaries. Actual editing remains v0.6.0 and macros v0.7.0.

## Latest UX decisions
- The user resumed implementation and main/release delivery on 2026-11-03; the previous planning-only pause is revoked.
- v0.4 includes editing sessions, folder assignment, favorites/recent/import/export, readable UI text/UI scaling independent of terminal font size, friendly pasted URL normalization to SSH hosts, and editor EXE configuration/detection with manual override. Preserve strict host-key verification and never silently infer SSH port 80/443 from HTTP(S).
- Integrate completed tested milestones into main and publish versioned GitHub Releases with installers; use clearly labeled development prereleases while experimental. Windows CI checks out the exact PR head. Fast-forward main to the successful tested commit; the main-only release workflow validates that same PR artifact's source SHA/run/hashes before publishing. Do not overwrite existing releases. Documentation-only follow-ups on main keep the version/tag/artifacts unchanged.
- Modern, minimal, secure, fast and intuitive are persistent product priorities.
- English is the default; support English and German throughout the UI and settings. Setup asks language first, then shell, appearance and preferred editor; all remain editable later.
- Theme choices: automatic/system (default), dark and light. Support a few calm accent presets plus a custom colour with readable contrast. Appearance changes must not restart shells.
- Use a minimal flat >_ icon inspired by the user's terminal-symbol reference. Refresh this product's existing desktop/start-menu shortcuts with a separately named icon asset; do not clear global Windows icon caches or restart Explorer.
- Improve the Windows NSIS installer with matching icon, restrained header/sidebar artwork and English/German language choices. Do not claim modern web-style UI is possible in every native installer page.
- Preferred editor/path can be detected or selected manually; Monaco, actual external editing and SFTP synchronization remain later milestones. Never execute editor paths during setup.
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
- User wants GitHub Releases with downloadable Windows installers backed by CI, not local compilation instructions. Also provide the EXE directly in chat outputs when possible because private artifact links previously produced browser 404 errors.
- Update docs/ROADMAP.md and README.md when milestones or verified behavior change.
- The planned default embedded editor is Monaco; external editor configuration must allow Notepad++.

## Definition of done for v0.2.0
Real interactive local shell in the app, streaming bidirectional PTY data, resize support, correct terminal cleanup, multi-tab behavior, Windows installer build and tested error handling. WSL/pwsh/Git Bash can be optional discovery after PowerShell/CMD.
