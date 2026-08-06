# Data And State

FluxIQ stores framework runtime state in the importing repository. Runtime state
should not be committed to the public framework repository.

## Root Paths

The default host state root is:

```text
.fluxiq/
```

Layout v2 is intentionally sparse:

```text
.fluxiq/
  config.json
  global.sqlite                 # created on the first global write
  artifacts/automation-studio/ # created only for large immutable objects
  domains/<domainId>/
    domain.sqlite               # created on the first domain write
    config/                     # created only when used
    data/                       # created only when used
  cache/                        # rebuildable; created only when used
  logs/                         # created only when used
  tmp/                          # created only when used
```

`FluxIQ.create()` is read-only. On a fresh host, `setup()` creates only
`.fluxiq/config.json`; databases and directories are created by their first
owning write. `FLUXIQ_ROOT` and `FLUXIQ_DIR` select the host and state roots.
Legacy per-folder overrides remain accepted for compatibility, but they are
externally managed and block automatic v1-to-v2 migration.

When the web panel is run from the FluxIQ framework checkout during local
development, it must be pointed at the importing repository explicitly. Set
`FLUXIQ_IMPORTER_ROOT`, `FLUXIQ_HOST_ROOT`, or `FLUXIQ_ROOT` to the repository
that owns the `.fluxiq` folder. The web panel refuses to silently use the
FluxIQ source checkout as the host root unless
`FLUXIQ_ALLOW_FRAMEWORK_REPO_ROOT=true` is set for deliberate framework-only
development.

Importing repositories can also attach domain-specific framework registration
to the web panel with `FLUXIQ_HOST_MODULE`. The value must be a path to a
CommonJS module that exports either `registerFluxIQHost(fluxiq)` or a default
synchronous registration function. The web runtime creates the plain `FluxIQ`
instance, loads this module, and lets the importer register recording domains,
nodes, adapters, or other host-owned extensions before API routes and the
client gateway start using the shared runtime.

The importing repository remains the domain authority. Its domain manifest and
host registration provide the domain name, labels, recording contracts,
adapters, and extensions shown by the global editor. "Global" means the editor
and framework control plane share one storage owner; it does not replace or
rename the importer-defined domain. Selecting another domain changes domain
runtime paths and filters/targets data, but never relocates identity, trusted
clients, or Automation Studio projects.

## Global SQLite Database

The global framework database is:

```text
.fluxiq/global.sqlite
```

Framework stores should use this database unless they are intentionally
domain-scoped or file-based artifacts.

Current global stores include:

- `identity.users`;
- `background.tasks`;
- `compute.nodes`;
- `deployment.targets`;
- `production.targets`;
- `program.state` for global program documents, including trusted clients;
- `automation.state` for Automation Studio project and pipeline documents;
- canonical Automation Studio recording, timeline, signal, model, and policy
  repositories.

Domain repository records use `.fluxiq/domains/<domainId>/domain.sqlite`.
Domain IDs are normalized path/storage keys; user-facing identity still comes
from the importer's registered manifest.

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

## Background Tasks State

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

- `.fluxiq/global.sqlite` and SQLite sidecars;
- `.fluxiq/artifacts`;
- `.fluxiq/domains` runtime data;
- `.fluxiq/cache`;
- `.fluxiq/logs`;
- `.fluxiq/tmp`;
- `.fluxiq/legacy` migration archives;
- `.next`;
- generated private domain artifacts.

## Storage Migration

Hosts without `config.json` but with legacy `.fluxiq/data`, `databases`, or an
active-domain-scoped state tree are reported as layout v1. Normal runtime setup
does not migrate implicitly. Inspect with `fluxiq.inspectStorage()` and apply
with `await fluxiq.migrateStorage()` (or authenticated `POST
/api/framework/setup` with `{ "action": "migrate" }`). The web runtime reloads
its FluxIQ instance after migration so resolved paths switch to v2.

Migration uses an exclusive lock and a restartable journal below
`.fluxiq/.migration/v2`. It stages and verifies databases/documents first,
rejects divergent stable-ID collisions, archives recognized sources under
`.fluxiq/legacy/v1-<timestamp>/`, and writes `config.json` last as the v2 commit
marker. External overrides are inventoried but never moved automatically. An
incomplete pre-commit migration can be resumed by calling `migrateStorage()`
again or rolled back with `rollbackStorageMigration()`.
