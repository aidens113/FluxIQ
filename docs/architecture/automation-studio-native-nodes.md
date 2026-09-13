# Automation Studio Native and Code Nodes

Native and Code Nodes provide an opaque custom-logic boundary without turning
the Flow editor into a generic code graph. Each remains one typed node with
declared ports, parameters, source identity, permissions, timeout,
cancellation, logs, errors, and editor metadata.

## Trust model

The initial implementation is **trusted-local Node.js**. It is explicitly not
a sandbox. FluxIQ never imports implementation code based on a palette manifest
or scans arbitrary node directories. A host constructs an
`AutomationStudioNativeNodeRuntime` and explicitly registers a manifest plus a
matching implementation bundle.

Package ID and semantic version must match exactly. Unsupported SDK versions,
duplicate packages, invalid extension identities/versions, undeclared
implementations, and missing node, mapper, resolver, or comparator
implementations are rejected before activation. Node instances retain an exact
definition-version pin; execution fails visibly when the bound package does not
provide it. Updating an active package requires a new host runtime so an
in-flight run cannot silently change implementation.

Permission and capability grants provide least-privilege authorization and
traceable denials. They do not contain hostile code; trusted modules could
still directly use Node.js globals or captured host objects. Untrusted and
marketplace code remains disabled until real process or VM isolation exists.

## Runtime boundary

Implementations receive only declared input ports, immutable parameters, a
cooperative `AbortSignal`, a read-only grant summary, the common element
matcher, registered target resolver access through `resolveTarget`, and a
logger. Runtime checks permissions, runtime capabilities, network
destinations, secret handles, filesystem roots, process access, and
child-process access first.

The default timeout is 30 seconds and a node may declare `metadata.timeoutMs`.
Timeout and cancellation abort the cooperative signal and return a traceable
failure. They cannot forcibly terminate trusted-local code that ignores the
signal. Outputs outside declared ports fail validation. Logs are capped and
redact credential-like keys before entering execution traces.

## Importer SDK

`AutomationStudioImporterSdkManifest` declares package/domain identity, native
and Code Nodes, recording mappers, target resolvers, comparators, custom
schemas, and editor metadata. `AutomationStudioImporterImplementationBundle`
binds implementation functions separately. Manifests are safe for compiler and
editor surfaces; implementation functions remain host-only.

Definitions are filtered to the active project scope before reaching the node
palette. Domain nodes cannot appear globally or in another domain. Code-owned
Flow compilation uses the same bound registry, making missing or out-of-scope
definitions compile errors.

## Inspector parameters and state binding

Importer and custom output-node definitions declare Inspector fields through
their `parameters` array. The Flow editor carries each definition's parameter
schema into the global Inspector and persists the edited values in the node's
`parameterValues`; these values are part of the Flow document and are saved
with the project rather than by an Inspector-local save operation.

A declared parameter exposes one value-source selector by default: `Manual
value` or `State value`. An importer may set `allowStateBinding: false` for a
strictly literal-only field. Both sources feed the same parameter ID and
implementations continue to read the final value from their normal
`parameters` object. State mode stores a `$state` binding containing the
registered signal path and the last manual value as a fallback. At execution,
FluxIQ resolves that path from run inputs, variables, prior graph outputs, or a
`StateSnapshot` supplied under `inputs.state`, before calling built-in, native,
or composite implementations. A missing path uses the retained manual fallback;
without a fallback the node fails with the unresolved path in its trace.

For example, an importing repository can declare:

```ts
{
  id: "message",
  label: "Message",
  valueType: "string",
  required: true
}
```

The saved node value remains a literal such as `"hello"` in Manual mode. In
State mode the same field is represented as
`{ $state: { path: "app.currentMessage", fallback: "hello" } }`; the custom
implementation still receives only the resolved string at
`context.parameters.message`.

### Bindings below the top level

A binding is resolved wherever it sits in a parameter value, not only at the
top of `parameterValues`. A node that carries a payload puts every one of its
real values one level down — `builtin.policy.action` holds the selected
output's arguments in its `parameters` object, and a recording-derived node is
materialized that way — so a binding at `parameters.text` is resolved exactly
as one at `text` is. The rules that make this safe:

- **The fail-closed rule holds at depth.** An unresolved path with no fallback
  is reported in `missingPaths` and the key is left out of the object that
  held it, so the node fails naming the path instead of dispatching with a
  value it never obtained. Every unresolved binding is reported, so a path
  bound twice appears twice.
