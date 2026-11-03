# SSH security design (v0.3.0)

## v0.4 session library and release additions
- Session/folder changes are validated in Rust and atomically replace a versioned catalog. An OS file lock serializes cooperating writers, and comparison with the last loaded bytes rejects stale updates. Reload after an external change; disk/write failures do not publish a new in-memory state. A legacy array receives a non-overwritten backup before its first migration write. Unknown legacy/import fields are rejected before a raw legacy backup could copy credential fields.
- Import uses an explicit native JSON picker, a 4 MiB bound, schema/field validation and preview/confirmation. Imports receive fresh session IDs and cannot replace existing sessions by ID. Exports contain typed metadata only, never the vault, private-key file contents or known-host trust. File selection is explicit; no generic frontend read/write-path API is exposed.
- Editor discovery checks bounded standard locations/registry/PATH entries. The native EXE picker and save validation do not execute programs. Actual editing remains outside v0.4.
- Pasted HTTP(S)/SSH addresses are normalized to SSH endpoints; protocol/port defaults and host-key verification are not weakened. Embedded credentials, paths/query/fragments and ambiguous hosts are rejected with actionable feedback.
- Release publication is limited to main and consumes a successful same-repository PR build at that exact commit. Receipt source SHA, workflow run, installer names/types, byte lengths and SHA-256 values are checked before publication. Releases are drafted with all assets before becoming visible and are not overwritten on subsequent same-version pushes. These receipts are provenance checks, not code signing or an independent security audit.

The SSH trust/credential design below is retained for v0.4.

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
- Agent authentication never enables agent forwarding. It tries at most 16 local identities within a deadline; a server may enforce a smaller authentication-attempt limit. Existing encrypted private keys are referenced by absolute path, not copied into app storage; passphrases are not saved.
- Saving a password is opt-in, Windows-only, and happens after successful host verification, authentication and terminal allocation. Windows stores it under a per-endpoint/username TermiX generic-credential target. Stored mode reads the password entirely in Rust. A forget action deletes that specific target.
- The OS credential vault does not protect against malware or another program running as the same user. Remote shells may independently save command history; TermiX's in-memory scrollback policy does not govern that history.

## Lifetime and resource limits
- Connections, authentication work and pending trust tickets are bounded. DNS/connect/handshake operations have deadlines/timeouts. No arbitrary local SSH command line is constructed.
- Non-blocking channel I/O is serialized per transport; input is ordered/bounded, output is pulled at the renderer's pace, resize is coalesced. Closing a tab/window shuts down its socket. Reconnect repeats server verification.
- Closing an in-flight authentication dialog ignores the result and closes a late successful transport; underlying blocking authentication may finish at its timeout. A stalled local agent may depend on the agent's own responsiveness. These need manual failure-path review before production use.

## Verification
CI uses an isolated loopback SSH server with an Ed25519 host key, encrypted RSA PEM and Ed25519 OpenSSH identities, and test-only passwords. Tests cover first-use approval, changed-key rejection/replacement, rejection before any password authentication, real encrypted transport, Unicode/input, PTY resize, Ctrl+C, exit status, disconnect/reconnect, encrypted key authentication, Windows SSH-agent authentication with an unrelated identity first, invalid credentials, expired tickets and corrupt trust files. Windows vault tests create/update/delete a unique test-only credential and reuse a saved password through Rust SSH authentication. Browser tests cover the independent approval UI and late-cancellation handling.

Remaining manual checks: installed Windows appearance and Explorer's displayed shortcut icon, interoperability with independently configured real OpenSSH hosts/key files, interrupted/slow networks, local-agent failure, multiple app instances and an independent security review. SFTP, forwarding and file editing remain outside this release.
