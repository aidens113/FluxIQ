# Failure facts for authoring control

`AutomationStudioFailureRecord` is the domain-neutral failure contract. The
producer owns its code and reports category, retryability, stage and effect.
Its optional `transient: true` says the cause is temporary. It does not prove
that an action was unacted, permit a retry, or override an authority refusal.
The strict reader rejects false/null transient claims and transient records
in the policy, authentication, person-needed and invalid-graph categories that
are never retryable. A temporary cause may itself be nonretryable.

An evidence tool result may attach `failure` beside its opaque evidence and
actual `effectApplied` flag. Missing or malformed optional failure metadata
does not invalidate the executed call, erase its evidence, or change its effect.
Old results without this field remain valid and carry no temporary claim.

`projectAutomationStudioFailureControlRecord`, exported by
`@fluxiq/contracts/automation` and `fluxiq/automation`, validates
the complete input before returning a fresh control-only record. It keeps
category, code, retryable and any present stage, effect, retryAfterMs,
certainNoEffect and transient. Expected/actual comparison text and the evidence
digest are excluded. The ordinary failure reader retains those diagnostic
fields where they already belong. Producers project before returning or
serializing the optional tool field; Core also projects at its reader and raw
tool-dump boundaries. Original objects and opaque evidence are not rewritten.

The authoring repeat guards admit a temporary-failure exception only for a
strict transient, retryable, explicitly unacted failure with actual
`effectApplied: false` and no person-needed signal. Both identical-call memory
and consecutive-refusal counting use that gate; amendment reruns retain their
actual execution facts. Code words such as retry, busy, disabled or timeout do
not supply a temporary fact. `certainNoEffect` alone does not grant an
unbounded exemption. This gate changes authoring bookkeeping, not the node
executor's retry or permission policy.

A client reporting one result for several dispatch attempts must retain earlier
ambiguity or authority. A final unacted refusal cannot certify an earlier
attempt whose effect was unknown. Success must not carry a stale failure.
Browser-specific classification and annotation remain downstream; Core does
not read page words or understand a web domain's failure codes.

This additive interface ships as contracts0.4.0 and Core0.18.0. Readers must
ship before producers: older strict failure readers reject a record containing
an unknown transient field. The paired web host imports the new public helper
and requires the rebuilt Core SDK. Its first producer annotates only after
reading the existing browser wire, so an existing browser remains compatible.
Clients that omit the field retain the conservative behavior above.

A trial gate bounds its own re-tests. A trial answer that ran, and has a re-test
left, says so with a typed field, `ownRetestBound: true`; the repeat guard
records no failure for that call, and only when `effectApplied` is true. Past
the gate's limit the field is absent, and a call that did nothing is never
exempt whatever it claims. The field is not in the evidence the model reads, and
the answer's `retry_allowed` reason stays diagnostic: words still grant
nothing. A `not_judged` or an unprepared entry no longer says to test again once
no re-test is left.

A refusal that tells the model to do something first is lifted by a fact too,
never by its `retry_allowed`. A named precondition (`PRECONDITIONS` in
`runtime/llm/repeat-guard/outcomes.ts`) is lifted by the call that meets it. A
project supervisor's `project.dispatch` is keyed on what its refusals read
(`runtime/project-agents/supervisor/request-keys/`, given to the loop as its
`requestContextKey`): once the plan, the returns, what stands or what is left on
the target changes it is a new call, and until then it is refused unrun like any
repeat. `project.assemble` is keyed on the plan and the returns the same way.
`project.dispatch_failed` has no such fact, so it no longer carries
`retry_allowed` and says to end honestly rather than to try again. It also says
what is known of the target. With no builder started, read from the build record,
it answers `effectApplied: false` and `targetsUnchanged: true`. With any started
it claims neither: `effectApplied: true`, `targetsUnchanged: false` and a failure
of effect `ambiguous` that is not retryable, since a lasting act may have landed.
That is no temporary failure to the guard, and Core keeps a blocked return for
each such brief, so it is not sent again while nothing it starts from has changed.

## Loops: when calls that each ran get nowhere

`runtime/llm/repeat-guard/loop-detection/` watches every call of every role that
runs the evidence loop, with no model call. The exact-repeat guard above stays the
first case. The detector reads typed facts only, and no word a model wrote counts
for or against anything.

**Progress.** A call made progress when it brought a page state this loop has not
seen, a row whose digest it has not seen (`readRows.rows`, or the domain's
`readRowsKey`), an act that landed and moved the page for the first time from this
page, a plan or revision accepted for the first time, or a draft or build key it
has not stood at. So working through rows or pages never reaches the patterns,
however many calls it takes. A call whose effect landed where no page is reported
counts as progress, and a call on a page the loop cannot name, keyed on nothing
else, is not judged, as with the guard: the doubt falls on not firing.

