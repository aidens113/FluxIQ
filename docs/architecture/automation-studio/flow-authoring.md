# Flow Authoring: Written Steps, Bindings And The Build's Test

How a build turns what it explored into a general Flow: steps that are run or
written, values bound to a Flow input or to the row a loop is on, and the test
that runs a loop once per row before the build may finish. Current-state
design (t252, 2026-10-03), verified against source. Paths are under
`packages/fluxiq/src/programs/automation-studio/`, and `runtime/` is that
directory's `runtime/`. The wider build loop -- exploration, the draft's
amendments, the dry-run gate, `core.run_flow`, the judged whole run -- is in
the [LLM Flow Bootstrap Contract](llm-flow-bootstrap.md#evidence-guided-generation);
this page covers what t252 added to it.

**Why (user, 2026-10-02).** Every step used to be the exact call the build had
run, so the model believed it had to do the Flow's work itself to author it:
repetitive work became a sequence of calls, a value the person gave was typed
in as a constant, and a loop's act was done to a real item while building. In
live run `run-murwcaj0-40e56557` the build accepted a friend request its own
listing had excluded, and the test, which sent that one press again, never ran
the loop the stored Flow held. The model may still explore any node
configuration live; it may also write the Flow it has learned, with loops and
parameters, without going through every iteration.

## The Draft

### Recorded And Written Steps

A step enters the draft one of two ways, and both become the same kind of Flow
node.

- **Recorded.** `core.run_node` runs the node live; the step is evidence
  (`taken`) until the model adds it (`add: true`, or `amend_draft add`).
- **Written.** `core.run_node` with `write: true`
  (`runtime/llm/node-tools/run-node.ts`). The host checks the call as it would
  a live one -- node, parameters, the target resolved into its frozen identity,
  the `consequences` a mutating node owes -- and stops before acting. It answers
  `resultCode: "core.run_node.written"` (`AUTOMATION_STUDIO_NODE_WRITTEN_CODE`,
  `runtime/llm/node-tools/replay.ts`), `effectApplied: false`, and a draft
  statement with `ranWith`, `replay` and `written: true`. No permission is asked
  at write time, because nothing is done; the build's test and the plan-time
  `flow_step` gate gate the step with the declaration it carries.

`write` implies `add` (the decision parse, `runtime/llm/evidence-loop-decision.ts`).
Core keeps `written: true` on the step only beside the written result code, so
a host that ignored `write` and acted produces an ordinary recorded step, never
a false "written" (`runtime/llm/evidence-loop/call-record.ts`). A written step
is proposable whatever `effectApplied` says and is never `did_not_work`
(`runtime/flow-draft/step.ts`).

A live call holding a binding form, or a stored `$state`, anywhere in its
parameters is refused `run_node.binding_needs_write`: a binding runs only in
the Flow, so the step is written, or run with the value and bound after. A form
the parse cannot translate is refused `run_node.binding_refused.<reason>`
naming its parameter path (`runtime/llm/unusable-decision.ts`).

### What The Draft Entry Shows

The authored draft entry (`runtime/flow-draft/entry.ts`) shows, per step,
`written: true` on a written step, its parameters with every stored binding
rendered back in the form the model writes (`runtime/flow-draft/binding-render.ts`),
and, after a test, `passes`: how many times a repeated step ran. Once for the
draft it shows `inputs: [{name, test, steps}]`, the Flow inputs the proposed
steps declare (`runtime/flow-draft/flow-inputs.ts`). Its instruction tells the
model it may write a step once it knows the node and parameters, that
repetitive work is a loop (list with a `where`, do or write the act on one kept
row, then `repeat` over the listing), to prefer writing a lasting act a loop
does, and the binding forms.

### Cancelling Choices And Changed Test Evidence

The host may attach `toggle: {key, to}` to a mutating recorded step. Core
compares the opaque control key and `on`/`off`; it does not interpret browser
targets. `runtime/flow-draft/reversal.ts` removes opposite presses only when
no kept proposable step between them could use or return the temporary state.
An intervening action or exported read preserves both presses. Conditional
steps and an explicit model decision to restore a removed step are preserved.
Removed steps retain `cancels` and an `out` explanation; their old act claims
are cleared so they cannot continue claiming instruction coverage.

Reordering invalidates `replayed` marks from the first changed position
onward. A successful checked rerun replaces its argument/resolved form and
clears the old target words and replay mark. It still performs no lasting act;
verification means the revised step is runnable, not that a newly targeted
act was performed. Failed dry-run rows can show the opaque recorded
`actedOn` place; this does not claim to know the actual place a replay ran.

### `amend_draft bind`

`bind` generalizes a kept step, recorded or written, by lifting concrete
arguments into bindings (`bindStep`, `runtime/flow-draft/amendment.ts`). Its
`input` is a JSON merge patch over the step's parameters, with or without
`parameters` around it, as for `rerun`. The bindings are written into both
`ranWith` and the shown `input`, and the first concrete argument of a recorded
step is kept once as `instance`, the evidence that the step worked with that
value. `{"$input": name}` given no `test` takes the value it replaces as its
test value. No live call is made; the Flow signature changes, so the next
completion is tested again. Everything is checked before anything is written.
Refusals, each naming the parameter's dotted path where there is one:

| Reason | When |
| --- | --- |
| `not_a_kept_step` | the step is not proposed |
| `bind_not_a_binding` | an empty patch, or a leaf that is not a binding form |
| `bind_new_key` | a leaf names a parameter the step does not have: binding lifts an argument, never invents one |
| `bind_malformed` | the form does not translate, or an `$input` with no test replaces a value that cannot be one |
| `bind_row_outside_loop` | a `$row` on a step outside a repeat span |
| `already_so` | the step already holds exactly these bindings |

The model is told each reason by `runtime/llm/draft-amendment-feedback.ts`.

**A rerun keeps a step's kind** (`runtime/llm/evidence-loop/rerun-request.ts`).
A rerun of a written step is sent with `write: true`, its forms translated as a
written call's are (an untranslatable one is refused `bind_malformed`). A rerun
of a recorded step whose merged argument still holds a binding is refused
`rerun_holds_binding`: it would run live, and a binding has no value until the
Flow runs. A rerun that replaces every binding with a concrete value runs live.
Undoing a `bind` is such a rerun.

## Bindings

The model writes a binding in `parameters`, at any depth. Core translates it
once, where the step is written or bound (`runtime/flow-draft/binding-forms.ts`),
into the executor's own state binding (`nodes/parameter-bindings.ts`), so the
test, the assembler and the stored Flow read one shape and nothing new runs.

| Model writes | Stored as | Resolved |
| --- | --- | --- |
| `{"$row": "name"}` | `{"$state":{"path":"item.name"}}` | in a loop pass, from the pass's row |
| `{"$input": "query", "test": "blue towels"}` | `{"$state":{"path":"query","fallback":"blue towels"}}` | from the run's inputs, else the test value |
| `{"$step": n, "output": port}` | not built (P5): refused `step_binding_not_yet` | -- |

Input names match `^[a-z][A-Za-z0-9]{0,31}$` and may not be `item`, the row's
name in run state; row fields are one path segment. A form with a stray key, a
wrong type, or a missing or `null` test is refused as `malformed` where it
sits and is never carried as a literal. Search depth is 16, as in the
executor's resolver.

**Assembly checks** (`runtime/flow-bootstrap/authoring/draft-bindings.ts`, run
on the assembled plan by `assemble-draft.ts`). A `$state` survives
normalisation unchanged on string and array parameters
(`authoring/values.ts`, `authoring/normalise.ts`). Then, read from the plan's
graph:

- `flow_draft.row_binding_outside_loop`: a row binding on a node not reached
  from a For Each's `body` port. A span repeating while a check holds has no
  For Each and no row, so a row binding there is refused too.
- `flow_draft.input_shadowed`: an input named `item`, or named as an output port
  of any node the plan uses, because a node's bare output keys enter the same
  run state and would overwrite it.
- `flow_draft.input_conflict`: one input name given two test values by the
  proposed steps (`automationStudioFlowDraftInputs(...).conflicts`, checked in
  `assemble-draft.ts`), naming both values and the steps. A run that supplies no
  value would use one at one step and another at the next.

**Flow inputs.** A Flow input is declared by its first `$input` binding, and
its test value is that binding's fallback: the value the build tests with, and
the value a stored Flow runs on when a run supplies none (the executor reads
run inputs first). A name given two test values is refused at assembly
(`flow_draft.input_conflict`, above).

**Not built.** P5: `$step` bindings to an earlier step's output, the plan's
`inputs`, the Flow's `interface.inputs` (so callers and the panel can see and
fill an input) and declared defaults on root runs; until then an input exists
only as the bindings' fallbacks. P6: row anchors from the list reader, so two
rows with equal values can be told apart; until then such a pass is ambiguous
to the page.

