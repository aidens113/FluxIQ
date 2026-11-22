# Adaptive Flow Training Roadmap

Status: Paused
Status detail: Paused as a separate workstream during the approved data-first execution week; unresolved work and historical evidence are retained below.
Created: 2026-08-16
Last updated: 2026-11-22
Owner: FluxIQ Core (Automation Studio runtime); the 2026-09-06 checkpoints were executed by Core safety, provider, and backend-grant subagents operating under the repository AGENTS.md
Scope: Core-side roadmap for turning recording/prompt-generated adaptive Flows into stable deterministic Flows (generation, expected-state comparison, runtime recovery, training patches, Training Mode UX, stabilization, integration primitives), plus the 2026-09-06 Production LLM Phase 0/1A/1B safety, provider-seam, and diagnosis-only grant checkpoints.
Paired document: F:\!FluxIQWebExtension\docs\working\llm-production-automation-plan.md
Related: none

---

## Current State

**Priority reconciliation, 2026-11-22:** [Data-first simplification](./data-first-simplification-plan.md) is the current implementation plan of record (approved S7). This pauses this separate plan, does not mark its remaining work complete, and does not cancel another running session. The earlier snapshot below is historical; its code and acceptance were not revalidated by this documentation change. Prior status detail: Roadmap Phase 1 is "underway through the Proposal Generator"; the 2026-09-06 Production LLM Phase 0 and Phase 1A checkpoints are "implemented and focused validation complete", Phase 1B backend grants are "implemented and locally validated", and a Phase 1C UI defect is deferred.

Written 2026-09-10 from this document's own status lines and its most recent
dated checkpoint (the three "2026-09-06 Production LLM" sections). No facts
beyond what the document states are recorded here.

**What is true now**

- The product direction is unchanged: the LLM is a temporary generator,
  trainer, and repair assistant; the saved Flow runtime is deterministic by
  default and adaptive behavior wakes only on state divergence or explicit
  Training Mode (see "Purpose" and "Core Mental Model").
- The LLM must never mutate canonical Flow state directly; it returns
  structured patch proposals (see "Patch Contract"). The delivered Phase
  0/1A/1B work enforces this rule.
- Of the eight roadmap phases, only Phase 1 (Generation Foundation) carries a
  status line, and it still reads "underway through the Proposal Generator".
  Phases 2 through 8 carry no delivery status in this document.
- The delivered Core work is a production LLM safety and provider lane, not the
  training loop itself: new Flows default to normal/no-LLM execution, and the
  only live-capable LLM lane is a one-call `diagnosis_only` mode that produces
  no patch, adaptation, promotion, auto-recovery, or LLM-authorized external
  side effect.
- The built-in provider is DeepSeek, fixed to
  `https://api.deepseek.com/chat/completions` and `deepseek-chat`, with no
  Flow/user endpoint override.
- Enforced limits: request token limits default 8,000 input / 2,000 output /
  10,000 total under an immutable 50,000 total ceiling; provider timeout 20 s
  default / 25 s maximum; response body 1 MiB default / 2 MiB absolute;
  per-request estimated cost $0.25 default with a server-enforced $10 absolute
  ceiling and a stricter $0.25 production run ceiling.
- Every dated section states that no live provider request was made and no
  secret source or environment secret was read during that work.

**Done** (per the 2026-09-06 sections)

- Phase 0 Safety Baseline: safe defaults for new Flows (manual proposals,
  locked mutation policy, no adaptation creation, no promotion); explicit
  manual-approval runs are diagnosis-only; provider results cross an `unknown`
  boundary and are strictly parsed and bounded; deterministic recording
  generation stays direct when the unavailable LLM option is requested, with
  `requestedGenerationMode` and `llmAssistanceStatus: not_invoked` recorded;
  adaptive admission serialized per project. Validation: Core check passed,
  focused suites passed, service suite 90/90.
- Phase 1A Provider Seam: expanded `AutomationStudioLlmProvider.runTask`
  request (timeout, `AbortSignal`, request ID, idempotency key, estimated input,
  token limits); DeepSeek transport adapter with strict envelope parsing and
  normalized failure classes; scoped opaque secret resolver only; synchronous
  per-run ledger shared by diagnosis and patch calls. Two independent hardening
  rounds, a cost-accounting blocker resolution (atomic per-call cost
  reservation against the run ceiling), and a final acceptance correction
  (ledger distinguishes admission reservation from accounting; cycle-safe
  aggregate guard before parsing). Validation: provider/harness/ledger suites
  19/19, then 22/22, then 25/25; service suite 91/91 then 92/92.
