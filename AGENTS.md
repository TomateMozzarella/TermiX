# Codex / AI contributor instructions for TermiX

Read [docs/ROADMAP.md](docs/ROADMAP.md) and [README.md](README.md) before changing code. The roadmap is the authoritative handoff for product goals, verified current state, milestone ordering, security requirements, and decisions from user discussions.

## v0.7 work in progress
The user explicitly requested implementation of v0.7 on 2026-11-04 after testing v0.6. Record new feedback and verify direct external opening (no Monaco import), optional shared SFTP/library sidebar, expandable folders, settings categories, visible search/replace, compare and editor maximize, context menus, split terminals, explicit-target snippets and safe metadata-only restoration. See the v0.7 roadmap section. Do not mark v0.7 released before all checks and publication finish.

## Current focus
**v0.6.0 is implemented, tested, integrated into main and published as a GitHub development prerelease (2026-11-04).** Application/tag commit: 003aa027d8d6440089a10023ce109a383d8b6169. Build 41885597244 passed 92 tests (28 native Windows, 34 frontend, 23 browser, 7 receipt checks), EXE/MSI packaging and a real upgrade from running v0.5 to v0.6. Catalog/folders, preferences and known-hosts files remained byte-identical. Publication 41887809158 published those exact assets; EXE SHA-256 2778527934f3be61b16c3c696ce926ec8d3cc57653d40a6de47e65e1555a372c matches the chat copy and asset digest.

v0.6 delivers local lazy Monaco remote editing, explicit external working copies, content-conflict protection/reload, Windows HTML drag handling, SFTP side/start-directory settings, context menus, readable ANSI palettes and accessible save/cancel controls at compact UI scales. Native GUI dragging and interactive installer cancellation, broader server/editor interoperability and independent security review remain manual items; see ROADMAP and SECURITY. Linux-first SSH monitoring remains pending after the user advanced to v0.6. Macros/split panes remain v0.7. Start follow-ups from main; never replace existing release assets.

## Latest UX decisions
- New v0.6 requirements: WebView2 HTML drag events, left/right and initial SFTP directory settings, context menus, ANSI/terminal contrast, installer close offer and upgrade preservation; see ROADMAP. Monaco must remain lazy/local, with no CDN, and remote content conflicts must block save.
- The user resumed implementation and main/release delivery on 2026-11-03; the previous planning-only pause is revoked.
- v0.5 adds SFTP on the existing verified SSH connection, streamed file selection/transfers via native dialogs, progress/cancellation and partial-file commit. Local dual-pane navigation, Explorer drag/drop and recursive/resumable transfers remain planned. Layout widths/collapse states and tab order currently apply to the running workspace; persistent layout restoration remains v0.7.
- v0.4 includes editing sessions, folder assignment, favorites/recent/import/export, readable UI text/UI scaling independent of terminal font size, friendly pasted URL normalization to SSH hosts, and editor EXE configuration/detection with manual override. Preserve strict host-key verification and never silently infer SSH port 80/443 from HTTP(S).
- Integrate completed tested milestones into main and publish versioned GitHub Releases with installers; use clearly labeled development prereleases while experimental. Windows CI checks out the exact PR head. Fast-forward main to the successful tested commit; the main-only release workflow validates that same PR artifact's source SHA/run/hashes before publishing. Do not overwrite existing releases. Documentation-only follow-ups on main keep the version/tag/artifacts unchanged.
- Modern, minimal, secure, fast and intuitive are persistent product priorities.
- English is the default; support English and German throughout the UI and settings. Setup asks language first, then shell, appearance and preferred editor; all remain editable later.
- Theme choices: automatic/system (default), dark and light. Support a few calm accent presets plus a custom colour with readable contrast. Appearance changes must not restart shells.
- Use a minimal flat >_ icon inspired by the user's terminal-symbol reference. Refresh this product's existing desktop/start-menu shortcuts with a separately named icon asset; do not clear global Windows icon caches or restart Explorer.
- Improve the Windows NSIS installer with matching icon, restrained header/sidebar artwork and English/German language choices. Do not claim modern web-style UI is possible in every native installer page.
- Preferred editor/path can be detected or selected manually. v0.6 uses Monaco by default and can explicitly launch that configured editor on a working copy. Reload and server save are manual; never execute editor paths during setup or auto-upload changes.
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
