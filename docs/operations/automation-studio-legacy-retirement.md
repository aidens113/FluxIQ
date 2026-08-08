# Automation Studio Legacy Retirement Runbook

Automation Studio is Flow-first. Legacy Task, Routine, and owner-bound Flow
documents remain readable during the compatibility window, but new authoring,
recording approvals, publication, composition, and runtime work use canonical
Flows.

This runbook deliberately separates compatibility migration from physical data
removal. Locking writes does not delete legacy source artifacts.

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
