# Installed completion and fingerprint regression

Outcome: Done (test authoring only; execution belongs to the lead).

## Authored files

- `apps/extension/e2e/site-reset/tests/completion-fingerprint/tests/installed.spec.ts`
- `apps/extension/e2e/site-reset/tests/completion-fingerprint/observe-company-link.ts`
- `apps/extension/e2e/site-reset/tests/completion-fingerprint/index.ts`

The exact paths and design were sent to the lead before edits. Production,
fixture, oracle, prompt, Core source, package versions and git were untouched.

## What the regression requires

1. Use the existing provider-free installed-extension fixture, isolated real
   company-website scenario, temporary Core root and real paired gateway.
2. Choose the original navigation link by the region printed in the real model
   view. The natural footer duplicate has identical words and destination.
   Retain the authentic complete fingerprint and selector from the real public
   resolver's unchanged answer, using the latest actual tool's project/Flow
   scope and permission callback. Submit only the original observed handle
   through the normal public authoring path. No private cross-package helper
   is imported and no assertion fingerprint is reconstructed.
3. Execute the original click, then retain ten additional actual navigation
   observations from distinct real fixture destinations. These include the
   directions destinations genuinely shown on the branches page. The original
   handle is never replaced. Assign the same weak id to the same real header
   link across company pages, and use the real public resolver to prove at
   least ten distinct documents have exactly the original selector and entire
   host-computed fingerprint before submission.
4. Submit, test and complete through the existing public project path. A
   pass-through observer invokes the real `resolvePlanNodeParameters`, requires
   the absolute original-fingerprint gate to run after the history accumulates,
   and requires byte-for-byte preservation of its parameters and fingerprint.
5. On a newly navigated expected-page document, change the observed weak id and
   class. Require every trial click to reach the correct navigation element
   while the saved address matches nothing. Each scripted judge checks these
   independent actual browser observations before returning its verdict.
6. Approve/apply through the public service, inspect the actual saved graph,
   then replay it unchanged through public saved-native-Flow playback. Require
   one correct actual click, a fresh document, a reported fingerprint/scored
   resolution, successful real gateway results, fresh command cardinality and
   zero additional provider callbacks.
7. Remove the original navigation target in the next fresh document, keeping
   the natural footer duplicate. Require a failed run, real failed/unacted
   click results and zero actual clicks. Text changes alone are not treated as
   an obligatory failure.

The browser observer only records counters and landmark classifications and
changes weak browser attributes on this isolated fixture. It neither dispatches
actions nor alters browser/gateway/runtime results. No model guidance receives
the assertion fingerprint or the observer's private address.

## Source checks

`domain/src/runtime/llm-evidence/tools.ts` delegates its public resolver to
`plan-resolution/resolve-plan-node.ts`. For an absolute click with no handles,
that resolver calls `targets.absoluteIntent` before the permission result can
admit the step. The regression requires that real public resolver invocation;
it cannot pass by skipping the gate.

Replay uses `service.runRuntimeSession` with the saved flow id, native default
mode, the authorized domain and model intervention disabled. This is the
service used by the product `run-runtime-session` program endpoint and by the
Lab persisted-Flow path (`saved-flow-replay/run-flow.ts` through
`flow-lane/persisted-flow-run.ts`). Required-command mode is a separate builtin
command-graph contract; this regression makes no claim about its receipts.

## Validation and limits

- Browser runs, provider calls and full suites: not launched by this worker;
  the lead owns them.
- The lead subsequently authorized the owning extension check once Core's SDK
  was current. Its first run found `TS18048` on the optional negative run-detail
  attempts collection; optional chaining corrected that projection without
  changing its strict assertions.
- `pnpm.cmd --filter @fluxiq-web-extension/extension check` -> rerun exited 0
  after the compiler and in-memory browser bundles passed. The cache reported
  `not stamped, because inputs changed while it ran (domain)`. This is an
  observed check pass, not a stable-tree final acceptance; the lead owns that
  final audit and the installed-browser run.
- Inspected the import-boundary, statement-packing and `as-never` structure
  rules. The regression uses public package imports, ordinary checked values,
  no `as never` fixture casts and one statement per line. The final structure
  audit remains assigned to the lead.
- Source was reviewed against the installed harness, the public authoring
  provider, the native output registry and the product playback path.
- Source freeze was reported to the lead. Runtime acceptance remains
  unverified until the lead runs the owning spec.
- Both positive target strategy and negative target-resolution failures are
  read from the authoritative flattened `getFlowRunDetail.actionAttempts`, so
  nested saved-flow execution does not hide the actual browser attempts.

## First installed attempt and correction

