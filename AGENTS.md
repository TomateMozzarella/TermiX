# Codex / AI contributor instructions for TermiX

Read [docs/ROADMAP.md](docs/ROADMAP.md) and [README.md](README.md) before changing code. The roadmap is the authoritative handoff for product goals, verified current state, milestone ordering, security requirements, and decisions from user discussions.

## v0.10 implementation resumed
The user resumed programming after the planning-only feedback on 2026-11-08. Keep the current language/architecture split; no language consolidation is requested. Implement the four UI decisions, compact grouped tab menus with named colour swatches and a factual SSH welcome, plus the v0.10 SSH-tunnel milestone. Single-target command execution is direct; no automatic command execution, external upload or tunnel restoration. Keep exact-source Windows/Linux/browser CI and immutable releases. v0.9 remains published until v0.10 is verified.

## Previous verified focus: v0.9 delivered
v0.9.0 is implemented, integrated into main and published on 2026-11-08. It fixes the installed terminal/Monaco runtime-style regressions and main-window close permission/guard coordination. Delivered: read-only Linux SSH monitoring, compact commands/context/double-click actions, SFTP mouse-back history, original safe external filenames, fixed-size scrollable settings, consistent rounded UI and up to six named existing terminal panes in a 3x2/2x3 grid. The displayed app version now derives from package.json.

