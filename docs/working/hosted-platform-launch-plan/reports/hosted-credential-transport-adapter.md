# Hosted credential transport adapter

Outcome: Done. Implemented only new `apps/extension/src/background/credentials/transport/**` plus additive `credentials/index.ts` exports after the lead released the initial read-only hold. The frozen source passes 25 owner tests and its no-emit probe. Existing repository implementation/tests, composition, session, outbox, Core/client/contracts, dependencies and output remain untouched.

## Frozen API

```ts
type HostedCredentialTokenStorage = {
  read(): Promise<string>;
  write(token: string, metadata?: ClientGatewayCredentialWriteMetadata): Promise<void>;
};

createHostedCredentialTokenStorage(input: {
  repository: HostedCredentialRepository;
  snapshot: HostedCredentialSnapshot;
  isCurrent: () => boolean;
}): HostedCredentialTokenStorage;
```

This is structurally compatible with `ClientGatewayConnectionTokenStorage`. It exposes no dial, clear, Forget, status, network address setter, or local fallback. The input snapshot comes from the already durably adopted private credential; the adapter captures its checked binding, install id, user/workspace, connected-client id and lineage. Its raw constructor credential is not used as an independent hello source. It obtains the bound repository port from that captured binding, so callers cannot pass a token and unrelated mutable destination independently.

`isCurrent` is mandatory, synchronous, and must return the literal boolean true. It represents the caller's trusted selection generation, including a switch away and back; comparing current URL alone is insufficient. Missing, nonboolean, or throwing guards refuse with fixed errors. The adapter also numbers its own read generations, so an earlier pending read/write cannot publish under a newer hello read. It never treats this local guard as server authentication.

## Read lifecycle

1. Check the current-selection guard and capture/increment the adapter read generation.
2. Await the exact binding's repository read; null, expiry, corruption, closed storage and other explicit repository failures never become an undefined/tokenless hello.
3. Compare the freshly loaded binding, install, user/workspace, connected-client id, lineage id/key against the constructor's captured scope. A newer trust lineage or different audience refuses even if the caller's selection guard incorrectly remained true.
4. Recheck selection/read generation after the await. Capture this durable snapshot's revision as the actual hello revision, then return only its credential. No later await occurs between that guard and return.

The seed revision need not remain current during ordinary rotation; the immutable trust scope must remain current. A read captures the latest durable revision for that hello, never a guessed revision from a display/session object.

## Write lifecycle

1. Require a completed current hello read. Capture that read's snapshot/revision/generation before any await and check selection.
2. Copy/validate the actual token and metadata. Hosted writes require metadata, a bounded printable messageId and sessionId, safe future server-authored expiry through the existing repository validation, and real complete user/workspace summaries matching the captured trust ids. Optional projectId remains transport data and does not select authority. No caller value selects gateway, connected-client id, user/workspace, or lineage.
3. Build the existing `ConnectTokenResponse` shape using the new token and actual ready expiry/summaries, plus the previously established PKCE connectedClientId and fixed checked gateway URL. Use the existing response schema; no display/email/expiry fabrication.
4. Deterministically map the bounded message id to `ready-` plus lowercase Web Crypto SHA-256 hex. This is a private mutation identifier, not a token/auth protocol. Snapshot the normalized response before hashing so caller mutation cannot alter the intended request.
5. Recheck selection/read generation after hashing, await a current private repository read, and validate exact trust scope again. Recheck selection/read generation after that await.
6. For a new rotation, commit with kind rotation, the hello-read expected revision, the deterministic operation id, and the normalized response. Do not replace the expected revision with a newer unrelated repository revision. Let CAS reject a late old write.
7. For an already-durable matching token/expiry/identity, verify exact replay using the receipt algorithm below. Do not declare success from memory or a token-only comparison.
8. After the durable commit returns, validate returned trust scope and recheck selection/read generation. Perform another guarded durable read, then require the same committed revision, credential, expiry and trust scope. Only then resolve the write promise. A changed selection or newer committed credential/lineage refuses activation/ready; it does not roll the durable credential backward or automatically revoke a previous rotation proof.

Repository errors already use fixed feedback. The adapter adds `HostedCredentialTransportError` with codes selection_changed, trust_changed, hello_required, metadata_missing, metadata_invalid, crypto_unavailable, credential_changed and operation_failed. It sanitizes unexpected synchronous callback/input/crypto exceptions without raw messages, causes, credentials, metadata, or logs. Missing/malformed metadata preserves the prior record. There is no permissive local path in this hosted adapter; existing local adapters remain separate and unchanged.

## Durable exact replay without repository edits

The current repository stores a mutation receipt with kind, expected revision, normalized payload digest and resulting revision. Its commit first checks an existing receipt, then requires that the current record still has that receipt's resulting revision. The existing tests prove conflicting operation-id reuse and superseded replay refusal.

When incoming credential/expiry/ids already match current durable snapshot revision N, call the existing rotation commit with expectedRevision N-1 and the same operation id/normalized response. A matching existing receipt can return the current record. If no matching receipt exists, current revision N cannot equal expected N-1, so the attempted replay cannot create a new write. Different summaries are also caught by the receipt payload digest even though snapshots retain only identity ids. An existing id bound to a different payload/kind/revision refuses. Another writer advancing the record before this probe makes it stale and refuses.

