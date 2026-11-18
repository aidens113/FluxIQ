# Remaining gateway mutation discovery

Outcome: Done — read-only discovery; implementation is not authorized by this brief.

The existing first-project helper cannot safely be treated as a guarded write merely because its web caller holds a tenant lease. It performs awaited lookup and IAM work before the real writer, and creator ownership is recorded after project creation. A Core-owned write-admission seam is the prerequisite. Self-forget needs credential-only teardown, rather than the content-route resolver. Legacy reference approval and dismissal should explicitly refuse the service profile while retaining local behavior and the implemented hosted consent flow.

## Current callers and authority

All four routes still select `getFluxIQ()` directly. None yet uses the completed tenant route lifetime owner.

| POST route under `/api/client-gateway` | Actual current proof / caller | Declared IAM | Current service behavior |
| --- | --- | --- | --- |
| `first-project` | Bearer → primary gateway `authorizeToken` → ready client session → identity actor; no panel fallback | Paired client, permission `none`, `gateway:CreateFirstProject` on workspace; nested registry creation also requires `programs.write` and `studio:CreateProject` | Does not route the proof to its tenant. Intended ordinary-client capability, currently bound to the primary path. |
| `approve-pairing` | Panel cookie through `requireFluxIQUser`; bearer alone is insufficient | Panel, `runtime.control`, `gateway:ApprovePairing` on caller's own user | No explicit service-profile refusal. Advertising the flow as unavailable does not disable this HTTP handler. |
| `dismiss-pairing` | Same panel cookie path | Panel, `runtime.control`, `gateway:DismissPairing` on workspace | No explicit service-profile refusal. |
| `forget-pairing` | Bearer only; `gateway.access.forgetByCredential`; no socket or active-user check | Table says paired client / `none` / `gateway:ForgetPairing` on workspace, but the handler intentionally does not invoke IAM | Correct authority-reduction idea, wrong primary-only routing. |

Source: the four owning `route.ts` files and `apps/web/src/lib/app-route-iam/contracts.ts:91`. “None” is a legacy permission classification, not an IAM exemption. The service user policy's workspace `gateway:Create*`/`studio:Create*` actions permit the intended first-project operation subject to the actual selected tenant and nested endpoint checks.

There is a separate mechanical service transport gate: `server/browser-trust/resolve-route.ts` requires an existing proved credential, exact client/type/domain binding, a non-primary workspace and live binding authorization; it rejects tokenless/reference enrollment. Core `server/client-gateway-websocket/routing/socket-session.ts:134` refuses a null resolver result and does not fall back to the primary gateway. Thus normal hosted tokenless WebSocket enrollment is refused already. That fact does not prove an explicit HTTP approve/dismiss policy. Ordinary users' current primary IAM refusals are also not a universal profile gate; an explicitly granted primary policy could differ.

## First-project: actual writes and missing seam

The chain is:

1. Web `first-project/route.ts:23` calls public `automationStudioPersonProject({registry, actor, domainId, create:true})`.
2. `programs/automation-studio/api/person-project.ts:28` calls registry `projects`, selects the latest exact `ownerUserId`, then calls `create-project` if none is found. Its per-registry/user/domain promise coalesces concurrent requests.
3. `programs/_shared/api.ts:222` awaits its IAM decision before invoking the registered handler. `automation-studio/api/handlers/projects.ts:97` calls `service.createProject` with request-derived data, with the domain overwritten from the authorized scope. No trusted per-call mutation callback exists.
4. The automation service facade delegates to `framework/automation-service/service/projects/creation.ts`. In the canonical branch, `CanonicalAuthorityWholeOperation.createProject` generates an ID and enters `run`/`reserve`. The reserve transaction changes routing/fence state and calls `CanonicalAuthorityLifecycle.create`, then persists the reserved operation. **This is already durable project-creation work**, before catalogue/manifest writes. The body later writes the catalogue, manifest, hierarchy and preferences through `globalEffects`, and the canonical lifecycle is completed afterward.
5. The fallback layout-v2 branch reads and writes those documents in `ProgramJsonStore.transaction`; its first project-index write is the mutation boundary. The legacy branch writes index and record separately. These are distinct implementation paths, not a single atomic transaction to assume.
6. Only after the handler succeeds does registry `afterSuccess` call `recordProgramCreatedOwner` (`api.ts:386`). `AutomationStudioProjectOwnership.recordOwner` first awaits catalogue existence, then changes the separate ownership document. It is idempotent for the same creator, replaces a default owner, and rejects a different recorded creator.

