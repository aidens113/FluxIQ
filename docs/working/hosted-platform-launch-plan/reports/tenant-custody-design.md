# Durable hosted custody implementation design

Outcome: Done as a source-reviewed design. None of the interfaces below is implemented by this report.

## Recommended boundary

Use primary identity as the sole authentication authority, tenant stores as the sole owners of their sealed keys/credential boxes, and one primary-owned durable custody journal to order authority reductions. A tenant must replay its user's committed events before releasing a key or accepting a new proof. The generic journal replay, user locking and coordinator live in **`packages/fluxiq/src/platform/custody/runtime/`**, behind neutral participant-provider ports. Both web and standalone/headless Core service hosts use that implementation. The web adapter supplies the current tenant owner under a workspace lease; no primary subscriber captures a tenant service across eviction.

This goes beyond adding subscribers. Today Identity Access deletes session rows and writes credentials separately from notifications; `runCredentialChange` treats post-write subscriber failure as a successful password change; Secret Keys remembers prepared-change ids/derived keys only in a timed memory map. Wiring those existing callbacks across tenants cannot prove crash ordering.

Keep the supported single live Core-process deployment. Durable transactions/CAS and replay provide restart and stale-writer safety; they do not claim active-active gateway, SecretKeyStore-cache or workspace-manager coherence.

## Stable interfaces to publish first

All are trusted construction/in-process ports, never request fields. Types belong in owner-local modules and public area barrels. Names avoid browser/DOM vocabulary.

```ts
// Core identity authority. Existing authorization argument/return types are reused.
type TenantIdentityAuthority = Pick<IdentityAccessService,
  "validateSession" | "authorizeSessionCredentials" | "authorizeSessionPasswordPin"> & {
  validateSessionDigest(input: {
    digest: string; userId: string; nowMs?: number;
  }): Promise<{ userId: string; expiresAtMs: number } | null>;
};

type CustodySequence = number; // Durable, monotonic per user; validated safe integer.
type CustodyPosition = { userId: string; sequence: CustodySequence };
type CustodyHead = CustodyPosition & {
  credentialRevision: number; preparingChangeId: string | null;
};

type CustodyJournalReader = {
  head(userId: string): Promise<CustodyHead>;
  read(input: {
    userId: string; after: number; through: number;
  }): AsyncIterable<CommittedCustodyEvent>;
  passwordDecision(changeId: string): Promise<PasswordDecision>;
};

// Branded by the coordinator; callers cannot construct one from JSON.
type CustodyLease = { readonly [custodyLeaseBrand]: true };
type HostedCustodyAccess = {
  withUser<T>(userId: string,
    run: (lease: CustodyLease) => Promise<T>): Promise<T>;
  ensureApplied(input: {
    workspaceId: string; userId: string; lease: CustodyLease;
  }): Promise<CustodyPosition>;
};

type TenantCustodyParticipant = {
  applyEvent(event: CommittedCustodyEvent,
    lease: CustodyLease): Promise<void>;
  preparePasswordChange(input: {
    changeId: string; userId: string;
    fromCredentialRevision: number; toCredentialRevision: number;
    actorSessionDigest: string | null;
    currentPassword: string; nextPassword: string;
  }, lease: CustodyLease): Promise<{
    changeId: string; manifestDigest: string;
    preparedKeyCount: number; requiresKeyReentry: readonly string[];
  }>;
  settlePasswordChange(input: {
    changeId: string; decision: PasswordDecision;
  }, lease: CustodyLease): Promise<void>;
};

// Core sees only ids and bounded participant lifetimes, never FluxIQWorkspaceManager or Next.js.
type CustodyParticipantProvider = {
  listWorkspaceIds(): Promise<readonly string[]>;
  withParticipant<T>(workspaceId: string,
    run: (participant: TenantCustodyParticipant) => Promise<T>): Promise<T>;
};
```

