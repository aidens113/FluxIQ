# Extension credential foundation

Outcome: Done. Added a standalone background-private audience-bound IndexedDB repository under the paired extension's `apps/extension/src/background/credentials/**`. Source is frozen for lead acceptance. Existing composition, session storage, outbox, manifests, migration, settings, local pairing, and dialing were not changed.

## Frozen API

The new subtree's `index.ts` exports `checkHostedCredentialBinding`, `createHostedCredentialRepository`, `HostedCredentialError`, and types `HostedCredentialFailure`, `HostedCredentialAudience`, `HostedCredentialBinding`, `HostedCredentialRepositoryOptions`, `HostedCredentialRepository`, `BoundHostedCredentials`, `HostedCredentialSnapshot`, `HostedInstallationIdentity`, `HostedCredentialCommit`, and `HostedPendingRevocation`.

```ts
checkHostedCredentialBinding(discovery: unknown, selectedOrigin: string): HostedCredentialBinding;
createHostedCredentialRepository(options?: {
  indexedDB?: IDBFactory;
  databaseName?: string;
  now?: () => number;
  randomUUID?: () => string;
}): HostedCredentialRepository;

interface HostedCredentialRepository {
  forBinding(binding: HostedCredentialBinding): BoundHostedCredentials;
  close(): Promise<void>;
}

interface BoundHostedCredentials {
  getOrCreateInstallation(): Promise<HostedInstallationIdentity>;
  read(): Promise<HostedCredentialSnapshot | null>;
  commit(input: {
    expectedRevision: number;
    operationId: string;
    kind: "new-trust" | "rotation";
    response: ConnectTokenResponse;
  }): Promise<HostedCredentialSnapshot>;
  forget(input: { expectedRevision: number; operationId: string }): Promise<HostedInstallationIdentity>;
  queueRevocation(input: { operationId: string; credential: string }): Promise<HostedPendingRevocation | null>;
  pendingRevocations(): Promise<HostedPendingRevocation[]>;
  acknowledgeRevocation(revocationId: string): Promise<void>;
}
```

The immutable checked binding is `{ origin, instanceId, gatewayUrl, authorizeUrl, tokenUrl, revokeUrl }`. It has an internal type brand and a runtime issuance registry: a copied/plain/persisted object cannot masquerade as a currently checked binding. Create one from the selected origin's checked discovery again after worker restart. This is local validation provenance, not cryptographic server authentication or a fresh network observation.

`HostedInstallationIdentity` is `{ installId, revision }`. A credential snapshot adds `{ binding, credential, expiresAtMs, connectedClientId, userId, workspaceId, lineageId, lineageKey }`. Pending revocations are `{ revocationId, binding, credential, createdAtMs }`. Both are private secret-bearing background ports, never panel/runtime status payloads.

`read()` returns null only when the exact binding has no active credential, including an explicit tombstone. It reports distinct fixed failure codes for `credential_expired`, `record_invalid`, `credential_invalid`, `storage_unavailable`, `repository_closed`, `binding_invalid`, `revision_conflict`, `operation_conflict`, `identity_mismatch`, and `crypto_unavailable`. No raw parser/storage/caller error is attached as a cause or copied into error messages.

## Binding and existing protocol compatibility

Binding checks reuse `parseFluxIQDiscoveryDocument` from the already declared `@fluxiq/contracts/platform` dependency. A real nonempty instance id is required; names, build hashes, and missing ids never substitute. Origin comparison is exact. HTTP connect endpoints must resolve to that exact origin and cannot contain credentials, fragments, or wildcards. Gateway URL scheme/security follows the existing discovery contract and its canonical advertised string is pinned. Response gateway must equal that pin exactly.

Policy difference identified during design: existing Core discovery permits a separately hosted secure gateway. The initial proposal would have required its HTTP-equivalent origin to equal Core's origin; that stricter rule was not implemented. Secure foreign gateway origins remain valid when explicitly advertised and pinned. Insecure nonloopback endpoints fail. Explicit loopback schemes remain valid for a discovery profile whose existing contract permits them; the module does not choose local/hosted modes or enable any fallback.