Two additional behaviors matter to a safe migration:

- A failed project-list response becomes `[]`, allowing a subsequent create attempt. A failed create response becomes `null`, which the web route returns as success. Create-mode must distinguish “none exists” from refusal or unavailable storage; an ownership failure after a project committed must not become successful `projectId:null`.
- The list handler calls `withProjectOwners`, which can persist default-owner migration. The helper's “reading makes nothing” comment means no project is created; it does not mean there are no writes. `ownership/migration.ts`, `ownership/document-store.ts` and the IAM owner resolver own those changes. A creation guard alone does not guard these earlier ownership writes.
- Coalescing shares the first caller's actor and entire operation with later callers. A guard added only to that first invocation would not revalidate each waiter. Every waiter currently deletes the key unconditionally in `finally`; use ownership-aware cleanup for the queued promise. The possible replacement-generation deletion is a source observation, not a reproduced runtime failure in this unit.

### Proposed exact prerequisite interface

Keep the public helper and existing registry authorizer. Do not duplicate bootstrap in web or add a request-body authority field. Introduce one optional, trusted call option, for example:

```ts
type ProgramMutationAdmission = {
  stillAuthorized(): Promise<boolean>;
  beforeMutation(): boolean;
};
// Optional SECOND argument; never a ProgramApiRequest/payload/scope field.
registry.call(request, { mutationAdmission });
// Person-project accepts and forwards the same admission in create mode.
```

The registered project handler receives trusted call options separately and forwards the admission to the creation owner. The canonical owner must make the final admission at **reservation**, before the first lifecycle/fence mutation; putting it only before `registry.call`, before the handler, or inside the later `globalEffects` body is insufficient. The document fallback must apply it before its first write after preparation. Apply the corresponding guard to default-owner migration reached by this guarded operation, or make this guarded lookup use an explicitly non-mutating owner read; do not silently bypass existing owner filtering.

`stillAuthorized` performs fresh route proof, user/membership and IAM checks; run external async authorization outside a held SQL writer lock. `beforeMutation` requires literal `true`, rejects malformed/thenable results, and synchronously checks the exact selected runtime/primary/manager, abort and release state after awaits. Errors/refusals are fixed, sanitized values. No callback goes into persisted input, wire contracts, model-visible arguments or public results. Existing unguarded callers remain compatible. Keep tests next to each changed owner.

**Required semantic decision for the implementation brief:** admission is an explicit point at which coherent work is accepted. Once a canonical reservation has committed, finish the admitted project and creator association; a later HTTP refusal cannot undo it. Do not introduce a later authorization check between project creation and its mandatory creator record that deliberately leaves an unattributed project. Final route revalidation can suppress stale publication, not claim rollback. The sync runtime predicate does not prove that a separately stored identity/trust revocation has not committed during a SQL wait. If the required guarantee is an atomic comparison with that authority at durable commit, an authority revision/coordinator must be part of the writer's admission; the existing context exposes no such atomic cross-store capability. Do not advertise the two callbacks as that stronger guarantee or await identity callbacks while holding the same database writer lock.

Existing creator attribution is itself a second commit. `api/tests/record-created-project-owner.test.ts` explicitly covers a storage failure followed by an explicit repair using the known ID; `automationStudioPersonProject` has no durable repair identity. The next Core unit must preserve the committed project identity through such a failure and complete attribution before allowing a retry to mint another first project, using the existing creation/ownership owners. It must not guess by the name “My automations”, assign a foreign project, or invent a second persistence engine. A helper-only callback patch would leave this failure gap and is not full acceptance.

