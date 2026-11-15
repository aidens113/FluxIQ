# Hosted Platform Implementation

Status: Active
Status detail: Isolated paired task t914: hosted consent, socket routing and service bootstrap validated; tenant HTTP and custody integration continue. Nothing deployed.
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

Portable Core control-plane deployment templates for AWS/GCP/Azure passed independent provider-free validation. Authoritative client trust now has workspace-scoped durable storage, signed proof lookup, immutable bindings and generation CAS; registry mutation serialization fixes a reproduced rotation rollback race. The trusted-store constructor seam is integrated into web service workspaces; production account composition now uses multi tenancy, proven with two independently provisioned accounts. Core PKCE service has durable one-use code exchange and trusted validator/issuer ports. Written briefs are under `hosted-platform-launch-plan/briefs/`; reports under `reports/`.

Approved credential issuance, strict locked tenant holder enrollment, routed WebSocket transport and consumer consent/token/revoke routes passed combined verification. Consent uses primary identity, tenant IAM and a root-owned account queue; mandatory custody starts with zero key boxes. Service first-owner setup now creates a personal workspace administrator, proven against actual multi-tenancy; self-hosted retains its owner policy. Browser HTTP routing, global runtime state isolation, tenant key identity/revocation coordination, durable run recovery, paid dispatch/metering, real runner provisioning and catalog remain incomplete. API authentication and commerce eligibility are not an implemented hosted execution path. No live deployment/model/email/paid call has run. Existing JSON browser trust is not silently migrated; deployment is one Core process, with no active-active gateway coherence claim.

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

### 2026-11-14 — Portable deployment checkpoint
- Agent: Senior supervisor; cloud-portability worker.
- Changed: Provider-neutral pinned Core release bundle, AWS/GCP/Azure Terraform entrypoints, retained state and metadata boot guards, secret-reference bootstrap and operator guide. Website remains separately released from FluxIQWebsite.
- Validation: Lead `node --test deploy/cloud/release/tests/release.test.mjs deploy/cloud/release/tests/compose.test.mjs deploy/cloud/runtime/tests/host-config.test.mjs` with verified standalone Compose -> 7 passed, zero skipped. Lead `python -m unittest discover -s deploy/cloud/runtime/tests -p 'test_*.py' -v` -> 12 passed. Lead Terraform 1.13.5 `fmt -check -recursive deploy/cloud` and each provider `validate -no-color` -> exit 0, all three configurations valid. No real cloud resources, secrets or paid services used.
- Outcome: Foundation commits 8da1c6bc4/67dda7b70 and paired downstream 1d75a5181 pushed on task/t914-hosted-platform only. Portable deployment unit independently checked; actual VM, Docker, Linux security and live release acceptance remain unverified. No dev/main promotion.
- Follow-up: Browser trust persistence and constructor integration, PKCE connect service and routed gateway transport continue in disjoint files. Credential-rotation concurrency regression reproduced by worker; fix and independent validation required before browser milestone acceptance.

### 2026-11-14 — Durable client trust and connect service verification
- Agent: Senior supervisor; browser-trust and connect-service workers.
- Changed: Shared credential proof implementation, authoritative scoped SQLite trust store, serialized gateway mutations and rollback, constructor injection, root authority shutdown, PKCE service and service account composition; operator documentation.
- Validation: Lead combined scoped run -> all 174 assertions passed, but constructor suite failed its real-SQL grouping guard. Added required marker, then reran constructor plus renamed trust store -> 20 tests in five files passed. Independent connect tests contributed 49 passes; worker reran 49 after barrel fix. Web workspace/program/shutdown integration -> 35 tests in four files passed, including two accounts provisioned to different tenant runtimes. Core build and typecheck passed. Full structure audit -> passed with 545 existing warnings and 916 baselines. Web typecheck pending.
- Outcome: Cloud checkpoint 765f1a0ca committed locally, but initial push hook refused in-progress imports/vocabulary, a packed cloud test statement and stale working index. Corrected without baseline expansion or hook bypass. Client-trust public symbols now use domain-neutral ClientTrust names. Final checkpoint push pending current web check and documentation index refresh.
- Validation: Final `pnpm.cmd --filter @fluxiq/web check` -> passed and cached. Core and web types now both pass for this checkpoint.
- Follow-up: Complete approved gateway issuer and routed transport, then web consent and all tenant authority consumers. No live rollout or main promotion is implied.

