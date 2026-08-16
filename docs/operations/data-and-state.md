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

## Automation Studio State Presentation

Automation Studio state snapshots are factual runtime evidence. They may also
carry optional presentation metadata for the State View: labels, groups, visual
kinds, evidence anchors, and declarative visual frames. These fields describe
how to reconstruct what the importer saw; they do not encode whether a value is
eligible, critical, or expected for a node.

Visual frames are JSON metadata. Small frames can live with the snapshot or
derived recording artifact. Large screenshots, images, and binary payloads must
live in the owning project's object storage and be referenced by an Automation
Studio object/API reference. Framework code must reject arbitrary filesystem
paths and must not commit importing-repo visual assets into the public FluxIQ
repository.

Project object storage is digest-addressed and physically scoped by ownership.
Binary visual assets are written under the owning Automation Studio project,
indexed by SHA-256, content type, size, and storage path, and read back only
through a project-plus-digest lookup. Uploads tied to an active client-gateway
recording are stored under:

```text
.fluxiq/artifacts/automation-studio/projects/<projectId>/recordings/sessions/<recordingId>/objects/
```

Large shared/generated objects that are not owned by a recording are stored
under:

```text
.fluxiq/artifacts/automation-studio/projects/<projectId>/objects/shared/
```

The small project object index remains project-scoped so the authenticated
`projectId` plus digest route can resolve both recording-owned and shared
objects without exposing filesystem paths.
State snapshots should store `automation-object://project/<projectId>/<sha256>`
references, or the corresponding authenticated API path when data is already
being prepared for the web client. They should never store absolute paths,
`file://` URLs, or untrusted remote image URLs.

The web State View resolves project object references through:

```text
/api/programs/automation-studio/state-assets/<projectId>/<sha256>
```

That route validates the user's session, requires `programs.read`, checks the
project and object index membership, preserves the asset content type and
length, and returns `404` for missing, unauthorized, or non-renderable objects.
Broken references remain visible as placeholders in the State View instead of
silently rendering arbitrary local or remote content.

The same digest route accepts screenshot uploads with `PUT`. Upload callers must
already know the SHA-256 digest and send raw image bytes with `Content-Type`
`image/png`, `image/jpeg`, `image/webp`, or `image/gif`. The write path requires
either a web session with `programs.write` or a paired client-gateway bearer
token. Uploads made with a paired client that has an active recording are
stored in that recording's object folder. It caps uploads at 20 MiB, stores
bytes in the project object store, verifies that the stored digest matches the
URL digest, and returns the
canonical `automation-object://project/<projectId>/<sha256>` reference plus the
authenticated API path. This lets importers use screenshots as optional visual
backgrounds while FluxIQ keeps element bounds, labels, anchors, and evidence
overlays as structured, selectable state data.

Project object index updates are serialized per project in the framework
object store. Index replacement uses a temporary file plus retry/backoff for
Windows `EPERM`/`EBUSY` filesystem locks before falling back to a direct index
write. This protects high-frequency screenshot uploads from losing index
entries or failing recording append when a local watcher or antivirus briefly
locks `objects/index.json`.

State rendering treats screenshot pixels and document reconstruction as
different coordinate kinds in one combined canvas. Screenshot image layers and
screenshot BBoxes use viewport coordinates (`boundsKind: "screenshot"` and
usually `renderKind: "screenshot-bbox"`), then render at the current
`scrollX`/`scrollY` position inside the document canvas when document metadata
is available. Full-page structured element state uses document coordinates
(`boundsKind: "document"` and optionally `renderKind: "direct-rendered"`). The
web State View can therefore show a reliable viewport screenshot and reconstruct
known elements outside the screenshot without scroll-stitched images.

Recording deletion prunes project object-store entries that are no longer
referenced by any remaining project recording or derived Automation Studio
artifact. This removes screenshot objects from the deleted recording and also
cleans up older orphaned project objects the next time a recording is deleted.
Recording-owned uploads are already written under the owning recording's session
folder, while ambiguous uploads live under `objects/shared/`; delete avoids a
full-project object reorganization on the hot path. Shared digest objects stay
in place until the last live reference is removed. Recording deletion also
removes the recording session directory itself, so unindexed screenshots, stale
derived JSON, and other physical leftovers under the deleted recording are not
retained.
Pipeline cleanup is ownership-based: artifacts indexed to the deleted recording
or whose JSON payload identifies that recording are removed from both
recording-owned and legacy shared locations. After each recording deletion,
FluxIQ also sweeps physical recording session folders that no longer correspond
to a live recording, which removes leftovers from recordings deleted before the
stricter cleanup logic existed.

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

Host-specific operator snapshots are written under:

```text
.fluxiq/cache/docs/
```

They are ignored, rebuildable runtime state and may contain local paths, Git
metadata, database counts, task schedules, importer domains, and registered IO.
The Docs program reads them as a separate allowlisted source and never writes
into importer-authored `docs/` content. The deterministic public API inventory
is versioned separately at `docs/reference/framework-reference.md`.

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

## Malformed Legacy JSON Recovery

Legacy file-backed program stores distinguish missing state from malformed
state. A missing file still means an unused empty store. Invalid JSON or an
invalid `{ version: 1, data: object }` envelope raises
`ProgramStateReadError` with the exact path instead of silently discarding the
problem.

Framework code handling an explicitly confirmed corrupt legacy file can call
`recoverMalformedState()`. Recovery renames the original to a unique
`.corrupt.<timestamp>.<id>.bak` file and writes a valid empty envelope. If the
replacement write fails, FluxIQ attempts to restore the original path. SQLite-
backed corruption is never reset through this file helper; inspect and repair
the owning record through Database Manager or restore the database from backup.

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