Coalesced callers must each pass their own authority checks before receiving a result; losing one waiter's authority must not cancel another caller's already-admitted coherent operation. Preserve null-domain/no-create behavior and existing response shape. Permission/storage failures are not ordinary absence.

## Self-forget: reuse credential proof and the owning revoker

The existing hosted primitive is `ClientTrustRepository.lookupCredential(token, options?)`, exported through `fluxiq/platform`. Its closed results are `current`, `previous`, `obsolete`, `inactive` and `invalid`; the binding supplies the workspace/trusted-client identity only after credential proof. This is not a user, membership or live-session grant. The repository has `scopedStore`, not a public direct revocation API.

`server/connect/revoke.ts` already demonstrates credential-only hosted cleanup: proof lookup, reject managed/primary bindings, check that the platform workspace exists, acquire its runtime, call `gateway.revokeTrustedClient`, release. It works for disabled owners without a ready socket. Its return type is `Promise<void>`, so using it and reporting `forgotten:true` would invent an outcome.

Keep the actual owner: `client-gateway/service/access.ts:103` calls the trusted-client registry's serialized `revoke`, awaits persistence, then releases custody and disconnects ready sessions. `trusted-clients.ts:335` restores memory/indexes if persistence rejects. Hosted `scopedStore.save` uses the browser-trust SQLite generation-CAS replacement transaction; it must remain the durable revocation owner. Do not add a second SQL revoker or authorize content access with this proof.

Propose a result-bearing server-only teardown helper, `forgetClientCredential(token): Promise<boolean>`, shared by hosted forget and `revokeConnectCredential`; the latter keeps its existing `Promise<void>` and public `/api/connect/revoke` response. Local forget retains `gateway.access.forgetByCredential`, including its existing obsolete-credential reuse enforcement. Hosted proof selects only its own ordinary trust, never a caller-supplied workspace/client hint. Missing bearer stays 401; processed invalid/inactive/already-revoked/non-applicable proof returns the existing 200 boolean envelope without reason/binding data. Operational persistence failures return fixed 503, not successful forgetting. No cookie fallback, active-account requirement or socket requirement; already inactive proof is idempotent cleanup.

**No-create prerequisite:** the existing connect helper checks workspace presence only before `manager.acquire`. The manager's acquire can cold-create a runtime; `create-tenant.ts:41` initializes layout and calls recursive `mkdir`. A stable missing workspace is skipped, but deletion between the check and acquire is not proved safe. `manager.get` avoids creation but cannot clean a cold, existing tenant. The narrow manager companion should be an owner-coordinated `acquireExisting(workspaceId): Promise<WorkspaceLease|null>` that participates in the existing opening/deletion lifetime and cannot initialize a missing/deleted workspace root. Couple it to authoritative workspace existence and deletion fencing; a renamed precheck followed by ordinary acquire is insufficient. If that cannot be furnished without broad construction changes, the alternative is a manager-owned cold-teardown operation using the same trust persistence owner, with no runtime creation. Root should select this prerequisite explicitly; do not claim the current helper already solves the deletion race. One-process deployment is the supported concurrency model, not independent active-active runtimes.

The forget IAM row currently describes a workspace grant the handler never requests. Root should give **this exact POST** explicit credential-teardown proof classification, alongside the existing exact public-proof routes, rather than requiring live paired-client IAM or broadening a prefix exemption. Keep all content and mutation route classifications intact.

## Legacy reference policy and local lifetime

Add an explicit service-profile refusal to both old HTTP approve/dismiss handlers, before reference lookup or any primary/tenant grant. Authenticated service requests should get fixed 403 explaining that hosted client approval uses the connect consent flow. Leave `/api/connect/authorize` and its own-user `gateway:ApprovePairing` IAM policy intact. Removing that policy to disable references would break the real hosted flow. No fallback enrollment from primary and no unlock/password/TOTP ceremony.

