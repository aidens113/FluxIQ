# Hosted Platform Implementation

Status: Active
Status detail: Isolated paired task t914: auth/tenant/commerce foundations validated; browser routing and portable cloud deployment continue. Nothing deployed.
Created: 2026-11-14
Last updated: 2026-11-14
Owner: Senior supervisor
Scope: Core-owned hosted platform: account routing, API credentials, billing/entitlements, deployment profiles and cloud runtime integration, preserving local and experimental execution.
Paired document: ../!FluxIQWebExtension/docs/working/hosted-platform-launch-plan.md
Related: [Hosted production](./hosted-production-plan.md), [FluxNode](./fluxnode-plan.md), [Code structure](../architecture/code-structure.md)

## Current State

User authorized implementation of the paired product plan, with ongoing FluxNode/client/automation experiments isolated and mergeable later. Core owns substantial auth/account/billing/entitlement services. Website remains its own main-domain repo; Core serves app.getfluxiq.com. Local/self-hosted operation remains independent; enterprise licensing and real non-web environments remain explicitly later phases.

Task t914 uses paired worktrees under `C:/Users/osrs_/FluxStuff/fxwork/t914/`. Core baseline is committed dev `04e7b1650`; downstream baseline `7f7fc1842`. Primary Core t911 has dirty lease work; t912 downstream adapter, t905 result work and other experimental branches are preserved, not imported as implicit prerequisites. No panel or paid provider run started. Task setup completed with Core libraries restored and downstream workspace build deliberately skipped.

Implemented foundation units: strict panel workspace resolution; trusted platform identity separated from tenant program data; web program route holds tenant leases and refuses service bearer fallback until browser binding exists; durable enrolled SDK key/proof/session service with web enrollment/list/revoke/exchange; additive discovery instance/build identity; production email transport; transactional commerce ledger and provider-neutral cloud eligibility. Lead observed 102 authority/mail tests, 56 commerce tests, 22 discovery tests and 178 web tests passing. Key concurrency initially failed independent validation, was traced to SQLite WAL initialization, and now passes 58 tests including repeated eight-connection races and eight actual processes with rollback journaling. Final rebuild/types/structure checkpoint is underway.

Active next units: portable Core control-plane deployments for AWS/GCP/Azure and authoritative browser trust (design frozen, source waits for foundation checkpoint). Written briefs are under `hosted-platform-launch-plan/briefs/`; reports under `reports/`. Production composition still hardcodes single tenancy; the advertised consumer connect/PKCE endpoints do not exist. Browser credential routing, global runtime state isolation, tenant key custody, durable run recovery, paid dispatch/metering, real runner provisioning and catalog remain incomplete. API authentication and commerce eligibility are not an implemented hosted execution path. No live deployment/model/email/paid call has run.

## Experimental Branch Integration Contract

- Platform work stays in t914 paired worktrees; do not modify, stash, reset, rebase or delete existing experiments. New experimental tasks use their own worktrees and never this task's test/build outputs or runtime data.
- Core platform owns deployment profiles, tenant/IAM resolution, commerce and neutral admission contracts; experiment branches own their runtime algorithms and domain adapters. Publish additive contracts where practical and avoid renaming/moving runtime code incidentally.
- Record exact baseline versions and any changed public contract in this document. No hidden import of files from experimental checkouts; build solely against the paired sources.
- Before accepting an experiment, integrate current dev into its branch without rewriting history, run owner-local tests/typechecks plus platform contract/tenant/local-mode tests and relevant four-attempt browser acceptance. Resolve both sides of paired API changes together. Only validated units enter dev; no force-push or unmerged-branch deletion.
- Intermediate platform contracts must keep local modes working and service modes closed when dependencies are missing. Feature availability cannot be an authentication bypass or a falsely successful stub. Existing retries/result/budget behavior remains authoritative.
- Leads own all mutating git and shared documents; workers own disjoint files/reports. Package checks run only after concurrent editors finish a coherent batch.

## Worker Briefs