`IdentityAccessServiceOptions` gets a hosted durable mutation adapter; runtime construction gets optional `identityAuthority` and hosted custody access/participant bindings. Absent preserves local/self-hosted construction. `registerSecretKeysApi` and registry credential gates accept the narrow authority type instead of a cast to a concrete tenant IdentityAccessService. Panel holder vouch uses `validateSessionDigest`; it need not expose the primary's complete user/session snapshot to a tenant API. Existing program-route primary authority remains separate from selected tenant data.

Expose `SecretKeysService.custody` as a focused collaborator rather than adding many facade methods. Existing strict `credentialUnlocks.enrollLockedCredential` stays the fresh zero-box enrollment operation. The host wraps its validation/enrollment/publication in the same user authority lease and tenant replay barrier. A no-key user still connects normally.

The public Core coordinator factory consumes only journal/decision ports, `CustodyParticipantProvider`, and clock/diagnostic ports. It owns user sequencing, prepare/settle traversal and replay, exposes `HostedCustodyAccess`, and drains on close. It imports no program service, web module, browser/DOM concept or manager class. Web's `server/tenant-custody` implements the provider with the current manager lease and tenant custody collaborator; a headless service host supplies its own current-owner provider. Neither host reimplements the replay/lock protocol.

## Durable records and transaction owners

Primary journal records are private control-plane metadata, stored in the primary SQLite database. **Co-location is verified in the current source:** `framework/persistence/repository/sqlite-repository.ts:273` defines `databasePath`; for an empty scope it returns `path.join(this.rootDir, "global.sqlite")` at line 280, independent of layout version (only domain-scoped paths vary). `programs/_shared/runtime.ts:204` constructs `identity.users` with `rootDir: paths.databases`. `apps/web/src/server/provisioning-listener/platform-services.ts:103` and `:104` construct `platform.store` and `platform.iam` with that same primary `fluxiq.paths.databases`. Their empty-scope tables therefore share one primary `global.sqlite`, so the recommended atomic primary adapter is feasible today, not a hypothetical choice of backend. Tenant key/unlock repositories likewise share each tenant's own database root (`runtime.ts:113` and `:117`).

Still verify actual resolved file/table identity at construction and refuse an adapter that cannot perform the required atomic commit; a future override must not silently split it. Use the existing SQLite transaction capability and shared asynchronous lock handling; do not build a second JSON authority or pretend `Repository.put` plus a callback is atomic.

| Record | Required fields/invariants |
| --- | --- |
| User custody head | `userId`, `sequence`, `credentialRevision`, optional active `changeId`. Increment sequence in the same transaction that commits its event. One active password preparation per user. |
| Committed custody event | `(userId, sequence)` primary key; immutable `eventId` and payload fingerprint; `kind`; committed time. Reusing an id with different data rejects. Events contain digests/ids/revisions, never raw cookies, passwords, plaintext keys, or derived decryption keys. |
| Session-end payload | Target user; ended digests; revoker id/administrator flag; `wholeUser`; **post-operation live session digests**, captured by the same primary transaction. This pins existing own-signout/orphan-holder semantics without re-reading a later session set. |
| Workspace-authority-end payload | Target user and workspace; membership/account reason. Account disable/delete is user-wide; membership removal is workspace-scoped. User journal metadata outlives account/membership deletion. |
| Password decision | `changeId`, user, from/to credential revision, actor **digest**, participant workspace ids, manifest digests, `preparing/committed/aborted`, and committed event sequence if any. `committed` cannot become `aborted`. No password or derived key. |
| Tenant per-user cursor | `(workspaceId, userId)`, applied sequence, workspace incarnation. Advances atomically with all holder/key mutations for that event. Unknown version/corruption throws; it is not “nothing to replay.” |
| Tenant password manifest | Change id, from/to revision, exact affected record ids, original/current and pending seal fingerprints, pending encrypted seals, and encrypted replacement boxes for eligible existing keeper generations. All values needed after death are ciphertext/metadata. |
| Explicit proof ordering | A holder's durable `provedAfterSequence` and credential revision. A proof first replays through a captured head, then persists its boxes at that head while holding the same user lease. The immutable original approving-session digest is not silently rebound to make events pass. |