- Phase 1B Backend Grants: opaque one-use `diagnosis_only` grants issued only
  after password plus configured PIN verification, bound to actor/session,
  enabled LLM key ID and revision, provider, model, canonical project/Flow and
  execution dependency digest, effective limits, one-call limit, TTL, and
  remaining uses; synchronous atomic claim; revocation on expiry timer,
  Automation Studio close, key update/rotation/deletion, capability expiry,
  cancellation, run failure, framework close, web-runtime reload, SIGINT, and
  SIGTERM; Secret Keys owns a generic opaque one-use reveal authorization with a
  zeroizable password-derived key, and decryption happens only at dispatch;
  the execution digest covers the parent Flow, effective settings, Flow Map
  Router, Subflows, routed Subflow graph Flows, applicable instructions, and
  every transitively reachable pinned published snapshot; a diagnosis grant
  cannot attach to a pre-existing runtime session (any supplied `runId` is
  rejected and the grant revoked); `authorizedDomainIds` is forced empty and
  `authorizedExternalSideEffects` forced false for `diagnosis_only`; the lane
  may run the already-authored deterministic Flow through its ordinary bound
  IO, importer-native, and host capabilities but adds no domain authorization.
  Validation: focused API/provider/harness/budget/grant/Secret Keys/framework
  suites 68/68; service suite 97/97, then 98/98, then all 100 tests; full
  `fluxiq` package 91 files / 586 tests, later 587/588 with one unrelated
  pagination performance test that passed alone; `pnpm --filter fluxiq build`,
  `pnpm docs:reference`, `pnpm docs:check`, and `git diff --check` passed;
  production web-owner lifecycle suite 8/8.

**Not done**

- Roadmap Phases 2 through 8: apply proposal to canonical Flow, expected
  input/output state and runtime comparison artifacts, runtime recovery,
  TrainingPatch artifacts and review UI, Training Mode UX (execution mode
  selector, train for N runs, training status panel), stabilization policy and
  "stable" status, and the deterministic integration primitives. None has a
  recorded status here.
- Near-Term Implementation Order items 1 through 10 have no recorded
  completion. In particular, LLM-assisted generation from recordings is not
  connected: Phase 0 states deterministic recording generation remains direct
  and the LLM option is "unavailable".
- Live provider validation: no live DeepSeek request is recorded anywhere in
  this document.
- Secret Keys/LLM Keys Programs UI composition and durable provider selection,
  deferred from Phase 1A to Phase 1B, are not explicitly recorded as delivered
  in the Phase 1B section (only Runtime Debug issuing diagnosis as a fresh run
  is recorded).
- Phase 1C UI defect (deferred): `flowHierarchyNodes` can emit canonical and
  legacy entries for the same Flow ID with the same `data-tree-item-id`, so
  filtering/clearing the hierarchy can make `.first()` select the legacy entry.
  Phase 1C must deduplicate by canonical Flow identity and add a regression for
  unique tree IDs and stable selection.
- The "Open Questions" section is unanswered: first real domain for Training
  Mode validation, which patch kinds are safe for auto-acceptance, where
  TrainingPatch artifacts live, the minimum model/provider abstraction before
  connecting LLM generation, and whether "Train until stable" precedes solid
  manual patch review.

**Next steps** (as this document states or implies them)

- Phase 1C: fix the `flowHierarchyNodes` duplicate-entry defect with the
  regression described above.
- Downstream: the Phase 1B section hands the local-loopback-only target
  boundary for the live diagnosis-only test to "the downstream testing
  facility/domain policy". That work is tracked in the paired document, not
  here.
- Resume the Near-Term Implementation Order from item 1 (Proposal Generator
  reliability) and item 2 (connect actual LLM-assisted generation behind the
  existing endpoint).

**Blockers**

- No outstanding blocker on the Core lane is recorded: the Phase 1A
  statements that Phase 1B was "paused" and "blocked on atomic cost
  reservation/settlement" were resolved by the cost-accounting blocker
  resolution, and Phase 1B was then implemented.
- The full web-package typecheck is blocked by unrelated concurrent work: an
  unsupported `transport` property in `AutomationStudioSession.tsx` and
  duplicate object properties in `useAutomationHierarchyUiRuntime.ts`. The
  Core check and build are not affected.

**Reading note**

- The Phase 1B section is not in chronological order. Its "Validation" bullets
  reference the executor-causality and pre-staged-session corrections, but the
  "Authorized executor-causality correction" paragraph appears last, after the
  "Independent acceptance security correction". Read the whole section before
  relying on any single paragraph.

---


## Prior Plan And Unresolved Work

The [complete prior plan and ledger](./adaptive-flow-training-roadmap/archive/2026-11-22-prior-plan-and-ledger.md) are preserved, including unfinished phases and acceptance requirements. Relative links were rebased for the archive location; no prior technical claims were revalidated or marked complete. Resume from that reference when this separate workstream resumes.

## Work Ledger

### 2026-11-22: priority reconciliation and compaction

- Changed: paused this separate plan under approved data-first S7 and moved its oversized prior document to the linked archive; retained its existing state summary above.
- Validation: `node scripts/structure-audit.mjs --rule working-docs --update` initially refused the two-line growth of an oversized document; compaction applied, rerun passed (exit 0; four obsolete working-docs baseline entries removed).
- Remaining: all unresolved work in the archived plan; no product acceptance claimed.
