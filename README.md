# TermiX

TermiX is an independent, cross-platform remote connection manager built with Tauri 2, Rust, React, TypeScript and xterm.js.

## Current status

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

**Still planned:** SFTP, actual embedded/external file editing, port forwarding, RDP, serial and X11. Optional pwsh/WSL/Git Bash discovery is deferred. Linux has a /bin/sh profile but has not received desktop validation. The editor choice is saved for the later editor milestone; setup never launches a program.

## v0.3.0 setup and SSH

The expanded assistant asks language (English by default, English/German available), shell, automatic/dark/light appearance, accent colour, font size and preferred editor. Automatic follows system changes. Preferences from v0.2.1 retain shell/font choices and request the new options once; saving completes the new setup. Settings preview appearance without restarting terminal processes; cancel restores the saved appearance.

Save an SSH host/port/username, then open it. New or changed public host keys must be checked independently and explicitly approved before authentication. Changed keys also require the exact hostname. TermiX maintains its own known-hosts file and does not silently change OpenSSH's files.

Choose password, an existing private key (passphrase prompted, never saved), local SSH agent (no forwarding), or a saved Windows credential. Password saving is optional and happens only after successful verification/login, in Windows Credential Manager. The saved authentication method and key-file path are non-secret metadata; raw passwords/private keys are not stored in session JSON. Reconnect rechecks server identity. See docs/SECURITY.md for limits, cancellation behavior and manual checks still needed.

The Windows EXE installer uses matching artwork and English/German pages. It refreshes existing TermiX shortcuts to a dedicated icon file and requests a shell icon refresh; unrelated shortcuts and global icon caches are not deleted.

## Windows downloads and verification

Open the latest successful [Windows Actions run](https://github.com/TomateMozzarella/TermiX/actions/workflows/windows-build.yml) and download **TermiX-Windows-Installer** from Artifacts while signed into an account with repository access. Pull requests also build installers after running tests. v0.2.0 is the user-confirmed baseline; newer builds require their own installed-app check.

Delivered v0.3.0 EXE: `TermiX_0.3.0_x64-setup.exe`, SHA-256 `881ca996fa969e032dca8ef8a0d501e14be817b3c0b4e5d4ad81f122eec8ac77`. The chat also provides this exact installer directly, avoiding private-artifact browser access problems.

On the first launch, complete the four-step setup. Upgrading from v0.2.1 preserves the existing shell/font preferences and asks for the new options once. Preferences are stored locally only after a successful save. Open **Settings** (**Einstellungen**) to change them later: the default shell affects new tabs, while appearance and font size apply to existing terminals without restarting their processes.

Use + for independent tabs. Closing a tab terminates its shell and Windows job descendants; closing the window closes all terminals. An exited shell stays visible until its tab is closed. The terminal scrollback buffer stays in memory (5,000 lines) and is not saved in session JSON; shells may keep their own command history according to their configuration. Use standard terminal selection/copy/paste. Input/paste is limited to 256 KiB pending per tab; at most 16 live terminals can be opened.

Before marking the milestone complete, verify in the installed app: Unicode output, an interactive prompt, Ctrl+C, copy/paste, resize, tab switching without restarting the shell, closing a busy shell, and closing/reopening the app without leftover processes.

## Tests

Windows CI runs the frontend tests, Playwright browser workflows and production build. Native tests use actual PTYs, preference files, Windows Credential Manager and a loopback SSH server with isolated test-only passwords/keys and a Windows SSH agent. Browser tests mock desktop IPC and cover UI behavior independently of the native engine. A silent installation check verifies bundled resources and refresh of an existing desktop shortcut. Lockfiles are committed.

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
