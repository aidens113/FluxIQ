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
module that exports either `registerFluxIQHost(fluxiq)` or a default
synchronous registration function. The web server loads it once at startup
with a native `import()` (`apps/web/src/instrumentation.ts`). Build it as an ES
module (`.mjs`, or `.js` under `"type": "module"`): FluxIQ packages are
ESM-only, and only an ES module host can import public subpaths such as
`fluxiq/automation-studio`. A CommonJS host still loads if it imports nothing
from FluxIQ at runtime. The web runtime creates the plain `FluxIQ`
instance, applies this module, and lets the importer register recording domains,
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
- `secret.keys`;
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
AES-256-GCM under a key derived from the user's password with `scrypt` at
N=2^17, r=8, p=1. The envelope is `version: 2`, records those parameters in
`kdfParams`, and derives its key from the decoded salt bytes. Inside the
encrypted payload, passwords and PINs are stored only as salted `scrypt` hashes
in PHC form, `$scrypt$ln=17,r=8,p=1$<salt>$<hash>`. Raw passwords and raw PINs
must never be stored in JSON files, SQLite records, logs, generated docs, or UI
state beyond the active form submission.

Derivations run off the event loop, at most two at a time in the process. A
login spends one derivation. An unknown or disabled username runs a dummy
derivation, so the response time does not reveal whether the account exists.

Older records upgrade themselves with no user step. A `version: 1` envelope,
derived at Node's default N=2^14 from the salt text, and `scrypt:` hashes are
still read. After that user's next successful login, the credential is
re-sealed as version 2 and its password hash rehashed. A PIN hash is rehashed
the next time the PIN is checked while the credential is unlocked. A record at
or above the current cost is not rewritten, and a failed attempt changes
nothing.

No PIN verifier is stored outside the seal. A PIN is checked only against the
credential unlocked in this process, so after a restart a PIN-gated action asks
the user to sign out and sign back in. The first load removes a
`pinVerifierHash` that an older build stored.

Sessions are stored under the SHA-256 digest of the session id, as client
gateway tokens are. The id itself is the cookie's bearer value and is never
stored. The first load deletes session records an older build stored under a
raw id, so those users sign in again. Identity Access snapshots list sessions by
digest.

### Which Identity Access endpoints require a credential recheck

An endpoint that hands out authority refuses to act until the calling session
re-proves its own credentials, through `authorizeSessionCredentials`: the
password always, the PIN when the acting user has one configured, and the
authenticator code when the acting user has two-factor authentication enabled.
The `identity.manage` permission is not enough on its own, because it says what
the role may do, not that the person at the keyboard is still the account
holder. A failed recheck answers `{ ok: false, requiresRecheck: true }`, which
tells the client to collect the factors again rather than to report a
permission failure.

These endpoints require the recheck:

- `create-user` — a new account is durable authority. The caller chooses its
  role and its initial password, and the account outlives the session that
  made it.
- `update-user`, when it changes `roleId` or `enabled` — a promotion is the
  same authority arriving at an existing account, enabling an account hands
  access back, and disabling one takes it from whoever was relying on it. A
  disabled administrator that could be switched on again with nothing proved
  would be a dormant escalation. The gate is on those two fields rather than on
  the endpoint: a rename or display-name edit carries no authority and stays
  open, so routine profile maintenance does not ask for a password.
- `set-password`, `set-pin` — credential rotation, through
  `setPasswordAuthorized` and `setPinAuthorized`.
- `begin-totp`, `confirm-totp` — enrollment issues the authenticator secret for
  an account and replaces any secret already set up for it, so an ungated
  enrollment achieves what an ungated disable would, and more.
- `disable-totp` — removes authenticator protection.
- `create-session` — a minted session is a bearer credential for the named
  user, so it lets one account act as another.
- `unlock-vault` — the vault credentials travel with a `userId` the caller
  chooses, and the recheck binds the unlock to the calling session.

These endpoints deliberately do not, and the omission is a decision rather than
a gap: `revoke-session` and `lock-vault` only take authority away. Revocation
is the action an operator reaches for when a session is already compromised, so
putting a credential prompt in front of it would keep the stolen session alive
for exactly as long as the prompt takes to answer, and a lock must never be the
step that fails when someone is trying to shut the vault. `snapshot` persists
nothing and lists sessions by digest only.

A vault unlock decides what must be proved from what the account has
configured, never from what the caller chose to send: an omitted password or
PIN is an unproved one, and an account holding no password verifier can prove
nothing and so unlocks nothing. Such an account cannot sign in either.

The web panel collects the factors in a modal on each of these actions, and
`withProgramAuthSession` overwrites `authSessionId` on every `identity-access`
call with the session id the server trusts, so a client cannot name someone
else's session as the one being re-proved.

An existing account's credentials change only through a password change
(`setPassword`, `setPasswordAuthorized`) or a PIN change (`setPin`,
`setPinAuthorized`); `upsertUser` refuses a password or PIN for an existing
account. A password change runs through the Identity Access credential-change
port: subscribers prepare, the credential is written, then they commit. A
subscriber that fails to prepare refuses the change. Once the credential is
written the change stands: a subscriber that fails to commit is logged with the
change id, user id, and failure count only, never an error text, and the
password change still succeeds. The global runtime
subscribes Secret Keys, so a user who changes their own password can still read
their Secret Keys with the new one. An administrator's reset of another account
has no current password to open that account's keys with, so those keys stay
sealed under the old password and cannot be read with the new one.

