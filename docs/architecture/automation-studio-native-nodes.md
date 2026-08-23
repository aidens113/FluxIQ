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
`metadata.elementTargetMinConfidence`.

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
available rather than persisting only a selector or XPath.

Recording proposal review surfaces this identity as a compact element target
summary. The summary favors visible text, accessible name, label, ID/test ID,
role, and confidence, with selectors shown as supporting detail evidence.

## Recording-derived nodes

Recording mapper implementations use the same explicitly bound package and
version boundary. Their typed results are persisted as
`RecordingFlowProposalArtifact` documents, not executable nodes. Review records
the decision, reviewer/notes when supplied, and an explicit Flow or node
destination.

Approved recording-derived definitions retain a fixed registered output ID and
are materialized to the built-in policy action at execution. Private definitions
remain in their project; public definitions are visible to projects in the same
global/domain scope. Any active mapper/output/source-input/confirmation-input contract mismatch
invalidates the proposal before palette listing or execution.
