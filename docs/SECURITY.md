# SSH security design (v0.3.0)

This is a test-build security design, not a claim of production readiness or a completed independent audit.

## Trust boundaries
- Rust owns TCP, the libssh2/OpenSSL SSH engine, private-key file access and Windows Credential Manager calls. The webview receives public fingerprints and an opaque transport ID, not private-key contents or saved passwords.
- Passwords/passphrases entered in the UI cross narrowly scoped IPC once; visible fields are immediately cleared. JavaScript strings cannot be reliably zeroized. Rust auth buffers use zeroize on drop, with best-effort handling of library-owned copies. No secrets are written to JSON, command arguments, application logs or telemetry.
- Saved session data contains connection metadata, authentication method and an existing key-file path only. Editor preference/path is metadata and does not execute a program in this release.

## Server identity
- TCP connect, SSH handshake and SHA-256 fingerprint collection happen before authentication. A pending connection is bound to an opaque, expiring ticket. Approval authenticates that same connection, avoiding a second unverified handshake.
- TermiX stores public host keys in its own local known-hosts file. It does not silently import, replace or edit the user's OpenSSH known_hosts.
- First-seen keys require explicit fingerprint approval. Changed keys block the connection, show old/new fingerprints and require independent verification plus the exact hostname and an explicit replace decision.
- Rust enforces these decisions independently of the UI and rechecks the persisted pin snapshot before authentication. Corrupt trust files fail closed and are not overwritten.
- Algorithm preferences exclude SHA-1 host-key signatures, DSA, group1, CBC and SHA-1 MAC fallback. Unsupported legacy servers fail negotiation instead of weakening policy.

## Credentials
- Agent authentication never enables agent forwarding. Existing encrypted private keys are referenced by absolute path, not copied into app storage; passphrases are not saved.
- Saving a password is opt-in, Windows-only, and happens after successful host verification, authentication and terminal allocation. Windows stores it under a per-endpoint/username TermiX generic-credential target. Stored mode reads the password entirely in Rust. A forget action deletes that specific target.
- The OS credential vault does not protect against malware or another program running as the same user. Remote shells may independently save command history; TermiX's in-memory scrollback policy does not govern that history.

## Lifetime and resource limits
- Connections, authentication work and pending trust tickets are bounded. DNS/connect/handshake operations have deadlines/timeouts. No arbitrary local SSH command line is constructed.
- Non-blocking channel I/O is serialized per transport; input is ordered/bounded, output is pulled at the renderer's pace, resize is coalesced. Closing a tab/window shuts down its socket. Reconnect repeats server verification.
- Closing an in-flight authentication dialog ignores the result and closes a late successful transport; underlying blocking authentication may finish at its timeout. A stalled local agent may depend on the agent's own responsiveness. These need manual failure-path review before production use.

## Verification
CI uses an isolated loopback SSH server and test-only RSA keys/passwords. Tests cover first-use approval, changed-key rejection/replacement, rejection before any password authentication, real encrypted transport, Unicode/input, PTY resize, disconnect/reconnect, encrypted key authentication, Windows SSH-agent authentication, invalid credentials, expired tickets and corrupt trust files. Windows vault tests create/update/delete a unique test-only credential. Browser tests cover the independent approval UI and late-cancellation handling.

Remaining checks: installed Windows desktop shortcut/installer appearance, real OpenSSH hosts and Ed25519/encrypted OpenSSH keys, interrupted/slow networks, local-agent failure, multiple app instances and an independent security review. SFTP, forwarding and file editing remain outside this release.
