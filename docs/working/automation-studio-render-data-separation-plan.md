# Automation Studio Render and Data Separation Working Plan

Status: Paused
Status detail: Paused as a separate workstream during the approved data-first execution week; unresolved work and historical evidence are retained below.
Created: 2026-08-28
Last updated: 2026-11-22
Owner: Parent agent (the integration owner named in the Implementation Journal); area: Automation Studio, `apps/web/src/features/automation-studio/`
Scope: Full separation of interactive rendering from project data, background work, persistence, and view-domain rendering in Automation Studio, plus the global-program shell interaction repairs that the live browser gate exposed.
Paired document: none
Related: `docs/architecture/automation-studio/workspace.md` (authored architecture, Steps 12.1-12.2); the UI profiling runbook and scale-certification guide (Step 12.3; named but not linked here); the earlier data-flow, fast-cache, load-performance, UI-lag audit, lag-remediation, and live-refactor working documents (marked historical by Step 12.4)

---

## Current State

**Priority reconciliation, 2026-11-22:** [Data-first simplification](./data-first-simplification-plan.md) is the current implementation plan of record (approved S7). This pauses this separate plan, does not mark its remaining work complete, and does not cancel another running session. The earlier snapshot below is historical; its code and acceptance were not revalidated by this documentation change. Prior status detail: Implementation, automated validation, authored documentation, and the current-panel live browser regression are complete; the separately hosted seeded small/scale browser matrix remains an operational certification run.

As of the last dated checkpoint (2026-08-30 - Global Program Interaction
Audit). Everything below is taken from this document's own phase status
lines, Progress Ledger, and Implementation Journal; nothing was re-measured
for this summary.

**What is true now**

- All twelve implementation phases are implemented in code. Phases 0-10 are
  marked Complete with their gates passed. Phase 11 reads "Current-panel live
  regression complete; dedicated seeded small/scale fixture-host certification
  remains". Phase 12 reads "Documentation and current-panel evidence complete;
  dedicated seeded fixture-host evidence remains tracked under Phase 11".
- The Phase 12 gate and the 2026-08-29 "Closure boundary" both state that
  Phase 12 cannot be labelled fully complete until the Phase 11 browser
  certification evidence is collected.
- The reproduced empty-project interaction defect (hierarchy click to visible
  Flow view) is fixed and measured against the user-hosted panel. Navigation
  now activates the workspace view immediately; hierarchy focus/primary and
  domain-selection reconciliation run after the visible view commit.
- Most recent passing hosted-panel run (2026-08-30): the complete regression
  covered all nine global programs plus a fresh Studio project and blank Flow
  in 1.8 minutes; warm Studio hierarchy selections measured 71.8-91.2 ms
  stable paint, pane tabs 67.1-85.2 ms, first-use Runtime Debug and Settings
  134.9 ms and 135.1 ms, Studio menus/arrangement/Add Tab about 30-31 ms, and
  the run reported zero API failures, console errors, page errors, React
  update-depth errors, or budget violations.
- Current browser budgets: 300 ms for a view's first activation and 120 ms for
  repeated activation and inner pane tabs, measured as two-frame stable paint.
  The earlier 100 ms DOM-commit-only gate was superseded on 2026-08-30 because
  it excluded the layout/paint cost of the commit.
- Latest repository validation (2026-08-30): web type check passes; complete
  web suite passes 183 files / 918 tests; authored-link and generated-document
  checks pass; `git diff --check` passes; the production Next compiler
  completed but its lint/type worker exited on Windows with code
  `3221225477` (the independent TypeScript gate passes).

**Done**

- Phases 0-10: stable runtime bootstrap, single presentation-transaction
  system, shell render isolation, hierarchy runtime replacement, direct view
  connectors, normalized domain/query stores, local async readiness
  boundaries, after-paint cache/preload/persistence, imperative Flow-canvas
  interaction, and legacy feedback-path removal enforced by 23 executable
  architecture contracts.
