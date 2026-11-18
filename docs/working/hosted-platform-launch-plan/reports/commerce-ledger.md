# Commerce ledger and cloud admission

Outcome: Done

## Implemented

- New `packages/fluxiq/src/platform/commerce/{model,storage,runtime}/**`, its barrels and owner-local tests. No existing runtime, automation, panel, key, package metadata or shared document was edited by this worker.
- `SQLiteCommerceLedger({ rootDir, now? })` uses Core's existing `SQLiteRepository` at kind `platform.commerce`, platform scope. Each operation runs through its `BEGIN IMMEDIATE` transaction. Event deduplication, immutable customer/account and subscription/customer/account linkage, account index and current subscription snapshot commit atomically. It uses no process-local truth/cache and persists across reopened ledger instances.
- `applyVerifiedEvent(event)` accepts only a complete normalized `subscription.snapshot`: provider/event IDs, authenticated original payload SHA-256, account/customer/subscription IDs, positive monotonic subscription version, explicit status, exclusive paid-through boundary, provider-state verification time and explicit capability/allocation/region/resource grants. Malformed/unknown fields are refused and input is copied before an await.
- Stored event identity binds both the original authenticated payload digest and every normalized field. An identical repeat returns the original receipt with `duplicate: true`. Reusing the provider/event identity with changed data throws `CommerceConflictError("event-reused")`. No raw provider/payment payload is retained.
- Versions are scoped to provider/subscription. Older versions are recorded as `stale` without changing eligibility; equal versions require an identical complete snapshot (`unchanged`) or fail with `version-reused`; a greater version applies. Version is an explicit upstream-adapter ordering contract, never an inferred ordering of webhook timestamps or arrival times. Customer/subscription reassignment is refused even for stale input.
- `CloudAdmissionService<Actor>` resolves caller/workspace/target/capability through an injected trusted server authorization port, independently of ledger eligibility. Requests contain no authoritative payer, paid status, plan, mode or target type. Account/workspace and target ownership must match the resolved authority, and the installed target must support the requested capability.
- Customer-owned execution in explicit `local`/`self-hosted` mode works without a ledger, cloud authorization or commerce policy. Every managed-cloud target, including a locally initiated hybrid request, requires verified cloud account/workspace authorization plus subscription, configured policy and eligible grant. Hosted-engine control of a customer-owned target uses a separate `control` entitlement without inventing managed-compute billing.
- Admission only accepts active status or an explicitly enabled trial. Past-due, canceled and incomplete snapshots do not grant new cloud access. Paid-through and grant expiry are exclusive, grant start inclusive; missing/future/stale verification denies. Freshness is checked after the asynchronous ledger read. Shared/dedicated/control grants are separate; dedicated grants must name the exact resource, and compute grants must match region. There is no fallback target, allocation class, account or region.
- Resolver/storage errors propagate; they cannot yield an allowed decision. This is a new-allocation eligibility decision, not a capacity/cost reservation, queue, execution credential, provider charge or payment completion claim. Stop/read/export and existing-run policies stay with their current owners.

## Public API and integration requirements

The new `platform/commerce/index.ts` exports:

- `SQLiteCommerceLedger`: `applyVerifiedEvent`, `getEvent`, `getSubscription`, `listSubscriptions`.
- `CloudAdmissionService`: constructor options `deploymentMode`, `authorize`, optional `ledger`/`policy`, optional `now`; method `admit({ actor, workspaceId, targetId, capability })`.
- `CommerceLedger`, `VerifiedCommerceEvent`, `CommerceSubscriptionSnapshot`, `CommerceSubscriptionRecord`, `CommerceSubscriptionStatus`, `CommerceEntitlementGrant`, `CommerceAllocationClass`, `CommerceStoredEvent`, `CommerceEventReceipt`, `CommerceEventResult`, `CommerceConflictError`.
- `CloudAdmissionOptions`, `CommerceDeploymentMode`, `CommerceExecutionAuthority`, `CommerceExecutionTarget`, `CommerceAdmissionPolicy`, `CommerceAdmissionRequest`, `CommerceAdmissionDecision`, `CommerceAdmissionDenial`.
- Pure event validation/identity functions, used by the ledger.

