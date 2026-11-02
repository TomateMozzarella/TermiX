# TermiX – Product Roadmap and Project Handoff

Last updated: 2026-11-02
Status: v0.3.0 implemented and Windows test installer verified. SSH, expanded setup, language, appearance, editor preference and Windows branding are delivered. User installed-app/interoperability checks and independent security review remain outstanding. Next planned milestone: v0.4.0 session manager.
Repository: https://github.com/TomateMozzarella/TermiX

## Vision
Build a polished, modern, cross-platform MobaXterm-style terminal and remote-connection manager, initially optimized for Windows 11, with Linux support later. The user prefers downloadable GitHub Actions installers and does not want to compile locally. Keep a compact desktop interface with automatic/dark/light appearance and customizable accents.

## Verified current state
- v0.2.0: user confirmed “funktioniert” and supplied a screenshot of an interactive PowerShell terminal on 2026-11-01. This confirms basic installed-app operation, not every manual edge case.
- All five frontend lifecycle tests, six real Windows PTY tests, and both Windows installers passed [Actions run 41341535773](https://github.com/TomateMozzarella/TermiX/actions/runs/41341535773).
- Tauri 2 + Rust backend; React + TypeScript + Vite frontend; xterm.js terminal rendering; lucide-react icons.
- Dark UI with workspace/sidebar, search, session categories, saved-session area, terminal tabs and status bar.
- Session create/delete/list persistence in the Rust backend (current JSON storage).
- The user installed and opened the Windows build successfully and provided a screenshot. The UI runs.
- GitHub Actions Windows installer build SUCCESS: https://github.com/TomateMozzarella/TermiX/actions/runs/41336575518
- The previous packaging issue was a missing Windows .ico bundle icon. Preserve bundle.icon = ["icons/icon.ico", "icons/icon.png"] in src-tauri/tauri.conf.json. v0.2.1 generates these from the shared public/termix.svg with the Tauri icon CLI, replacing the temporary TX artwork.
- v0.1.0 baseline: xterm.js shows placeholder output; no real terminal transport. The v0.2.0 implementation below replaces this for local tabs only. SSH, SFTP, editor, tunnels, RDP, serial and X11 remain planned.
- Windows build artifacts are uploaded as TermiX-Windows-Installer by .github/workflows/windows-build.yml.
- v0.3.0 adds a working SSH engine to the local-terminal baseline. It remains a test build with manual failure-path checks and independent security review outstanding.

## Technology decisions
- KEEP Tauri 2 / Rust / React / TypeScript / xterm.js. Tauri is the desktop framework, not the design system; frontend appearance is independently customizable.
- Rust backend owns privileged operations, shell processes, authentication, file operations and protocol engines. React owns UI and xterm.js display.
- Use typed, narrow Tauri IPC and explicit capabilities. Avoid generic arbitrary command execution from webview.
- Consider a refined component system (e.g. Tailwind + shadcn/ui) later, without sacrificing the current dark look or blocking core functionality.
- On Windows use ConPTY via a maintained Rust PTY abstraction (evaluate portable-pty) for local interactive terminals; xterm.js is the renderer, not a shell.
- Default local shell: Windows PowerShell; support CMD, PowerShell 7, WSL distributions and optionally Git Bash with user-selectable profiles. MobaXterm's local Unix-like environment is Cygwin-based; TermiX intentionally uses native shell profiles instead of pretending xterm.js provides Unix commands.

## Milestones (in order)
### v0.2.0 – Real local terminal [IMPLEMENTED; BASIC INSTALLED USE CONFIRMED]
Implementation update (2026-11-01):
- Added portable-pty 0.9.0 with native ConPTY, allowlisted Windows PowerShell/CMD profiles and a future-portable /bin/sh profile.
- Narrow open/read/write/resize/close IPC; raw UTF-8 bytes reach xterm without per-chunk string decoding. Pull-based output waits for xterm parsing; bounded backend queue, pending input, terminal count and scrollback.
- Tabs keep their processes when hidden; ResizeObserver refits visible panes; late startup after React unmount is closed. Closing the last tab leaves an explicit new-terminal action.
- Windows job objects own shell descendants; jobs close on tab/app shutdown and on shell exit. Shell profiles use fixed system paths with no user command interpolation; profiles are disabled for PowerShell startup. No shell secrets are persisted or logged by TermiX.
- Added real PTY tests for shell IO, resize, independent tabs, close/reopen, validation, natural exit, PowerShell Unicode/input/Ctrl+C. Frontend tests cover late-start cleanup, output backpressure, ordered/chunked input and startup failure.
- Verified locally: TypeScript/Vite production build, five frontend lifecycle tests, npm audit reports zero vulnerabilities. All six real Windows PTY tests passed in [Actions run 41340756174](https://github.com/TomateMozzarella/TermiX/actions/runs/41340756174), including Unicode, interactive input, Ctrl+C, resizing, lifecycle, saturated-output shutdown and descendant cleanup. Installer artifacts are published only by successful complete workflow runs; installed-app manual checks still required. Local Rust compilation is unavailable because the Visual C++ linker is absent.
- Optional pwsh/WSL/Git Bash discovery deferred; Linux desktop and descendant cleanup are not verified. User has confirmed basic installed PowerShell use; exhaustive manual copy/paste and window-close checks remain separate from the automated coverage.

- Implement Rust PTY lifecycle (spawn, stream output, write input, resize, terminate), initially Windows ConPTY; design for Linux PTYs.
- PowerShell and CMD profiles first; discover optional pwsh, WSL, Git Bash.
- Connect PTY byte streams to xterm.js with proper Unicode, resize handling, copy/paste, scrolling, tab lifecycle and cleanup.
- Make multiple independent tabs work; prevent orphan processes and uncontrolled memory growth.
- Never interpolate user input into a command shell or run user-entered commands outside the PTY by accident.
- Tests: launch shell, echo command, interactive input, resize, close, reopen; build Windows installer in CI.

### v0.2.1 – First-run setup, settings and visual refinement [DELIVERED; USER CONFIRMED IMPROVEMENT]
User feedback from the installed v0.2.0 screenshot (2026-11-01): the terminal works, but the design is not polished. In particular the logo, the disconnected “Bereit” text in the top bar, and the raw shell dropdown need attention. The shell should be chosen in a setup assistant and changed later through settings.

- First launch/upgrade without preferences: two-step assistant for default shell and readable terminal font size. Start the first shell only after preferences are successfully saved.
- Working settings button: change the default shell for new tabs; apply font size to running terminals without restarting them. Support cancel, errors and retry.
- Store only validated non-secret preferences in Rust; atomic writes and schema versioning. Do not alter existing saved sessions or persist credentials.
- Consistent shared logo for UI and packaged Windows icons; dark native title bar, restrained accent colors, readable typography and a themed terminal scrollbar.
- Remove the top-bar “Bereit” label and sidebar shell select; use a single footer status. Mark unavailable protocol features as planned.
- Tests: onboarding, relaunch without repeated setup, settings persistence/replacement, invalid/corrupt settings, save failure, cancellation, keyboard focus and continuing open tabs. Retain existing real PTY tests and build downloadable installers.
- Implementation present in source. All five frontend tests, four browser UI cases and nine Rust tests passed in [Windows Actions run 41343449310](https://github.com/TomateMozzarella/TermiX/actions/runs/41343449310). Use the successful workflow run tied to the delivered installer for build provenance; v0.2.1 installed-app validation is still required. This is a focused UX increment before SSH; do not present SSH as implemented.

### v0.3.0 – SSH, secure credentials and expanded setup [IMPLEMENTED; WINDOWS TEST BUILD VERIFIED]
- Verification: [Actions run 41487262956](https://github.com/TomateMozzarella/TermiX/actions/runs/41487262956), application commit `ddc70f55a2d9d9b087f36b45daa7ca7eef1c0c76`: 18 native tests, 7 frontend tests and 9 browser cases passed. EXE/MSI packaging passed; a silent installation verified executable/icon/license resources and refreshed an existing desktop shortcut to the dedicated ICO. The direct chat EXE was checked against CI SHA-256 `881ca996fa969e032dca8ef8a0d501e14be817b3c0b4e5d4ad81f122eec8ac77`.
- Native tests use debug builds; the shipped release installer is separately compiled and installation-tested. Browser visual previews use mocked desktop IPC. Do not conflate these checks with installed interactive SSH/UI validation or an independent audit; see docs/SECURITY.md.
- User authorized implementation on 2026-11-02 after reviewing the plan; the earlier request to wait is revoked.
- Persistent design goals: minimal/modern, secure, fast, intuitive. English default; English and German initially. Language selection first in setup and changeable later.
- Setup/settings: default shell, automatic/dark/light mode, accent presets/custom colour with contrast protection, font size and preferred editor (integrated planned/Notepad++/VS Code/custom executable reference). Do not launch an editor during setup; editor integration remains v0.6.0.
- Minimal flat >_ icon rather than the earlier detailed symbol. One source for UI and native icons. Dedicated v3 shortcut icon and NSIS refresh of existing TermiX shortcuts, without touching unrelated shortcuts or global icon caches.
- NSIS installer: consistent icon, clean header/sidebar artwork and English/German selection within native installer limits. Existing sessions survive preference migration; newly added setup choices are asked once after upgrade.
- Implementation uses Rust ssh2/libssh2 with bundled OpenSSL explicitly selected on Windows, modern algorithm preferences, a two-phase server-key check bound to the same connection, an app-owned public known-hosts file, password/key/agent authentication and opt-in Windows Credential Manager. Agent authentication tries bounded identities instead of assuming the first key matches. See docs/SECURITY.md for boundaries and remaining checks; do not call it production-ready.
- Interactive SSH with password, private-key and agent authentication, PTY allocation, resize, clean disconnect/reconnect, connection timeout.
- Strict server host-key verification; persistent known-hosts policy and explicit user review for first-seen/changed keys; NEVER silently accept changed keys.
- Windows Credential Manager / OS-protected keychain for optionally saved passwords; do not persist passwords in JSON/SQLite/localStorage/logs.
- Prefer OpenSSH agent or encrypted key files in existing ~/.ssh; save references/paths, not private key material. Support passphrase prompts without persistence by default.
- Rust-only handling of secrets; minimize frontend exposure, zeroize sensitive buffers where feasible, avoid accidental telemetry/logging.
- Do not claim OS credential storage protects against malware running as the same user.
- Security review and tests before calling SSH production-ready.

### v0.4.0 – Session manager
- Create/edit/delete/duplicate sessions; groups/folders, favorites, search, recently used, profile defaults.
- Save host, port, username, connection type, terminal settings and credential references; NEVER raw secrets.
- Evaluate migration from current sessions.json to SQLite with backward-compatible migration and backup.
- Validation, atomic writes, import/export of non-secret metadata; clear UX around missing credentials.

### v0.5.0 – SFTP
- SFTP browser with remote/local navigation, upload/download, progress, cancellation, overwrite confirmation, drag-and-drop.
- Secure path handling, permission/error reporting, safe partial transfer recovery.
- Integrate SFTP browsing with SSH sessions.

### v0.6.0 – Editors
- Embedded Monaco Editor as the default editor: tabs, syntax highlighting, line numbers, search, save, encoding awareness.
- Configurable external editor executable, e.g. Notepad++, VS Code or any user-selected program.
- Open remote SFTP file -> safe local working copy -> edit -> explicit or controlled sync back via SFTP.
- Detect remote modifications/conflicts; avoid silently overwriting remote changes.
- Protect temporary working files and clean up securely; clearly communicate editor trust boundaries.

### v0.7.0 – Terminal productivity
- Split panes, search, themes, fonts, font size, key bindings, session/tab restoration, context menus, command palette.
- Accessibility, performance, error states and responsive sizing.

### v0.8.0 – SSH tunnels
- Local and remote port forwarding, lifecycle UI, explicit binding configuration, secure defaults and errors.
- Review security implications of exposing listening ports.

### v0.9.0 – Additional protocols
- RDP, serial connections and X11 support, each evaluated for platform dependencies, security and feasibility.
- These are PLANNED, not promised as trivial built-in implementations.

## Security requirements (non-negotiable)
1. No plaintext password, private key or passphrase in persisted session metadata, localStorage, source control, build logs or telemetry.
2. OS credential vault for opt-in saved passwords; user can choose not to save.
3. SSH agent or passphrase-protected existing key files preferred. Never copy private keys into app storage by default.
4. Verify SSH host keys; changed keys require conspicuous blocking confirmation and context.
5. Minimize secrets in frontend IPC and process arguments; sanitize logs/errors; least privilege for Tauri capabilities.
6. Handle SFTP file permissions, temporary copies and overwrite conflicts carefully.
7. Do not mark security work complete without targeted tests and review.

## Release and quality workflow
- Work incrementally by milestone, use small reviewable commits/PRs, keep documentation updated.
- GitHub Actions must produce a working Windows installer artifact; do not ask the user to compile locally.
- Build success is not functional correctness: test new functionality, not only compilation.
- Keep Rust, TypeScript, Tauri and Windows bundle paths consistent. Preserve .ico bundling fix.
- Prefer deterministic dependency versions/lockfiles, appropriate CI tests and explicit failure logs.
- Clearly state what works, what is stubbed, and what remains planned.
- Update this roadmap's status after each milestone.

## Open implementation choices
- Current transports are portable-pty 0.9.0 and ssh2/libssh2/OpenSSL; Windows saved passwords use Credential Manager. Remaining choices include non-Windows credential storage, migration to SQLite, exact UI component library, SFTP sync strategy, optional WSL/Git Bash detection and protocol backends for RDP/X11.
- Decide these during implementation with tests and threat-model awareness rather than presenting them as already settled.

## User preferences / decisions from discussions
- User approved milestone order above.
- Wants strong security for SSH passwords and keys.
- Wants Notepad++ (or another external program) selectable as editor AND an integrated default editor.
- Wants PowerShell/CMD and Unix-like options including WSL, and eventually SSH.
- Wants modern polished MobaXterm-like design, not a clone of Cygwin's shell.
- Windows 11 first, future cross-platform.
- Build and distribute using GitHub Actions; user does not want local builds.
- For private GitHub artifact links, also provide the installer directly in this chat's outputs when possible; the user encountered a browser 404 on the private artifact URL.
- Default shell belongs in first-run setup and later settings, not a raw always-visible sidebar dropdown. Unify the logo and remove redundant/disconnected status text.