- Removed modules: `live/useAutomationProjectView.ts`,
  `live/useAutomationCanonicalViewInputs.ts`,
  `live/view-host/canonical-publishers.tsx`, `live/view-host/publisher.tsx`,
  `live/view-host/input-identity.ts`, plus the optimistic mounted-view
  activation and grouped publication paths.
- Phase 11 Steps 11.1 and 11.7 complete; deterministic portions of 11.2
  recorded (explicitly not as React commit counts); the current-panel live
  desktop Chromium regression passes on the exact final code.
- Phase 12 Steps 12.1-12.5 complete: workspace architecture guide rewritten,
  profiling and scale-certification runbooks updated, historical-tracking
  notices added to six earlier working documents, final evidence record here.
- Post-closure hotfixes recorded and validated: direct-connector scope
  factories, workspace view-source feedback loop, external-store snapshot
  identity, empty resource identity, concurrent project-migration
  initialization, Strict Mode lifecycle disposal, launcher prefetch flood,
  route-selected dynamic program chunks (program route reduced from roughly
  12.83 MB of development JavaScript to 139 kB first-load), stable-paint
  layout containment and hierarchy shell repair, shared menu portal and
  focus-trap repairs, and the Docs program layout-root fix.

**Not done**

- The seeded `small`/`scale` fixture-host browser matrix. It requires a panel
  started against `apps/web/.e2e-host` on `127.0.0.1:3000`; every live run so
  far targeted the user's rebuilt live profile instead. The 2026-08-29 closure
  boundary listed Steps 11.3-11.6 and the 11.8 measurements as the manual
  gate; only the current-panel portion has since been run.
- No seeded-fixture React commit count/duration, browser soak, retained-heap,
  or SQL query-plan measurement has been produced.
- Phase 12 full-completion label (gated on the item above).
- The loose `Last updated: 2026-08-29` line below and the Progress Ledger
  predate the 2026-08-30 journal entries and have not been reconciled.

**Next steps**

- Manually restart the user-hosted development panel: the 2026-08-30
  production build ran against the same `.next` directory and left the dev
  process returning HTTP 500.
- Run the seeded `small`/`scale` browser matrix per the UI profiling and
  scale-certification runbooks, record actual values in this document
  (Step 11.8), then reconcile the Phase 11/12 status lines and the ledger.
- Confirm the Windows lint/type worker exit (`3221225477`) on a clean
  production build.
- Residual risks to confirm at scale during that run: the non-subscribing
  session snapshot reader still performs an aggregate projection when the
  catalog/session itself renders; Flow Editor, Recording, Inspector, and State
  keep cross-domain memoized selectors inside their active connectors.

**Blockers**

- None recorded as hard blockers; the document states the fixture matrix "is
  not a blocker" for the fixed empty-project defect.
- Operational dependency: repository policy forbids the agent from launching
  the web panel, so all remaining browser evidence needs a human operator to
  start the panel.
- The hosted development panel is unusable (HTTP 500) until restarted.

---

Status: Implementation, automated validation, authored documentation, and the
current-panel live browser regression are complete; the separately hosted
seeded small/scale browser matrix remains an operational certification run
Created: 2026-08-28
Last updated: 2026-08-29
Primary scope: `apps/web/src/features/automation-studio/`


## Prior Plan And Unresolved Work

The [complete prior plan and ledger](./automation-studio-render-data-separation-plan/archive/2026-11-22-prior-plan-and-ledger.md) are preserved, including unfinished phases and acceptance requirements. Relative links were rebased for the archive location; no prior technical claims were revalidated or marked complete. Resume from that reference when this separate workstream resumes.

## Work Ledger

### 2026-11-22: priority reconciliation and compaction

- Changed: paused this separate plan under approved data-first S7 and moved its oversized prior document to the linked archive; retained its existing state summary above.
- Validation: `node scripts/structure-audit.mjs --rule working-docs --update` initially refused the two-line growth of an oversized document; compaction applied, rerun passed (exit 0; four obsolete working-docs baseline entries removed).
- Remaining: all unresolved work in the archived plan; no product acceptance claimed.