### 2026-11-14 — Hosted consent and routed transport integration
- Agent: Senior supervisor; connect-service, browser-trust and cloud-portability workers.
- Changed: Pre-socket credential issuer with mandatory durable locked-holder grant; root-authoritative socket routing; primary session consent and tenant IAM; account-wide client limits; bounded PKCE/token/revoke routes; API-key management IAM. Service bootstrap regression uses real multi-tenancy instead of a single-tenancy fixture.
- Validation: Lead strict custody owner tests -> 107 passed; routed transport -> 48 passed; issuer/trust subset -> 77 passed and one new root test failed because storage validation threw before returning its promise. Made scoped save async; storage rerun -> 11 passed. Connect suite initially exposed a Node strip-only parameter-property error in the new refusal class; explicit field initialization fixed it; rerun -> 50 passed including eight processes. IAM owner tests -> 18 passed. `pnpm.cmd --filter @fluxiq/contracts build` and `pnpm.cmd --filter fluxiq build` -> passed.
- Validation: Lead web integration batch -> 85 passed, two root approval tests failed because Vitest unpacked array fixtures into arguments rather than a sessions array; web typecheck found the same test-matrix typing error. Corrected the fixture to named object rows; affected rerun underway. Real two-account provisioning, ordinary-user consent IAM, key management denial, routing, revocation and quota tests passed. Earlier web run refused stale Core dist before executing tests; rebuilt owning libraries rather than bypassing the guard.
- Outcome: Previously validated cloud/trust checkpoints pushed on task branches only. This batch remains uncommitted during checks. Real service owner setup reproduces claim_failed from a forbidden OwnerFullAccess request; worker is replacing it with a personal tenant administrator grant, preserving private operator authority and self-hosted semantics.
- Follow-up: Complete owner and combined web checks, audit/typecheck and paired documentation checkpoint. Then implement tenant HTTP auth and primary-owned durable tenant custody coordination. Extension PKCE initiation/tab observation, reference-code fallback and managed-host ticket routing are not yet implemented.
- Validation: Lead consent/middleware/approval rerun -> 67 passed in nine files. Full structure audit caught CredentialUnlocks at 41 methods against a 40-method limit; extracted its existing credential-envelope creation into a focused module without widening the baseline. Lead custody/transport/IAM rerun -> 173 passed in 12 files; structure audit -> passed (546 warnings, 916 baselined). Final Core rebuild and typecheck -> passed. A concurrent rebuild removed dist while the worker was collecting owner tests: eight lightweight tests passed and three suites stopped at import; no fixed setup behavior ran in that interrupted attempt. Lead is rerunning owner/setup after the completed build, with sources frozen.
- Validation: Final lead `pnpm.cmd --filter @fluxiq/web exec vitest run src/server/owner-claim/tests src/app/setup/tests src/app/setup/client/tests src/app/setup/server/tests` -> 26 passed in five files, including real service provisioning, normal sign-in, isolated tenant IAM, rejected creation, concurrent setup and marker-write retry. Final `pnpm.cmd --filter @fluxiq/web check` -> passed. All modified package types and structural gates pass; no full suite, main promotion or live browser acceptance claimed.
- Outcome: Third batch ready for isolated task checkpoint. Follow-on report-only discovery covers HTTP authority, extension credential/server binding and consent-tab exclusion, and durable tenant custody event ordering. Existing experiments remain untouched.

## Open Questions

User clarified on 2026-11-14: Website is `https://github.com/aidens113/FluxIQWebsite`, remains separately released; no AWS account/region or payment provider chosen. Support portable containers and provider adapters for AWS, Google Cloud and Azure rather than hardcoding AWS into Core. Provider accounts, production mail/payment configuration and actual Hostinger deployed revision remain rollout inputs; no secret values requested in chat. Enterprise licensing and non-web automation remain future work per user. These do not block provider-free implementation.
