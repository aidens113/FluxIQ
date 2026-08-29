# Automation Studio Legacy Retirement Runbook

Automation Studio is Flow-first. Legacy Task, Routine, and owner-bound Flow
documents remain readable during the compatibility window, but new authoring,
recording approvals, publication, composition, and runtime work use canonical
Flows.

This runbook deliberately separates compatibility migration from physical data
removal. Locking writes does not delete legacy source artifacts.

## Web compatibility surfaces

Persistence compatibility is separate from the retired universal web renderer.
Automation Studio no longer ships `views/legacy-renderer-adapter.tsx`, and
`Renderer.tsx` now exports only the typed `AutomationViewHost` contract and its
request types. Canonical views are published independently into the workspace
view source; saved unknown, mismatched, or retired IDs recover through explicit
UI instead of being pushed through a broad aggregate renderer.

Internal Flow-editor focus/save communication and the generic program-workspace
Automation Studio bridge have also moved from browser `CustomEvent` messages to
typed props and direct commands. Do not recreate those channels to support a
legacy view. Program API mutation notifications and development-only metric or
reconciliation events are integration/diagnostic adapters, not a supported
legacy view-control API.

The Config view remains a read-only compatibility surface while saved Config
IDs migrate to Flow Settings. Its presence does not permit new Config editing,
and removing it requires the same saved-view inventory and recovery evidence as
other compatibility UI removal.

## Compatibility window

Every project begins in schema `0.1` with phase `compatibility`. Legacy read
adapters remain active. The generic `save-project-artifact` and
`delete-project-artifact` endpoints return a machine-readable
`legacy.compatibility_write` diagnostic for Task, Routine, and owner-bound Flow
writes. New clients must use canonical Flow endpoints.

Before locking legacy writes:

1. Inspect `inspect-legacy-retirement`.
2. Run `inspect-flow-migration`, then `migrate-flows` if required.
3. Export the immutable legacy snapshot with `export-legacy-project`.
4. Verify the snapshot digest through `verify-legacy-backup`.
5. Record every supported importer as validated or explicitly deferred with
   `record-legacy-retirement-evidence`; acknowledge that the importer inventory
   is complete.
6. Resolve or intentionally defer every unmigrated Task/Routine.
7. Reinspect and require `canLockWrites: true`.
8. Call `seal-legacy-writes` with `expectedSchemaVersion: "0.2"`.

The seal is one-way for ordinary APIs. After sealing, Task, Routine, and
owner-bound Flow writes return `legacy.write_locked`; reads and legacy catalog
adapters continue to work.

## Backups and rollback

`migrate-flows` creates a recording-independent legacy backup before writing a
canonical Flow. The backup contains Task, Routine, configuration, and legacy
owner-bound Flow documents plus a SHA-256 digest. Migration ledgers retain
source identity and the digest of each created canonical Flow.

Phase 11 migrations also create a verified backup manifest before importing a
project into v2 storage. The manifest records every legacy file path, byte
count, modified time, SHA-256 digest, resource classification, total byte count,
and manifest digest. Verification must be run after the manifest is written and
again before any rollback. A changed or missing file blocks cutover until the
operator either creates a fresh manifest or records an explicit deferral.

Use `plan-flow-migration-rollback` first. Rollback is blocked if the backup is
missing/invalid, a migrated Flow lost its source provenance, the Flow was
edited, or it is no longer a draft. This prevents an emergency rollback from
discarding post-migration work or a published interface.

If the plan is `ready`, `rollback-flow-migration` removes only unchanged
canonical Flows created by that ledger. Legacy sources are not restored because
they were never modified. The ledger records `rolledBackAt`, the rollback is
appended to the retirement audit log, and repeating the same rollback is an
idempotent `applied` result rather than another destructive pass.

## Support diagnostics

Collect these before escalation:

- `inspect-legacy-retirement` report;
- `list-legacy-retirement-audit` events;
- the migration ledger and rollback plan;
- backup ID and digest;
- project/global-domain scope;
- affected recordings, published composites, and importer package versions.

Never delete legacy folders to fix a migration problem. Do not bypass a blocked
rollback by manually deleting canonical Flow rows. Preserve the backup, ledger,
audit events, recording evidence, published snapshots, and historic runtime
traces for diagnosis.

## Physical removal policy

Legacy read adapters and source data remain until a future schema-major release
and only after supported importers are validated, project inventories are clean
or intentionally deferred, backup/rollback rehearsals pass, and the retention
policy permits deletion. That future removal requires a separate explicit
migration; schema `0.2` only disables legacy writes.

## Backup retention

Keep the latest verified Phase 11 backup manifest for each migrated project for
at least one major schema release after v2 becomes the default. Keep any failed
or mismatch-producing manifest until its support case is closed. Do not prune a
manifest while a migration job, hybrid-read comparison, verification report, or
rollback plan references its digest.

Backup manifests are small and immutable. Retention jobs may archive older
manifests, but they must preserve the manifest JSON, verification result,
inventory digest, legacy resource counts, and referenced object digest list.
Physical legacy folders may only be removed after a successful final
verification report confirms counts, object references, graph semantics, stream
chunk continuity, and intentionally deferred artifacts.