Application/tag commit `4e54ab96b2ce798b1c0ee3aadc39ff1f65c041b2`; [build 42473674531](https://github.com/TomateMozzarella/TermiX/actions/runs/42473674531) passed 118 checks (37 native Windows, 36 frontend, 36 production browser, 8 receipt checks and one exact-collector check on real Linux). EXE/MSI packaging, a running-v0.8 upgrade preserving catalog/preferences/known-hosts/commands bytes, portable data/WebView isolation and a real native main-window close of the shipped portable app passed. [Publication 42475873920](https://github.com/TomateMozzarella/TermiX/actions/runs/42475873920) published the exact EXE/MSI/portable ZIP. EXE SHA-256 `38d79115a06f675ef9b2d3fc24f895debab99f2103a5d98a5fbdd347447616be` matches GitHub and the chat copy; portable ZIP SHA-256 `b352b8983c7185e279c7673d61a27944a47845fd1818712a61ee47bec7537c45`. Wider native gesture/editor/server interoperability, interactive uninstall choices, measured startup latency and independent review remain separate manual work.

Multi-Execute remains explicitly planned with visible selected targets and confirmation. Non-Linux monitoring, draggable/persistent grid ratios and wider compatibility remain follow-ups. Tunnels are v0.10 and protocol expansion v0.11 after the reported stability issues. Start future work from main; preserve immutable releases. Never disable script CSP protections to fix CSS, run arbitrary monitor commands, auto-upload edits or restart terminal processes during layout changes.

## Previous baseline: v0.8 delivered
The user requested v0.8 implementation on 2026-11-08: portable ZIP + installer in GitHub Releases, opt-in credential cleanup on EXE uninstall, saved command sidebar, compact SFTP icons/actions, no duplicate Files top button, styled first paint and nonmodal external editing with explicit transfer confirmation. This reprioritizes SSH tunnels to the following milestone. Portable data/WebView storage is executable-relative; Windows credentials remain on the PC in a separate portable namespace. Never package user data or auto-upload external edits. v0.8.0 is implemented, integrated into main and published on 2026-11-08.

Application/tag commit `81205dc3de017a3772955ecb9814ee8540efb8e9`; [build 42468504906](https://github.com/TomateMozzarella/TermiX/actions/runs/42468504906) passed 110 checks (35 native Windows, 35 frontend, 32 browser, 8 release-receipt), EXE/MSI packaging, a running-v0.7 upgrade with byte-identical catalog/preferences/known-hosts and portable startup from another working directory with isolated data/WebView. [Publication 42469661873](https://github.com/TomateMozzarella/TermiX/actions/runs/42469661873) published the exact EXE/MSI/portable ZIP. EXE SHA-256 `37cb0677fe93849221ecbb7e88774f922fc75d58e833092ec08af0a660244e24` matches GitHub and the chat copy. Portable ZIP SHA-256 `75a9db775685bea7eb9f96a1b6a9bd3ab14b5152d6e362c62c5e90597d45bf5e`. Interactive uninstall choices, wider editor/server interoperability and real startup timing remain manual validation items.

## Previous baseline: v0.7
**v0.7.0 is implemented, tested, integrated into main and published as a GitHub development prerelease (2026-11-04).** Application/tag commit: 1fe2f84a0412fb268b569351477f6cf25ef46131. Build 41901000165 passed 101 checks (31 native Windows, 34 frontend, 29 browser, 7 receipt tests), EXE/MSI packaging and an actual running-v0.6-to-v0.7 upgrade. Catalog/folders, preferences and known-hosts stayed byte-identical. Publication 41905892456 published the exact assets; EXE SHA-256 f632c2141da8e5847b1f9e2fda0fd93ead580991613cc1ac21c1ee7c4c94edf1 matches GitHub and the chat copy.

v0.7 adds direct external opening without Monaco or auto-upload; optional shared Sessions/SFTP navigation; expandable session/remote folders; categorized settings; visible find/replace, read-only comparison and editor maximize; richer context menus; two existing terminal panes; terminal search; a command palette and explicit-target memory-only snippets. Restoration saves bounded tab references/order/pins/colours and widths, never terminal output, commands or credentials. SSH reconnection always requires the normal explicit verification/authentication flow. Remote rendering is bounded and filters duplicate/cyclic paths. Keyboard focus and shortcut consumption are tested.

Non-Linux monitoring, configurable shortcut mappings, recording, draggable split ratios, persistent split/collapse state, detached/multi-monitor windows and printing/output recording remain follow-ups, not completed features. Native drag gestures, interactive installer cancellation, wider interoperability and independent security review remain manual. Start future work from main; never replace existing release assets. Browser tests use built production assets; the token-protected test preview lifecycle endpoint is not shipped.

## Latest UX decisions
- 2026-11-04 v0.7 feedback is recorded and delivered as described above. MobaXterm screenshots are workflow references, not instructions to copy every tool. Default shared navigation stays left; separate SFTP placement is configurable. Snippets are deliberately memory-only in this first release.
- New v0.6 requirements: WebView2 HTML drag events, left/right and initial SFTP directory settings, context menus, ANSI/terminal contrast, installer close offer and upgrade preservation; see ROADMAP. Monaco must remain lazy/local, with no CDN, and remote content conflicts must block save.
- The user resumed implementation and main/release delivery on 2026-11-03; the previous planning-only pause is revoked.
- v0.5 adds SFTP on the existing verified SSH connection, streamed file selection/transfers via native dialogs, progress/cancellation and partial-file commit. Local dual-pane navigation, Explorer drag/drop and recursive/resumable transfers remain planned. Layout widths/collapse states and tab order currently apply to the running workspace; v0.7 explicitly restores tab references/order/pins/colours and widths; split/collapse restoration remains a follow-up.
- v0.4 includes editing sessions, folder assignment, favorites/recent/import/export, readable UI text/UI scaling independent of terminal font size, friendly pasted URL normalization to SSH hosts, and editor EXE configuration/detection with manual override. Preserve strict host-key verification and never silently infer SSH port 80/443 from HTTP(S).
- Integrate completed tested milestones into main and publish versioned GitHub Releases with installers; use clearly labeled development prereleases while experimental. Windows CI checks out the exact PR head. Fast-forward main to the successful tested commit; the main-only release workflow validates that same PR artifact's source SHA/run/hashes before publishing. Do not overwrite existing releases. Documentation-only follow-ups on main keep the version/tag/artifacts unchanged.
- Modern, minimal, secure, fast and intuitive are persistent product priorities.
- English is the default; support English and German throughout the UI and settings. Setup asks language first, then shell, appearance and preferred editor; all remain editable later.
- Theme choices: automatic/system (default), dark and light. Support a few calm accent presets plus a custom colour with readable contrast. Appearance changes must not restart shells.
- Use a minimal flat >_ icon inspired by the user's terminal-symbol reference. Refresh this product's existing desktop/start-menu shortcuts with a separately named icon asset; do not clear global Windows icon caches or restart Explorer.
- Improve the Windows NSIS installer with matching icon, restrained header/sidebar artwork and English/German language choices. Do not claim modern web-style UI is possible in every native installer page.
- Preferred editor/path can be detected or selected manually. Monaco remains the default; v0.7 also offers direct configured external opening on a working copy. v0.8 detects stable external saves and asks to transfer; never execute editor paths during setup or auto-upload changes.
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

### Recursive SFTP folder upload (2026-11-08)
Added to v0.10: native folder selection, nested files and empty directories, aggregate byte progress and cancellation. Replacement remains opt-in. Links and special files are skipped and counted; traversal is bounded to 10,000 entries and 32 levels. Completed files/directories remain after cancellation; the current partial file is cleaned up. No automatic resume or Explorer folder drag/drop. Native Windows integration validation is pending.
