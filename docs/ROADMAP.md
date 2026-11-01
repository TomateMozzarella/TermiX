# TermiX – Product Roadmap and Project Handoff

Last updated: 2026-11-01
Status: v0.1.0 foundation built and tested on Windows 11; v0.2.0 next.
Repository: https://github.com/TomateMozzarella/TermiX

## Vision
Build a polished, modern, cross-platform MobaXterm-style terminal and remote-connection manager, initially optimized for Windows 11, with Linux support later. The user prefers downloadable GitHub Actions installers and does not want to compile locally. Keep the dark, compact desktop interface and evolve it into a functional product.

## Verified current state (v0.1.0)
- Tauri 2 + Rust backend; React + TypeScript + Vite frontend; xterm.js terminal rendering; lucide-react icons.
- Dark UI with workspace/sidebar, search, session categories, saved-session area, terminal tabs and status bar.
- Session create/delete/list persistence in the Rust backend (current JSON storage).
- The user installed and opened the Windows build successfully and provided a screenshot. The UI runs.
- GitHub Actions Windows installer build SUCCESS: https://github.com/TomateMozzarella/TermiX/actions/runs/41336575518
- The previous packaging issue was a missing Windows .ico bundle icon. Fixed by specifying bundle.icon = ["icons/icon.ico", "icons/icon.png"] in src-tauri/tauri.conf.json. Workflow generates temporary icons.
- IMPORTANT: xterm.js currently shows placeholder output. No local shell, SSH, SFTP, editor, tunnels, RDP, serial, X11 or real terminal transport yet. Do not describe any of these as implemented.
- Windows build artifacts are uploaded as TermiX-Windows-Installer by .github/workflows/windows-build.yml.
- The current design is a functional UI shell, not a production-ready remote access client.

## Technology decisions
- KEEP Tauri 2 / Rust / React / TypeScript / xterm.js. Tauri is the desktop framework, not the design system; frontend appearance is independently customizable.
- Rust backend owns privileged operations, shell processes, authentication, file operations and protocol engines. React owns UI and xterm.js display.
- Use typed, narrow Tauri IPC and explicit capabilities. Avoid generic arbitrary command execution from webview.
- Consider a refined component system (e.g. Tailwind + shadcn/ui) later, without sacrificing the current dark look or blocking core functionality.
- On Windows use ConPTY via a maintained Rust PTY abstraction (evaluate portable-pty) for local interactive terminals; xterm.js is the renderer, not a shell.
- Default local shell: Windows PowerShell; support CMD, PowerShell 7, WSL distributions and optionally Git Bash with user-selectable profiles. MobaXterm's local Unix-like environment is Cygwin-based; TermiX intentionally uses native shell profiles instead of pretending xterm.js provides Unix commands.

## Milestones (in order)
### v0.2.0 – Real local terminal [NEXT]
- Implement Rust PTY lifecycle (spawn, stream output, write input, resize, terminate), initially Windows ConPTY; design for Linux PTYs.
- PowerShell and CMD profiles first; discover optional pwsh, WSL, Git Bash.
- Connect PTY byte streams to xterm.js with proper Unicode, resize handling, copy/paste, scrolling, tab lifecycle and cleanup.
- Make multiple independent tabs work; prevent orphan processes and uncontrolled memory growth.
- Never interpolate user input into a command shell or run user-entered commands outside the PTY by accident.
- Tests: launch shell, echo command, interactive input, resize, close, reopen; build Windows installer in CI.

### v0.3.0 – SSH and secure credentials
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
- Rust PTY crate and transport event design; secure credential/keychain abstraction; SSH library; migration to SQLite; exact UI component library; SFTP sync strategy; optional WSL/Git Bash detection; protocol backends for RDP/X11.
- Decide these during implementation with tests and threat-model awareness rather than presenting them as already settled.

## User preferences / decisions from discussions
- User approved milestone order above.
- Wants strong security for SSH passwords and keys.
- Wants Notepad++ (or another external program) selectable as editor AND an integrated default editor.
- Wants PowerShell/CMD and Unix-like options including WSL, and eventually SSH.
- Wants modern polished MobaXterm-like design, not a clone of Cygwin's shell.
- Windows 11 first, future cross-platform.
- Build and distribute using GitHub Actions; user does not want local builds.
