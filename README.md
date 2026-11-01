# TermiX

TermiX is an independent, cross-platform remote connection manager built with Tauri 2, Rust, React, TypeScript and xterm.js.

## Current status

This repository is the initial application foundation:
- Tauri 2 desktop shell
- React/TypeScript interface
- Session list with create/delete/persistence
- Multi-tab terminal UI shell
- xterm.js terminal renderer
- Windows/Linux-oriented project configuration

**Not implemented yet:** actual local PTY process transport, SSH transport/authentication, SFTP, port forwarding, RDP, serial and X11. The terminal currently displays a development placeholder; it does not pretend to establish a remote connection.

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
