# TermiX – Product Roadmap and Project Handoff

### Current development workspace after v0.12.0
- Detachable terminals retain the live process and scrollback. Window appearance and labels follow workspace settings.
- SFTP downloads verify a saved local prefix when the same source and destination are chosen again. Uploads retain in-session pause and resume. Following a disconnect, retrying a folder verifies completed files and skips identical ones; the interrupted file starts again in a new exclusive staging file.
- Third-party import reviews supported OpenSSH, PuTTY and MobaXterm entries. Entries without a saved SSH username are skipped.
- FreeBSD, macOS and Windows have read-only SSH monitoring collectors. Native Windows, SFTP and remote-host validation remain pending.

Last updated: 2026-11-08
Status: v0.10.0 implemented, tested, integrated into main and published on 2026-11-08. SSH tunnels, recursive folder upload and post-v0.9 UI improvements are delivered. Only main remains; future work stays on main. The v0.11 workspace redesign and Multi-Execute await native release validation.
Repository: https://github.com/TomateMozzarella/TermiX

The user resumed v0.4 implementation/main/release work on 2026-11-03, revoking the preceding feedback-turn pause. That milestone is complete. SQLite is deferred: the existing JSON library was upgraded to a versioned catalog with atomic writes, OS writer locking, stale-snapshot checks and a legacy backup, covering the folder/session scope without a database migration dependency.

## Feedback recorded 2026-11-08 after v0.9 — implementation resumed
The initial documentation-only pause was revoked by the user's subsequent instruction to implement the new points and next version. Delivered in verified v0.10:
1. Improve light-mode readability throughout the interface: text/background contrast, muted and disabled text, controls, status/monitoring, terminal colours and editor/popover surfaces. The user reports dark mode is readable; retain its readability while checking both themes.
2. Make the settings dialog larger. Keep its dimensions stable across categories, bounded by the available viewport, with scrolling content and reachable navigation/footer.
3. Clicking Play on a saved command/macro should run it directly in the selected terminal, without another confirmation dialog. This explicitly supersedes the earlier confirmation requirement for that single-target Play action. Keep the active target clear; this does not decide the separate planned Multi-Execute workflow.
4. Make informational reminders about files still being edited optional in settings. Aggregate multiple open external files into one compact indicator/count with an expandable list, rather than accumulating per-file messages or a permanently expanded overlay. The attached dark-mode screenshot illustrates the current external-file status area. Hiding reminders does not imply automatic transfer or discarding edits.

## Workspace redesign before RDP

Local implementation adds an empty initial workspace, collapsed session folders with global search during a query, direct tools for split layouts and SSH tunnels, grouped context actions, an about/help dialog, and an R shortcut for a focused disconnected SSH terminal. Reconnect goes through the existing verification and authentication flow. Multi-Execute previews and confirms the command for all connected terminals in the visible split with at least two recipients. RDP remains a later step.

## Vision
Build a polished, modern, cross-platform MobaXterm-style terminal and remote-connection manager, initially optimized for Windows 11, with Linux support later. The user prefers downloadable GitHub Actions installers and does not want to compile locally. Keep a compact desktop interface with automatic/dark/light appearance and customizable accents.

