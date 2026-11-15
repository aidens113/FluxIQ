# Authoritative browser trust

Outcome: Done for the bounded persistence/proof partition. Hosted connect acceptance is not claimed.

## Frozen seam

`createSqliteClientTrustRepository({ filePath, now? }): ClientTrustRepository`

- `scopedStore(workspaceId): ClientGatewayTrustedClientStore` preserves the gateway's existing optional store port. Each adapter captures a workspace generation when loaded and rejects stale saves through a durable SQLite compare-and-swap.
- `lookupCredential(token, { request?: boolean } = {}): Promise<ClientTrustCredentialProof>` reads the same authoritative private row independently of a loaded tenant gateway. It provides credential proof/binding only; callers must still authorize the owner, membership, workspace and tenant session.
- `close(): Promise<void>` drains in-flight operations and rejects subsequent operations.

The proof union has `status` values `current`, `previous`, `obsolete`, `inactive`, and `invalid`. `current`/`previous` carry a safe binding. `obsolete` carries the binding and `reuse: "revoke" | "request-in-flight"`. `inactive` carries the proven binding and `reason: "revoked" | "expired"`. `invalid` carries `reason: "unknown" | "forged"` and no binding. Binding fields are workspace id, trusted-client id, approving user id, client id/type, optional declared domain, and optional managed host. No token, digest, or reuse signing key appears in a proof.

The exports live in `packages/fluxiq/src/platform/browser-trust/index.ts`. Production symbol names use neutral `ClientTrust*`; the initially proposed `BrowserTrust*` names failed Core's domain-neutral vocabulary gate and were renamed without introducing a baseline exception. Lead owns the public platform export and construction integration. Conflict errors use `code: "browser_trust.conflict"` and a specific `reason`, including `stale-generation`; they must propagate to the caller instead of silently refreshing and publishing a credential.

## Implementation decisions

- Extract the existing credential hash/signature/classification operations so registry and platform lookup share the signed credential rules. Retain legacy digest credentials, the unconfirmed previous credential window, and the distinct request-in-flight exception.
- Store the complete private trust state and immutable workspace binding together in one authoritative SQLite row. Indexed digest columns are part of that row and commit with it.
- A scoped replacement affects only its workspace. Removed records remain private revoked tombstones, preserving immutable id ownership and preventing removal/reinsertion from reviving or moving trust.
- Scoped saves also preserve owner/client/domain/managed-host/signing-key identity and permanently refuse clearing revocation. Duplicate cross-client credential digests are rejected atomically.
- Use rollback journal `DELETE`, full synchronization, native busy timeout zero, and event-loop `SQLITE_BUSY` retry. The lead observed nondeterministic `SQLITE_PROTOCOL` when independent fresh connections raced WAL setup; this implementation must not repeat that setup.
- The existing retry helper moved unchanged from `platform/keys/storage/sqlite-lock.ts` to `framework/persistence/repository/locking/{retry,index}.ts`. Both auth stores consume that primitive; the existing `SQLiteRepository` was not changed.
- Empty load/lookup does not create a file or directory. Existing databases are read through read-only snapshot transactions. Only a save creates storage/schema and atomically arbitrates generation zero. A failed first transaction can leave a valid empty SQLite file; an explicitly empty schema is treated as uninitialized authority, while corrupt/incomplete existing authority still throws.
- Grant/rotation publication remains after mandatory store persistence. An adapter conflict/write failure propagates, and the registry restores its in-memory state. A legacy rotation rollback also restores the reuse signing key. Repeat-revoke rollback preserves an already revoked record, including a revocation at timestamp zero.
- Registry mutation/persistence sections are serialized so one failed operation cannot restore its snapshot over a later committed credential. Rotation's external custody hook stays outside that queue; revocation can still end trust while custody waits. Queued confirmations retain their expected current digest. A simultaneous legacy upgrade adopts the signing key another reconnect committed before preparing its final credential.

## Validation

Observed 2026-11-14:

- Initial targeted proof/lifecycle/storage run: 17/17 passed.
- Initial complete focused browser-trust plus existing credential suites: 70/70 passed.
- `pnpm.cmd --filter fluxiq exec vitest run src/platform/keys src/server/keys-api` -> 4 files, **58/58 passed**, 8.38 s, after relocating the shared retry helper. Includes repeated eight-connection races and eight actual competing key-store processes.
- `pnpm.cmd --filter fluxiq exec vitest run src/platform/browser-trust/tests/concurrent-registry.test.ts` -> initially **1 failed**: platform lookup proved the later published credential current, but registry lookup returned undefined after an earlier failed rotation restored old memory. This was the reproduced cause of a publication inconsistency, not a platform storage failure. Serializing mutation/persistence fixed it.
- Final command `pnpm.cmd --filter fluxiq exec vitest run src/platform/browser-trust src/client-gateway/service/credentials src/client-gateway/service/tests/trusted-clients.test.ts src/client-gateway/service/tests/credential-lifetime.test.ts src/client-gateway/service/tests/credential-reuse.test.ts src/client-gateway/service/tests/credential-custody.test.ts src/client-gateway/service/tests/pairing-flow.test.ts src/client-gateway/tests/host-enrolment.test.ts src/client-gateway/tests/trust-domain.test.ts src/client-gateway/tests/service.test.ts` -> 13 files, **110/110 passed**, 6.59 s; repeated after the neutral-symbol/barrel changes -> **110/110 passed**, 10.24 s.
- `node scripts/structure-audit.mjs --rule imports --rule web-vocabulary --rule exported-values --rule naming --rule file-lines --rule directory-files --rule failure-as-empty --rule import-cycles --rule swallowed-failure --json` -> **zero failures**, 525 existing advisory warnings, 410 baselined findings, zero lowerable entries. Earlier barrel and vocabulary findings were corrected; no baseline exception was added. The first run also surfaced one then-in-progress connect-test import owned by the lead; the final current-tree run passed.
- Scoped `git diff --check -- <owned paths>` -> exit 0; only Git's existing LF-to-CRLF advisory for key database source.

Real gateway tests cover grant, rotate, previous acceptance, confirmation, signed obsolete-token reuse revocation, explicit revoke, restart, equal client ids in two workspaces, stale-gateway grant rejection, and mandatory save failure without `server.session_ready`. Storage tests cover immutable binding/tombstones, stale saves after rotation/revocation, complete transaction/CAS rollback, malformed persistence refusing lookup, queued-operation close, legacy credentials, managed-host binding, absent read without filesystem creation, eight fresh concurrent connections, and eight actual process writers sharing a generation-zero snapshot (one winner, seven visible stale conflicts).

## Integration and security limits

- No listener, PKCE issuance, hosted connect UI, account/membership authorization, HTTP actor authorization or deployment is implemented by this partition. A current proof is never sufficient by itself to authorize a socket or request. Obsolete proof identifies its one binding for existing reuse handling; it does not authorize ordinary work.
- The repository does not directly mutate/revoke platform proofs; the scoped gateway store is the mutation owner in this unit. A loaded gateway whose generation is stale must be discarded/recreated after conflict; it must not silently replay its old state. Consumers must consult current platform proof on authenticated operations and apply their identity/membership/session rules.
- The existing optional local JSON adapter and digest credential scheme remain supported. Automatic migration of preexisting tenant JSON trust into the new service authority is not included; a service cutover must deliberately select/import one authority, not operate a second JSON fallback.
- No servers, models, browser sessions, cloud calls or real user data were used. Whole-package typechecks/builds, full structure audit, and construction/listener integration are reserved for the lead's acceptance.

## Return contract

Outcome: Done
Changed: `platform/browser-trust/**`; shared gateway `service/credentials/**`, `service/trusted-clients.ts`, focused registry tests; shared `framework/persistence/repository/locking/**`; key database import and removal of old private helper; this report.
Validation: Final focused command above -> 110/110 tests passed; keys command -> 58/58 passed; selected structure rules -> zero failures; scoped diff check -> exit 0.
Not verified: Lead-owned whole-package typecheck/build, full structure audit, construction, pre-hello routing, PKCE/connect UI, HTTP authorization, deployment and migration.
Report: `docs/working/hosted-platform-launch-plan/reports/browser-trust.md`
Notes: Proof selects binding only. No source integration, shared documents, git mutations or paid/live calls. Source is stable for lead validation.
