# Repository State Audit

Status: Active
Status detail: Core audit complete; documented withholding limits, an unsafe storage-less default, and ignored failure routing are confirmed for downstream prioritization.
Created: 2026-09-13
Last updated: 2026-09-13
Owner: Senior supervisor agent
Scope: Core-side record for the paired read-only audit of FluxIQ Core and FluxIQWebExtension at their current dev heads.
Paired document: `F:\!FluxIQWebExtension\docs\working\repository-state-audit.md`
Related: [Core Week 1 plan](./mvp-week1-web-automation-reliability-plan.md), [working document protocol](./agent-working-doc-protocol.md)

---

## Current State

The audit completed at Core `0a2dc53` and downstream `f3771ac`. Both trees were
clean and aligned with their local `origin/dev` tracking refs at intake.

The downstream document owns coordination and the consolidated result. This
paired document owns the Core worker report and Core-specific findings.

**Confirmed**

- Caller-marked values are not withheld recursively from persisted runtime
  result payload, target, failure, or metadata. This is documented current
  behavior and a hardening gap, not a regression found after release.
- A run input copied without a state binding to another output key remains in
  the saved trace. This too is an explicitly documented limitation.
- A storage-less `AutomationStudioService` forgets newly created projects and
  can write partial recording data relative to the process working directory.
- The public `failureRoute` parameter remains ignored.
- The Week 1 Current State's node-definition `expectedState` statement is
  correct: Flow approval retains it, while node-definition approval drops it.
- The Current State's branch-ahead and next-push statements are stale; the
  actual branch is aligned with `origin/dev`.

**Next:** prioritize the security/storage items after the downstream
pre-Stage-4 runner fixes; correct the stale Week 1 state on touch.

**Blockers:** none.

---

## Objective

Identify Core defects or compatibility risks that can invalidate downstream
Week 1 validation or should enter the reliability blocker ranking.

## Worker Briefs

The owning brief is in the paired downstream document.

## Work Ledger

### 2026-09-13 — Core share of the repository-state audit
- Agent: supervisor with worker `audit-core`
- Changed: this document and `repository-state-audit/reports/audit-core.md`
- Why: Verify Core risks that can affect downstream Week 1 and later adaptation work.
- Validation: `pnpm check` -> exit 0; focused sequential Vitest -> 4 files and 49 tests passed; supervisor source review confirmed the limits and rejected one worker documentation claim. The structure audit reported advisory warnings but no violations.
- Outcome: Accepted
- Follow-up: see the paired downstream audit for ranking and sequencing.

## Open Questions

- Define the persistable runtime-result boundary for caller-marked values.
- Decide whether a storage-less Automation Studio service is in-memory or invalid.
