# TermiX

TermiX is an independent, cross-platform remote connection manager built with Tauri 2, Rust, React, TypeScript and xterm.js.

## Current status

v0.2.0 real local terminals passed Windows CI and were confirmed working by the user. v0.2.1 adds first-run setup, persistent settings and visual refinement (new installer verification pending):
- Tauri 2 desktop shell
- React/TypeScript interface
- Session list with create/delete/persistence
- Multi-tab terminal UI shell
- xterm.js terminal renderer
- Native PTY transport using portable-pty / Windows ConPTY
- Windows PowerShell and CMD profiles, independent tabs, input/output and resize
- Bounded output buffering and scrollback; tab/window cleanup with Windows process jobs
- Automated Rust PTY integration tests and frontend lifecycle tests
- First-run assistant for default shell and font size; settings can change these later
- A shared SVG logo for the interface and generated Windows application/installer icons
- Dark title bar and scrollbars, a single footer status, and a cleaner sidebar
- Windows/Linux-oriented project configuration

**Not implemented yet:** SSH transport/authentication, SFTP, port forwarding, RDP, serial and X11. Optional pwsh/WSL/Git Bash profile discovery is deferred. Linux has a /bin/sh profile but has not received desktop validation.

## Windows downloads and verification

Open the latest successful [Windows Actions run](https://github.com/TomateMozzarella/TermiX/actions/workflows/windows-build.yml) and download **TermiX-Windows-Installer** from Artifacts while signed into an account with repository access. Pull requests also build installers after running tests. v0.2.0 is the user-confirmed baseline; newer builds require their own installed-app check.

On the first launch (also after upgrading without preferences), choose Windows PowerShell or CMD in the setup assistant, then choose a font size. Preferences are stored locally only after a successful save. Open **Einstellungen** to change them later: the default shell affects new tabs, while font size applies to existing terminals without restarting their processes.

Use + for independent tabs. Closing a tab terminates its shell and Windows job descendants; closing the window closes all terminals. An exited shell stays visible until its tab is closed. The terminal scrollback buffer stays in memory (5,000 lines) and is not saved in session JSON; shells may keep their own command history according to their configuration. Use standard terminal selection/copy/paste. Input/paste is limited to 256 KiB pending per tab; at most 16 live terminals can be opened.

Before marking the milestone complete, verify in the installed app: Unicode output, an interactive prompt, Ctrl+C, copy/paste, resize, tab switching without restarting the shell, closing a busy shell, and closing/reopening the app without leftover processes.

## Tests

`npm ci`, `npm test`, `npm run test:ui`, `npm run build`, `npm run icons` and `cargo test --locked --manifest-path src-tauri/Cargo.toml` run in Windows CI before installer packaging. Browser tests use Playwright Chromium with mocked desktop IPC to verify UI behavior; backend tests use actual PTYs and actual preference files. Lockfiles are committed.

## Development

Requires Rust stable, Node.js LTS and the Tauri platform prerequisites.

```bash
npm install
npm run icons
npm run tauri dev
```

## Production build

```bash
npm run icons
npm run tauri build
```

See https://v2.tauri.app/start/prerequisites/

## Design principles

- Keep credentials out of the session JSON file.
- Verify SSH host keys; never silently trust unknown hosts.
- Keep protocol engines in Rust and UI presentation in React.
- Use explicit Tauri capabilities and narrow IPC commands.
- Keep protocol-specific functionality behind backend interfaces.
