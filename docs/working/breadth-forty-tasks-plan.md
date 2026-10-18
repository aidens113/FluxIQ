# Breadth Round Core Integration

Status: Active
Status detail: Codex continuation is validating held storage, reset, result-verification and target-contract changes before downstream live acceptance.
Created: 2026-10-17
Last updated: 2026-10-17
Owner: Codex senior supervisor
Scope: Domain-neutral storage, reset authorization, result verification and target preservation required by the downstream breadth round. Browser tests, scenarios and install proof remain downstream.
Paired document: `breadth-forty-tasks-plan.md` in FluxIQWebExtension
Related: [automation-project-agents-plan.md](./automation-project-agents-plan.md)

## Current State

The user authorized continuing the downstream forty-task handoff, including live browser validation.
The downstream document `../!FluxIQWebExtension/docs/working/breadth-forty-tasks-plan.md` owns execution order, worker briefs and browser evidence.

- Storage proposal `72abeeab` is excluded from current integration: supervisor inspected held JSON (482 passed, 2 failed, 4 skipped) and baseline JSON (484 passed, 0 failed, 4 skipped). Control timings shifted, so causality is unproved. Source/dist baseline verified against the stamp; restoration `c13c0a30` and original proposal remain only on held t707 branch.
- Result-verification change `94c3c49f` in t563 is merged to local dev after supervisor-run focused tests: 4 files, 41 tests. Fluxiq typecheck and structure audit passed. Live judge acceptance remains unverified.
- Held drawing-token normalization `4d90c6e7` in t567 passed supervisor-run normalizer, durable-repair/reopen, downstream transport and Chromium reveal checks. Its frozen production build/check pair passed; downstream company-site live launch is preparing its isolated web build. This held branch is not merged yet.
- R1 in t719 is not accepted: subject equality alone cannot authorize removing a pre-existing same-subject item, and an arbitrary changed page cannot prove an exact inverse. The reset worker is adding generic pre-act destination observations and positive completion evidence; unproved inverses must fail closed.
- The downstream Lab's lifetime use of Core's existing build-cache step locks is merged to downstream local dev; supervisor reran 18 real-process/guard tests and the audit. Core contains no browser-specific lock or scenario code. Raw commands bypassing Core's cache remain outside the protection.
- Classifieds run diagnosis established mismatched preceding navigation and seller-read identity, not a selector regression. Generic failed-trial feedback now traces preceding context before correcting the causal step (t563 `d5488b29`, merged locally). Supervisor independently ran the two focused files from packages/fluxiq: 12/12 passed. Worker typecheck/audit passed; no identity matching was loosened. A supervisor command from Core root accidentally selected staged .tmp test copies and was stopped; it is not accepted validation.
- Social collection-processing dedupe accounting (t5667005f611) is merged locally alongside downstream opt-in excluded-link identity and explicit complete-text reads. Supervisor Core25/25 and integrated Core37/37 passed; downstream independent unit/domain and Chromium proof passed, final paired build/type/audits green. Paid social acceptance remains pending.
- R1's reviewed new-line witness is committed only on paired t719 (Core4bb74570/c61455d3); supervisor24 Core tests and downstream67/36 tests passed. Canonical install also needs a proved collection-transfer inverse after both exploration and trial acts, so generic opaque per-step pre/post collection witnesses and ordered baseline restoration are being added there before dev acceptance. No scenario/browser behavior moves into Core.
- Downstream company live run reached118 provider calls ($0.082465122), seven trials, no promoted Flow. The extension returned ended for a hidden load-more before scroll-loaded batches; downstream owns that repair. Source stayed frozen during the run; no Core build race recurred.

Next: independently verify and merge safe R1 after live proof; integrate held lane changes with narrow gates; observe downstream live acceptance. Optional storage pooling no longer blocks this round. No full suite is required for each merge under the user's twice-daily sweep policy.

## Work Ledger

### 2026-10-17 — Continuation and paired integration record
- Agent: supervisor
- Changed: this paired record; dev merged into isolated t707/t719/t563/t567 branches.
- Why: retain generic Core dependencies and the reset preservation defect alongside downstream execution.
- Validation: t563 focused vitest -> 41/41; fluxiq:check -> exit 0; structure audit -> passed (401 warnings, 1154 baselined). t567 target normalizer -> 10/10.
- Outcome: Partial; no held feature has yet been merged or pushed in this continuation.
- Follow-up: storage comparison, safe reset proof and downstream live acceptance.

## Open Questions

None requiring user input.