| Pattern | What it is |
| --- | --- |
| `exact_repeat` | The guard's refusal: the same whole input on the same page |
| `near_repeat` | One call, with its free text taken out (`reason`, `summary`, a plan's `purpose` and `notAsked`, never anything under `parameters`), that came to nothing twice on one page |
| `cycle` | The last block of up to four calls equal to the block before it, across pages too, with nothing new in its last pass |
| `no_progress` | Twelve calls in a row with no progress, whatever they were |
| `same_fix` | An edit that brings the draft back, the second time in a row, to a Flow an edit already led to (dropping steps back through drafts only their calls built is not a fix coming back), an identical edit that changed nothing, or a submission a trial or the check has already refused |
| `same_act` | One stated-lasting act on one target landing again with no new row identity read since, however much the page changed |

**A lasting act is not progress for moving the page.** Adding one more to a cart
changes the page each time, so every other fact reads it as work. A call states it
is lasting by declaring a consequence or by naming an act of the instruction. A new
row read since, the task's own row binding (`$row`, `$step`, a repeat pass's
`item`) or a landed undo (`undoes`) starts it again.

How far it goes depends on the caller. With no `loopSignal` (the old modes) every
repeat is told and none is refused. With a `loopSignal` (the new path) the first
repeat is told and every one after is refused, whatever else has moved, unless the
loop's `askedRepeats(act)` says the task asks for more. The caller fills that from
the attempt's act record: up to that count the landings are work and nothing is
said, and the next is refused before it runs. It is read once, at the target's first
landing, and nothing the model replies can lift it.

**A target is its fingerprint at a place.** A handle names a control only while its
page stands, so a call that says what it ran with (`draft.ranWith`) is keyed on that,
with its handles left out. A fingerprint alone is not enough: "Add to cart" on another
product's page has the same one, so a lasting act's target also holds the place the
domain's route state last named (`routeState.page.location`). Before a call runs only
its handle is known, so what a handle ran as is remembered; a handle not seen yet
runs once, and is caught as soon as it has.

**The ladder, each step only if the last did not work** (`watch.ts`). Steer: a
`core.loop_check` note says what repeated, how many times and what did not change,
and the person sees a step (`llm_evidence_loop.loop_steered`). Refuse: the next call
that continues it is refused before it runs, through the guard's own path, so it
is recorded `llm_evidence_loop.repeat_refused` with the pattern as its reason and
counts in the same run of refusals. A cycle's refusal falls on its acts: a look in it costs nothing and may be what the page needs after a reload, and a look that came to nothing starts again from nothing once an act has landed. Change approach is
a typed signal to a caller that gave `loopSignal` (`AutomationStudioLlmLoopSignal`),
raised after three refusals or further findings with no progress, or when refusals
in a row would stall the round; it is the last rung however often it comes, and the
watch never asks the person by itself (t962, run-mwo3dp11-a47a032d, where an "ask the
person" rung was raised nine times while the attempt looped on one model for 34
minutes).

**The model decides how to go on** (user, 2026-11-19). A loop whose caller gave
`loopSignal` is offered `core.loop_decision` (`runtime/llm/loop-decision/`) from its
first decision. A steer then names the repeat, how many times, and what each repeat
came back with (`decide.cameBack`, the calls' result codes), and asks for one decision:
`continue` (with `why`) ends the incident, so the repeat may run and a further catch
asks again with the count; `change_approach` (with `approach`) keeps the repeat
refused; `ask_person` (with one plain `question` and `why` explaining genuine
impossibility) raises the `ask_person` signal with the model's question, which the
attempt posts and does not wait for; `finish_with_best` (with `result`) goes to the completion
check as any completion does: accepted, it is the attempt's result; refused, the repeat stays
refused as after `change_approach`, the decision's answer says it was not accepted, and the no's
defects and Core's check of their rows reach the model beside its words (t1011). Asking the person is the last resort (user, 2026-11-19:
"ONLY stop and ask user for feedback if its legit impossible"): the first catches offer
`continue`, `change_approach` and `finish_with_best`, and `ask_person` joins only once
the model has changed approach and the repeat is caught again; an earlier or reasonless
`ask_person` is refused (`core.loop_decision.ask_person_not_offered`, t1000; t983 had
dropped this gate with the ladder). A judge whose unreadable replies fail the same way
twice in a row is caught as a loop too: each re-ask names the schema part that was
missing, and the steer may choose `change_approach` or `finish_with_best`, never
`continue` or `ask_person` (`runtime/result-verification/unreadable-asks/`). The loop carries it out
(`decision-handlers/model-decision.ts`); each goes on the attempt's record
(`decisions`), into a `NNNN-loop_decision` step folder and into the chat. Detection
alone never stops anything; the purse still ends the task.

