# Service bootstrap with multi tenancy

Outcome: Done. The lead independently passed the focused owner/setup acceptance and web typecheck; source remains frozen.

## Chosen semantics

Service setup creates the first administrator account with `FluxIQAdministratorAccess` in a new personal workspace. It does not grant `FluxIQOwnerFullAccess`, membership in the primary control workspace, or platform/cross-customer authority. Platform operations remain with the private provisioning authority. This uses the existing provisionable policy and preserves Core's multi-tenant OwnerFullAccess rejection.

Self-hosted setup keeps OwnerFullAccess in its existing single workspace. Local setup remains unavailable. The marker's existing `ownerUserId` continues to identify the person who completed setup; it is not a service-wide authorization grant.

## Reproduction and implementation

- The old test fixture always composed `{ mode: "single" }`, including tests that merely changed the deployment profile to service. The fixture now explicitly composes service as multi tenancy and enables its service IAM profile, using real temporary FluxIQ/SQLite/platform services without user storage.
- Before changing production code, `pnpm.cmd --filter @fluxiq/web exec vitest run src/server/owner-claim/tests/service-bootstrap.test.ts` reproduced the failure: the real multi-tenant claim returned `{ ok: false, code: "claim_failed" }` instead of creating the account. The existing unconditional OwnerFullAccess request conflicts with `checkProvisioningPolicies`, which rejects that policy outside single tenancy. Test execution took 251 ms; first compiled-Core collection took 99.23 s (100.14 s total).
- `claim-owner.ts` now chooses AdministratorAccess only for service; other profiles keep their previous policy. The private in-process caller, `workspace: "new"`, create request id, password validation/reset, serialized marker recheck, default-admin retirement, atomic private marker write and setup-code removal are unchanged.
- Service setup text describes the administrator account and personal workspace. Self-hosted/default text remains unchanged, including its owner wording. The page explicitly supplies its service flag, and error text no longer suggests the service account controls the whole server.
- Added real multi-tenancy acceptance cases for successful normalized-email login and unverified email; exact personal membership and absence of primary membership; preserved OwnerFullAccess refusal; setup submit sign-in and route selection; a real separate tenant with its IAM policy source; another customer's tenant returning 403; concurrent/repeated claim; creation refusal leaving marker/code/default admin untouched; and marker-write failure reusing the same account/workspace on retry.

The routing test uses the real `FluxIQWorkspaceManager`, `createTenantFluxIQ`, `sessionWorkspaceId`, workspace IAM source and public `handleProgramRequest`, with primary identity authority and separate tenant roots. It opens no server/browser and makes no model or cloud call.

## Validation so far

- Root authorized web execution only after contracts/Core had rebuilt. The failing regression above ran against that fresh build, before the fix.
- First post-fix focused command: `pnpm.cmd --filter @fluxiq/web exec vitest run src/server/owner-claim src/app/setup/server/tests/submitOwnerClaim.test.ts src/app/setup/client/tests/postSetup.test.ts` -> 8 lightweight setup tests passed; 3 Core-backed suites could not collect because `dist/runtime/llm/evidence-loop-decision.js` disappeared while the lead's next build cleaned dist. The lead confirmed the concurrent clean. This is a collection/environment failure, not a bootstrap behavior verdict; no Core-backed test body ran in that attempt.
- Source was then frozen, and the lead requested no duplicate test run while rebuilding and running its own focused owner/setup acceptance.
- After the fresh Core rebuild, the lead independently ran the owner/setup acceptance: **26 tests in 5 files passed**, including **all 5 real service-bootstrap cases**. The lead also observed the **web typecheck pass**. These are lead-observed results; the worker did not repeat the same suite.
- `git diff --check -- apps/web/src/server/owner-claim apps/web/src/app/setup docs/working/hosted-platform-launch-plan/reports/service-owner-bootstrap.md` -> exit 0.

No Core package, general provisioning policy/composition, shared document, git history, user state or secret was changed. Existing service markers or previously provisioned primary memberships are not migrated by this first-setup fix.

## Return contract

Outcome: Done
Changed: Profile-specific bootstrap policy; service setup copy/flag; real-profile fixture and service-bootstrap tests; existing self-hosted test clarification; this report.
Validation: Lead-observed owner/setup acceptance -> 26/26 in 5 files passed, including 5 real multi-tenant bootstrap cases; lead web typecheck passed; scoped diff check -> exit 0.
Not verified: Live browser/server deployment, migration of previously claimed service instances, or broader hosted execution/key-custody lifecycle.
Report: `docs/working/hosted-platform-launch-plan/reports/service-owner-bootstrap.md`
Notes: Service administrator stays in its personal workspace. Local/self-hosted setup behavior and security mechanics remain intact. No source mutations after the stable-source signal.
