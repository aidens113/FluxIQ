# Optional Multi-Action Exploration Reconciliation

Status: Active
Status detail: Current Core contracts are being compared with the stale t021 one-or-many evidence prototype before a minimal current-dev port.
Created: 2026-09-20
Last updated: 2026-09-20
Owner: Senior supervisor agent
Scope: Own the domain-neutral ordered multi-action evidence-decision, state-window, per-action permission, refusal, and accounting contracts for optional exploration batching.
Paired document: `F:\fxwork\t033\!FluxIQWebExtension\docs\working\multi-action-exploration-reconcile.md`
Related: [LLM-assisted deterministic automation expansion](./llm-assisted-deterministic-automation-expansion-plan.md)

---

## Current State

The stale t021 Core prototype allowed one evidence decision to contain an
ordered action list, but its live run never completed a second action in any
batch and created no Flow. The branch is substantially behind current `dev`
and its uncommitted diff must not be merged.

Current Core owns the generic decision shape, ordered reduction, evidence
window, per-action permission/refusal, accounting, and compatibility parsing.
The downstream web repository owns concrete browser tools, field entry, and
truthful `targetsUnchanged`. The paired downstream document owns the worker
brief and report for the initial read-only reconciliation.

**Done:** fresh paired t033 worktree built from current Core `dev`.

**Next:** accept or revise the reconciliation map, then brief the smallest Core
implementation slice. No provider call occurs during the map.

**Blockers:** none for investigation.

---

## Work Ledger

### 2026-09-20 — Reconciliation boundary established
- Agent: supervisor
- Changed: paired working document only.
- Why: keep generic one-or-many decision semantics in Core while leaving browser actions/evidence downstream.
- Validation: current Core production packages built during paired t033 setup.
- Outcome: Partial
- Follow-up: downstream-owned read-only map.

---

## Open Questions

- What is the minimal compatibility representation that keeps one-action decisions unchanged while permitting an ordered list? Owner: senior supervisor after the reconciliation report.
