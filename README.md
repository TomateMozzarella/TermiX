# TermiX

TermiX is an independent, cross-platform remote connection manager built with Tauri 2, Rust, React, TypeScript and xterm.js.

## Current status

v0.2.0 local-terminal implementation (automated Windows PTY tests passed; installed-app validation pending):
- Tauri 2 desktop shell
- React/TypeScript interface
- Session list with create/delete/persistence
- Multi-tab terminal UI shell
- xterm.js terminal renderer
- Native PTY transport using portable-pty / Windows ConPTY
- Windows PowerShell and CMD profiles, independent tabs, input/output and resize
- Bounded output buffering and scrollback; tab/window cleanup with Windows process jobs
- Automated Rust PTY integration tests and frontend lifecycle tests
- Windows/Linux-oriented project configuration

**Not implemented yet:** SSH transport/authentication, SFTP, port forwarding, RDP, serial and X11. Optional pwsh/WSL/Git Bash profile discovery is deferred. Linux has a /bin/sh profile but has not received desktop validation.

## Windows downloads and verification

Open the latest successful [Windows Actions run](https://github.com/TomateMozzarella/TermiX/actions/workflows/windows-build.yml) and download **TermiX-Windows-Installer** from Artifacts. Pull requests also build installers after running tests. The previously verified v0.1.0 installer remains the baseline until the v0.2.0 workflow succeeds and the installed app is checked.

In the app, choose Windows PowerShell or CMD above Local Terminal. Use + for independent tabs. Closing a tab terminates its shell and Windows job descendants; closing the window closes all terminals. An exited shell stays visible until its tab is closed. Terminal history is in memory only (5,000 scrollback lines), not saved in session JSON. Use the terminal's standard selection/copy/paste shortcuts. Input/paste is limited to 256 KiB pending per tab; at most 16 live terminal tabs can be opened.

Before marking the milestone complete, verify in the installed app: Unicode output, an interactive prompt, Ctrl+C, copy/paste, resize, tab switching without restarting the shell, closing a busy shell, and closing/reopening the app without leftover processes.

## Tests

`npm ci`, `npm test`, `npm run build` and `cargo test --locked --manifest-path src-tauri/Cargo.toml` run in Windows CI before installer packaging. Lockfiles are committed. Backend tests use actual PTYs, not mocked shell output.

## Development

Requires Rust stable, Node.js LTS and the Tauri platform prerequisites.

```bash
npm install
npm run tauri dev
```

## Production build

```bash
npm run tauri build
```

See https://v2.tauri.app/start/prerequisites/

## Design principles

- Keep credentials out of the session JSON file.
- Verify SSH host keys; never silently trust unknown hosts.
- Keep protocol engines in Rust and UI presentation in React.
- Use explicit Tauri capabilities and narrow IPC commands.
- Keep protocol-specific functionality behind backend interfaces.
