# Recovering a target without a source step

Core 0.20 adds an optional `reacquireUnboundTarget` host method for a target
that has no row/output source-node lineage. Existing `reacquireTarget` and
read-only source reruns retain precedence. A failed source rerun never falls
through to an unrelated search of the current environment.

The existing retry predicate remains authoritative: the last failure must
have lost its target without acting, and no uncertain, landed or completed
act may be repeated. Recovery runs once before attempt four, or the last
attempt when a caller's policy allows only two or three. It spends no attempt.

## Who may change a target

Canonical registered parameter descriptors opt in with `targetRefresh:true`.
The native SDK resolves the exact definition and version, including the
registered output behind a `builtin.policy.action` wrapper. It exposes only
the opted-in flat parameter IDs and which optional fields may be removed.
Neither Flow metadata nor the matching host can expand this write-set.

The host receives isolated copies of the original node, actual resolved
parameters, declaration, previous failed attempt ID and before-action state
reference, and failure. Flow inputs, variables, fallbacks and wired values
resolve exactly as they do for normal execution. An unresolved binding cannot
be repaired into an executable action by a target patch.

A found answer contains atomic set/remove operations for the permitted
fields. Duplicate or undeclared IDs, required removals, invalid JSON and
unreadable data reject the entire patch. A policy wrapper permits changes
only inside its existing output parameters; output ID, approvals, consequence
declarations and other wrapper fields remain protected.

## Scope, lifetime and authority

The host must prove that its observation belongs to the previous attempt's
same resource, place and document. Missing or changed provenance is
`unavailable/place_unproved`. Address, position or an old handle alone cannot
identify the same item. Only positively complete scoped absence can return
`gone` with `coverage:"complete"`; partial observations cannot establish
uniqueness or absence.

Core installs accepted changes in a private per-arrival parameter overlay,
separate from the source path's run-value overlay. It does not modify the
Flow, variables, shared outputs, another node, a child run or a later loop
pass. Other parameters resolve afresh on each retry. A later deliberate target
change invalidates the old overlay rather than being overwritten by it.

Original and resolved action-effect floors remain pinned through preparation
and execution. A refresh cannot lower them or grant new authority; a stronger
effect or new permission consequence rejects the patch. Cancellation and the
completed-act ledger are checked after the asynchronous observation, using
the original admitted act identity. A resolver failure remains a real failure.

Identity recovery records use `kind:"identity"` and closed outcome/reason
fields. They contain no fabricated source ID, source-return flag, parameters,
patch values, fingerprints, page data or host error text. Older hosts that omit
the new method and declarations retain their prior execution path. No gateway
envelope, command receipt or new package subpath is required.
