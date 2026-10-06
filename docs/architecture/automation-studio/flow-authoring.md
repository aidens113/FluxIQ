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

### Unchanged Saved Candidates During Repair

A repair seed retains a saved node's explicit consequence declaration, including
`[]`, and the first start token actually captured by its ordinary execution.
Missing declarations or starts remain missing. A separate private scheduled
candidate represents the unchanged configuration awaiting a fresh whole test;
it is neither `ranWith` nor evidence of an earlier performed action.

Module-private correspondence binds the candidate to its original step object
and configuration. Only the loop's trusted initial seed copy transfers that
correspondence. Copied, edited or stale configurations cannot borrow it. The
full-test gate and replay walker also require the registered node's fixed output
mapping. Fresh replay still uses ordinary reset, binding resolution, output
schema and permission checks. Lasting candidates use the existing verification
mode without repeating their mutation or inventing prior execution proof.

The actual public-service/native/domain-adapter repair fixture independently
verified fresh reset, unchanged saved opener, repaired bound value and acceptance
in that order. Core eligibility/refusal owners cover missing provenance, copied
or edited candidates, unmapped outputs, unresolved binding and lasting verify.
These scripted fixtures do not prove live browser behavior or provider-free
saved reuse. Candidate scheduling remains private to `runtime/flow-draft/`;
ordinary recorded/written steps retain their existing contracts.

Authored guidance also distinguishes preparation from the parent act: claim an
advertised child choice for its setting, or retain necessary preparation without
an act claim when no child is listed. It does not invent a child ID or remap
claims; the whole original requirement remains in the checklist.

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
uses the validated host draft declaration to update its action/tool identity,
effect and proposal metadata. It never derives an action from an arbitrary
argument field. The previous execution keeps its original identity; the new
candidate clears the old target words and replay mark. It still performs no lasting act;
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
| `{"$step": n, "output": "port", "path": "a.b"}` | `{"$state":{"path":"$step.<id>.port.a.b"}}` in the draft; `$node.<key>.port.a.b` in the plan and stored Flow | in the test, from what step n answered in this test; in a run, from that node's output in this run |

Input names match `^[a-z][A-Za-z0-9]{0,31}$` and may not be `item`, the row's
name in run state; row fields are one path segment. A form with a stray key, a
wrong type, or a missing or `null` test is refused as `malformed` where it
sits and is never carried as a literal. Search depth is 16, as in the
executor's resolver.