Database Manager treats the `identity.users` store as sensitive because it can
contain encrypted credential records. It also treats `secret.keys` as sensitive
because it contains encrypted LLM and custom key payloads. Viewing that store opens a modal
credential recheck using the current user's configured factors: password
always, PIN only when configured, and 2FA only when enabled. `put-record` and
`delete-record` on either store require the same recheck. Non-secret identity
metadata remains readable so login, session routing, and status displays can
work without decrypting credential payloads.

Existing plaintext credential records from pre-encryption development builds
are migrated opportunistically. A user's legacy `credential:<userId>` record is
sealed as version 2 after that user successfully logs in, because the framework
needs the user's password to derive the encryption key. Admin password resets
can also replace a legacy credential bundle under the new password.

Upgraded records move forward only. A build older than `fluxiq` 0.5.0 skips
version 2 records: a user whose credential was re-sealed cannot log in to it,
and upgraded Secret Keys disappear from it. Rolling back means rolling forward
again or restoring a `global.sqlite` backup taken before the upgrade.

The web login counts failed attempts in three files under `.fluxiq/security/`,
each over a ten-minute window with a one-minute lockout:
- `login-attempts.json` counts per username, keyed together with the client
  address when a trusted proxy forwards one: five failures lock that username
  out.
- `login-address-attempts.json` counts per client address whatever the
  username: twenty failures lock that address out. It applies only when
  `FLUXIQ_TRUST_PROXY=true` and the proxy forwards an address, so clients never
  share one address bucket.
- `login-panel-attempts.json` counts every failed login on the panel: one
  hundred failures lock out every login.

A successful login clears only the username count. An authenticator-code prompt
after a correct password counts only against the username.

Record ids follow this shape:

```text
user:<userId>
role:<roleId>
credential:<userId>
session:<SHA-256 hex digest of the session id>
vault
```

The first default admin user is created with username `admin` and password
`admin`. No default PIN is created.


## Secret Key State

LLM provider keys and custom framework secrets are stored in the `secret.keys`
table inside `global.sqlite`.

Each secret key record stores redacted metadata next to a sealed value payload.
The value payload is encrypted with AES-256-GCM under a key derived with
`scrypt`, at the same cost as identity credential records, from the password of
the user who created or last rotated the key. A version 2 seal records
`kdfParams` and, when it was sealed for a user, that user's id in
`sealedByUserId`. Snapshots and list responses do not include raw secret values.

A value is decrypted only with a password or a key derived from one. An explicit
reveal and a runtime resolver's reveal authorization each take a fresh
credential recheck, and creating an authorization checks that the password opens
the key. Login also opens values: `unlockSession` tries every key sealed for
that user, plus keys with no `sealedByUserId` and version 1 keys, and holds the
derived keys of those that open for that session. A key keeps unlocking after a
metadata edit, because its seal is matched to its `lastRotatedAtMs`.

An older seal upgrades itself after a successful unlock or reveal. A version 1
seal (`scrypt` at N=2^14, keyed from the salt text) or one below the current
cost is re-sealed as version 2, once per record, stamped for the user whose
password opened it, keeping `updatedAtMs` and `lastRotatedAtMs`. The new derived
key replaces the old one for every holder, and the old key buffers are zeroed. A
seal is never rewritten at a lower cost.

When a user changes their own password, their keys are re-sealed under the new
password: prepared before the credential is written, applied after it. If they
cannot be prepared, the password change is refused. The user's sessions keep the
key; every other holder, such as an outstanding reveal authorization, is
revoked. A key rotated or deleted in between keeps its newer state. An
administrator's reset of another account cannot re-seal that account's keys,
which stay sealed under the old password.

Database Manager treats `secret.keys` as sensitive. Viewing that store opens the
same modal credential recheck used for `identity.users`: password always, PIN
only when configured, and 2FA only when enabled. `put-record` and
`delete-record` on it require the same recheck.

Record ids follow this shape:

```text
secret:<uuid>
```

Secret records include `recordType: "secret-key"`, `encrypted: true`, metadata
such as `kind`, `provider`, `scope`, and `enabled`, plus a `sealed` envelope
containing `version`, the encryption algorithm, KDF, `kdfParams` (version 2),
salt, IV, tag, ciphertext, and for version 2 an optional `sealedByUserId`. Raw
LLM keys and custom token values must never be written to logs, generated docs,
runtime debug payloads, or non-secret UI state.

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

The web panel awaits storage readiness before serving requests. It initializes
only a genuinely fresh root, serializing concurrent startup through one
runtime-owned promise. A v1 or incomplete-migration root fails startup without
mutation and must use the protected migration or rollback path explicitly;
authentication must never create state before the v2 commit marker exists.

A marker-less root containing a root-level `global.sqlite` and only
unambiguous v2-owned top-level state is reported as `uncommitted_v2`, not v1.
This can result from a host that wrote authentication state before the v2
marker was committed. Setup and v1 migration both refuse it. Recovery is an
explicit, offline operator action:

```ts
import { adoptUncommittedFluxIQStorage } from "fluxiq";

await adoptUncommittedFluxIQStorage({ fluxiqRoot: "/absolute/host/.fluxiq" });
```

Stop every host process first and take a verified private backup. Adoption
accepts only a regular, integrity-checked `global.sqlite` containing a
recognized FluxIQ global table, plus the unambiguous v2-owned `artifacts`,
`cache`, `logs`, `security`, and `tmp` directories. It
rejects a migration journal, external path overrides, legacy or ambiguous
roots (including `domains`), unknown entries, symbolic links, SQLite sidecars,
and malformed databases without writing. On success it atomically writes only
the missing `config.json` marker and returns the database size and SHA-256 so
the operator can verify byte preservation. It never runs from normal setup or
web-panel startup. Recreate the `FluxIQ` instance or restart the host after it
returns.
