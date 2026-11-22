# FluxIQ UI/UX Upgrade Audit And Working Plan

Status: Paused
Status detail: Paused as a separate workstream during the approved data-first execution week; unresolved work and historical evidence are retained below.
Created: 2026-08-26
Last updated: 2026-11-22
Owner: FluxIQ Web and Automation Studio
Scope: Product-wide UI/UX audit and implementation backlog for the FluxIQ web panel (`apps/web`): global shell, authentication, the eight global operational programs, every Automation Studio surface, shared primitives, and the Playwright browser-evidence gates.
Paired document: none
Related: docs/working/automation-studio-strict-workspace-layout-plan.md, docs/working/automation-studio-load-performance-plan.md, docs/working/flow-initialization-router-ui-plan.md, docs/working/llm-assisted-deterministic-automation-expansion-plan.md, docs/architecture/automation-studio/workspace.md

---

## Current State

**Priority reconciliation, 2026-11-22:** [Data-first simplification](./data-first-simplification-plan.md) is the current implementation plan of record (approved S7). This pauses this separate plan, does not mark its remaining work complete, and does not cancel another running session. The earlier snapshot below is historical; its code and acceptance were not revalidated by this documentation change. Prior status detail: Original status "audited in depth; exhaustive implementation plan ready"; the ledger now records every granular step 0.1-19.10 and two follow-up freeze corrections (latest 2026-08-27) as complete, with browser-evidence runs still pending a manually started web panel.

_Added 2026-09-10 by a protocol worker from this document's own ledger. Nothing below the second `---` was changed._

**What this document is**

- The product-wide UI/UX audit and the exhaustive implementation backlog for the FluxIQ web panel (`apps/web`): global shell, authentication, the eight global operational programs, and every Automation Studio surface.
- It is a working plan plus an append-only Implementation Ledger. Its Rollout Rules require every completed step to update this document before the next step begins.

**Map of the document**

- Audit findings (reference): Purpose, Audit Method, Current-State Evidence (source facts measured at audit time), Product UX Principles, Severity Model, and the Findings Register (P0/P1/P2 sections per surface, each with Observed / Required upgrade / Done when).
- Design decisions: Target Information Architecture and Implementation Architecture (proposed `apps/web/src/ui` and `features/automation-studio` folders; State And Data Rules).
- Surface contract: Exhaustive Surface Coverage Contract, then the inventories AS-SHELL-01..08, AS-VIEW-01..18, AS-INNER-01..08, AS-MODAL-01..07, GLOBAL-01..05, PROGRAM-01..09, the Shared Primitive And Pattern Inventory, and the Cross-Cutting State Matrix. Each surface carries a disposition (Keep / Consolidate / Relocate / Compatibility only / Retire / Decision required).
- Backlog (authoritative): Revised Granular Execution Plan, Granular Phases 0-19, 142 numbered steps. It explicitly supersedes the coarse Detailed Delivery Plan (Phases 0-11), which is retained for its requirements only.
- Gate and rules: Exhaustive Completion Rule, Cross-Phase Test Matrix, Rollout Rules, Dependencies And Related Documents, Audit Completion Checklist.
- Ledger: Implementation Ledger, one dated entry per granular step (0.1 through 19.10, all dated 2026-08-26), each with Status / Plan reference / Implementation / Validation / Defect impact / Next plan step, followed by three closing entries: Phase 19.10 Build-Gate Resolution (2026-08-26), Automation Studio Project-Open Memory Correction (2026-08-26), and Automation Studio Persistent Freeze Second Pass (2026-08-27, the most recent entry).
- Defect register: ledger entry 0.6 defines the stable closure units UI-P0-001..007 and UI-P1-001..015, each mapped to the granular phases that must close it; later entries cite these IDs in their Plan reference lines.

**Done** (as recorded by the ledger)