Use these discriminants/fields for the frozen event model (no transport-dependent objects):

```ts
type CustodyEventBase = {
  schemaVersion: 1; eventId: string; userId: string; sequence: number;
  committedAtMs: number; credentialRevision: number;
};
type CommittedCustodyEvent = CustodyEventBase & (
  | { kind: "session-ended"; endedDigests: readonly string[];
      wholeUser: boolean; revokerUserId: string | null;
      administrator: boolean; liveSessionDigestsAfter: readonly string[] }
  | { kind: "workspace-authority-ended"; workspaceId: string;
      reason: "membership_removed" | "membership_disabled" }
  | { kind: "account-authority-ended";
      reason: "account_disabled" | "account_deleted" }
  | { kind: "password-committed"; changeId: string;
      actorSessionDigest: string | null; resetWithoutOldPassword: boolean }
  | { kind: "password-aborted"; changeId: string }
);
type PasswordIntent = {
  changeId: string; userId: string;
  fromCredentialRevision: number; toCredentialRevision: number;
  actorSessionDigest: string | null;
  workspaceIds: readonly string[];
  manifests: readonly { workspaceId: string; digest: string }[];
};
type PasswordDecision = PasswordIntent & (
  | { state: "preparing" }
  | { state: "committed"; sequence: number; committedAtMs: number }
  | { state: "aborted"; sequence: number; abortedAtMs: number }
);
```

The primary write seam is an owner-specific atomic adapter, not a broad Repository change:

```ts
interface IdentityCustodyCommitStore {
  commitSessionEnd(plan: SessionEndCommit): Promise<CustodyPosition>;
  beginPasswordChange(plan: PasswordPrepareIntent): Promise<PasswordDecision>;
  commitPasswordChange(plan: PasswordIdentityCommit): Promise<PasswordDecision>;
  abortPasswordChange(plan: PasswordAbort): Promise<PasswordDecision>;
  readPasswordDecision(changeId: string): Promise<PasswordDecision>;
}
interface PlatformCustodyCommitStore {
  commitAuthorityEnd(plan: PlatformAuthorityEndCommit): Promise<CustodyPosition>;
}
```

`SessionEndCommit` contains guarded session-row deletions plus the event. `PasswordIdentityCommit` contains the expected credential revision, next **sealed identity credential row/metadata**, retained actor digest and other-session deletions plus its committed decision/event. Those encoded credential writes remain private to the identity-storage owner; they are not event payloads or a web API. Account/membership mutation adapters append their authority-end event in the same primary transaction as the authority-reducing metadata change. Do not call the ordinary platform write first and append later.

Concretely, every commit plan carries an immutable `operationId`, `userId`, expected credential/head revisions and `nowMs`. Session-end adds the trusted revoker and selected digests/whole-user flag; the adapter computes remaining live digests inside its transaction. Password-prepare stores `PasswordIntent`; password-commit adds the owner-private next sealed credential write and guarded session removals; abort includes the expected preparing change id. Platform authority-end adds the guarded account/membership row/index writes and scoped reason. Replaying the same operation returns its stored receipt; a different payload under that id rejects. No public caller supplies executable SQL or a raw identity credential to the journal.

Hosted identity persistence must write the rows owned by each mutation, with revision guards. The present broad `persist()` re-upserts all cached sessions/credentials and could resurrect a row a concurrent durable mutation removed. Session creation, credential/TOTP changes, user disable/delete and revocation need the same mutation fence/targeted persistence; a new outbox alone does not fix that race. Local adapter behavior can remain unchanged.

## Session-end ordering and cold replay