- **Positions in an array are preserved.** Bindings inside array elements are
  resolved, but an unresolved element keeps its place rather than renumbering
  the elements after it; the node fails on the reported path regardless.
- **A resolved value is never walked again.** What state supplies is a value,
  so data that happens to be binding-shaped cannot name a further path to
  read.
- **A subtree that resolved nothing is handed back unchanged**, by identity,
  so resolution never rewrites a payload it did not change.
- **Descent is bounded** at 16 levels, with a cycle guard, so a pathological
  or self-referential value costs bounded time. A binding deeper than the
  bound is left as it is rather than resolved.

`allowStateBinding: false` is enforced at every depth, not only where the
parameter value *is* a binding: Flow bootstrap validation walks a literal-only
parameter's value and raises `bootstrap.invalid_state_binding` at the path of
the first binding it finds inside it. A binding that names nothing is rejected
the same way wherever it sits. The walk reaches deeper than resolution does, so
validation never stops short of what execution will honour, and it uses the
resolver's own predicate — a value carrying `$state` alongside other keys is a
binding to both, because it is one to the resolver.

### A resolved value never reaches the persisted trace

A binding is a request for a value the Flow document deliberately does not
carry, so the resolved value belongs in the executor's memory and on the
dispatch path, and nowhere else. Resolving below the top level is what made
that a real risk: `builtin.policy.action` copies its whole payload into a
`policy.output.dispatch` effect, an attempt copies a result's effects verbatim,
and the run's trace is persisted whole.

`runAutomationStudioGraph` therefore withholds, from the trace it returns,
every value the run resolved out of state and every input the run was given. It
is the one place a run trace is produced, and what it returns is what the
runtime service persists.

- **Safety is proved, not declared.** A value is treated as authored — and so
  safe to persist, because the document already holds it — only when it is
  identical to the value the document carries at the same position. Everything
  else is withheld: a changed value, a key the document does not have, a
  subtree that cannot be lined up against the document. Nothing marks a value
  as sensitive, so nothing can forget to.
- **Every resolved value, not the ones Core guesses are secret.** Core cannot
  tell a credential from a cart count, and the namespace that means "secret" is
  a domain's convention, so a value a binding supplied is withheld whatever it
  holds.
- **The run's own inputs are covered before the first node runs.** The
  withholding is seeded by resolving each node's declared bindings against the
  run's inputs and variables, so a supplied value is withheld from the trace's
  `values` and from every attempt's `inputs` even when the run fails before the
  bound node executes.
- **Every run input is withheld where the trace saves it, read or not.** The
  trace's `values` and each attempt's `inputs` are seeded from the run's inputs,
  so an entry that still holds the value the caller supplied reads `[withheld]`
  under its key; strings and numbers become the marker, and booleans and null
  stay. This is by position, not by value: a value the run computed that equals
  an input, such as `5 + 0`, is kept. The cost is a known gap: an input no
  binding reads, copied by a node into an output under another key, is not
  withheld at that copy.
- **The trace keeps its shape.** A withheld value is replaced in place by the
  `AUTOMATION_STUDIO_WITHHELD_VALUE` constant — `[withheld]` — rather than
  removed, and inside prose it is replaced where it sits, so
  `Could not type [withheld] into #password.` still says what failed. Ids,
  statuses, routes, and timestamps are never rewritten: replacing a `status`
  that happened to equal a resolved value would corrupt the artifact for every
  reader while protecting nothing.
- **One text rule.** Inside prose, the framework runtime's
  `fluxiqRuntimeTextWithholding` does the replacing, as it does for the command
  attempt saved for the same dispatch. Every stretch a withheld text covers
  becomes one marker, so a value that contains or overlaps another is replaced
  whole and leaves no fragment, and a marker already written is never rewritten.
- **A Call Flow child's withheld values stay withheld in its parent.** The Call
  Flow attempt keeps the child's saved trace. The parent executes with the
  child's real outputs, so the parent's saved trace also withholds every value
  the child withheld by value, wherever one reaches it: an output, or a bound
  failure message.
- **Execution is untouched.** The dispatched effect, the live `values` map, and
  the inputs handed to the host for its state snapshots all carry the real
  value; a run that resolved nothing and was given no inputs gets its own trace
  back by identity. Execution that goes on from a finished run reads real values
  too: a Call Flow parent builds its outputs from the trace its child executed,
  and a live-patch rerun is seeded from the failed attempt as the run executed
  it. `runAutomationStudioGraph`'s optional `onExecutedTrace` hands such a caller
  that trace beside the saved one, for executing with only.