## The Build's Test

The test is the replay walker, not a graph run
(`automationStudioFlowDraftReplaySteps`, `runtime/llm/node-tools/replay-draft.ts`,
with the span logic in `runtime/llm/node-tools/replay-span.ts`). Running the
graph would lose reanchoring, site memory (`remembered`), sometimes-present
steps, withheld excusal and per-step verdicts; the walker sends the same calls.

### The Walker

- **Straight steps** are sent as before. A step holding bindings has them
  resolved by the executor's resolver (`resolveAutomationNodeParameterValues`)
  against no run inputs, so an input takes its test value; a path that does not
  resolve fails the step `core.replay.unresolved_binding` and sends nothing. A
  step with no binding is sent byte-identical to before.
- **List spans.** At a `repeat` whose `over` step's node declares an array
  output (the rule `runtime/flow-bootstrap/authoring/draft-routing.ts` uses),
  the rows are that step's `outputs[<port>]` in this test's answer
  (`AUTOMATION_STUDIO_NODE_OUTPUTS_KEY`). Each member runs once per row, in
  order, call ids `<callId>.pass.<n>`: with the row under `item` only when its
  node declares an `item` input (the assembler wires the row to exactly those),
  with its bindings resolved against `{item: row}`, and, when it carries a
  row, without the explored row's `produced`.