Flow flags, actual emitted gateway protocol support, minimum extension version, fresh discovery fetching/cache, permission gestures, PKCE state, account consent, and active profile selection remain future composition policy. The module reuses `ConnectTokenResponse` and its parser; it introduces no wire token/authentication protocol.

## Durability and concurrency

The default database is `fluxiq.private.credentials.v1`, accessed through extension-origin IndexedDB. Three stores hold binding records, mutation receipts, and pending revocations. There is no local/sync storage, worker-memory substitute, credential logging, networking, or persistent authorization code/verifier/state. No legacy record is read, copied, or erased.

The exact full binding tuple is the storage key. Each tuple gets a durably committed install id. Independent connections share IndexedDB transaction serialization; a unique install-id index prevents two bindings from adopting the same generated install identity. Credential writes require a current expected revision, and a tombstone retains the increasing revision and install id after Forget. A late rotation cannot revive cleared or replaced state.

Each mutation id binds its kind, expected revision, and SHA-256 digest of its exact normalized payload. The durable receipt stores a digest rather than an extra raw credential copy. Exact replay can return its still-current result; reuse with a different payload/revision/kind fails. A superseded receipt cannot restore or return an older credential. Acknowledged pending work remains acknowledged on an exact queue replay.

Transactions request strict durability, wait for transaction completion, and only then return a credential snapshot. An abort after both the binding and receipt writes rolls both back. Explicit repository closure drains accepted transactions and prevents the caller from receiving a usable snapshot after closure. Unexpected database closure refuses further work. Storage failures remain failures rather than becoming absent credentials or memory-only success.

New trust mints a fresh lineage identifier and scoped lineage key including the full server binding, install, user, workspace, connected client, and lineage. Rotation requires the same client/user/workspace and preserves lineage. Inputs are normalized/snapshotted before asynchronous hashing, so caller mutation cannot alter the intended revision or credential identity.

Forget atomically tombstones the active credential and journals its proof for revocation against the original binding. Pending reads and acknowledgements remain binding scoped; another server cannot acknowledge that work. A known delivered-but-unadopted credential can be privately queued without activating it.

## Required future composition sequencing

`new-trust` while a record already exists is a caller-owned trust transition. Explicit account/profile switch handling must determine and perform its Forget/revocation sequencing before exchange/commit. Do not infer that replacing a local record revokes the old server credential. Ordinary token rotation does not automatically revoke the previous proof: Core's previous-credential recovery semantics can make such a revocation revoke the current trust.

Future composition must durably journal a delivered-but-unadopted credential when cancellation, selection change, storage failure, or delivery failure prevents adoption. It must use this repository's pinned binding for token/revoke/gateway/HTTP consumers, wait for commit before activation or acknowledgement, preserve/replace scoped outbox lineage appropriately, and never combine a stored token with independent mutable addresses. This standalone module does not yet enforce those consumer call sites or migrate old local records.

## Validation observed

From paired extension `apps/extension`:

```powershell
$env:EXTENSION_TEST_BUILD_LABEL='credential-foundation'
node scripts/test-extension.mjs background/credentials/tests
```

Last completed run before the lead's dependency rebuild hold: **21 tests passed, 0 failed**, across four owner files: binding4, repository6, revocations3, failures8. The existing filtered runner bundles only selected owner tests into ignored per-label scratch output. No package/browser build or server was started.

The tests exercise independent origins and changed instance/gateway/endpoints; exact response gateway; close/reopen; six independent-connection installation/CAS competitors; exact mutation replay and conflicting reuse; owner/workspace/client rotation checks; fresh trust lineage; expiry and malformed input; atomic Forget and private pending work; stale late writes; strict completion-before-return; abort-after-write rollback; explicit and unexpected closure; corrupted records; safe errors/receipt contents; and post-call input mutation.

Source-local compiler API probe rooted at the entry and four test files, with extension tsconfig and noEmit/nonincremental options: **5 roots, 0 diagnostics**. It emitted no files. Owner-scoped structure probe after the final test-helper formatting fix: **17 rules, 30 scripts, 0 findings** (file-lines, directory-files, class-methods, exported-values, statement-packing, swallowed-failure, failure-as-empty, as-never, test-placement, naming, import-cycles, imports, contract-spread, facade-dispatch, regexp-template-escapes, restricted-references, shared-temp-root).

