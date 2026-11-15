# Authoritative browser trust

Outcome: In progress; source edits held while the lead validates the current foundation milestone.

## Frozen seam

`createSqliteBrowserTrustRepository({ filePath, now? }): BrowserTrustRepository`

- `scopedStore(workspaceId): ClientGatewayTrustedClientStore` preserves the gateway's existing optional store port. Each adapter captures a workspace generation when loaded and rejects stale saves through a durable SQLite compare-and-swap.
- `lookupCredential(token, { request?: boolean } = {}): Promise<BrowserTrustCredentialProof>` reads the same authoritative private row independently of a loaded tenant gateway. It provides credential proof/binding only; callers must still authorize the owner, membership, workspace and tenant session.
- `close(): Promise<void>` drains in-flight operations and rejects subsequent operations.

The proof union has `status` values `current`, `previous`, `obsolete`, `inactive`, and `invalid`. `current`/`previous` carry a safe binding. `obsolete` carries the binding and `reuse: "revoke" | "request-in-flight"`. `inactive` carries the proven binding and `reason: "revoked" | "expired"`. `invalid` carries `reason: "unknown" | "forged"` and no binding. Binding fields are workspace id, trusted-client id, approving user id, client id/type, optional declared domain, and optional managed host. No token, digest, or reuse signing key appears in a proof.

## Implementation decisions

- Extract the existing credential hash/signature/classification operations so registry and platform lookup share the signed credential rules. Retain legacy digest credentials, the unconfirmed previous credential window, and the distinct request-in-flight exception.
- Store the complete private trust state and immutable workspace binding together in one authoritative SQLite row. Indexed digest columns are part of that row and commit with it.
- A scoped replacement affects only its workspace. Removed records remain private revoked tombstones, preserving immutable id ownership and preventing removal/reinsertion from reviving or moving trust.
- Use rollback journal `DELETE`, full synchronization, native busy timeout zero, and event-loop `SQLITE_BUSY` retry. The lead observed nondeterministic `SQLITE_PROTOCOL` when independent fresh connections raced WAL setup; this implementation must not repeat that setup.
- Grant/rotation publication remains after mandatory store persistence. An adapter conflict/write failure propagates, and the registry restores its in-memory state. A legacy rotation rollback also restores the reuse signing key.

## Planned narrow validation

- Existing credential lifetime/reuse/custody/pairing tests after extracting the shared primitive.
- Real gateway grant, rotate, previous confirmation, revoke and restart with a scoped SQLite store and an independent repository lookup.
- Equal declared client ids in different workspaces, immutable trusted id binding, stale writer rejection after rotation/revocation, and simultaneous independent SQLite connections.
- SQL-trigger write failure proves transaction and generation rollback; grant/rotation failures emit no credential or ready session.

No checks run yet. No listener, PKCE, hosted connect UI, account/membership authorization, or live/cloud execution is claimed.