## Verified current state
- v0.2.0: user confirmed “funktioniert” and supplied a screenshot of an interactive PowerShell terminal on 2026-11-01. This confirms basic installed-app operation, not every manual edge case.
- All five frontend lifecycle tests, six real Windows PTY tests, and both Windows installers passed [Actions run 41341535773](https://github.com/TomateMozzarella/TermiX/actions/runs/41341535773).
- Tauri 2 + Rust backend; React + TypeScript + Vite frontend; xterm.js terminal rendering; lucide-react icons.
- Dark UI with workspace/sidebar, search, session categories, saved-session area, terminal tabs and status bar.
- Rust-owned session edit/create/delete/duplicate, folders, favorites/recent and metadata import/export with a versioned JSON catalog (v0.4).
- The user installed and opened the Windows build successfully and provided a screenshot. The UI runs.
- GitHub Actions Windows installer build SUCCESS: https://github.com/TomateMozzarella/TermiX/actions/runs/41336575518
- The previous packaging issue was a missing Windows .ico bundle icon. Preserve bundle.icon = ["icons/icon.ico", "icons/icon.png"] in src-tauri/tauri.conf.json. v0.2.1 generates these from the shared public/termix.svg with the Tauri icon CLI, replacing the temporary TX artwork.
- Historical v0.1 baseline had placeholder output. Real local terminals arrived in v0.2 and SSH in v0.3. SFTP arrived in v0.5, editing in v0.6 and tunnels in v0.10; RDP, serial and X11 remain planned.
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

### v0.4.0 – Session manager [IMPLEMENTED; WINDOWS PRERELEASE PUBLISHED]
- Application/tag commit: fb51f303d07f3ea375156be3af57679d3a6720ac. [Build 41681128357](https://github.com/TomateMozzarella/TermiX/actions/runs/41681128357) passed 25 native Windows tests, 31 frontend tests, 17 browser workflows and 7 release-receipt checks (80 total). Native checks include migration/backup, rollback, concurrency/stale writes, import ID preservation, address normalization and editor-path validation. Existing PTY/SSH/vault checks passed.
- EXE/MSI packaging passed. Stale cached bundles are cleared safely before packaging; silent installation verifies the actual executable reports 0.4.0, licenses/icon resources exist and an existing desktop shortcut uses the dedicated ICO. Interactive file-picker behavior and broader installed UX/SSH checks remain manual.
- [Release publication 41684183118](https://github.com/TomateMozzarella/TermiX/actions/runs/41684183118) published [v0.4.0](https://github.com/TomateMozzarella/TermiX/releases/tag/v0.4.0) with EXE, MSI, SHA256SUMS and a source manifest. main was fast-forwarded to the exact successful PR head; PR #1 was automatically marked merged. EXE SHA-256 `6757b55828e97cddbc1d68efba6024a8ca130061e73042b4a61a9efa5f3d86e9` matches the published asset digest and direct chat copy.
- Latest installed-app feedback (2026-11-02) makes editing existing sessions and assigning them to folders core acceptance criteria. Expose a clear edit action; prefill name/host/port/username/authentication references, preserve session identity and apply saved connection changes to subsequent connections without restarting active sessions.
- Create/edit/delete/duplicate sessions; groups/folders, favorites, search, recently used, profile defaults.
- Folder management: create/rename/delete folders, assign/move sessions and provide an unassigned/default location. Deleting a folder must not silently delete its sessions.
- Readability: increase small sidebar/session details, tab labels, form labels/help text and status text; improve light-theme contrast. Add UI scaling separate from terminal font size, respect Windows DPI, and check common resolutions/scales and dialog fit. Do not defer this screenshot-reported issue to v0.7.0.
- Friendly SSH address entry: accept bare IPs and DNS hostnames; normalize pasted http://, https:// and ssh:// addresses to a visible hostname/IP preview before save. Remove surrounding whitespace and optional trailing slash. HTTP(S) prefixes are input convenience only: the resulting connection remains SSH, normally port 22, with normal host-key verification. Never infer SSH port 80/443 from HTTP(S). Handle an explicitly supplied port visibly; reject ambiguous input, embedded credentials and non-root paths/query/fragment with a helpful explanation instead of silently guessing. Cover IPv6 and hostname cases. Validate normalized data in Rust as well as the UI.
- Editor configuration only: allow an explicit executable path and a browse button for Notepad++, VS Code and custom editors. Optionally detect installed editors through standard installation locations/registry/PATH, without scanning the whole disk. Show any detected path and allow overriding it; detection failure keeps manual selection available. Never execute a detected/editor path during setup. Actual file opening/editing remains v0.6.0.
- Save host, port, username, connection type, terminal settings and credential references; NEVER raw secrets.
- Evaluate migration from current sessions.json to SQLite with backward-compatible migration and backup.
- Validation, atomic writes, import/export of non-secret metadata; clear UX around missing credentials.

### v0.5.0 – SFTP and workspace interaction [IMPLEMENTED; WINDOWS PRERELEASE PUBLISHED]
- Application/tag commit: `df84e11e0bccee832cb0b643bf65981d0655ef2a`. [Build 41692187212](https://github.com/TomateMozzarella/TermiX/actions/runs/41692187212) passed 27 native Windows, 31 frontend, 20 browser and 7 release-receipt tests (85 total). SFTP integration covers listing, upload/download, refusal of unconfirmed replacement, safe atomic-overwrite fallback, mid-download cancellation with destination preservation/partial cleanup, and subsequent terminal use. Browser cases cover folder drag/drop, collapsible groups, resizing, tab reorder/middle-click and SFTP controls/errors.
- EXE/MSI packaging and silent installation passed, including executable version 0.5.0, licenses and desktop-shortcut icon. [Publication 41871779129](https://github.com/TomateMozzarella/TermiX/actions/runs/41871779129) published [v0.5.0](https://github.com/TomateMozzarella/TermiX/releases/tag/v0.5.0) from the exact tested PR head. PR #2 was integrated into main. EXE SHA-256 `ad92f81c88ff438d25497eb8ab50b7d344ca76134fb6dd6af1921ba05aa9b4f0` matches the direct chat copy and published asset digest. Installed interactive file dialogs, wider server interoperability and independent security review remain separate.
- Sidebar/file-panel widths, collapse states and tab order currently last for the running workspace; persistent layout restoration remains v0.7.
- SFTP browser on the existing verified SSH connection: remote path navigation, bounded directory listing, streamed uploads/downloads, progress/cancellation and explicit replacement control. Native Windows Open/Save dialogs provide local navigation and grant the specific local file, rather than exposing arbitrary frontend filesystem access. Internal remote-file drag-to-download is included; OS Explorer drag/drop, a dual-pane local browser, recursive folders and resumable transfers remain follow-ups.
- 2026-11-03 user feedback: drag saved sessions into folders/unassigned, resize sidebar and file-browser panel, collapse Connections/Folders/Saved Sessions, reorder terminal tabs by drag and drop and close tabs with the middle mouse button. Include these in v0.5 without restarting active terminals. The native window is already resizable; split terminal panes remain v0.7.
- Transfers use exclusive sibling partial files and commit only after successful completion; never truncate the destination at start. Report permissions, existing targets, changed source/destination, unsupported SFTP/atomic replacement and cancellation. Best-effort partial cleanup; a lost connection may leave a clearly named .termix-UUID.part file. No automatic resume.
- SSH monitoring requested: show CPU usage, RAM used/total, disk used/total and connected SSH users. Originally scheduled before v0.6; still pending after the user advanced to editors, initially Linux with capability detection, opt-in low-frequency bounded polling, separate channel, no credentials/sudo, pause when hidden, explicit unsupported/unavailable states. Count SSH sessions separately from distinct users; do not claim who(1) entries are all SSH connections. Windows/BSD need platform-specific support. This is recorded, not implemented by the SFTP release.
- Secure path handling and permission/error reporting are implemented. Failed transfers clean their partial files when possible; automatic recovery/resume remains planned.
- Integrate SFTP browsing with SSH sessions.

### v0.6.0 – Editors and installed Windows fixes [IMPLEMENTED; WINDOWS PRERELEASE PUBLISHED]
- Application/tag commit: `003aa027d8d6440089a10023ce109a383d8b6169`. [Build 41885597244](https://github.com/TomateMozzarella/TermiX/actions/runs/41885597244) passed all 92 tests: 28 native Windows, 34 frontend, 23 browser and 7 release-receipt checks. Native tests include remote editing, content conflicts, explicit reload, binary/size rejection and an external-editor fixture proving no automatic upload. Browser coverage includes editor save/conflict/discard, context menus, SFTP side/start preferences and compact editor save/transfer cancellation at 900x600/150%.
- EXE/MSI and the actual v0.5-to-v0.6 upgrade passed. The baseline v0.5 EXE was checksum-verified, started, then upgraded; process closure and byte-identical catalog/folders/preferences/known-hosts were verified alongside executable version/icon/licenses. [Publication 41887809158](https://github.com/TomateMozzarella/TermiX/actions/runs/41887809158) published [v0.6.0](https://github.com/TomateMozzarella/TermiX/releases/tag/v0.6.0). PR #3 was integrated at the tested head. EXE SHA-256 `2778527934f3be61b16c3c696ce926ec8d3cc57653d40a6de47e65e1555a372c` matches GitHub and the direct chat copy.
- Native drag gestures are not covered by the mocked browser surface. The Windows integration cause was identified in Tauri's documented native file-drop interception; app.windows[].dragDropEnabled=false is protected by a configuration regression test. Interactive installer OK/Cancel, further real editors/servers and independent security review remain manual.

- 2026-11-04 feedback: fix installed session/folder and tab drag/drop (Tauri WebView2 native file interception must be disabled for HTML5 dragging), align upload controls, offer left/right SFTP placement, configurable SFTP starting directory, readable independent terminal palettes, session-list/SFTP context menus including folder creation, running-app close offer in the installer, upgrade data preservation and published GitHub EXE assets.
- Root SFTP startup is the authenticated user/server starting directory, not a hardcoded /root. A global path preference now selects another initial directory; it does not follow terminal cd automatically.
- Integrated editing supports bounded UTF-8 regular files (2 MiB, eight documents), language highlighting, tabs/search and explicit Ctrl+S; content hashes detect remote conflicts before atomic replacement. Unsupported atomic replacement fails safely.
- External editing uses a configured absolute executable, one argument containing a random per-user working-copy path, explicit reload and manual server save. No automatic watcher/upload, shell interpolation or execution from setup. Crash leftovers can remain in the user temp folder.
- Installer testing includes an existing running application and byte-for-byte preservation of sessions/preferences/known-hosts files. Interactive close/cancel and real native drag gestures still require installed checks.
- Embedded Monaco Editor as the default editor: tabs, syntax highlighting, line numbers, search, save, encoding awareness.
- Configurable external editor executable, e.g. Notepad++, VS Code or any user-selected program.
- Use the visible, user-confirmed editor executable configured earlier. v0.4 detects executable locations; v0.6 launches only after an explicit edit action.
- Open remote SFTP file -> safe local working copy -> edit -> explicit or controlled sync back via SFTP.
- Detect remote modifications/conflicts; avoid silently overwriting remote changes.
- Protect temporary working files and clean up securely; clearly communicate editor trust boundaries.

### v0.7.0 – Terminal productivity [IMPLEMENTED; WINDOWS PRERELEASE PUBLISHED]
- Application/tag commit: `1fe2f84a0412fb268b569351477f6cf25ef46131`. [Build 41901000165](https://github.com/TomateMozzarella/TermiX/actions/runs/41901000165) passed 101 checks: 31 native Windows, 34 frontend, 29 browser and 7 release-receipt tests. New checks cover preference defaults/validation, bounded metadata-only workspace storage, direct external opening without Monaco/auto-upload, actual replace-all and highlighted differences, shared/expandable SFTP including duplicate/cyclic entries, keyboard focus, terminal search/snippets and restoration without automatic SSH authentication.
- EXE/MSI packaging and a real running-v0.6-to-v0.7 upgrade passed; catalog/folders, preferences and known-hosts remained byte-identical. [Publication 41905892456](https://github.com/TomateMozzarella/TermiX/actions/runs/41905892456) published [v0.7.0](https://github.com/TomateMozzarella/TermiX/releases/tag/v0.7.0). PR #4 was integrated at the exact tested head. EXE SHA-256 `f632c2141da8e5847b1f9e2fda0fd93ead580991613cc1ac21c1ee7c4c94edf1` matches GitHub and the direct chat copy.
- Browser workflows now use production assets, avoiding development-server lazy-module discovery/reloads. The test-only loopback preview shutdown route uses an ephemeral token and is not bundled in the application. Native desktop gestures, interactive installer choices, additional servers/editors and independent review remain manual items.
- 2026-11-04 installed v0.6 feedback accepted: direct external editor preference; shared Sessions/SFTP sidebar (default) or a separate left/right panel; expandable session and remote folders; categorized settings; visible search/replace (single/all), two-file read-only comparison; editor maximize; richer terminal/tab context menus and subtle rounding. MobaXterm screenshots are workflow references, not a requirement to clone every tool.
- Delivered and verified: two existing terminal panes without reconnecting, terminal search, command palette (Ctrl+Shift+P), tab rename/pin/colour/bulk close, clipboard/font/scrollback menus, explicit-target named snippets kept in memory for the current app session, and an explicit restore offer for tab references/order/colours/pins and widths. Restoring SSH tabs never authenticates automatically. No command/history/output/credentials are persisted in workspace.json.
- Follow-ups: persistent non-secret snippet library after a dedicated storage design, macro recording, customizable shortcut mapping, draggable split divider and persistent split/collapse layout, detached/multi-monitor windows, formatted clipboard/printing/output recording and SSH monitoring. These are not delivered by the first v0.7 prerelease. Existing standard terminal/editor shortcuts remain supported.

- Split panes, search, themes, fonts, font size, key bindings, session/tab restoration, context menus, command palette.
- Add named command snippets/macros with explicit execution in a clearly identified target session and optional shortcuts. Never store passwords/private keys in macros, auto-run them on connection, or run commands in a different/local session by surprise. Macro recording/advanced scripting needs separate scope decisions.
- Accessibility, performance, error states and responsive sizing.
- The embedded terminal already exists since v0.2.0 (xterm.js display, Rust PTY transport, PowerShell/CMD shell); SSH arrives in v0.3.0. A new shell interpreter or terminal emulator written from scratch is not currently planned. If "own terminal" means a bundled Unix environment like MobaXterm's, clarify that separately; optional WSL/pwsh/Git Bash discovery remains planned but is not a delivered bundled Unix environment.

### v0.8.0 – Portable delivery and everyday workflows [DELIVERED; WINDOWS PACKAGE AND PORTABLE VERIFIED]
- 2026-11-08 user feedback takes priority over the earlier tunnel-only milestone. Ship portable Windows ZIP and EXE as verified GitHub Release assets; retain the MSI as an alternative. A portable marker selects executable-relative data/WebView storage and an isolated Windows-vault namespace. The ZIP never includes user data. WebView2 Runtime remains required on Windows.
- NSIS EXE uninstall: ask whether to remove only installed TermiX:ssh credentials, default No; silent uninstall/upgrade retains them. Never remove other apps, portable credentials or private-key files. MSI uninstall retains credentials; interactive credential removal is currently specific to the EXE uninstaller.
- Replace memory-only snippets with a saved Commands tab beside Sessions/SFTP: create, edit, delete, search and explicitly execute in the identified terminal. Typed bounded local command definitions, no automatic execution; never store secrets. Basic secret-pattern rejection is not a general secret detector.
- Compact one-row SFTP icon toolbar with tooltips: download/upload/refresh/create file/create folder/delete selection. Exclusive file creation, nonrecursive deletion with confirmation, symbolic-link protection. Keep replacement opt-in under concise options; remove the long persistent help paragraph and duplicate top-right Files button.
- Show a themed startup surface and keep the native window hidden until the styled interface is ready, with a bounded fallback. Do not claim measured installed startup latency from browser mocks.
- External editing becomes nonmodal: unchanged return goes straight to the terminal; foreground/focus checks detect stable saved changes, then request server-transfer confirmation. No automatic upload; existing conflict checks remain. Working copies can remain in temp after a crash/disconnect and require explicit completion; external editors are trusted applications.
- Application/tag commit `81205dc3de017a3772955ecb9814ee8540efb8e9`; [build 42468504906](https://github.com/TomateMozzarella/TermiX/actions/runs/42468504906) passed 110 checks (35 native Windows, 35 frontend, 32 browser, 8 release-receipt), EXE/MSI packaging, a running-v0.7 upgrade with byte-identical catalog/preferences/known-hosts and portable startup from another working directory with isolated data/WebView. [Publication 42469661873](https://github.com/TomateMozzarella/TermiX/actions/runs/42469661873) published the exact EXE/MSI/portable ZIP. EXE SHA-256 `37cb0677fe93849221ecbb7e88774f922fc75d58e833092ec08af0a660244e24` matches GitHub and the chat copy. Portable ZIP SHA-256 `75a9db775685bea7eb9f96a1b6a9bd3ab14b5152d6e362c62c5e90597d45bf5e`. Interactive uninstall choices, wider editor/server interoperability and real startup timing remain manual validation items.
- Saved commands were verified across relaunch in native storage/browser workflows. The upgrade check covers existing catalog/preferences/known-hosts; wider portable update/move and interactive credential-uninstall scenarios remain manual. Official bundler downloads use pinned Tauri hashes and bounded retries after repeated transient HTTP-504 failures.

### v0.9.0 – Rendering, monitoring and daily workspace [DELIVERED; WINDOWS CLOSE AND LINUX COLLECTOR VERIFIED]
- 2026-11-08 installed screenshots exposed missing xterm runtime styles/cursor and overlapping Monaco lines after v0.8 added hashed startup CSS. Add explicit style-element/attribute policy while preserving self-only scripts/workers and all script hashing; production browser tests must include Tauri-style hashes.
- Fix native close with the main-window destroy capability and one coordinated unsaved-work guard. Cancel must keep all transports alive; accepted close performs normal native cleanup.
- Linux monitoring: bounded read-only fixed command over the existing verified SSH transport, separate channel, five-second foreground sampling, CPU deltas, RAM, root-filesystem usage, network rates, uptime, visible sshd session processes and logged-in user count. No sudo or remote installation. Unsupported/missing tools, namespaces and server permissions can limit values; do not show stale data as current. Other operating systems remain planned.
- Compact named commands; hover/edit reveals text, right-click run/edit/delete and confirmed double-click execution. SFTP mouse back traverses successful visited directories without navigating/reloading the application.
- External editors still require a local copy; preserve safe original filenames in unique temporary folders. No direct remote-path claim, automatic upload or relaxed conflict checking.
- Keep settings a stable viewport-bounded size across categories; scroll content while navigation/footer stay visible. Standardize calm rounded controls/panels/menus without styling xterm/Monaco internals globally.
- User requested six visible terminals: arrange up to six existing tabs in a 3x2/2x3 grid, keep their processes/transports and explicit focused command target. Arbitrary draggable split ratios and persistent split geometry remain follow-ups.
- Multi-Execute is explicitly requested for planning: opt-in selected targets, visible recipient list and a confirmation before broadcasting; never automatically mirror passwords or input. Not shipped in v0.9.
- Application/tag commit `4e54ab96b2ce798b1c0ee3aadc39ff1f65c041b2`; [build 42473674531](https://github.com/TomateMozzarella/TermiX/actions/runs/42473674531) passed 118 checks (37 native Windows, 36 frontend, 36 production browser, 8 receipt checks and one exact-collector check on real Linux). EXE/MSI packaging, a running-v0.8 upgrade preserving catalog/preferences/known-hosts/commands bytes, portable data/WebView isolation and a real native main-window close of the shipped portable app passed. [Publication 42475873920](https://github.com/TomateMozzarella/TermiX/actions/runs/42475873920) published the exact EXE/MSI/portable ZIP. EXE SHA-256 `38d79115a06f675ef9b2d3fc24f895debab99f2103a5d98a5fbdd347447616be` matches GitHub and the chat copy; portable ZIP SHA-256 `b352b8983c7185e279c7673d61a27944a47845fd1818712a61ee47bec7537c45`. Wider native gesture/editor/server interoperability, interactive uninstall choices, measured startup latency and independent review remain separate manual work.
- The real Windows close test was added because the previous mocked browser checks did not exercise the SDK's final native destroy permission; the production-CSP test reproduces Tauri-style CSS hashes and checks visible terminal colours/cursor and Monaco line geometry.
- Move SSH tunnels after these reported stability/UX issues.

### v0.10.0 – SSH tunnels and daily workflow [DELIVERED]

Application/tag commit `ce50cc0bb73cda73573aeed3a880bc6f80affe19`; [build 42489925990](https://github.com/TomateMozzarella/TermiX/actions/runs/42489925990) passed 126 checks (41 native Windows, 36 frontend, 40 production browser, 8 receipt checks and one exact Linux collector check). Both 4 MiB tunnel directions, active stop and SSH continuity passed, as did recursive SFTP content/empty-directory/overwrite checks. EXE/MSI packaging, a running-v0.9 upgrade preserving catalog/preferences/known-hosts/commands bytes, portable isolation and actual native close passed. [Publication 42491528367](https://github.com/TomateMozzarella/TermiX/actions/runs/42491528367) published the exact immutable EXE/MSI/portable ZIP. EXE SHA-256 `01777e131ac56cd93f6995195bbff510cbd32338055add010df556801d9c87e3` matches GitHub and the chat copy; portable ZIP SHA-256 `87e52cf6daaf7ee89fe38ba0accca93e4f9404e532b638098fc230df15893491`. Interactive folder-picker/gesture choices, broader interoperability and independent review remain manual validation areas.

- Implement the four post-v0.9 UI requests above. Retain language split; no rewrite just to reduce GitHub language counts.
- Later screenshot feedback: compact tab menu, named colour circles instead of hex values, grouped layout/close actions, factual SSH connection welcome without claiming X11/compression support.
- Tunnel scope: existing verified/authenticated SSH session, explicit local/remote directions, loopback-only requested binds, target host/port, start/list/stop, no persistence/automatic restoration, eight tunnels and eight peers each, bounded buffers and shutdown on SSH/window close. Local target is resolved by the server; remote target uses a numeric client-side IP. Remote server binding policy can affect actual exposure. Cancellation uses the library listener lifecycle; interrupted transports can require disconnect for final server cleanup.
- Local and remote port forwarding, lifecycle UI, explicit binding configuration, secure defaults and errors.
- Review security implications of exposing listening ports.

### v0.11.0 – Workspace redesign

- Toolbar shortcuts, grouped context menus, searchable collapsed session folders, empty startup and SSH reconnect with R.
- Up to six visible terminals with explicit Multi-Execute confirmation for two or more ready panes.

### Following milestone – Additional protocols
- RDP, serial connections and X11 support, each evaluated for platform dependencies, security and feasibility.
- These are PLANNED, not promised as trivial built-in implementations.
- v0.12.0 adds saved RDP connections and launches the Windows Remote Desktop client with a validated host and port. Native launch testing is pending. Embedded RDP needs a separate feasibility check.

### v0.11.2 — Sessions, saved commands and terminal output

- Choose a custom tab colour alongside the four presets.
- Import and export saved commands as local JSON. Preview imports and retain existing commands.
- Give sessions and folders their own context menus with scoped import/export and management actions. Alternate SSH login uses the normal host verification flow and leaves the saved login unchanged.
- Open a read-only snapshot of terminal scrollback in the integrated editor.
- Track desktop shortcuts, session defaults, host ping, third-party imports and bulk connect as separate workflow requests. Folder nesting and team sharing need a separate evaluation.

### v0.11.1 — Visual follow-up [IN DEVELOPMENT]

Feedback from the installed Windows build on 2026-11-14. The interface changes are in local review. Native link verification and release validation are pending. Retain every existing action and ask the user before removing any feature.

- Context menus: remove the stray rule above the first terminal menu group and use one separator between groups, including around the tab colour swatches. Keep named swatches, icons and direct access to actions.
- Toolbar and Help: group Settings and Help at the right edge, with Help last and consistent icon, spacing and hover/focus states. Keep Help in its own app dialog. Verify Project, Changelog, Updates and Documentation by actually opening each destination from the installed Windows build and checking logged-in access.
- SSH tunnels: style the form with the shared dialog fields. Visually group direction, listening address/port, and target host/port. Present active tunnels and their status/actions separately in the same dialog.
- Split view: show compact visual previews for one through six panes, including both two-pane orientations. Indicate the current choice and why a layout is unavailable. Omit the empty dialog footer. Keep running terminals and Multi-Execute target rules intact when changing the layout.
- Launch with a maximized window and the Connections section collapsed. Align the primary toolbar action with the sidebar navigation.
- Terminal tab strip: match the concept's spacing, rounded tab shapes and clear active state. Support mouse-wheel and arrow scrolling and keep the New Tab button visible. Preserve tab colours, drag reorder, middle-click close, pinning and direct access to tab actions.
- Additional differences from the concept: give split panes their own visible session headers and clear focus treatment, strengthen the primary New Connection action, and review whether Multi-Execute's recipient list makes each target easy to identify at a glance. Keep the approved separate dialogs for Settings, New Connection and Help.
- Compare the installed app with the approved concept in light and dark themes, at normal and narrow widths, with one and six terminal panes. Include screenshots of each affected surface in the review.

### Editor follow-up after v0.11.2 [IN DEVELOPMENT]

- Fix the missing icons in Monaco's Find and Replace controls. The current production assets do not include the Codicon font. Verify the packaged Windows build in both themes with the existing content security policy.
- Investigate the yellow tint in the editor. Distinguish syntax colours from search matches, selections and the active line. Use TermiX theme colours with readable contrast for each state.
- Separate hiding the editor from closing a file. Keep open files, unsaved edits and the chosen comparison in memory when switching back to the terminal or SFTP. Provide a clear way to reopen the editor and an explicit close action with the existing unsaved-edits protection.
- Verify the comparison workflow across folders. Open file A from SFTP, hide the editor, browse to file B and open it, then select A and B by name and path in the editor. Keep the connection and file identity visible. Preserve explicit saving and remote conflict checks.
- Make “Open output in editor” use the preferred editor from Settings. Keep the integrated snapshot read-only. For an external editor, open a local temporary text copy using the configured executable and clean up the copy through the managed temporary-file lifecycle. Keep the output local. Verify the action on installed Windows for local and SSH terminals, including keyboard access and a clear error if the configured editor cannot launch.
- Apply the workspace redesign to the integrated editor and comparison view. Match terminal tabs with rounded shapes, a clear active state, readable truncated file names and visible close buttons. Show which files have unsaved edits and make the full path easy to find when names match. Align the toolbar, search and replace controls, and spacing in both themes.
- Give the main toolbar actions and the editor toolbar actions equal width and height within their respective toolbars. Verify English and German labels at narrow widths and increased UI scale. Preserve emphasis for primary actions and allow file tabs to accommodate long names.
- Rename “Remote editor” and “Remote-Editor” to “TermiX Editor.” Show the connection and file path where they help identify a remote document.
- Move the floating external-files indicator to a consistent spot in the workspace, such as the status bar. Use a readable file count and a clearly visible chevron with an accessible expanded state. Keep the grouped list, optional reminders and existing review before uploading changes.
- Replace generic WebView confirmation prompts for closing TermiX or discarding editor changes with themed, localized TermiX dialogs. Explain what is at risk, keep Cancel easy to reach, and verify that cancelling preserves working copies and unsaved buffers.
- Evaluate editor additions in this order. Add go-to-line and word wrap first, then check indentation controls and format-on-demand for supported file types. Formatting must be explicit, and changes remain in the buffer until saved.

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
- User feedback (2026-11-02): prefer integrating completed, tested development milestones into main and publishing versioned GitHub Releases with downloadable installer assets and release notes, rather than indefinitely keeping everything in a draft branch/Actions artifacts. Use prereleases for experimental development builds and identify remaining limitations honestly. Retain checks and short-lived branches for unfinished work; avoid publishing every intermediate commit as a release.
- Current delivered state: PR #4 is merged, main contains v0.7 and GitHub prerelease v0.7.0 is published; earlier releases remain unchanged. The earlier planning-only restriction applied to the feedback turn and was revoked by the user's subsequent implementation request. Future work starts from main; verify a complete PR build at its exact head before fast-forward integration. Existing same-version releases remain immutable across documentation follow-ups.
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
- 2026-11-03/04: the user requested folder drag/drop, adjustable areas, collapsible groups, tab reorder/middle-click and SSH monitoring, then resumed completion on 2026-11-04. Initial workspace items shipped in v0.5; the installed drag issue and additional requests were fixed in v0.6. Monitoring remains pending.
- 2026-11-02 feedback: editing sessions, folder assignment, readable/scalable UI, editor EXE detection plus manual override, friendly URL-to-SSH-host input, macros, clearer terminal/editor/file-browser milestone communication, and tested main integration/GitHub Releases are recorded above. No application code was requested in this feedback turn.
- User approved milestone order above.
- Wants strong security for SSH passwords and keys.
- Wants Notepad++ (or another external program) selectable as editor AND an integrated default editor.
- Wants PowerShell/CMD and Unix-like options including WSL, and eventually SSH.
- Wants modern polished MobaXterm-like design, not a clone of Cygwin's shell.
- Windows 11 first, future cross-platform.
- Build and distribute using GitHub Actions; user does not want local builds.
- For private GitHub artifact links, also provide the installer directly in this chat's outputs when possible; the user encountered a browser 404 on the private artifact URL.
- Default shell belongs in first-run setup and later settings, not a raw always-visible sidebar dropdown. Unify the logo and remove redundant/disconnected status text.
- 2026-11-04 installed v0.5 feedback and v0.6 delivery: drag interception, SFTP upload alignment/side/start directory, terminal contrast, context menus, GitHub EXE assets and tested upgrade preservation are recorded in the v0.6 section. Terminal prompt/true-colour output still depends on the remote shell/application; no remote startup files are modified automatically.

### Recursive SFTP folder upload (2026-11-08)
Added to v0.10: native folder selection, nested files and empty directories, aggregate byte progress and cancellation. Replacement remains opt-in. Links and special files are skipped and counted; traversal is bounded to 10,000 entries and 32 levels. Completed files/directories remain after cancellation; the current partial file is cleaned up. No automatic resume or Explorer folder drag/drop. Native Windows protocol integration passed; interactive folder-picker coverage remains manual.

2026-11-08 workflow decision: user explicitly requests working directly on main and retiring old version branches. This supersedes PR-only work. Build the exact main commit and publish only after all required CI jobs and the source/hash receipt pass. Immutable tags/releases remain. Cleanup only expected old tips already contained in main. A redesigned README/project showcase with real UI captures and a labelled demonstration GIF is requested.
Release presentation decision (2026-11-08): every new release gets a concise highlight, clear EXE/MSI/portable downloads, grouped New/Improved/Fixed changes, upgrade notes, known limits and verified-source/checksum assets. Use actual screenshots when useful; do not claim planned work or unverified tests as delivered. Preserve already-published assets/tags.





