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
`@fluxiq/contracts/automation-studio` and `fluxiq/automation-studio`, validates
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