**An earlier step's output (P5, t270).** `n` is a draft position, and a
position is renumbered by every reorder and withdrawal, so the form is read
against the draft as it stands when it is written
(`AutomationStudioFlowDraftBindingContext`: the steps, the position of the step
being written -- absent for one about to be appended -- and the node lookup)
and stored under the step's own id. `path` is optional, one or more field
names of a record output; a list index is refused, since the resolver walks no
list. Refusals: `step_binding_not_yet` when the caller passed no draft (every
caller before P5's wiring), `step_missing` (no step at `n`), `step_not_earlier`
(`n` is the step itself or after it), `step_not_usable` (withdrawn, a look, or
failed), `step_output_unknown` (the node is known and declares no such output),
`malformed`. Shown back to the model as `{"$step": <its position now>, ...}`
(`binding-render.ts` with the draft; `null` once the step is gone).

Nothing keeps run state under `$step` or `$node`, so an unrewritten reference
is reported missing, never read. The build's test supplies each step's outputs
under `$step.<id>` from its own answer in the same walk, and only from a step
asked to run that ran (`core.replay.replayed`); each repeat pass starts with
none of the last pass's (`replay-draft.ts`, `replay-span.ts`). Assembly
rewrites `$step.<id>` to `$node.<key>`, the plan key of the node the step
became (`assemble-draft.ts`), and the executor resolves `<key>` to the one node
of the graph whose `metadata.bootstrapSymbolicKey` is that key
(`runtime/executor/node-inputs.ts`, `automationStudioNodeOutputReferences`),
then reads `${nodeId}.<output>` with the ordinary resolver. A key no node or
two nodes carry stays unresolved: the node fails
`executor.parameter.unresolved_state_path` before it runs.

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
- Earlier outputs (`assemble-draft.ts`), each naming the reading step:
  `flow_draft.step_binding_source_missing` (its step became no node of the
  plan: withdrawn, or not in the Flow), `flow_draft.step_binding_not_earlier`
  (its node is the reader or after it: a reorder moved it),
  `flow_draft.step_binding_unknown_output` (the registry's definition declares
  no such output), `flow_draft.step_binding_conditional_source` (the Flow does
  not always run it: optional, only-if, a fallback, an answered interruption),
  `flow_draft.step_binding_repeated_source` (it is a member of a repeat the
  reader is not in, so the reader would get whichever pass ran last).

**Flow inputs.** A Flow input is declared by its first `$input` binding, and
its test value is that binding's fallback: the value the build tests with, and
the value a stored Flow runs on when a run supplies none (the executor reads
run inputs first). A name given two test values is refused at assembly
(`flow_draft.input_conflict`, above).

**Not built.** The plan's
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
person's, is sent `replay: "verify"` once per row, and is never pressed. An act
of the person's is lasting by its kind (an add, save, claim, move or submit), by
a quote of the build's instruction read that grounds it (a split act by its
original clause), or when the read answered it with a class or left it
unanswered; any other act -- a setting or an open the read neither quotes nor
answered as lasting -- runs again (t174-w107,
[the instruction's read](llm-flow-bootstrap.md#permission-on-the-authoring-path)).

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

### Lasting acts from counted-object instructions

When one original instruction clause names multiple counted objects, each parsed act keeps its own display quote and parser-owned source clause/object provenance. On the quote path of the lasting-act rule (`instructedLastingActs`, `runtime/flow-bootstrap/action-permissions.ts`), the cached consequence read attributes such an act only when a grounded quote includes that child object and matches the original clause or display quote: a combined clause grounds both objects; a narrow sibling quote or shared verb grounds neither. The quote path is one of three. An add, save, claim, move or submit act is lasting by its kind whatever the read quoted, so split adds are checked, never pressed again, by build tests; and an act the per-act read answered with a class, or left unanswered, is lasting too ([the instruction's read](llm-flow-bootstrap.md#permission-on-the-authoring-path)). In the read itself, a split act's answered classes are recorded as entries quoting its original clause, because the assembled display quote is not the person's words; sibling splits of one clause give one entry per class. Dotted choice IDs remain ordinary preparation, and this attribution changes no permissions or normal Flow execution.

### Checked configuration and prior execution

An accepted verify-only rerun stores its replacement as checkedCandidate with performed=false and intended act claims. Its old performed record stays under priorExecution tied to the original arguments; old state, output and resolved configuration cannot prove the replacement ran. The candidate remains authorable without acquiring the stronger written contract. Following test marks are invalidated, zero-row candidates remain not reached, and binding a candidate does not invent an executed instance. A separate historical lasting-effect guard keeps subsequent reruns read-only even after current effectApplied becomes false. Ordinary explicit actions and their existing permission gates remain unchanged.

A refused nonexistent-step amendment explains that add includes an existing draft step; a new action is authored through an offered tool_call with add:true and an intended act where appropriate. Its returned draft position is used for later edits. The feedback changes no action permissions or execution behavior.


### Declared arrival evidence

Restoration and instructed-act evidence classify arrival using the runtime binding's existing runsNodes.arrival opaque node identity and declared parameter. Only that action and parameter can match the start location, with resolved arguments taking precedence. A nonarrival action carrying stale location arguments cannot be refused as merely arriving; absent a declaration, arbitrary strings do not confer arrival. The same declaration reaches completion restoration, model/stopped checklists and build-test judge summaries. Other plan location comparisons remain unchanged; this classification does not invent performed evidence or alter permission, replay or host effect semantics.

### Continuing unfinished creation

The existing flow.explore chat capability builds or continues eligible creation in the same Flow. Continuing the saved goal omits instruction; a genuinely changed goal can make old draft evidence incompatible. flow.improve remains for a Flow with applied steps and retains its apply confirmation. Service target validation and exact incomplete-draft dependency digest/instruction-ID compatibility remain authoritative, and a catalog name alone does not establish successful work. Saving an identical canonical active generation goal returns the existing document without changing its timestamp or digest; changed or disabled goals retain the normal write path. No new capability or automatic fallback is introduced.

An automatic reauthor build retries once only after a canonically classified
transient provider request failure: rate limiting, network failure, timeout,
or a retryable HTTP server error with matching provider provenance. Public
`retryable` also permits a person to continue an unfinished draft; it does not
authorize another automatic build after budget, iteration, unreadable-reply,
unchanged or no-progress endings. Each actual attempt retains its accounting
and append order, and a permitted retry receives only the remaining repair
purse. Approval or application failure after an adaptation exists cannot
trigger another generate. Internal HTTP retries remain within their original
logical provider question.

### Scoped Lab build-call allowance

The public `resolveAutomationStudioLlmBuildCallLimit` reader accepts an optional
positive safe integer from `FLUXIQ_LLM_BUILD_CALL_LIMIT` only when
`FLUXIQ_LLM_BUILD_CALL_LIMIT_SCOPE=test`. An unscoped process ignores the value,
including a malformed one. There is no implicit call limit for ordinary UI.
The Lab forwards its resolved plan before starting its owned Core process;
explicit Flow/provider settings can narrow that allowance.

The creation purse admits each logical provider question before sending it.
Pending questions reserve slots; settlement consumes one, and an explicitly
unsent request releases it. Internal HTTP retries share the original question's
slot. Reader, decision, repair-round and judge questions share the allowance;
deterministic replay consumes none. The configured judge pair is kept back from
nonjudge questions, without recording the reserve as paid usage. Calls and
dollars retain separate refusal fields and closed budget endings.

Failed builds can publish optional root `totalProviderCallCount` from the
actual current purse. This aggregate is separate from evidence-loop decision
count and includes settled questions outside the loop. Legacy absence remains
unknown; setup failures before a purse exists do not acquire an invented zero.
Call-refused judging preserves actual usage and reports its settled question
delta, including zero when nothing was sent. Whole-test, current-signature,
lasting-effect and permission gates remain authoritative.

### Paging Evidence Sent To The Result Judge

The result verifier adds paging wording to its provider-facing summary copy after unread-column annotation. A consistent observed end with no truncation and plausible page counts states the observed end and omits the authored page limit on that copy. Real page-bound termination retains the limit and incomplete-list advice. Missing or unknown stop, contradictory truncation, impossible counts and an absent first-page continuation control retain the facts and uncertainty. This projection changes no verdict, default bound, executed read or durable raw account; the saved evidence remains available unchanged. Owner regressions cover the actual judge request as well as the projection boundaries; live extraction acceptance remains a separate requirement.

### Unusable decision field feedback

Strict provider grammar still refuses extra decision-envelope keys. For a
known misplaced tool-call write flag, the next decision receives the constant
response.decision.write path and supported response.decision.input.write
location. Only this closed grammar metadata is carried through the unusable
decision error and model feedback; arbitrary key names, values and provider
messages remain withheld. Feedback does not execute the rejected call or
change its permission requirements.

Paid usage is independent of reply readability. A rejected schema reply keeps
its parsed numeric usage through the unusable-decision error, aggregate and
trace; an unreadable reply account remains a compatible fallback. An explicit
partial account can retain known cost without inventing token counts. The
active creation purse already settles these calls before schema refusal; this
reporting path neither charges them again nor changes the spend ceiling.

## Verification Accounting At Settlement

The bounded runtime result check retains each actual completed intervention
before starting confirmation. A private collector closes when the outer check
settles; timeout, abort or error fallback keeps genuine completed paid usage,
and late responses cannot append to the saved terminal record.

An unfinished verification has unknown request accounting. It cannot publish a
synthetic zero ledger or qualify a deterministic replay. The existing public
zero-provider helper now requires affirmative completed verification as its
third argument; omitted proof returns unknown. Ordinary completed no-model
checks remain explicit zero when no prior/current gate or intervention exists.
This narrows old two-argument absence inference. It adds no provider wrapper,
request counter, pending-call cost estimate or verification-local total claimed
as whole-run usage. Existing request admission, retries, policies and provider
identity remain unchanged.

Independently observed mocked-transport regressions cover pending first check,
paid first check followed by pending confirmation, unsent input refusal,
completed no-provider checks and prevention of late writes. Actual public
FluxIQ disabled construction also executed a saved native Flow, preserving a
nonempty fixture key/session and publishing explicit zero with fresh network
and key-release observers. Live browser saved reuse remains separate.