Test dependency: lead installed exact development dependency `fake-indexeddb@6.2.8` and owns package/lock changes. Worker changed no package files. Initial run19/20 exposed a test assumption: fake-indexeddb's force-close helper waits for active transactions rather than aborting them, so the test now waits for its observed close event and proves refusal of new work; abort-during-write remains a separate explicit transaction-abort regression. Its published force-close declaration names a constructor although implementation takes a database, handled through a test-only reflective call. The first source probe found contextual parameter typing issues around Object.freeze, corrected before the passing probe. The final formatting-only change fixed two packed statements in a test helper; no rerun overlapped the lead's dependency output rebuild.

Not verified: actual browser-origin/content-script isolation, Chromium/Edge/Firefox IndexedDB behavior or power-loss persistence, PKCE/HTTP/gateway composition, legacy migration, profile switching, acknowledgements, outbox replay, local pairing regression, or live credentials. Private origin ownership is an architectural choice requiring browser proof, not something the fake store proves. No live/provider/browser/server/paid operation was run. Source is frozen; lead owns coordinated rebuild, independent acceptance, and git.

## Follow-up read-only transport metadata trace

The lead requested this integration check after the foundation froze. No source edit or test collection accompanied it.

Current `packages/client-gateway-websocket/src/types.ts` defines `tokenStorage.write(token: string): void | Promise<void>`. `connection/types.ts` aliases this shape as `ClientGatewayConnectionTokenStorage`; `connection/connection.ts` wraps writes in its `credentialWrites` queue and checks the active socket, but forwards only the token. `transport.ts` awaits the write inside `commitSession`, then assigns session/token, sends `client.credential_received`, and emits message/session_ready. Thus the existing persistence barrier is the correct place for an atomic credential-plus-metadata commit; `onSessionReady` is too late.

Smallest recommended additive public seam:

```ts
type ClientGatewayCredentialWriteMetadata = Readonly<
  Omit<ClientGatewaySessionReady, "token"> & { messageId: string }
>;

write(token: string, metadata?: ClientGatewayCredentialWriteMetadata): void | Promise<void>;
```

The transport supplies a detached copy of the actual ready payload minus token, plus its envelope id, to the already-awaited write. The reconnecting connection must forward both arguments through the existing serialized/superseded guard. Existing one-argument local/enrollment storage adapters remain compatible. No second ready listener or post-ack persistence should be introduced. The metadata name/type is a proposal for the lead to freeze, not an implemented export.

The hosted adapter must validate that this server supplies a future safe-integer `credentialExpiresAt` and full user/workspace summaries, check their ids equal the currently bound credential owner/workspace, and construct the repository's existing rotation response using that server metadata plus the persisted connectedClientId and pinned gateway. Ready does not currently carry connectedClientId; retain the one established by the PKCE token response rather than conflating it with hello.clientId/sessionId. Missing/malformed hosted metadata must refuse before acknowledgement. Do not derive a sliding expiration locally or fabricate display/email values. A private validated/mapped message id can help choose an idempotent operation identity; retry logic must retain the exact intended revision/payload rather than turn replay into a new mutation.

Server prerequisite found: `ClientGatewaySessionReady` already declares optional `user`, `workspace`, and `credentialExpiresAt` in `packages/contracts/src/client-gateway.ts`, but both actual send sites, `packages/fluxiq/src/client-gateway/service/lifecycle.ts` and `trust-grant.ts`, currently send only sessionId/token/projectId. Metadata forwarding alone therefore cannot activate hosted rotation. The host must populate authoritative existing fields from actual trusted-client expiration and current server-owned account/workspace metadata, with current authority checks; unavailable authoritative metadata must remain an explicit refusal. This is a separate production implementation owned by the lead. The current transport parser casts envelopes rather than validating the ready metadata, so the hosted persistence adapter still needs its existing strict response validation.

Required next acceptance: exact metadata forwarded through direct and reconnecting clients; storage sees a detached snapshot; no acknowledgement/ready/later-command delivery before the metadata transaction completes; invalid/missing/foreign hosted metadata refuses without changing the previous durable credential; persistence failure has fixed terminal feedback; one-argument local adapters still work. Nothing in this trace proves those changes implemented or accepted.