**One starting model** (`runtime/llm/role-routing/`). Automation defaults to Haiku
unless a model or compatible provider was explicitly selected. Every role, repair,
judge and same-task later attempt keeps that choice. No detector signal, failed
repair or loop decision selects a stronger model; obsolete `escalate_model` calls
receive feedback to choose a supported decision. Asking the person does not require
a prior approach count or model change, but still requires a genuinely impossible
instruction rather than difficulty or repetition.

Answer First stores the public `startingModel` id in its existing version-1 task
memory. The same task identity retains it across restart and Run again; a distinct
task identity may choose differently. Historical ladder records/exports remain
readable but inert, and the attempt frame still provides cached-continuation
identity. See [the task model contract](./llm-flow-bootstrap.md#one-starting-model-per-automation-task)
for default, concurrency and legacy-record rules. Progress ends the repeat incident
at any step, except a lasting-act refusal which stands until a new row or an undo.

**What it never does.** It adds refusals and notes and removes none. It lifts
nothing the guard refuses, and what the guard has lifted (a handle since shown, a
precondition since met) starts again from nothing here. It gives nothing leave to
run, so a call it lets through goes on to every permission gate, and a lasting act
that was refused stays refused. A node's own retries happen inside one call, and
a validated temporary failure, a trial whose gate bounds its own re-tests, a rerun
(measured as its amendment), a check, a written step and a member of a prior-node
batch are never counted as repeats, though what they bring still counts as progress.

**No count ends a loop with a `loopSignal`** (user, 2026-11-24: "THERE SHOULDNT BE ANY
ARBITRARY FUCKING CALL LIMIT THAT RANDOMLY JUST RESETS EVERYTHING"; t1008). The answer-first
rounds are such loops, and a round that ended on a count started the next with an empty
evidence window: run-mwufisf0-5535f5f5 ended four rounds in a row on its eighth look, and each
fresh round looked at the same things again. So `resolveLimits` (`../../../packages/fluxiq/src/runtime/llm/loop-configuration.ts`,
`uncounted`) lifts the turns, calls, edits, steps without progress and unusable replies in a
row for such a loop, after checking them as given, and the no-progress redirect stops counting
down. Eight looks in a row are no stall there: the run of looks is caught as a `no_progress`
finding (`decision-handlers/searching.ts`), steered with the model's loop decision, and each
further look that brings nothing climbs the ladder. Where the model chose `change_approach` on
a stretch of looks alone, each further look that brings nothing, run or answered from memory,
counts as a refusal does (`watch.ts`); an act or an edit is the different kind of step and ends
that. Only the result, the purse, a person's Stop and loop detection's own last rung end a round.

**With no `loopSignal`** a loop keeps steer and refuse, and no signal is raised. It
ends only the ways it always could: a ladder refusal counts in the existing run of
refused repeats, which stalls as it always has at three in a row. No lane adds a new
way for a task to end in failure.

**The attempt's record** (`attempt-record.ts`, `attemptRecord` on the loop). The
caller owns one record per attempt and hands it to each loop and stage. It holds
digests, Core's tool ids, closed outcomes and an edit's step numbers and change
kinds, never a value or a word the model wrote, and `data()` is plain JSON for the
attempt row and for `seed` on the next attempt. It is how the same fix is known
after a fresh context, how many fresh approaches have been tried, what the last stopped
loop repeated (`stoppedOn`, which the next round is told with the words to take a
different approach), historical model-ladder metadata, and the model's loop decisions.

**What a run reports.** Rows in the trace (`automationStudioLlmLoopsCaught`, by
pattern, with no new row member, so every rebuilder already carries them), and in
the step log a `NNNN-loop` folder for each steer and signal beside the answer folder
of each refusal, which the Lab reads with `loopsCaughtInSteps`
(`packages/test-runner/src/loop-replay/`, in the web extension repository). The same
tool replays the detector over saved step logs.

**Not caught.** An act that states nothing lasting (`consequences: []`) and lands on
a new page each time is real work to these facts. A renumbered handle runs once before it is known. The same gate refusing
fresh builders in turn is not one loop's pattern. A loop in calls that report no
state is watched only for the same fix and the same act.