- Every granular step 0.1 through 19.10 has a ledger entry whose Status is Completed / Complete. Explicit "Phase result ... is complete" lines exist for Phases 7, 8, 9, 10, 11, 12, 15, 16, 17, 18, and 19; Phases 0-6, 13, and 14 have no phase-result line, but every one of their step entries is marked Completed.
- The 19.10 entry states "Granular Phase 19 and its final production-build gate are complete." Its validation: full `pnpm check` across all workspace packages, web unit/component suite 54 files / 284 tests, framework suite passing after one stale Secret Keys catalog expectation was corrected, client gateway 3 tests, `pnpm docs:check`, Playwright discovery of 81 tests across desktop/compact/mobile, and a passing production build after status helpers moved to the browser-safe `fluxiq/ui` export.
- Two post-plan performance corrections are marked Complete: the project-open Flow-by-recording Cartesian product and cross-project cache retention were removed (2026-08-26), and the legacy global `snapshot` bootstrap, unchanged-gateway-poll rerenders, per-click full recomputation, and unbounded Router row mounting were removed (2026-08-27). The 2026-08-27 entry reports web suite 54 files / 288 tests, focused performance regressions 4 files / 90 tests, and passing web and framework builds.
- In the Revised Granular Execution Plan list itself, steps 0.1-4.6 and 17.1-19.10 carry inline completion markers; steps 5.1-16.7 are unmarked there but each has a Completed ledger entry.
- Audit Completion Checklist: 10 of 11 items checked.

**Not done**

- No browser execution of the Playwright suites is recorded anywhere in the ledger. Every entry that touches browser evidence (0.1, 0.2, 0.4, 0.5, 0.6, 1.6, 5.5, 19.9, 19.10, and both freeze corrections) states that execution, screenshots, axe/keyboard/zoom/reduced-motion artifacts, or interactive profiling were not run because repository instructions prohibit starting the web panel for the user; they run against a panel a developer starts manually (`pnpm --filter @fluxiq/web dev`; run instructions in `apps/web/e2e/README.md`).
- Consequently the Audit Completion Checklist item "Capture browser baseline screenshots and measured task/performance data" is still unchecked; step 0.5 remains "Implementation completed; live artifact execution pending manual panel startup"; step 0.6 says its screenshot links "activate after the manually started suite is run".
- No defect-register row (UI-P0-001..007, UI-P1-001..015) has been updated with a closure reference backed by browser evidence, which the register's Evidence contract requires, and the Exhaustive Completion Rule requires "all P0/P1 findings are closed with browser evidence". By the document's own rule the upgrade is implemented but not yet evidenced complete.
- Step 19.9 is marked "Complete (gate implementation)": axe is now a gate for serious/critical violations, and 200 percent overflow and performance navigation cover all eight global programs, but the gates have not been executed.

**Next steps** (the document names no next plan step after the 2026-08-27 entry; these are the open items it does name)

- Start the web panel manually and run the Playwright projects (`test:e2e`) so the baseline, surface-matrix, performance, and accessibility suites produce their artifacts under `apps/web/test-results/playwright/`.
- Use those artifacts to close the UI-P0/UI-P1 register rows per the Evidence contract in entry 0.6, and check the last Audit Completion Checklist item.
- Perform the interactive browser profiling that both freeze-correction entries defer to an external panel.

**Blockers**

- The only stated blocker is procedural: agents may not start the web panel, so all browser-evidence work waits on a human-started panel. No technical blocker is recorded.

**Known staleness in this document** (left in place; see the protocol report)

- The original header below still reads "Status: audited in depth; exhaustive implementation plan ready" and "Last updated: 2026-08-26", although the ledger records all phases complete and its latest entry is dated 2026-08-27.
- The Current-State Evidence section (for example `globals.css` at 10,294 lines, `AutomationStudioLive.tsx` at 4,311 lines) describes the codebase before implementation; the 2026-08-27 entry already refers to a "3,000-line Studio owner".
- Six ledger headings (Granular Phases 8.5, 8.6, 8.7, 8.8, 9.1, 9.2) are joined onto the preceding "Next plan step" line without a line break, so they do not render as headings and are missed by heading greps.

---

Status: audited in depth; exhaustive implementation plan ready

Owner: FluxIQ Web and Automation Studio

Last updated: 2026-08-26


## Prior Plan And Unresolved Work

The [complete prior plan and ledger](./ui-ux-upgrade-audit-plan/archive/2026-11-22-prior-plan-and-ledger.md) are preserved, including unfinished phases and acceptance requirements. Relative links were rebased for the archive location; no prior technical claims were revalidated or marked complete. Resume from that reference when this separate workstream resumes.

## Work Ledger

### 2026-11-22: priority reconciliation and compaction

- Changed: paused this separate plan under approved data-first S7 and moved its oversized prior document to the linked archive; retained its existing state summary above.
- Validation: `node scripts/structure-audit.mjs --rule working-docs --update` initially refused the two-line growth of an oversized document; compaction applied, rerun passed (exit 0; four obsolete working-docs baseline entries removed).
- Remaining: all unresolved work in the archived plan; no product acceptance claimed.
