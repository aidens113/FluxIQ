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
| `same_fix` | An edit that brings the draft back to a Flow it already stood at, an identical edit that changed nothing, or a submission a trial or the check has already refused |
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
counts in the same run of refusals. A cycle's refusal falls on its acts: a look in it costs nothing and may be what the page needs after a reload, and a look that came to nothing starts again from nothing once an act has landed. Change approach, then ask the person: both are
a typed signal to a caller that gave `loopSignal` (`AutomationStudioLlmLoopSignal`),
raised after three refusals or further findings with no progress, or when refusals
in a row would stall the round. Progress ends the incident at any step, but for a
lasting act, whose refusal stands until a new row or an undo.

**What it never does.** It adds refusals and notes and removes none. It lifts
nothing the guard refuses, and what the guard has lifted (a handle since shown, a
precondition since met) starts again from nothing here. It gives nothing leave to
run, so a call it lets through goes on to every permission gate, and a lasting act
that was refused stays refused. A node's own retries happen inside one call, and
a validated temporary failure, a trial whose gate bounds its own re-tests, a rerun
(measured as its amendment), a check, a written step and a member of a prior-node
batch are never counted as repeats, though what they bring still counts as progress.

**With no `loopSignal`** a loop keeps steer and refuse, and no signal is raised. It
ends only the ways it always could: a ladder refusal counts in the existing run of
refused repeats, which stalls as it always has at three in a row. No lane adds a new
way for a task to end in failure.

**The attempt's record** (`attempt-record.ts`, `attemptRecord` on the loop). The
caller owns one record per attempt and hands it to each loop and stage. It holds
digests, Core's tool ids, closed outcomes and an edit's step numbers and change
kinds, never a value or a word the model wrote, and `data()` is plain JSON for the
attempt row and for `seed` on the next attempt. It is how the same fix is known
after a fresh context, and how many fresh approaches have been tried: past two,
the signal is `ask_person`.

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
