# Automation Studio Runtime Debug UI Cleanup

Status: Active
Status detail: Implemented; live browser review pending (the restructure is in place and focused tests pass, but live browser validation and a clean web typecheck are still outstanding).
Created: 2026-09-05
Last updated: 2026-09-10
Owner: Automation Studio web UI
Scope: Restructure the Flow-owned Runtime Debug inner view in Automation Studio (run launcher, Runs/Replays history, responsive styling) into one configure-run-inspect workflow while preserving runtime commands, bounded data loading, query pagination, subscriptions, and detail navigation.
Paired document: none
Related: none

---

## Current State

**Summary:** The document's own status line reads "Implemented; live browser review pending". The three implementation phases (view hierarchy, history hierarchy, responsive styling and test coverage) are recorded as delivered, but final validation is incomplete because live browser review and the web typecheck have not been completed.

**Done**
- Focused Runtime Debug and style validation passed: 6 files, 39 tests.
- Runtime input interaction coverage includes the pre-existing `no_llm_intervention` readiness change and passes.
- Large-project run history still renders only the 25-row SQL page and retains explicit loading, error, and empty states.
- Full web test run: 213 files passed, 7 failed. The failures belong to separate view-identity/hierarchy/cache architecture work, not this effort; one Runtime Debug copy assertion was corrected and revalidated in the focused suite.

**Not done**
- Live browser review of the revised Runtime Debug view has not been run.
- Web typecheck has not passed.

**Next steps**
- Run the live browser review once panel management is authorized for a session.
- Re-run the web typecheck once the pre-existing errors noted below are cleared.

**Blockers**
- Live browser review: panel management was not authorized for the implementing session.
- Web typecheck: pre-existing errors in `live/AutomationStudioSession.tsx` (unsupported `transport` option) and `live/useAutomationHierarchyUiRuntime.ts` (duplicate object properties), which this effort did not introduce.

---

Date: 2026-09-05
Status: Implemented; live browser review pending
Owner: Automation Studio web UI

## Goal

Make the Flow-owned Runtime Debug inner view read as one coherent workflow:
configure a run, start it, then inspect run or replay history. Preserve the
existing runtime commands, bounded data loading, and detail navigation.

## Audit Findings

1. The view begins with a five-item framework summary that does not help the
   immediate debug task and competes with the run controls for attention.
2. Run mode copy is repeated in every mode card and again below the group,
   making the launcher unusually tall before inputs are reached.
3. Execution settings are separated from the Run action by input, live-state,
   retry, and advanced-input sections. This obscures the configuration-to-run
   sequence.
4. Successful readiness is styled as another full-width notice while warnings,
   inputs, advanced JSON, and history all use additional bordered containers.
   The result is a stack of visually equal boxes with no dominant task.
5. History has three nested shells (workspace, debugger, list page), repeated
   headings, and independent overflow rules. The seven-column run row forces a
   wide horizontal scroller in the constrained inner pane.
6. Run filters expose five labeled controls at once. Search, sort direction,
   and page size consume more space than the run list at smaller widths.
7. Raw run and target identifiers dominate each row even though this history is
   already scoped to the selected Flow.

## Decisions

- Replace the unrelated global summary strip with a compact Runtime Debug
  introduction that identifies the selected Flow and explains the workflow.
- Keep run modes explicit, but render them as a compact segmented choice with
  one contextual description for the selected mode.
- Group mode, step limit, and the primary Run action into one execution bar.
- Keep typed inputs visible and Advanced JSON opt-in. Keep readiness failures
  actionable and make successful readiness a quiet inline state.
- Open a completed run directly in canonical run detail instead of also
  inserting a duplicate `Last Run` summary between the launcher and history.
- Present Runs and Replays as the history section's own tabs without another
  generic wrapper heading.
- Simplify run history to the information needed for scanning: run/status,
  start time, duration, actions, and effects. Keep full IDs available in titles
  and the detail view.
- Collapse secondary history controls behind a compact `Filters` disclosure on
  narrow layouts while preserving the existing server query contract.
- Use one vertical scroll owner for the Runtime Debug stage; list and detail
  regions may scroll horizontally only when their tabular contents require it.

## Implementation Phases

### Phase 1: View hierarchy

- Add the compact view introduction.
- Recompose the run launcher so execution controls precede typed inputs and
  advanced input data.
- Remove repeated copy and redundant full-width success treatment.

### Phase 2: History hierarchy

- Make the Runs/Replays selector read as a proper inner-view tab list.
- Remove redundant list chrome and reduce the run row's scanning columns.
- Refine search, filters, pagination, empty, loading, and error states.

### Phase 3: Responsive styling and validation

- Remove nested vertical scrolling and define desktop, tablet, and mobile
  layouts.
- Add focused markup/interaction coverage for the revised hierarchy.
- Run the runtime-focused tests, web check, and web build. Live browser
  validation remains pending unless panel management is authorized.

## Risks And Constraints

- Preserve the user's current readiness behavior change: instruction-free
  graph runs are allowed in `no_llm_intervention` mode.
- Do not alter runtime APIs, query pagination, mutation subscriptions, replay
  scoping, run cancellation, or detail loading.
- Compact rows must remain keyboard operable and expose full identifiers to
  assistive technology or title text.
- The framework repository must remain domain-neutral.

## Validation Log

- Focused Runtime Debug and style validation passed: 6 files, 39 tests.
- Runtime input interaction coverage includes the pre-existing
  `no_llm_intervention` readiness change and passes.
- Large-project run history still renders only the 25-row SQL page and retains
  explicit loading, error, and empty states.
- Full web test run: 213 files passed and 7 failed. The failures are in current
  view-identity/hierarchy/cache architecture work; the Runtime Debug suites
  passed in that run except for a copy assertion corrected and revalidated in
  the focused suite.
- Web typecheck remains blocked by pre-existing errors in
  `live/AutomationStudioSession.tsx` (unsupported `transport` option) and
  `live/useAutomationHierarchyUiRuntime.ts` (duplicate object properties).
- Live browser review was not run because panel management was not authorized
  for this session.
