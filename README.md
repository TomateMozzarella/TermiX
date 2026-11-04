# TermiX

TermiX is an independent, cross-platform remote connection manager built with Tauri 2, Rust, React, TypeScript and xterm.js.

## v0.6 development

Active work adds Monaco remote editing and explicit external-editor working copies, WebView2 drag fixes, configurable SFTP side/start directory, context menus, independent terminal colours and upgrade verification. SSH monitoring remains pending after the user advanced to this milestone. See docs/ROADMAP.md for scope and verified delivery status.

## Current status

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

**Still planned:** actual embedded/external file editing, port forwarding, RDP, serial and X11. Optional pwsh/WSL/Git Bash discovery is deferred. Linux has a /bin/sh profile but has not received desktop validation. The editor choice is saved for the later editor milestone; setup never launches a program.

## v0.3.0 setup and SSH

The expanded assistant asks language (English by default, English/German available), shell, automatic/dark/light appearance, accent colour, font size and preferred editor. Automatic follows system changes. Preferences from v0.2.1 retain shell/font choices and request the new options once; saving completes the new setup. Settings preview appearance without restarting terminal processes; cancel restores the saved appearance.

Save an SSH host/port/username, then open it. New or changed public host keys must be checked independently and explicitly approved before authentication. Changed keys also require the exact hostname. TermiX maintains its own known-hosts file and does not silently change OpenSSH's files.

Choose password, an existing private key (passphrase prompted, never saved), local SSH agent (no forwarding), or a saved Windows credential. Password saving is optional and happens only after successful verification/login, in Windows Credential Manager. The saved authentication method and key-file path are non-secret metadata; raw passwords/private keys are not stored in session JSON. Reconnect rechecks server identity. See docs/SECURITY.md for limits, cancellation behavior and manual checks still needed.

The Windows EXE installer uses matching artwork and English/German pages. It refreshes existing TermiX shortcuts to a dedicated icon file and requests a shell icon refresh; unrelated shortcuts and global icon caches are not deleted.

## Windows downloads and verification

Open **[GitHub Release v0.5.0](https://github.com/TomateMozzarella/TermiX/releases/tag/v0.5.0)** and choose `TermiX_0.5.0_x64-setup.exe` (guided installation) or the MSI. The prerelease includes SHA256SUMS and release-manifest.json. Private-repository downloads require a signed-in account with repository access; the chat provides the same EXE directly as well.

Delivered v0.5 EXE SHA-256: `ad92f81c88ff438d25497eb8ab50b7d344ca76134fb6dd6af1921ba05aa9b4f0`. It matches GitHub's published asset digest and the locally transferred installer. Close TermiX before upgrading. SSH monitoring is next in v0.5.x; actual editing follows in v0.6.0 and macros in v0.7.0.

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
