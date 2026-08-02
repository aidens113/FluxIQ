# Data And State

FluxIQ stores framework runtime state in the importing repository. Runtime state
should not be committed to the public framework repository.

## Root Paths

The default host state root is:

```text
.fluxiq/
```

The default database root is:

```text
.fluxiq/databases/
```

These paths can be overridden through `FluxIQ.create(...)` or environment
variables such as `FLUXIQ_ROOT`, `FLUXIQ_DIR`, and `FLUXIQ_DATABASES_DIR`.

When the web panel is run from the FluxIQ framework checkout during local
development, it must be pointed at the importing repository explicitly. Set
`FLUXIQ_IMPORTER_ROOT`, `FLUXIQ_HOST_ROOT`, or `FLUXIQ_ROOT` to the repository
that owns the `.fluxiq` folder. The web panel refuses to silently use the
FluxIQ source checkout as the host root unless
`FLUXIQ_ALLOW_FRAMEWORK_REPO_ROOT=true` is set for deliberate framework-only
development.

## Global SQLite Database

The global framework database is:

```text
.fluxiq/databases/global.sqlite
```

Framework stores should use this database unless they are intentionally
domain-scoped or file-based artifacts.

Current global stores include:

- `identity.users`;
- `background.tasks`;
- `compute.nodes`;
- `deployment.targets`;
- `production.targets`.

## Background Tasks State

## Identity State

Users, roles, credentials, sessions, and identity vault status are stored in
the `identity.users` table inside `global.sqlite`.

Credential records are encrypted at rest. The credential payload is sealed with
AES-256-GCM using a key derived from the user's password with `scrypt`; inside
that encrypted payload, passwords and PINs are still stored only as salted
`scrypt` hashes. Raw passwords and raw PINs must never be stored in JSON files,
SQLite records, logs, generated docs, or UI state beyond the active form
submission.

Database Manager treats the `identity.users` store as sensitive because it can
contain encrypted credential records. Viewing that store opens a modal
credential recheck using the current user's configured factors: password
always, PIN only when configured, and 2FA only when enabled. Non-secret identity
metadata remains readable so login, session routing, and status displays can
work without decrypting credential payloads.

Existing plaintext credential records from pre-encryption development builds
are migrated opportunistically. A user's legacy `credential:<userId>` record is
sealed after that user successfully logs in, because the framework needs the
user's password to derive the encryption key. Admin password resets can also
replace a legacy credential bundle under the new password.

Record ids follow this shape:

```text
user:<userId>
role:<roleId>
credential:<userId>
session:<sessionId>
vault
```

The first default admin user is created with username `admin` and password
`admin`. No default PIN is created.

Background task scheduler state, task definitions, and recent run history are
stored in the `background.tasks` table inside `global.sqlite`.

Record ids follow this shape:

```text
scheduler
task:<taskId>
run:<runId>
```

Writes are batched every 10 seconds. The service updates in-memory state
immediately, then flushes a full state snapshot to SQLite on the batch window.

## Generated Documentation

Generated Markdown docs are written under:

```text
docs/generated/
```

They are not framework source code, but they are intentionally readable in Git.
When generated docs become noisy or shallow, improve the generator and authored
docs rather than treating generated output as the design source of truth.

## Runtime Artifacts

These host-owned folders should not be committed from framework development:

- `.fluxiq/data`;
- `.fluxiq/databases`;
- `.fluxiq/logs`;
- `.fluxiq/tmp`;
- `.fluxiq/recordings`;
- `.fluxiq/policies`;
- `.next`;
- generated private domain artifacts.
