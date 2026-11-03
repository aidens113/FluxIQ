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