- **While spans.** At a `repeat` over a check, the body runs and the check is
  asked again until it stops replaying. A while span whose body is a lasting
  act runs one pass: the test never does the act that would end the loop.
- **The bound** is For Each's default `maxIterations`
  (`automationStudioFlowDraftReplayLoopBound`, 100). More rows than that, or a
  while span past it, fail every member `core.replay.loop_bound`.
- **No rows known** -- the list step was verified or failed, the host sent no
  `outputs`, the rows are not records, or the caller gave no `nodeOf` node
  lookup -- leaves the span unplanned: it runs once on the explored row and is
  excused as a repeat, exactly as before t252. Every place a build runs the
  walker passes `nodeOf: nodeDescriptions.definition`: the evidence loop's
  dry-run gate and tools, the stopped round's test (`runtime/service.ts`) and
  `core.run_flow`.

Each member's outcome carries `passes: [{pass, status, resultCode?}]`; its
status is its first non-passing pass's, else `replayed`. A pass answering
`remembered`, `present` or `verified` passes. Observations carry `pass` and
`of`.

### Lasting Acts And Excusal

A member's mode is the same on every pass
(`automationStudioFlowDraftStepReplayMode`, `runtime/flow-draft/verify-only.ts`):
a step with a declared lasting consequence, or one doing an act of the
person's, is sent `replay: "verify"` once per row, and is never pressed.

**A step the test ran per row is excused only by a withheld act.** The verdict
(`runtime/flow-draft/dry-run.ts`) never exempts an outcome that carries
`passes` as a step the Flow does not always run; only `withheldBy` -- it needed
what an earlier checked lasting act would have done -- excuses it, and its
outcome then says `excused: "withheld"` (`runtime/flow-draft/excused.ts`). A
repeat that failed on some rows therefore blocks the completion.

### `not_reached`

The dry-run gate (`runtime/llm/node-tools/dry-run-gate.ts`) refuses
`llm_evidence_loop.full_run_required` with the word `not_reached` for a written
step the test never ran on a row: a member of a list span whose list returned
no rows in the test (`passes: []`), or a member of a span the test could not
expand that did not pass on the explored row. In a span the test could not
expand, a recorded member bound to the row is refused the same way: its `$row`
value had no row, so its call failed `core.replay.unresolved_binding` and its
bound form never ran. A recorded member of a zero-row span is not refused (it
ran while exploring), nor is a member excused as withheld. The sentence the model is shown names both causes and what to do
(`runtime/flow-draft/full-run-required.ts`).

### The Unchanged-Replay Guard

A refused Flow completed again unchanged is replayed at most twice; each
refusal of a Flow whose signature equals the last refused one carries the line
`unchanged`, naming the steps to change. A failed per-row pass with no
`withheldBy` is named as a step to change. Written steps and bindings change
the Flow signature through `ranWith`.