For local/self-hosted callers, preserve panel-only `runtime.control`, reference validation, 404 unavailable request, 409 known disconnected/refused pairing cases, success session/dismissed shape and the existing ignored obsolete password/TOTP fields. Replace the open `pairing.*` + raw-message forwarding with a closed mapping; unexpected operational failure is sanitized.

Dismissal is synchronous in Core after body parsing, so selected-context revalidation plus a final synchronous currentness check can precede the mutation without a new Core port. Approval awaits gateway readiness, registration, metadata and custody. Current `pairing-flow.ts:176` supplies a `lateRefusal` for the requesting client's challenge/session; it does not validate the approving panel session/IAM. A bounded optional trusted approval-admission port should reuse these checks and the existing undelivered-trust cleanup, checking the approver before registration and again before custody/publication. A route-only precheck cannot prove logout/revocation during approval. Do not conflate challenge liveness with approver authority, or revoke an established independent client merely because a panel session later logs out.

## File partitions and narrow acceptance

1. **Core bootstrap prerequisite:** `programs/automation-studio/api/person-project.ts` and owning tests; trusted second call-options type/forwarding in `programs/_shared/api.ts`; the projects handler; the existing service create facade/creation owner; canonical reservation and ownership migration/record owners only as required by the agreed admission and attribution semantics. Public additive type export only. Test actual canonical/fallback first writes, failed list with zero creates, revoke/reload/abort during lookup/IAM/preparation, admission before reservation, no stranded operation from a late refusal, ownership-save failure/retry identity, foreign-project exclusion and two callers with different proofs.
2. **Web first-project after that interface freezes:** its route/tests only, using the existing paired-client selected context. Test exact tenant/actor/domain, no primary/bearer-to-panel fallback, nested creation denial, latest own project, no duplicate creation, concurrent proof expiry/revocation, final currentness and exact-once release. Root owns parity/IAM fixtures.
3. **Credential teardown prerequisite + route:** new `server/browser-trust/teardown` module/tests, existing connect revoke delegation/tests, forget route/tests, and explicitly granted manager/factory companions. Test offline/disabled owner, cold existing tenant, no root recreation during or after deletion, current/previous/obsolete/inactive/forged proofs, managed/primary refusal, exact own-trust scope, repeated cleanup and save failure. Assert no content/membership disclosure and truthful boolean/503 behavior. Root owns exact proof classification/matrix changes.
4. **Legacy policy/local approval:** approve and dismiss route/tests plus only the Core approval-input/pairing-flow/trust-grant seam/tests needed for live approver admission. Test explicit service refusal before any reference/grant access, local role/IAM and missing-cookie cases, revocation while body/save/custody waits, no publish on failed approval, idempotent dismiss and no second lock. Root coordinates shared profile/IAM fixture edits.

The trace worker's now-added `uploadTraceArtifact.beforeIntake?: () => boolean` is a useful precedent for a strict synchronous check after awaited authorization. Its immediate `receiveTraceArtifact` call is not the same as the multi-stage project reserve/create/attribute lifecycle; do not copy its placement and claim project-commit coverage. Trace source and tests remain outside this partition. Controlled-tab PKCE and server-bound credential integration remain separate extension work; these migrations must use the fixed credential contract and must not revive legacy references as hosted enrollment.

## Validation and limits

Performed read-only `Get-Content` / `rg -n` / `rg --files` inspection of the brief, Current State, prior tenant-route report, owning routes, IAM policy/classification, routed WebSocket implementation, public helper/registry/writer/ownership chain, credential proof model, connect teardown, gateway revocation and manager construction/deletion. Existing owning tests were read as source evidence only. Several initial guessed filenames did not exist; discovery was corrected using the repository's actual paths.

No source changed; no tests, typecheck, build, dist replacement, browser, network, account operation or provider call ran. This report is a source-level plan, not runtime reproduction of the described races or evidence of an exploited deployment. Previous accepted account/stream reports and working artifacts were preserved.