1. Authorize the operation through primary authority and acquire its user's coordinator lease. A public unknown cookie cannot generate another person's custody event.
2. In one primary transaction, validate expected revision, remove/invalidate the target session rows, append the immutable event with the correct remaining live digests, and advance that user's head. Update the in-memory primary view only after commit. A failed/ambiguous commit is resolved by its durable operation receipt, not blindly rolled back to an older cache.
3. Core's coordinator eagerly delivers for prompt feedback **through the current participant-provider callback**; web implements that lifetime with manager leases. Delivery is an optimization; the journal is the recovery authority. A delivery failure does not undo a committed revocation and must be reported with the durable event still pending. The coordinator never caches a participant beyond its callback.
4. A tenant's first custody operation reads the user's authoritative head, resolves any `preparingChangeId` against its durable decision/credential receipt, and replays every event after its local cursor in order. It cannot return a usable position while an orphan preparation is unresolved. Initial participant discovery enumerates existing workspace catalog rows, not just current memberships; this covers former memberships. Deleted workspace ids are never rebound, and a deleted root is acknowledged only after permanent custody teardown/removal.
5. Applying an event first prevents new local key release and zeroes affected held sessions/reveal authorizations. One tenant transaction changes/drops its persisted wraps/boxes and advances its cursor. Update cached records after that commit. A failed write leaves the participant blocked and its old cursor unchanged, so reopen/restart must retry the event before any release.
6. A subsequent explicit unlock verifies the caller's **exact primary session/password proof**, replays through the current head, and only then persists newly chosen holder boxes with that position. Replaying an old acknowledged event cannot lock the new proof again. A later signout has a higher sequence and still applies.

No expiry event is generated merely because an approving panel session expires. Existing paired trust and key boxes may outlive that normal expiry. Explicit revocation and later proof are events, not a permanent “original approving digest must remain live” gate. Preserve the current rule that an own signout can also lock holders whose original approval link has already ended, using the event's post-operation live-digest set.

The barrier must sit inside the key owner, not only HTTP middleware: `unlockSession`, strict/presented credential handling, password/direct-key reveal, `createRevealAuthorization`, `createSessionRevealAuthorization`, **redemption** of a reveal authorization, and key/box mutations all need it under hosted binding. Thus background model paths cannot bypass replay. Hold a user lease only around authority/key critical sections, not a whole Flow or an external model request. A provider request already given a key cannot be cryptographically undone; revocation prevents later release and invalidates still-held one-use authorizations.

Password events must also update digest-indexed origin/fallback decisions before the runtime selects an unlock. The current `mayFallBack` ending/password counters live only in memory; restarting cannot turn an old-session task into permission to draw on a newer panel session. Preserve the existing permitted panel fallback within the same credential epoch, while rejecting origins revoked by an intervening password change. The hosted resolver must await replay before its synchronous readiness/fallback helpers run; strict client enrollment never uses that fallback at all.

Use a branded/reentrant internal lease so participant replay/preparation called by the coordinator does not recursively reacquire the same user lock. Never accept that lease from a request. Persistence/replay failures propagate and keep the key unavailable; no catch-to-empty, TTL disposal or retry cap can erase the journal obligation.

## Password prepare, commit and abort

**Prepare.** The primary stores a `preparing` intent and credential revision fence before asking tenants to prepare. Freeze the affected user's key/credential mutations while holding the user lease. Snapshot all existing workspace ids from the neutral provider, including former memberships; a workspace opened/created concurrently must join at the current revision before accepting key writes. Visit cold tenants through provider callbacks (manager leases in web), never stale services retained by subscribers.

Each tenant opens **only its own correctly owned seals** with the ephemeral supplied current password, re-seals them under the ephemeral next password using existing cryptography, and durably stages a manifest/pending seals before acknowledging. Do not borrow any held session to supply keys. Existing unopenable/reset-era keys stay locked and are listed as requiring re-entry; zero prepared keys is valid. Ambiguous legacy ownership must not be assigned to another account by background migration.

The manifest must also stage encrypted replacement boxes for eligible **already existing** keepers: the actor's existing panel holder, and an already unlocked paired holder whose original approval digest is that actor's digest, still vouched for in this workspace. An unproved first-unlock holder remains locked. A removed membership gets no keeper. Stage against exact current/pending credential-generation fingerprints; block concurrent holder rotation behind the same mutation gate. Generate no new holder/grant merely because a password change reaches a cold workspace.