### Brief: tenancy-discovery
- Role/model: discovery worker, gpt-6.1-sol, medium.
- Goal: Determine smallest complete C2/C3 implementation batches and freeze tenant request-routing contract.
- Read: this Current State, code-structure.md, hosted-production-plan Current State and C2/C3 sections; apps/web/src/lib/workspaces, auth, tenant-sensitive routes/gateway wiring as needed.
- Own only: docs/working/hosted-platform-launch-plan/reports/tenancy-discovery.md.
- Must not touch: source, other reports/shared docs, other repos, git. No builds/servers/paid calls; setup build is running.
- Return: exact file partitions, existing helpers/tests, unresolved security constraints, safe first complete code unit and commands to validate it. Include pointers and brief return contract. Do not propose primary-instance fallback for service tenants.

### Brief: access-discovery
- Role/model: discovery worker, gpt-6.1-sol, medium.
- Goal: Map P3b API key/session implementation and existing platform commerce persistence seams; identify runnable first units without editing automation internals.
- Read: this Current State, code-structure.md, fluxnode-plan key sections, SDK session/key code, server FluxNode API, existing IAM/store/panel ports.
- Own only: docs/working/hosted-platform-launch-plan/reports/access-discovery.md.
- Must not touch: source/shared docs/other reports/repos/git. No builds/servers/paid calls.
- Return: exact key server gaps, frozen public protocol, persistence/security needs, runnable integration owner, and bounded implementation file partitions/tests. Separate auth from future billing. Do not invent a second key scheme or accept remote open mode.

### Brief: deployment-discovery
- Role/model: discovery worker, gpt-6-luna, high.
- Goal: Identify executable isolated platform release/deployment work that can land while runtime experiments continue.
- Read: this Current State, existing Core deploy assets/profile/discovery; paired downstream apps/product, browser-host manifests and deploy gaps; no secrets.
- Own only: docs/working/hosted-platform-launch-plan/reports/deployment-discovery.md.
- Must not touch: source/shared docs/other reports/repos/git. No builds/servers/cloud calls.
- Return: exact baseline deploy commands/dependencies, local/service config semantics, proposed version-manifest compatibility gate and small testable first implementation partition. Identify Docker availability read-only if useful.

## Work Ledger

### 2026-11-14 — Isolated execution intake
- Agent: Senior supervisor.
- Changed: Paired task t914 and this Core working record.
- Validation: `git status --short --branch` -> primary Core is dirty task/t911-runtime-lease-isolation; downstream dev has unrelated instruction/debug changes. `pnpm.cmd task start hosted-platform --worktree --core --skip-workspace-build` -> paired t914 worktrees created, preparation running.
- Outcome: Existing experiments preserved; implementation intake active.
- Follow-up: Read discovery reports, freeze contracts and dispatch disjoint code units.

### 2026-11-14 — First implementation batch
- Agent: Senior supervisor; tenancy, key-session and release workers have disjoint written briefs.
- Changed: Production Resend transport, explicit web sender configuration and operator documentation; discovery findings and implementation briefs.
- Validation: `pnpm.cmd exec vitest run src/platform/provisioning/email/resend/tests/sender.test.ts` (fluxiq package) -> 12 passed. An earlier transform error in the test constructor was corrected before this passing run. No real email sent. Task preparation -> completed successfully.
- Outcome: Email transport provider-free tests pass; web integration awaits rebuilt Core exports. Discovery confirmed missing atomic key persistence and platform/tenant identity split. Source implementations underway; no hosted-ready claim.
- Follow-up: Finish owner-local tests, rebuild shared contracts once editors settle, run package types/structure, integrate service mounts and tenant routing, then commerce/admission and managed execution.

