# Start-state admission diagnostic
Status: source/tests FROZEN; all C runtime processes ended. No further Service run while SQL/log owners change.
Scope: provider-free original positive `runs each trial on the site`; original YES/world/reset assertions and 300,000 ms timeout retained.
Command: `pnpm.cmd exec vitest run src/programs/automation-studio/runtime/service/project-build/tests/project-build-trial-reset.test.ts -t 'runs each trial on the site' --minWorkers 1 --maxWorkers 1` (packages/fluxiq).
Log: `.fluxiq/refactor/c-claim-phase-diagnostic.log`; session96878, exit1.
Result: one selected test timed out; 391.28 s total, 86.23 s collection, 303.97 s test/cleanup; three unselected cases skipped.
Distance: initial look/go.product/add.honey/add.rye/go.away/submit completed by73.668 s after fixture setup; test.1 never returned.
No `claim.complete.begin`, `complete.reject`, UNKNOWN or exact coverage-key cancellation appeared before cleanup.
Cleanup started at300.013 s; only then `execution_admission.aborted` surfaced. This is a timeout-cleanup symptom, not proof of a claim/receipt failure.
Actual rejected chain: StartCheck.readStartState -> authoring producer -> BuildToolObserver.invoke ordinary-root branch -> root callback prepare -> Source.prepare -> Lifecycle.enter.
The abort is lifecycle.ts222, AFTER awaiting `track(reservation, persistence.enter(request))` at217. The selected start-state callback had not yet been invoked.
Lifecycle.track only retains and returns the SAME persistence Promise; it does not flush or await its own tracking set.
Missing scope is visible statically: brief-ports placing -> act-places reader.read(undefined,signal), omitting its invocation parameter; producer therefore cannot inherit an original request parent there.
The resulting observer ordinary-root branch is proven by the actual stack; whether the missing parent causes the long durable-enter wait remains unproven.
FIFO/store/native duration and the exact earlier active operation were not instrumented; no deadlock, native IO failure, or performance cause is claimed.
The isolated synthetic temporary directory was removed by normal cleanup before a database metadata query; no database contents were read.
Previous two fixes genuinely advanced beyond runBody/trialled unknown; their focused engine2/2 and Root normal type/audit/build acceptance remain separate from this failed positive.
Next required evidence: actual persistence-enter/FIFO operation phases plus original parent handoff at placing/start-state; preserve one configured cohort and original tuple/receiver.
No purity/fulfilled-Promise receipt, new Source/context registry, root retry, timeout increase or assertion change is an acceptable substitute.
Outcome: Partial
Changed: TEST-only fixed-label phase diagnostics, this report; production unchanged during this diagnostic.
Validation: command above -> timeout exit1; all original positive assertions remain unproven because build did not return.
Not verified: clean positive, exact durable-enter wait owner, native dataset ACK; descriptor/native-clock fix remains approved and held.
Report: docs/working/runtime-ownership-refactor/reports/start-state-admission-diagnostic.md
Notes: no active readers; source/tests frozen; no git/build/provider/browser/user-data operation.