Why boxes must be prepared: existing `CredentialChanges` retains the next seal's derived key in memory for `onCommitted/personProved`. A process dying after identity commit loses that key. Pending encrypted seals alone preserve decryptability with the new password but cannot automatically re-box the key to retained credentials. Ciphertext boxes prepared under existing holder public keys solve recovery without storing a raw password/key.

**Commit.** After every participant durably acknowledges, recheck the primary actor/revision and atomically commit the next sealed identity credential, credential revision/change id, revocation of all non-retained sessions, password decision and custody event/head. The current `setPasswordAuthorized` performs session revocation after the credential change; hosted mode must remove that crash gap. After this transaction the new password is authoritative, regardless of notification failures.

Participants apply the committed decision in their own transaction: promote only the manifest-matching pending seals, install only its prepared keeper boxes, clear/drop all other affected holders and one-use authorizations, and advance cursor/manifest state together. A key rotated/deleted since the guarded snapshot keeps its newer state; an unexpected generation conflict blocks/raises instead of overwriting it. Healthy live participants can keep their actor's held keys; after a crash the returning cookie/credential opens its prepared boxes without requiring the password again.

**Abort.** A failed prepare or failed primary credential commit leaves the old identity revision authoritative. Persist an `aborted` decision, then remove only matching staged tenant seals/boxes, with awaited durable cleanup. Failed cleanup remains replayable. The current `abortCredentialChange(): void` and fire-and-forget removal are insufficient for this hosted path; its participant abort must be awaited. Never discard a committed pending seal because the old-password branch happened to open first.

| Death/failure point | Deterministic recovery |
| --- | --- |
| Before preparing intent commits | No tenant prepare is permitted; old password/state remains. |
| After intent or some tenant prepares, before primary commit | Read the guarded primary credential revision/change receipt. If still the old revision and no commit receipt exists, atomically abort; each tenant removes only that change's staged data. |
| Primary commit reports an ambiguous error | Read its durable change id/receipt. A committed receipt wins; never publish an abort based only on a thrown connection/close error. |
| After primary commit, before any/all tenant commits | The committed journal decision is replayed before key release. Ciphertext manifests finish seal/box promotion without any password. |
| After tenant row writes, before cursor acknowledgement | Writes and cursor are one transaction: both rollback or both survive. Replay is idempotent by event/change id and fingerprints. |
| Next seal exists but necessary keeper box was not prepared, or an old key never opened | Do not invent a decryption key. Keep that holder locked and request explicit re-proof with the now-authoritative password, or re-entry of an unrecoverable model key. Basic connection still succeeds. |
| Administrator reset with no old password | No reseal/recovery is claimed. Commit the identity reset plus durable all-holder lock event; leave old ciphertext inaccessible until legitimate recovery/replacement. |

The timed local `CredentialChanges.pending` map may continue to serve local behavior. Hosted recovery must be driven by durable decisions/manifests, not its 60-second memory expiry. The old `openCurrentOrPending/settle` password heuristic must run only after hosted replay has resolved a staged decision.

## Selected-tenant login and key proof

Service login authenticates at primary, resolves the selected tenant from trusted membership, leases it, passes its barrier, and invokes that tenant's own unlock using the same raw session and submitted password **in memory only**. Do not first unlock primary and transfer anything. Local/self-hosted stays unchanged. A no-key account succeeds with count zero. A later first visit to another tenant requires its own explicit proof or previously enrolled cookie wrap, not another tenant's unlock.

For Settings and first-holder unlock, primary authority verifies the password/TOTP, payload session must equal the routed actor's primary session, and the user must match. Tenant proof reaches only its local records and explicitly selected eligible holder/ticket. Capture/recheck authority under the same user lease before a proof's durable publication. The existing ordinary panel fallback policy is not permission to seed a new hosted client from some other live session.

## Implementation partitions