### 2026-11-14 — Provider portability and integration validation
- Agent: Senior supervisor.
- Changed: Web key enrollment/list/revoke and session exchange, instance-bound discovery/configuration, key-service lifecycle/eligibility, cloud portability brief. Additive public versions: fluxiq 0.50.0, contracts 0.22.0.
- Validation: Lead rerun of program authority and mail tests -> 102 passed in 4 files; commerce owner-local tests -> 56 passed in 3 files; discovery schema -> 22 passed. Library build -> passed, cache stamp refused because workers added tests while package inputs were hashed; no compilation failure. Structure audit -> seven new import/statement violations in lead web files, corrected; rerun pending. Key-store concurrency exposed native SQLite busy-wait starvation; worker changed lock waiting to asynchronous, preserving transactional replay consumption; rebuild and verification pending.
- Outcome: Foundation integration continues, not a hosted-ready release. User identified separate Website remote and requested AWS/GCP/Azure portability with no provider/account/region selected.
- Validation: `git ls-remote https://github.com/aidens113/FluxIQWebsite.git HEAD refs/heads/main` -> both resolve to `08e51d4980750c693e2eac5fcce38f7aca46e921`. Actual Hostinger deployment revision remains unverified.
- Follow-up: Complete shared build, web/API/types/structure checks, isolated commit; complete tenant gateway/process isolation, production account composition, durable execution/provider adapters, billing integration and rollout acceptance.

### 2026-11-14 — Independent replay regression
- Agent: Senior supervisor; key-session worker assigned diagnosis with failure evidence.
- Validation: `pnpm.cmd exec vitest run src/platform/keys src/server/keys-api` (fluxiq package) -> 44 passed, 1 failed. Eight independent SQLite connections produced zero successful exchanges where one must succeed; race test took 21.8 seconds. Earlier worker 45-pass result is not accepted as verified.
- Outcome: Key/session milestone cannot merge until the remaining contention cause is fixed and independently rechecked. Do not reduce contenders or increase timeout to mask it. Focused web tests and package type checks are in progress against stable source.
- Follow-up: Inspect actual failed statement/error, correct storage lifecycle, repeat concurrent/restart/SDK proof tests, then web/types/structure as affected.

### 2026-11-14 — Replay correction and web verification
- Agent: Senior supervisor.
- Changed: Worker removed per-connection WAL initialization from the new key DB, retaining FULL durability and BEGIN IMMEDIATE under rollback journaling. Root corrected a web import cycle by resolving provisioning on use and changed the email resolver's env port to a structural read-only map.
- Validation: Lead `pnpm.cmd exec vitest run src/platform/keys src/server/keys-api` -> 58 passed, including 12 eight-connection rounds and eight child processes; worker independently reported two clean 58-pass reruns. Web focused batch -> 178 passed in 15 files. Contracts/Core typechecks passed; web initially found seven env-test type errors, corrected; `pnpm.cmd --filter @fluxiq/web check` -> passed. `node scripts/structure-audit.mjs --rule import-cycles` -> passed, 196 baselined. New source rebuild and final Core types/full structure pending.
- Outcome: Observed replay failure resolved structurally; cloud rollout remains incomplete. No test credentials or provider secrets committed.
- Follow-up: Commit/push validated foundation on isolated task branch, then implement browser-trust scoped store and shared SQLite lock helper; portable cloud package in parallel.

### 2026-11-14 — Foundation checkpoint
- Agent: Senior supervisor.
- Validation: Final `pnpm.cmd --filter fluxiq build` -> passed and cached; `pnpm.cmd --filter fluxiq check` -> passed and cached; latest web key/mail rerun after import-cycle correction -> 30 passed in 6 files. Full `node scripts/structure-audit.mjs` -> passed (545 existing warnings, 916 baselined); downstream working-doc/docs-links checks -> passed; `git diff --check` -> clean. Contracts/web package types passed as recorded above. Full test/build sweeps and live deployments deliberately not run; main promotion is not earned.
- Outcome: Foundation source ready to commit/push on task/t914-hosted-platform. Existing Core/downstream experiment worktrees remain untouched. Cloud deployment source and browser-trust design remain in progress and are not part of foundation acceptance.
- Follow-up: Continue authoritative browser credential routing and portable deployment tests; no release/hosted-ready claim.

## Open Questions

User clarified on 2026-11-14: Website is `https://github.com/aidens113/FluxIQWebsite`, remains separately released; no AWS account/region or payment provider chosen. Support portable containers and provider adapters for AWS, Google Cloud and Azure rather than hardcoding AWS into Core. Provider accounts, production mail/payment configuration and actual Hostinger deployed revision remain rollout inputs; no secret values requested in chat. Enterprise licensing and non-web automation remain future work per user. These do not block provider-free implementation.