This also handles a recreated adapter after worker restart: it can verify the previous frame's exact durable receipt without a new query API or rewriting old repository code. It does not accept a changed message id merely because the token matches; that id lacks the original receipt and cannot use N-1 to write. Session/project routing fields are not credential authority; the exact credential mutation is the normalized response already covered by the repository receipt.

## Crash and replay windows

| Window | Required result |
| --- | --- |
| Before rotation commit completes | No acknowledgement/ready. Transaction failure keeps the previous credential and receipt state. |
| Commit succeeds, worker dies before callback/ack | New credential and receipt already survive. A fresh read resumes with that credential; existing Core current/previous recovery semantics remain responsible for server proof recovery. |
| Exact same frame retried after commit | Verify the existing receipt/current revision and return only after that durable transaction; do not mint another operation id/revision. |
| Same message id, different credential/expiry/summary intent | Refuse the receipt conflict; no overwrite. |
| Different id replaying the same current credential | No matching receipt; replay probe refuses rather than accepting token equality. |
| Newer rotation, Forget, or new-trust lineage already committed | Hello revision, current receipt, and/or scope mismatch refuses old work. |
| Selection/read generation changes while commit is pending | An accepted transaction may still commit, but callback refuses after await, so transport cannot acknowledge or publish that frame. Do not restore the older proof. |
| Connection/profile switches | Caller owns cancellation/Forget sequencing and fresh adapter construction; never turn a false old generation true just because the URL matches again. |

The adapter does not automatically revoke normal rotation predecessors or switch to new trust. Delivered-but-unadopted fresh consent cleanup belongs to the later PKCE/composition unit; a rotated durable proof kept for an inactive profile remains private to its original audience.

## Lifecycle policy

One logical distinct ready rotation is accepted per hello read; exact duplicate frames may verify/replay. The existing client reads storage before its connect hello. Actual Core ready send sites remain resumeTrustedSession and the shared waiting pairing/enrollment grant; no periodic unsolicited rotation path was found. A caller manually sending another hello/causing a distinct ready on the same socket must perform a fresh adapter read first. The adapter does not silently advance an old hello revision to whatever happens to be in storage. A policy regression proves a second distinct rotation without a new read refuses and preserves the current record, while a fresh read allows it. Generic transport acceptance of several ready frames is not a hosted authorization guarantee for an unrefreshed hello.

## Changed files and validation

Cohesive production owners are `transport/{adapter,boundary,create,failure,index,operation,ready,replay,scope,types}.ts`; `credentials/index.ts` adds only factory/type/error exports. Four adjacent test files are `transport/tests/{adapter,replay,selection,transport}.test.ts`, with local fixture/socket helpers. Old credential test fixtures are reused read-only. No second credential store or old repository edit was needed.

The exact filtered invocation, from paired extension `apps/extension`, was:

```powershell
$env:EXTENSION_TEST_BUILD_LABEL='hosted-credential-transport'
node scripts/test-extension.mjs background/credentials/transport/tests
```

Observed **25 tests passed, 0 failed** across four owner files: adapter 7, replay 7, selection 8, transport 3. Final run duration 899ms. Root separately reported independent 25/25; that is the lead's verification, not this worker's run.

The tests use root-installed fake-indexeddb and actual unchanged repository transactions. Public client 0.3.0 direct/reconnecting implementations run with a test-only socket and no network/browser. They prove server expiry persistence with unchanged lineage; missing/malformed/expired metadata preserving prior storage; wrong identity/binding/lineage and absent hello; stale selection around async boundaries; read-generation replacement; concurrent external CAS; exact receipt replay in original/recreated adapters; conflicting id/intent; another id with an equal token refusing; transaction abort and closed storage; newer post-commit rotation/new-trust refusal; fixed diagnostics; durable commit before acknowledgement/ready/later-frame delivery; and no acknowledgement/ready after selection changed following a completed commit. Connection test composition uses the pinned binding/install id and omits explicit hello.token.

Source-local TypeScript compiler API probe with the extension tsconfig, noEmit/nonincremental options, and roots at the adapter entry plus four test files -> **5 roots, 0 diagnostics**. No files emitted. The initial entry probe found an incorrect key-union annotation, fixed before passing owner probes.

Owner-scoped structure -> **17 rules, 17 files, 0 findings**: file-lines, directory-files, class-methods, exported-values, statement-packing, swallowed-failure, failure-as-empty, as-never, test-placement, naming, import-cycles, imports, contract-spread, facade-dispatch, regexp-template-escapes, restricted-references, shared-temp-root. Intermediate audit found packed statements in two test callbacks; fixed before final zero findings. `git diff --check -- apps/extension/src/background/credentials/transport apps/extension/src/background/credentials/index.ts` -> exit 0, no output.

These filtered tests/probes were authorized against unchanged client 0.3.0 output while Core Unit B source/rebuild work remained pending. No Core output build or composed server-metadata acceptance is claimed. No package build, dist mutation, real socket, browser, server, provider, dependency, or git mutation was run by this worker. Old one-argument local consumers remain covered by Unit A rather than modified here.

Not verified: real browser-origin isolation, server metadata population, PKCE consent/exchange, active connection/profile composition, actual current/previous server proof recovery, real crashes/power loss, or live sockets. Recreated-adapter replay is provider-free durable-store acceptance, not a killed-browser experiment. The adapter remains unwired. Source is frozen for the lead's package checkpoint and integration.
