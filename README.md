# TermiX

TermiX is an independent, cross-platform remote connection manager built with Tauri 2, Rust, React, TypeScript and xterm.js.

## Current status — v0.9.0

**[v0.9.0 Windows development prerelease](https://github.com/TomateMozzarella/TermiX/releases/tag/v0.9.0) is published and integrated into main.**

Application/tag commit `4e54ab96b2ce798b1c0ee3aadc39ff1f65c041b2`; [build 42473674531](https://github.com/TomateMozzarella/TermiX/actions/runs/42473674531) passed 118 checks (37 native Windows, 36 frontend, 36 production browser, 8 receipt checks and one exact-collector check on real Linux). EXE/MSI packaging, a running-v0.8 upgrade preserving catalog/preferences/known-hosts/commands bytes, portable data/WebView isolation and a real native main-window close of the shipped portable app passed. [Publication 42475873920](https://github.com/TomateMozzarella/TermiX/actions/runs/42475873920) published the exact EXE/MSI/portable ZIP. EXE SHA-256 `38d79115a06f675ef9b2d3fc24f895debab99f2103a5d98a5fbdd347447616be` matches GitHub and the chat copy; portable ZIP SHA-256 `b352b8983c7185e279c7673d61a27944a47845fd1818712a61ee47bec7537c45`. Wider native gesture/editor/server interoperability, interactive uninstall choices, measured startup latency and independent review remain separate manual work.

Terminal cursor/font and Monaco line layout work under the installed hash-augmented CSP. Window closing uses one coordinated unsaved-work guard and the required main-only permission. Linux SSH monitoring shows CPU/RAM/root disk/network/uptime/visible sshd sessions/logged-in users, with pause and retry. Metrics depend on Linux tools and server visibility; the first CPU/network delta needs a second sample.

Named commands are compact, with hover, context run/edit/delete and confirmed double-click execution. The mouse back button traverses visited SFTP directories. Settings keep the same viewport-bounded size across categories and scroll their content. Controls/menus/panels share calmer rounded geometry. Tab context menu → Show up to 6 terminals arranges existing transports without restarting them; each pane is named and can return to a single view. Multi-Execute, draggable split ratios and persistent grid geometry remain planned.

External editors now show the safe original filename. A local SFTP copy is still necessary; explicit transfer and remote-conflict checks remain. See [v0.9 release notes](docs/releases/v0.9.0.md).

## Previously delivered v0.8.0

**[v0.8.0 Windows development prerelease](https://github.com/TomateMozzarella/TermiX/releases/tag/v0.8.0) is published and integrated into main.**

Application/tag commit `81205dc3de017a3772955ecb9814ee8540efb8e9`; [build 42468504906](https://github.com/TomateMozzarella/TermiX/actions/runs/42468504906) passed 110 checks (35 native Windows, 35 frontend, 32 browser, 8 release-receipt), EXE/MSI packaging, a running-v0.7 upgrade with byte-identical catalog/preferences/known-hosts and portable startup from another working directory with isolated data/WebView. [Publication 42469661873](https://github.com/TomateMozzarella/TermiX/actions/runs/42469661873) published the exact EXE/MSI/portable ZIP. EXE SHA-256 `37cb0677fe93849221ecbb7e88774f922fc75d58e833092ec08af0a660244e24` matches GitHub and the chat copy. Portable ZIP SHA-256 `75a9db775685bea7eb9f96a1b6a9bd3ab14b5152d6e362c62c5e90597d45bf5e`. Interactive uninstall choices, wider editor/server interoperability and real startup timing remain manual validation items.

Saved **Commands** now live beside Sessions/SFTP and survive restarts. SFTP has a compact six-icon toolbar for download/upload/refresh/new file/new folder/delete, with replacement under Options. The duplicate Files top button is removed. Startup shows a styled surface. Direct external editing is nonmodal: unchanged return leaves the terminal usable; stable saved changes prompt for transfer, with no automatic upload and existing conflict protection.

Portable mode keeps sessions/settings/commands and the WebView profile in data beside the EXE. Keep that folder when replacing application files. WebView2 Runtime is required; passwords remain in the PC/user/location-bound Windows vault. Interactive EXE uninstall offers optional installed-credential removal, default No; silent/MSI uninstall keeps them. See [v0.8 release notes](docs/releases/v0.8.0.md).

## Previously delivered v0.7.0

**[v0.7.0 Windows development prerelease](https://github.com/TomateMozzarella/TermiX/releases/tag/v0.7.0) is published and integrated into main.** [Build 41901000165](https://github.com/TomateMozzarella/TermiX/actions/runs/41901000165) passed all 101 checks: 31 native Windows tests, 34 frontend tests, 29 browser workflows and 7 release-receipt checks. EXE/MSI packaging and a real upgrade from a running, checksum-verified v0.6 installation passed; catalog/folders, preferences and known SSH hosts remained byte-identical. [Publication 41905892456](https://github.com/TomateMozzarella/TermiX/actions/runs/41905892456) published application/tag commit `1fe2f84a0412fb268b569351477f6cf25ef46131`.

Choose direct external opening or the integrated editor in Settings → Preferred editor. External edits still require explicit reload/review and server save; no automatic upload. Sessions and SFTP share one sidebar by default; Settings → Files also offers a separate left/right panel. Session folders and bounded remote directory trees expand. Settings use five categories. Editor tools expose Find/Replace (next/all), read-only comparison of two open files and maximize/restore.

Right-click tabs or the terminal for productivity actions. Split two existing terminal tabs without restarting them, search terminal output, and open the command palette with Ctrl+Shift+P. Named command snippets require an explicit target and confirmation and live only in memory for this app session. Workspace restoration explicitly reopens bounded tab references/order, pins/colours and widths; SSH reconnection remains manual. No commands, output, history or credentials are saved in workspace.json. Monitoring, persistent snippets, custom shortcut maps and detached windows remain planned. See [release notes](docs/releases/v0.7.0.md) and [security scope](docs/SECURITY.md).

## Previously delivered v0.6.0

**[v0.6.0 Windows development prerelease](https://github.com/TomateMozzarella/TermiX/releases/tag/v0.6.0) is published and integrated into main.** [Build 41885597244](https://github.com/TomateMozzarella/TermiX/actions/runs/41885597244) passed all 92 tests (28 native Windows, 34 frontend, 23 browser, 7 release-receipt checks), EXE/MSI packaging and a real upgrade from running v0.5 to v0.6. Session/folder metadata, settings and known SSH hosts remained byte-identical. [Publication 41887809158](https://github.com/TomateMozzarella/TermiX/actions/runs/41887809158) published the exact tested application/tag commit `003aa027d8d6440089a10023ce109a383d8b6169`.

Open a regular UTF-8 file (up to 2 MiB) from SFTP to edit it in the bundled lazy-loaded Monaco editor: eight file tabs, highlighting, find/replace and explicit Save to server / Ctrl+S. Server content or permission changes block replacement; copy your changes or explicitly reload the server version after a discard confirmation. The configured external editor can open a temporary working copy; reload those edits, review them and save explicitly. No automatic upload occurs. Working copies can remain in user temp after interrupted editing/crashes; closing a buffer removes its known copy. Extra encodings, recursive transfers and auto-sync remain planned.

Windows session/folder and tab dragging now passes through WebView2 rather than native file interception. Settings offer SFTP on the left/right, an initial directory and an independent light/dark terminal palette with readable ANSI colours. A dot uses the authenticated user's server starting directory (often /root for root); terminal cd is independent. Context menus create library/SFTP folders and expose file actions. Upload alignment and save/cancel controls at compact UI scales are checked. The installer offers to close the exact installed app; save unsaved editor work before updating. Native GUI gestures/installer cancellation and wider server/editor interoperability remain manual checks.

SSH monitoring remains pending; macros/split panes remain v0.7. See [v0.6 release notes](docs/releases/v0.6.0.md) and [security scope](docs/SECURITY.md).

## Previously delivered v0.5.0

**[v0.5.0 Windows development prerelease](https://github.com/TomateMozzarella/TermiX/releases/tag/v0.5.0) is published and integrated into main.** [Build 41692187212](https://github.com/TomateMozzarella/TermiX/actions/runs/41692187212) passed 85 tests (27 native Windows, 31 frontend, 20 browser and 7 release-receipt checks), EXE/MSI packaging and silent installation of version 0.5.0 with the shortcut icon. [Publication 41871779129](https://github.com/TomateMozzarella/TermiX/actions/runs/41871779129) published the exact tested application/tag commit `df84e11e0bccee832cb0b643bf65981d0655ef2a`.

Open **Files** on an authenticated SSH tab to browse the server through the same verified connection. Upload/download individual regular files using native local file selection, watch progress and cancel transfers. Exclusive partial files protect existing destinations until successful completion; remote replacement requires explicit opt-in. Internal remote-file drag-to-download is supported. Explorer drag/drop, a separate local file tree, recursive folders and automatic resume remain planned. Interrupted connections can leave named partial files. Native-picker interaction and broader server interoperability still need installed manual checks.

Drag sessions onto folders or Unassigned, collapse sidebar groups, resize the sidebar/file panel, reorder tabs by dragging and close tabs with the middle mouse button. These layout choices currently last for the running workspace. Terminal processes keep running during layout changes. SSH monitoring (Linux CPU/RAM/disk/SSH-session and user counts) is recorded for the next v0.5.x follow-up; it is not yet delivered. Editing remains v0.6 and macros/split terminals v0.7. See [release notes](docs/releases/v0.5.0.md) and the roadmap.

## Previously delivered v0.4.0

**[v0.4.0 Windows development prerelease](https://github.com/TomateMozzarella/TermiX/releases/tag/v0.4.0) is published and its application source is integrated into main.** [Build 41681128357](https://github.com/TomateMozzarella/TermiX/actions/runs/41681128357) passed all 80 tests (25 native Windows, 31 frontend, 17 browser, 7 release-receipt checks), built EXE/MSI installers and verified a silent installation of executable version 0.4.0 plus the desktop-shortcut icon. [Publication 41684183118](https://github.com/TomateMozzarella/TermiX/actions/runs/41684183118) verified the artifacts and published tag/source commit fb51f303d07f3ea375156be3af57679d3a6720ac. Subsequent documentation changes do not alter that application source or overwrite its release assets.

v0.4 adds editing/duplication/deletion, folders, favorites/recent views, import/export previews and a versioned atomic session catalog with a backup of the v0.3 array. Active connections keep their original host/profile when saved metadata changes. The catalog uses OS file locking and checks its saved snapshot to reject stale writes from another window; reload the library before applying further changes after a conflict. SQLite is deferred for this milestone.

UI labels and controls are larger and support independent 100–150% interface scaling. Existing preferences default to 100% without repeating setup. Terminal font size remains separate. Editor selection can discover Notepad++/VS Code from standard locations, App Paths registry entries or PATH, or use the native EXE picker/manual path. No editor is executed in v0.4.

SSH address entry accepts hostnames, IPs and pasted http(s)/ssh URLs. The preview shows the normalized SSH destination and explicit port. HTTP(S) prefixes do not imply port 80/443; paths, embedded credentials, queries and fragments require correction. Rust validates the normalized values independently of the interface.

Completed milestones are integrated into `main` at the exact tested PR commit. The release workflow publishes a GitHub development prerelease only after verifying that commit's successful build artifact, receipt and checksums; existing releases are not overwritten. See [v0.4.0 release notes](docs/releases/v0.4.0.md). SFTP arrived in v0.5; actual editing and macros remain later milestones.

### Previously delivered v0.3.0

v0.3.0 is available as a Windows test build. It extends the user-tested local terminal with Rust-owned SSH, bilingual setup/settings, theme/accent preferences and refreshed Windows branding. [Actions run 41487262956](https://github.com/TomateMozzarella/TermiX/actions/runs/41487262956) passed 18 native tests, 7 frontend tests and 9 browser workflows, built EXE/MSI installers, and verified silent installation plus refresh of an existing desktop shortcut. The delivered installer was built from commit `ddc70f55a2d9d9b087f36b45daa7ca7eef1c0c76`; subsequent documentation/cache cleanup does not change its application source. See [security design and remaining manual checks](docs/SECURITY.md); this is not a production-readiness claim.
- Tauri 2 desktop shell
- React/TypeScript interface
- Session list with create/delete/persistence
- Multi-tab terminal UI shell
- xterm.js terminal renderer
- Native PTY transport using portable-pty / Windows ConPTY
- Windows PowerShell and CMD profiles, independent tabs, input/output and resize
- Bounded output buffering and scrollback; tab/window cleanup with Windows process jobs
- Automated Rust PTY integration tests and frontend lifecycle tests
- Four-step English/German setup for language, shell, appearance/font size and editor preference
- A shared SVG logo for the interface and generated Windows application/installer icons
- System/dark/light appearance, custom accent colours, matching title bar and terminal scrollbars
- Windows/Linux-oriented project configuration

**Still planned:** port forwarding, RDP, serial and X11. Optional pwsh/WSL/Git Bash discovery is deferred. Linux has a /bin/sh profile but has not received desktop validation. The editor choice is used by v0.6 file editing; setup never launches a program.

## v0.3.0 setup and SSH

The expanded assistant asks language (English by default, English/German available), shell, automatic/dark/light appearance, accent colour, font size and preferred editor. Automatic follows system changes. Preferences from v0.2.1 retain shell/font choices and request the new options once; saving completes the new setup. Settings preview appearance without restarting terminal processes; cancel restores the saved appearance.

Save an SSH host/port/username, then open it. New or changed public host keys must be checked independently and explicitly approved before authentication. Changed keys also require the exact hostname. TermiX maintains its own known-hosts file and does not silently change OpenSSH's files.

Choose password, an existing private key (passphrase prompted, never saved), local SSH agent (no forwarding), or a saved Windows credential. Password saving is optional and happens only after successful verification/login, in Windows Credential Manager. The saved authentication method and key-file path are non-secret metadata; raw passwords/private keys are not stored in session JSON. Reconnect rechecks server identity. See docs/SECURITY.md for limits, cancellation behavior and manual checks still needed.

The Windows EXE installer uses matching artwork and English/German pages. It refreshes existing TermiX shortcuts to a dedicated icon file and requests a shell icon refresh; unrelated shortcuts and global icon caches are not deleted.

## Windows downloads and verification

Open **[GitHub Release v0.9.0](https://github.com/TomateMozzarella/TermiX/releases/tag/v0.9.0)** and choose `TermiX_0.9.0_x64-setup.exe` (guided installation), `TermiX_0.9.0_x64-portable.zip` (extract the complete ZIP, keep portable.flag, start TermiX.exe), or the MSI. The prerelease includes SHA256SUMS and release-manifest.json. Private-repository downloads require a signed-in account with repository access; the chat provides the same EXE directly as well.

Delivered v0.9 EXE SHA-256: `38d79115a06f675ef9b2d3fc24f895debab99f2103a5d98a5fbdd347447616be`. It matches GitHub and the chat copy. Close TermiX before upgrading; the installer can close the running installed app. Portable updates keep data beside the EXE. Saved commands require explicit execution; monitoring currently targets Linux.

Open the latest successful [Windows Actions run](https://github.com/TomateMozzarella/TermiX/actions/workflows/windows-build.yml) and download **TermiX-Windows-Installer** from Artifacts while signed into an account with repository access. Pull requests also build installers after running tests. v0.2.0 is the user-confirmed baseline; newer builds require their own installed-app check.

Delivered v0.3.0 EXE: `TermiX_0.3.0_x64-setup.exe`, SHA-256 `881ca996fa969e032dca8ef8a0d501e14be817b3c0b4e5d4ad81f122eec8ac77`. The chat also provides this exact installer directly, avoiding private-artifact browser access problems.

On the first launch, complete the four-step setup. Upgrading from v0.2.1 preserves the existing shell/font preferences and asks for the new options once. Preferences are stored locally only after a successful save. Open **Settings** (**Einstellungen**) to change them later: the default shell affects new tabs, while appearance and font size apply to existing terminals without restarting their processes.

Use + for independent tabs. Closing a tab terminates its shell and Windows job descendants; closing the window closes all terminals. An exited shell stays visible until its tab is closed. The terminal scrollback buffer stays in memory (5,000 lines) and is not saved in session JSON; shells may keep their own command history according to their configuration. Use standard terminal selection/copy/paste. Input/paste is limited to 256 KiB pending per tab; at most 16 live terminals can be opened.

Before marking the milestone complete, verify in the installed app: Unicode output, an interactive prompt, Ctrl+C, copy/paste, resize, tab switching without restarting the shell, closing a busy shell, and closing/reopening the app without leftover processes.

## Tests

Windows CI runs the frontend tests, Playwright browser workflows and production build. Native tests use actual PTYs, preference files, Windows Credential Manager and a loopback SSH server with isolated test-only passwords/keys and a Windows SSH agent. Browser tests mock desktop IPC and cover UI behavior independently of the native engine. A silent installation check verifies bundled resources and refresh of an existing desktop shortcut. Lockfiles are committed.

v0.4 adds shared Rust/TypeScript address cases, native migration/rollback/import/concurrent-writer checks, editor-path validation, browser workflows for sessions/folders/scaling/editor overrides, and Python checks that reject tampered or mismatched release receipts. File dialogs themselves still need installed interactive Windows checks.

## Development

Requires Rust stable, Node.js LTS and the Tauri platform prerequisites.
The commands below target Windows PowerShell. Generate the bundled artwork and license resource before launching/building the desktop app.

```bash
npm install
cargo fetch --locked --manifest-path src-tauri/Cargo.toml
python scripts/collect-licenses.py
npm run icons
./scripts/installer-assets.ps1
npm run tauri dev
```

## Production build

```bash
cargo fetch --locked --manifest-path src-tauri/Cargo.toml
python scripts/collect-licenses.py
npm run icons
./scripts/installer-assets.ps1
npm run tauri build
```

See https://v2.tauri.app/start/prerequisites/

## Design principles

- Keep credentials out of the session JSON file.
- Verify SSH host keys; never silently trust unknown hosts.
- Keep protocol engines in Rust and UI presentation in React.
- Use explicit Tauri capabilities and narrow IPC commands.
- Keep protocol-specific functionality behind backend interfaces.