Lead integration must export the commerce barrel from `platform/index.ts` (lead acknowledged and did so), instantiate the ledger at the platform database root, and supply a real authenticated IAM/workspace/target resolver. `cloudAuthorization` is an output of that trusted resolver after actual cloud account/workspace authorization, never a boolean or object accepted from client input. Deployment mode and policy come from operator configuration, never hostname/loopback/client flags.

The policy has an explicit version `id`, positive `maxVerificationAgeMs`, boolean `allowTrial`, and `entitlementKeys: { control, shared, dedicated }`; no default price, trial allowance or grace duration is invented. Admission returns bound principal/account/workspace/target/capability plus subscription version, policy ID, allocation, entitlement key and exclusive validity when commerce permits. Re-run admission at dispatch/resume before new allocation; do not mistake this result for durable spend authority.

A provider verifier/reconciler must authenticate original provider events, compute `payloadSha256`, and deliver **complete current-state snapshots** with a genuinely ordered provider sequence or a transactionally serialized reconciliation version. Do not generate versions from event delivery order or wall-clock timestamps: an adapter that does so can misrepresent stale provider state as current. A refresh of `verifiedAtMs` is a changed snapshot and needs a new version. Missing-event reconciliation, provider signature/raw-body routes, checkout/customer portal, published plan/grace policy, provisioning/reservations/outbox and metering remain distinct integration work. A cancel-at-period-end adapter keeps an active snapshot until the paid-through boundary; `canceled` means no new eligibility now.

## Validation

- `pnpm.cmd --filter fluxiq exec vitest run src/platform/commerce --maxWorkers 2` -> failed before test collection: Vitest's configured minimum worker count conflicted with `maxWorkers=2`; no tests ran and no product failure was inferred.
- `pnpm.cmd --filter fluxiq exec vitest run src/platform/commerce --minWorkers 2 --maxWorkers 2` -> **3 test files passed; 56 tests passed**, observed duration 3.48 s. Real SQLite files are throwaway temp roots, never user data.
- `pnpm.cmd --filter fluxiq exec vitest run src/platform/commerce/runtime/tests/cloud-admission-service.test.ts --minWorkers 2 --maxWorkers 2` -> **1 file, 34 tests passed**, observed duration 2.78 s, after making the test option-omission helper compatible with exact optional property types. Scenario tables also have explicit snapshot types for that strict setting.
- Real SQLite coverage: original receipt dedup and changed-content refusal; normalized snapshot persistence/reopen; canceled then reordered active events, including a newer verification timestamp on the older version; equal-version conflict; immutable account/customer/subscription linkage; provider namespace isolation; concurrent independent ledger instances; greatest-version retention; input copying; final-event-write SQLite trigger failure rolling back snapshot/linkage/index/event together, followed by successful retry.
- Admission coverage: all subscription statuses; explicit trial policy; paid-through/grant/freshness exact boundaries and future verification; stale/missing state; account/workspace ownership; spoofed caller fields and invalid actor; capability/region/dedicated resource binding; no shared fallback; service control entitlement; local/self-hosted billing independence; hybrid cloud subscription requirement; resolver/ledger outages; request mutation; asynchronous expiry check; current revocation on successive decisions.
- No whole-package build/check/structure audit was run by this worker while peers edited. Lead was notified of stable production source before its coordinated library build and received the owner-local test command/result. No production source changed after that notification.

## Not verified

No provider signatures, real payment event/checkout, real deployment/cloud resource, IAM resolver integration, HTTP route, capacity reservation/meter/invoice, enterprise license, live browser or paid model call was exercised. Concurrency tests use independent ledger instances in one process against real SQLite; simultaneous independent OS processes were not launched. Package-wide typecheck/build/structure checks and final integration remain lead-owned.

## Return contract

Outcome: Done
Changed: `packages/fluxiq/src/platform/commerce/**`; `docs/working/hosted-platform-launch-plan/reports/commerce-ledger.md`
Validation: `pnpm.cmd --filter fluxiq exec vitest run src/platform/commerce --minWorkers 2 --maxWorkers 2` -> 3 files, 56 tests passed
Not verified: real provider/cloud/HTTP/IAM integration, separate-process concurrency, package-wide checks; see above
Report: `docs/working/hosted-platform-launch-plan/reports/commerce-ledger.md`
Notes: Complete provider-neutral ledger/admission unit; server resolver/provider adapters and reservations remain explicit integration seams. No git, real paid calls or edits outside owned subtree/report.