Freeze the pure port/event/manifest types and primary/tenant transaction contracts before dispatch. Ownership is by these files; barrel/runtime construction edits below are serial lead integration.

| Unit | Owned files | Required verification |
| --- | --- | --- |
| A: primary journal/atomic persistence | New `platform/custody/{model,storage}/**`; identity's owner-specific commit adapter under `programs/identity-access/storage/`; focused primary journal tests. No tenant/web code. | Real SQLite event/head CAS; event with session/credential state commits or rolls back together; immutable ids; ambiguous commit receipt; no raw secrets. |
| B: primary identity lifecycle | `programs/identity-access/runtime/{service,stored-state,run-credential-change}.ts`, `runtime/sessions/**`, new focused mutation collaborators and owner tests. Uses A's frozen port. | Exact-session validation, targeted writes cannot resurrect revoked rows; password/session deletion atomicity; prepare/abort/commit failure windows; local behavior preserved. Split facade under existing size/method budgets. |
| C: tenant transaction/manifests/barrier | New `programs/secret-keys/runtime/custody/**`; existing `credential-changes.ts`, key-store persistence, `unlocks/**`, HeldKeys access and service facade collaborator; owner tests. No identity/web edits. | Real tenant cursor+holder/key atomicity; durable prepare/commit/abort; keeper cipher boxes; no session borrowing; event/proof ordering; first-unlock and normal-expiry behavior. |
| D: authority-reduction platform sources | Existing platform account/member disable/delete/remove operations and store mutation adapters, plus owner tests. Uses A's frozen journal transaction contract. No web/tenant source. | Membership/account changes and their durable scoped/user-wide lock events cannot split; removed memberships/account deletion cannot erase replay evidence; no new grants. |
| E: shared Core coordinator/replay/user gate | New `packages/fluxiq/src/platform/custody/runtime/{coordinator,replay,user-lock,participant-provider}.ts`, owner-local barrels and tests. Consumes only frozen neutral journal/decision/participant ports; no program/web imports. | Two real tenant participants with the shared Core runtime; sequence and reentrancy; cold replay; ambiguous decisions; no participant retained outside callback; failures drain/propagate; same protocol works with web and headless providers. |
| F: web participant/lifecycle adapter | New `apps/web/src/server/tenant-custody/{participant-provider,participant-lifetime}.ts` and tests; narrowly scoped workspace-manager lifecycle binding. Its feature barrel is lead-owned during parallel work. No generic replay/user-lock implementation. | Current instance only, full catalog rather than membership-only discovery, correct manager lease lifetime/release, no retained stale closures after eviction; bind Core coordinator and drain it before manager shutdown. |
| G: web login/proof adapter | New `server/tenant-custody/{login-unlock,prove-selected-tenant}.ts` and tests; `app/api/auth/login/route.ts`, `app/setup/server` sign-in dependency, and relevant key setup adapter. No participant lifecycle or shared coordinator files. | Real primary session plus selected tenant; no-key success; wrong user/session/workspace denied; no primary-to-tenant material transfer; existing setup/local paths preserved. |
| Lead integration | Public Core/platform and feature barrels/types; `framework/index.ts`, `programs/_shared/runtime.ts`, web `lib/fluxiq.ts`, `create-tenant.ts`, primary provisioning composition and connect trust authority. Auth registry handler type narrowing where shared. Bind the same Core coordinator in standalone/headless service composition through its provider port. | Bind optional ports only for hosted service activation, preserve ordinary local construction, require complete custody ports in a real service host, dispose host subscriptions, require durable participant/journal, verify no duplicate identity stores/custody observers as authority, rerun affected acceptance independently. |

Do not give B/C/E/F/G workers overlapping runtime construction files. Keep application auth/profile composition and current workspace lease acquisition in web; keep generic custody coordination/replay/locking in Core's platform area. Do not add a broad event-sourcing framework; use its existing transaction capability and focused custody records. Root must validate the actual file/table co-location instead of relying on similarly named repositories.

## Smallest complete acceptance slice