The lead's first owning browser run failed with
`flow_bootstrap.evidence_repeat_without_progress`. Inspection of its private
trace established that original handle resolution and every fingerprint shape
assertion passed, and execution reached the history phase. Eight history-phase
callbacks occurred, but the history-complete/submission assertion was never
reached. The browser recorded only eight actual fixture document requests in
the entire run, including setup, preparation and the original click; some
requested history actions did not execute.

The first attempt did not retain the loop's exact refused-call feedback. Core's
documented repeat guard intentionally refuses repeated same-input navigations
that reach the same state, which explains the old alternating-page setup, but
its exact feedback code/outcome was not observed. The test now records bounded
safe phase, request/execution, document, resolver, submission and closed failure
code counters, and records actual `core.repeat_check` feedback before failing
fast. It never overrides that guard.

The lead approved replacing repetitive navigation with ten distinct actual
fixture destinations, all still reached through normal `core.run_node`, and
requiring at least ten exact selector-plus-whole-fingerprint source matches.
Both changes are authored and frozen. The initial check pass predates this
correction; the lead owns its final type/audit/build/browser rerun.

## Second installed attempt and diagnostic freeze

The lead's second attempt proved the corrected preparation: ten requested
history calls actually executed, thirteen documents were observed and twelve
had the exact original selector and entire fingerprint. Original capture and
submission each occurred once. The failure was subsequently in the test phase,
with no judged trial or counted absolute resolution yet. The final supervisor
ending reported `project.completion_not_latest` and
`project.build_ending_told`, obscuring the subflow trial's first answer.

The source now records the bounded trial presence, ok flag, verdict, code and
closed feedback issue codes immediately before the assertion. It uses the
existing `trialCode` projection (code before verdict), and retains the first
safe builder-exception marker for the outer failure summary. All acceptance
assertions and target inputs remain unchanged. This diagnostics-only change
was frozen for the lead's third owning run; this worker launched no check,
build or browser process in this correction.

Read-only source inspection confirmed the public trusted absolute path:
single-subflow `core.test_subflow` assembles the accepted proposal through
`single-subflow/assemble-latest.ts` and the candidate controller's
`submitComposed` before the whole trial. A failed assembly/composed submission
returns a code-only refusal instead of a verdict. New model-authored absolute
selectors are deliberately refused by Domain's literal guard; no such literals
were inserted into this test, and no guard or authority was bypassed.

## Third installed attempt and retained native evidence

The third attempt exposed the actual trial answer: it was present, entry was
prepared, a trial run existed, and its verdict was `execution_failed` with
`candidate.execution_incomplete`. No judge ran. Preparation still completed
all ten real history calls and proved twelve exact matching sources. This is
an execution failure, rather than a missing/stale revision pair; its underlying
first native node failure was not retained by the earlier code-only diagnostic.
The later supervisor ending again obscured it, while the newly retained
builder marker confirmed the first assertion was in the test phase.

After the lead confirmed that process was closed, diagnostics were expanded
without changing acceptance or product code:

- Every feedback step now reports closed definition/status/failure-code fields
  and any existing nested failure stage/effect/retryability.
- The actual trial id is used privately to read the public runtime session and
  flattened run detail. Every actual node attempt reports its numeric index,
  definition, status, failure code/stage/effect/retryability, plus run/trace
  status.
- Failed gateway action-result summaries and successful action-type counts are
  logged, together with the harness's already-closed gateway outcome summaries.
- Before assertions, the complete actual subflow-trial answer, run detail and
  runtime session are written to `installed-private-trial-diagnostic.json`
  under the ignored Playwright output directory. They are never printed or
  attached as raw content.
- On failure, the isolated temporary Core root is copied to
  `installed-private-diagnostic-storage` under that ignored directory before
  cleanup. This preserves its original storage for read-only diagnosis; it is
  not a repository artifact or a user-data copy.

The fourth-attempt source was frozen immediately; no worker check, build or
browser process was launched. The first native failure still awaits the lead's
next actual execution and preserved evidence. No target-binding, fingerprint,
or script-syntax cause is claimed from the incomplete verdict alone.

Outcome: Done
Changed: The three new test files listed above; this report.
Validation: Earlier owning check -> exit 0; third lead browser run -> real trial execution_failed/candidate.execution_incomplete, with preparation unchanged; full closed/native/private diagnostics now authored.
Not verified: First underlying native failure, lead's fourth owning run and final installed-browser acceptance.
Report: docs/working/framework-heavy-lifting-plan/reports/codex-1031/completion-parameters/browser.md
Notes: Provider-free design; original parameters retained; default native replay, not required-command mode.