## Output safety

Importer action nodes must declare a fixed or enumerated `outputAction`
contract. Their `policy.output.dispatch` effects are validated and then passed
to the existing IO dispatcher, including registered-output verification and
optional confirmation inputs.

When an output payload contains a canonical element target, the IO dispatcher
normalizes it and runs the shared matcher before dispatching. Outputs may
declare `metadata.elementTarget: true` or `metadata.targetKind: "element"` to
require an element fingerprint; dispatch fails visibly when such an output is
called without one. If runtime candidates are supplied, the best candidate and
match diagnostics are written to dispatch metadata and node outputs. Match
confidence thresholds default from output safety level and may be overridden by
`metadata.elementTargetMinConfidence`. Without candidates Core resolves nothing:
it dispatches the fingerprint unscored, applies no threshold, and records
`unresolved_no_candidates` with no `minimumConfidence`, leaving the element to
the output's adapter.

Trusted Code Nodes cannot emit importer output actions. Action-bound input
events remain confirmation observations and never become policy state through
this runtime.

## Element Matching

Recording mappers and native importer implementations share the same
`elementMatcher` context object. The matcher scores an intended element
fingerprint against runtime candidates using weighted signals. Stable and
human-readable signals such as visible text, accessible name, labels, IDs,
test IDs, automation IDs, entity IDs, and state paths carry the most weight.
Structural paths such as selectors, query paths, and XPath still contribute,
but they are not allowed to dominate stronger semantic identity.

The matcher can score explicit candidates supplied by an extension, or derive
candidates from a `StateSnapshot` presentation/state surface. Scores retain
positive and negative contributions so a failed click or generated proposal can
explain which signals matched and which ones drifted. Custom output nodes
should use this matcher before dispatching extension actions that target
elements, and recording mappers should store the strongest fingerprint
available rather than persisting only a selector or XPath. When a recorded
action's parameters name its element in `element`, Core builds the mapped node's
target fingerprint from that element's identity and keeps the parameters' own
locator signals, such as `selector` and `statePath`, where both name one. An
element's `implicitRole` counts as its `role`, and the parameters' own `text` —
the action's argument, typed text for instance — never becomes the target's
`visibleText`.

Recording proposal review surfaces this identity as a compact element target
summary. The summary favors visible text, accessible name, label, ID/test ID,
role, and confidence, with selectors shown as supporting detail evidence.

## Recording-derived nodes

Recording mapper implementations use the same explicitly bound package and
version boundary. Their typed results are persisted as
`RecordingFlowProposalArtifact` documents, not executable nodes. Review records
the decision, reviewer/notes when supplied, and an explicit Flow or node
destination.

A mapper is called once for each mapper-visible timeline entry: the recorded
timeline without state checkpoints or client state snapshots and updates. Its
`AutomationStudioRecordingMapperContext` carries `signal`, `elementMatcher`, and
`following`: the mapper-visible entries after this one, in timeline order and at
most 32, in the same observation shape. `following` is where a mapper reads what
an action led to, such as the navigation a click caused, without Core knowing
what either is. Core builds the observations once for each mapper, so one
mapper's changes to what it was handed never reach another; within one mapper's
calls, an observation in `following` is the object that mapper is later handed
for that entry.

A candidate may carry `expectedState`: what should hold after the action, in
whatever condition shape the host's `expectationEvaluator` reads. Core keeps it
only when it is a plain object with at least one key, stores a clone on the
proposal's `RecordingFlowActionCandidate`, and drops anything else (an array, a
primitive, a class instance, an empty object, or a value that cannot be cloned)
while still proposing the action. Approving the proposal into a Flow writes it into the recorded action
node's `parameterValues.expectedState`, where the
[transition comparison](automation-studio.md#llm-assisted-deterministic-automation)
reads it: once the action succeeds, the host is asked whether the state holds,
and a rejection fails the attempt. Approving the proposal into a node definition
does not carry it.

Both fields are additive. A mapper that ignores `following` and proposes no
`expectedState` gets the proposal it got before, and a candidate without
`expectedState` becomes the same node as before. A host whose mapper proposes
`expectedState` and that binds an expectation evaluator should expect those
recorded actions to fail wherever the evaluator rejects the state.

Approved recording-derived definitions retain a fixed registered output ID and
are materialized to the built-in policy action at execution. Private definitions
remain in their project; public definitions are visible to projects in the same
global/domain scope. Any active mapper/output/source-input/confirmation-input contract mismatch
invalidates the proposal before palette listing or execution.