Implement A/B/C/E plus the minimal F/lead binding for **session end and explicit re-unlock** first. Use one real primary identity store and two real tenant SQLite stores/manager-held custodies. It is complete only when a signout while a tenant is evicted survives a process restart and blocks the returning client's key before release; a later exact-session explicit proof reopens only the selected tenant and is not re-locked by old replay. Exercise the shared Core coordinator through both the web provider and an independent headless provider. This is an honest session-custody slice, not password-change completion.

Then add G and D, followed by password staging/commit recovery across both real tenants. The acceptance fixture must cover:

- User U owns independent keys in tenants A/B; another user in B stays untouched. Remove a membership before a user-wide event and still apply it to retained records. Ordinary approval-session expiry alone leaves a previously proved paired holder usable.
- Two distinct live approvals: signing out one locks exactly the correct holder and its orphan-link cases. Evict/reopen and full primary/manager restart produce the same result. Force tenant apply failure: no secret release before successful replay; no cursor advance without mutation.
- Explicit later unlock advances proof ordering, keeps first-unlock tickets/holder choices, and never obtains material from another user's or another session's HeldKeys. No-key login/strict connection succeeds.
- Prepare a password change with both tenants real, a previously proved keeper and a cookie-only first-unlock client. Inject failure after each primary/tenant write boundary. A child process can terminate after primary commit and before tenant commit; reopened services finish from ciphertext manifests with no password. The legitimate keeper can reopen; the unproved and other holders remain locked.
- A failed prepare/primary commit leaves old authentication and old seals valid after replay; committed identity never rolls back because a tenant failed to acknowledge. Concurrent key rotate/delete and session revoke cannot overwrite a newer generation or publish a stale proof.
- Work carrying an old session origin cannot borrow a newer panel unlock after password change and process restart; a legitimate origin in the current epoch keeps the supported ordinary panel fallback behavior.
- Administrator reset with no old password locks all affected boxes, including cold/removed-member stores, and never claims it recovered an old encrypted key. Raw cookies/passwords/derived keys are absent from journal, manifests, database bytes and diagnostic output.

Use source-owner tests for each change and the real composition test under `apps/web/src/server/tenant-custody/tests/`; no server, browser or live model is needed. Existing single-runtime credential tests remain regressions, but mocked fanout alone is not acceptance.

## Explicit design choices and recommended resolutions

- **Primary atomic storage:** current source confirms co-located primary identity/platform/IAM tables in `paths.databases/global.sqlite`, so implement the atomic adapter there with guarded revision receipts. This backend choice is resolved for today's composition. Construction must assert it; a future split-store deployment requires a separate durable protocol and cannot use callback sequencing as a fallback.
- **Participant discovery:** use the authoritative full workspace catalog for the first complete slice, including removed memberships. A later location index is an optimization only after it is mechanically maintained; an incomplete membership lookup is never the authority.
- **Unopenable/legacy keys:** re-seal only keys whose ownership/proof is established locally. Retain honest locked/re-entry state for unrecoverable keys; never borrow material from another session to make a password change appear complete.
- **Expired session versus revoked session:** expiry alone generates no lock event. Explicit revocations/proofs carry ordered durable positions. Do not rewrite original approval linkage or impose a permanent liveness gate.
- **Operator/runtime scope:** one live primary process and one tenant mutation owner remain required. Active-active and old service data migration are separate explicit designs, not implied by this journal.

## Return contract

Outcome: Done
Changed: This design report only.
Validation: Source review of current identity change/revocation, Secret Keys prepare/commit/abort and custody, workspace lifecycle, and persistence interfaces. No tests/builds/servers/model calls, as requested.
Not verified: Proposed APIs, schema migrations, atomic adapters, replay implementation, crash recovery or real multi-tenant acceptance.
Report: `docs/working/hosted-platform-launch-plan/reports/tenant-custody-design.md`
Notes: No source/runtime-state/git mutation. Plaintext passwords and keys never enter event payloads. Password recovery requires prepared encrypted keeper boxes or honest re-proof/re-entry.