### Part Runs

`core.run_flow` (`runtime/llm/node-tools/run-flow-part.ts`) runs the same
walker with no reset and no reanchor. A span expands only when its list step is
inside the range; otherwise it runs once on the explored row. A pass that does
not pass stops the run there, as a step does.

### What The Judge Reads

The build-test summary (`runtime/result-verification/build-test/summary.ts`)
gives a repeated step `passes`: one line per pass with its outcome and
observation, named by the label its list read gave that row
(`pass-lines.ts`, `span-rows.ts`; labels come from the already-screened
`readRows`, never from the row's values), and `buildTest.inputs` once: the
Flow's inputs at the values the test ran on, a sensitive test value written
`(withheld)` (`test-inputs.ts`). A repeated step's own target words leave out
its template row by the domain's `rowContextKeys`. The judge is told each pass
is judged against its own row (`runtime/llm/diagnosis-instructions.ts`), and
the request pre-flight re-screens each pass and each input value for denied
keys (`runtime/llm/harness/request-evidence-check.ts`). Rows and `item` never
reach the model: `outputs` is carried, never shown, and the step log writes an
`item` and `outputs` as field names only (`runtime/llm/step-log/field-names.ts`).

### Parity With The Executor

The walker and the executor's For Each are two interpreters of one loop. They
share the list-port and `item` rules with `draft-routing.ts`, the resolver, and
the For Each bound. The pin is
`runtime/llm/node-tools/tests/replay-parity.test.ts` (t252 w7): one draft with
a Flow input, a list, a repeat holding a row-scoped press and a row-bound step,
and a step after the loop is assembled, run by `runAutomationStudioGraph` with
fake native nodes and by the walker with a fake host, and both must send the
same node, resolved parameters and `item`, in the same order. Defaults the
assembler writes onto plan nodes are dropped from the comparison while they
hold exactly their default.

End to end, `runtime/tests/service-authoring/tests/confirm-requests-build.test.ts`
builds "confirm every friend request with 5 or more mutual friends" through the
service with a scripted model and judge: eight requests, three kept. The test
checks the Confirm once per kept row with that row as `item`, presses nothing
and names no excluded row; the judge reads three passes; the stored Flow has
one For Each over the list, the Confirm inside it bound to `item.name`, the
explored row's name nowhere, and `metadata.declaredConsequences` kept. Its
variants cover a written Confirm, a Confirm that declares nothing lasting (sent
as a step per row), and zero kept rows (refused `not_reached`).

## Consequences

A written step declares `consequences` exactly as a live one, and the host
refuses a mutating written node without a readable declaration. The
declaration travels in `ranWith` into the plan node's `consequences`, so the
plan-time `flow_step` gate and the test's per-pass gate see it; `bind` keeps
it. A materialised Flow node keeps its plan node's declaration as
`metadata.declaredConsequences` (`runtime/flow-bootstrap/adaptation.ts`; `[]`,
"nothing lasting", is kept, an absent declaration is left off). **Nothing reads
it at run time:** a plain run of a stored Flow gates nothing per node, for
recorded and written steps alike. Gating stored runs on it would change what
every stored Flow does when it runs, which is the user's decision.

### Advisory action-claim feedback

An explicit act claim on a control whose wording does not name that act now includes informational claimSaid feedback. It preserves the claim and coverage; whole-Flow judgement remains authoritative. The feedback asks the author to review the actual control and add a distinct executable step when needed. A checked rerun verifies an existing target and does not add the claimed action. Existing act-kind vocabulary recognizes legitimate action wording; blank controls and set/open choices avoid speculative warnings.

### Removing an accidental row repeat

The unrepeat draft amendment accepts only step and change. It removes a repeat on that step without changing the input, act claims or disposition, and invalidates replay marks from that step onward. Existing keep and keep with act preserve intentional repeats. Quantity-is-a-repeat feedback names unrepeat on the beginning of the repeated span, followed by the item quantity control; missing cart actions still prevent completion.

### Selecting a terminal recovery cause

Terminal recovery selects the newest failed or unknown attempt that has no later successful attempt of the same node. Both canonical execution callbacks and the durable annotation fallback use this selector. It preserves every historical attempt and the actual run status: a graph can still fail after all action faults have healed. Genuine unresolved failures and result-refutation attempts remain eligible, while no unresolved attempt retains the provider-free no-failed-attempt refusal.
