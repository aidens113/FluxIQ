# Adaptation And Recorded Replay - Core Contracts

Status: Active
Status detail: Codex verifying t517/t516 and implementing t518; downstream owns live gate evidence.
Created: 2026-10-13
Last updated: 2026-10-13
Owner: Codex senior supervisor
Scope: Generic certain-no-effect failure/retry, interruption-learning promotion, and historical recording state-routing contracts required by the downstream adaptation gate.
Paired document: C:/Users/osrs_/FluxStuff/!FluxIQWebExtension/docs/working/adaptation-and-breadth-plan.md
Related: [MVP final month](./mvp-final-month-plan.md), [state-aware recovery](./state-aware-recovery-plan.md)

## Current State

- t517 adds optional `certainNoEffect: true` only on retryable, unacted failures. A lasting act gets one re-press; default continuation cannot turn its exhausted failure into success. Authored failure/optional routes retain precedence. Supervisor observed 140 owning executor and 10 contract tests passing after dev integration, source typechecks and public builds. Downstream 302 domain/501 extension tests and source/test typechecks pass; headed Chromium Post harness passes. Full browser gateway/Core playback and Firefox are unverified. Structure gates/integration are next.
- t516 learns an interruption the client defence closed, without asking a model, when adaptations are kept. Its guarded handler remains held until successful judged completion. Review found and fixed per-layer/identical-time identity collisions. Worker claims remain pending supervisor integration and verification.
- t518 is a separate paired task. Existing state routing owns positive-evidence skip decisions. Recording proposal generation currently keeps state links but does not supply historical route signatures; the state linker can also mix producer and ingestion clocks. An optional host-owned historical snapshot projection will feed the existing signature/effect seam, declining incomplete/ambiguous evidence. Browser-specific projection and inferred target-wait semantics stay downstream.
- No full suites or paid runs were authorized by this document. The newer user rule requires owning tests, touched-package typechecks and structure audit per task, with full sweeps at most twice daily. Core's legacy finish wrapper will use `--skip-checks` only after those narrow gates are independently observed.
- Live qualification, scenario state, run receipts and P1-P7 are owned by the paired downstream document. Unit/preflight success does not establish browser handler execution or durable reuse.

## Work Ledger

### 2026-10-13 - Codex continuation contracts paired

- Agent: Codex senior supervisor.
- Changed: created the Core counterpart for t516/t517/t518 coordination; user was alerted before Core edits.
- Validation: t517 executor 140 tests, contracts 10 tests, source typechecks and contracts/fluxiq builds observed after merging dev into the task. Remaining tasks have only worker claims so far.
- Outcome: In progress.
