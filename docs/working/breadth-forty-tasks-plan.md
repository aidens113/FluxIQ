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

- Held storage change `72abeeab` is being compared against dev in t707, rebuilding production dist for each half because crash probes load dist.
- Result-verification change `94c3c49f` in t563 is merged to local dev after supervisor-run focused tests: 4 files, 41 tests. Fluxiq typecheck and structure audit passed. Live judge acceptance remains unverified.
- Held drawing-token normalization `4d90c6e7` in t567 passed supervisor-run normalizer tests: 10 tests. Its production build and downstream transport validation are in progress.
- R1 in t719 is not accepted: subject equality alone cannot authorize removing a pre-existing same-subject item, and an arbitrary changed page cannot prove an exact inverse. The reset worker is adding generic pre-act destination observations and positive completion evidence; unproved inverses must fail closed.
- The downstream Lab's lifetime use of Core's existing build-cache step locks is merged to downstream local dev; supervisor reran 18 real-process/guard tests and the audit. Core contains no browser-specific lock or scenario code. Raw commands bypassing Core's cache remain outside the protection.

Next: settle storage A/B; independently verify and merge safe R1 after live proof; integrate held lane changes with narrow gates; observe downstream live acceptance. No full suite is required for each merge under the user's twice-daily sweep policy.

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
