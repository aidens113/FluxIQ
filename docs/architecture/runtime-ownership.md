# Runtime Ownership

Automation Studio is a UI panel controlling framework capabilities. Execution,
authoring, verification, persistence and orchestration belong to framework
packages. Studio retains panel-specific UI, view state and thin control adapters.
Backend authorities still under Studio, including temporary compatibility
composition and receipt helpers, remain required migration work; the table below
describes accepted framework owners and does not make those locations permanent.

| Owner | Responsibility |
| --- | --- |
| `flows/executable` | Rich graph, node/edge, interface, region, composite and execution DTOs without a project persistence envelope |
| `components/automation` | Neutral node definitions, registry, action effects and consequences, processing and parameter contracts |
| `engine/automation` | Graph/node execution, frames, lifecycle, state routing, retries, target reacquisition, trace privacy and resume |
| `runtime/automation-host` | Domain host ports, execution facts, resource/control contracts and opaque domain observations |
| `runtime/interaction`, `runtime/parking` | Questions, parked-run carry and settlement |
| `runtime/repeat`, `runtime/reference-time` | Repeat observations and a fixed execution reference time |
| `runtime/activity` | Structured runtime activity and scoped presentation ports |
| `runtime/target-matching` | Neutral matching contracts, aggregation and state identity; domain scoring supplied explicitly |
| `runtime/models` | Provider transports, model catalog/limits, usage/pricing, secret-resolution ports and retry/error mechanics |
| `runtime/agents` | Model-call budgets and settlement, scoped allowances, tool-call identity/usage, repeated-state tracking and bounded iteration |
| `components/automation/importer`, `runtime/native-execution`, `runtime/adapters` | Importer contracts and validation, trusted native binding and identity-preserving runtime adapters |
| `runtime/environment`, `runtime/run-control`, `runtime/host-resources` | Execution environments, cancellation/progress registries and resource leases |
| `runtime/output-dispatch`, `engine/automation/integration` | Registered-output dispatch and engine option composition; trusted target preparation cannot replace actions or authorization |
| `flows/executable/compiled-plan`, `flows/executable/composite` | Compiled plan contracts, exact snapshot digests, dependency pins and composition validation |
| `engine/automation/compiled-plan`, `engine/automation/composite` | Actual compiled and composite execution |
| `@fluxiq/contracts/state`, `@fluxiq/contracts/recording`, `runtime/state`, `runtime/recording` | Shared rich state/recording contracts, state store/diff, sessions, normalization and structural validation |
| `runtime/recording/indexing` | Recording indexes, timeline projection, nearest-state links and lookup; reference and observation policies are explicit |
| `runtime/recording/mapping`, `flows/executable/recording`, `components/automation/recording` | Mapper iteration, candidate/review validation, recorded-step recipes and definition materialization; Studio retains proposal identity and persistence |
| `engine/automation/router`, `flows/executable/routing` | Router compilation, conditions, ordered route selection and rich executable routing data |
| `runtime/action-permissions`, `flows/executable/permissions` | Declaration validation, effect floors, assessment, permission state and grounded instruction data; Studio supplies request presentation and actual instruction reads |
| `flows/executable/change` | Change vocabulary, exhaustive patch policy and bounded origin parsing |
| `runtime/flow-authoring/draft` | Drafts, amendments, bindings, replay eligibility, routing and carried/scheduled steps; presentation is supplied explicitly |
| `runtime/execution-admission` | Private execution-coverage handles, lifecycle and durable persistence ports; concrete storage and actual invocation adapters are separate |
| `runtime/execution-observation` | Original callback/receiver observation, actual backend retry-series identity and common callback-root lifecycle; unsupported completion earns no certificate |
| `flows/executable/dsl` | Declarative executable Flow source and compilation; Studio stamps its persistence envelope |
| `programs/automation-studio` | Project/editor APIs, persistence, publication and repository-backed resolution, authoring workflow composition, conversation and presentation adapters |

The existing simple `FlowDocument` engine remains compatible. The mature executable graph has a different contract; the ownership move does not convert stored documents or replace its execution behavior with the simpler engine.

A full Studio document is structurally assignable to the execution contract. The engine does not require editor timestamps, project storage ownership or publication history to execute a graph. Studio composes those concerns around framework execution.

Host contracts do not import the engine. The engine and framework-owned contracts do not import Studio, including erased type imports. The structure audit enforces these boundaries. Presentation is supplied per run or scoped context; pure execution can run without a panel.

## Public API migration

New consumers use:

- `fluxiq/components/automation` and `fluxiq/components/automation/action-effect`;
- `fluxiq/flows/executable`;
- `fluxiq/engine/automation`;
- `fluxiq/runtime/target-matching`;
- `fluxiq/runtime/automation-host` for the domain host boundary and execution DTOs;
- `@fluxiq/contracts/runtime` for failure/actionability contracts and strict parsers.
- `@fluxiq/contracts/records` and `@fluxiq/contracts/recording-capture` for data/capture contracts;
- `fluxiq/runtime/models` and `fluxiq/runtime/agents` for generic model-backed execution;
- `fluxiq/flows/executable/dsl` for declarative executable compilation;
- `fluxiq/runtime/action-permissions` and `fluxiq/flows/executable/permissions` for neutral permission execution/data;
- `fluxiq/runtime/action-permissions/client` for browser-safe permission display/request parsing, without instruction runtime or Node imports;
- `fluxiq/runtime/execution-admission` and `fluxiq/runtime/execution-observation` for configured execution coverage and original invocation observation;
- `fluxiq/runtime/recording/mapping`, `fluxiq/flows/executable/recording` and `fluxiq/components/automation/recording` for recording-to-executable projections.

Importer consumers use `fluxiq/components/automation/importer`; native binding and
runtime adapters use `fluxiq/runtime/native-execution` and `fluxiq/runtime/adapters`.
Execution environments, control and resource scheduling have focused public runtime
subpaths. State and recording mechanisms require explicit content-reference and
observation policies; Studio retains its storage scheme and compatibility classifier.
The shared model-context packer lives in `runtime/models/context`, while persistence
and retrieval of reusable context remain program responsibilities.

`fluxiq/runtime/flow-authoring` exposes draft mechanisms without a Studio store or
implicit browser wording. Typed presentation and schema-description factories
bind text independently of validation. Studio compatibility adapters preserve
their original rendered output and schema bytes. Recording indexing retains its
stored schema and ordinary JSON dictionaries; own-key access treats opaque IDs
such as `constructor` and `__proto__` as data.

`fluxiq/runtime/execution-admission` exposes the neutral coverage authority and
ports. Source and scope identities, one-use proofs and explicit source delegation
are private runtime capabilities. Informational records grant no execution rights.
Its durable SQL, gateway, producer and candidate wiring is still in progress;
the standalone authority does not enable a candidate retry exemption or certify
an unobserved callback.

Legacy `fluxiq/automation-studio` entry points retain their exported names and delegate toward framework owners. Existing Studio-prefixed symbols remain compatible during this ownership migration. Schema discriminators, graph fields and stored target payloads remain unchanged.

The rich executor preserves retry floors, lasting-act uncertainty protection, stale-source reacquisition, lifecycle handling, record withholding and partial-run behavior. Studio composition may bind its legacy presentation/classification adapter while domains provide their concrete host behavior.

`captureStateSnapshot` returns a captured reference or
`{ kind: "unavailable", reason: "unsupported_node" }` for a node the host does not observe.
Actual capture failures remain errors with sanitized diagnostics. Hosts that previously threw to
decline a node must return the explicit unsupported result. Execution preserves the original
host object and its method receivers; compatibility classification is a separate per-run option.

## Web boundary

Core owns matching interfaces and generic confidence policy. The web domain owns selector/XPath/tag/class/attribute comparisons, browser URL interpretation, DOM candidates and calibrated web weights. The extension executes browser actions and supplies live candidates; the domain provides web adapters and recording mappings. Core never imports downstream modules.

A registered domain matcher is used consistently for importer implementations, target resolvers and recording mappers. Output dispatch without a matcher preserves unresolved targeting for host resolution and reports `unresolved_no_matcher`; it does not select using partial neutral scores.

The legacy fingerprint factory is retained as a neutral matcher compatibility API. Callers needing historical web scoring register the web domain's matcher; the downstream extension already uses that implementation. Legacy serialized browser fields remain opaque compatibility data in Core.

Recording parameter interpretation is supplied by the trusted implementation bundle's
`recordingCandidateParameterNormalizer`. It is bound by the actual registered domain,
never by manifest metadata or target-shaped fields. The binder preserves the original
function and original bundle receiver and rejects a conflicting function before partial
registration. A missing normalizer preserves parameters with the existing shallow copy;
canonical mapping has no implicit browser fallback. Invalid non-plain results are refused
before candidate identity allocation. The web domain's adapter owns element/target
precedence, aliases, field bounds and sensitive target-metadata withholding.
Remaining legacy active target-normalizer callers in Studio are tracked migration work;
the new canonical mapper does not call them.

## Execution coverage composition

One complete source cohort is configured before the first reservation. Later candidate
ports bind privately to that same persisted flow series. Original private handles and
observer state stay out of model and implementation payloads. A retry series follows an
actual logical invocation across its scheduled attempts; a new authored invocation or
successful self-loop receives a fresh private identity.

Execution options carry private observation and retry companions outside their
enumerable fields. Copy them with `copyAutomationExecutionOptions`; a plain
object spread or JSON round trip does not carry those companions. Copying a
public or serialized object through the helper creates no observation authority.
Existing explicit parent-binding operations remain responsible for entering the
actual child; a copied options object alone proves no completed execution.

The original gateway journal, required observer and post-handling consumption remain
the command authorities. SQL coverage links to their real claim transaction. An original
child completion read is informational; it cannot mint a grant or replace persisted
owner/fence/frontier checks. Lost acknowledgement or uncertain lasting work stays pending
across revisions, ports and reopened owners. Unsupported first returns remain unverified.
Pinned noncommitting diagnosis may inspect retained evidence, but cannot start/reset a
Flow, clear coverage, promote a pending result or fall back to live execution.

Hosts may provide a trusted `executionScopeAttestor` at service construction.
It authenticates an original resource-owner proof against the actual persisted
Flow anchor; project, owner, continuation and coverage epoch stay fixed. The
owner must retain the resource throughout the continuation. Default or absent
attestation remains unverified, and a new attestation cannot erase existing
unverified history, resource changes or pending/lost-acknowledgement commands.
Page state, reset replies and model request fields do not supply that proof.

Trusted callback completion configurations snapshot original functions,
receivers and readers before source setup through a declaration-only registrar.
The service constructor accepts general declarations; `bindHostRuntime` may
accept host declarations, and `bindNativeNodeRuntime` retains its existing
identity argument followed by optional native declarations. These declarations
do not assert a baseline or travel in model/native/host argument fields.
Managed asynchronous writers can authenticate their original returned promise
with a private producer receipt after actual commit; public return values and
fulfilled promises alone certify nothing. Effectful synchronous callbacks are
not silently treated as completed asynchronous work.

Root preparation may await an original owner using the actual entered callback
context and original reserved root before implementation invocation. Preparation
failure interrupts/releases through the same lifecycle without executing the
implementation. Tool request forwarding and admitted-child routing remain
private, preserving one logical retry series and avoiding an independent root
inside an already admitted call.

## Distribution

`fluxiq/runtime/result-verification` owns bounded verification waiting and the
asks-per-check limit. Studio forwards its existing names to the same values and
functions. Deadline calculation keeps the 120-second minimum and allows all bounded
asks plus 30 seconds around them. A deadline returns an unverified wait outcome;
it does not certify that the original operation stopped or authorize another act.
First-ask confirmation, model verdict-word reading and verification-status selection
also have one neutral owner; Studio keeps exact aliases to the same functions.
The larger verdict, evidence and repair extraction remains in progress.

The same runtime owns completed-check collection, generic over each client's
original full receipt. It retains original receipt identity and completion order,
closes against late answers, and returns a fresh array without creating another
receipt schema or history store. Studio specializes this collector with its
existing intervention receipt.

`fluxiq/flows/executable/verification` owns the exact rich result, diagnosis,
read-account, record, repair and historical trial packet contracts. Studio retains
its old names as aliases. Historical not-run reading keeps its existing accepted
forms; a stored proof or verdict is data and grants no execution authority.

The executable validation area exposes graph/handler/reachability validation over
the actual graph. Its caller supplies the enclosing required output IDs explicitly;
full Flow validation derives them from its actual interface and delegates to the
same algorithms. The existing repair-overlay composition still needs migration to
this seam with its original enclosing contract.

Its accounting projection reads the original canonical ledger through a narrow
read-only source. It preserves historical paid calls, omitted-call counts and
recovery metadata, and cannot open a purse or reserve budget. Missing historical
accounting remains unknown instead of becoming a zero-spend receipt.

This additive public API and ownership migration sets the next package versions to `fluxiq@0.27.0` and `@fluxiq/contracts@0.7.0`. Publication is separate from this refactor. Downstream consumers must rebuild against the matching Core version before compiling against canonical subpaths.

The ownership audit remains active. Recording gateway capture and partial-trial composition,
remaining change/recovery mechanisms, further authoring/verification and browser interpretation have further
required extraction phases tracked in the paired working documents. After both
repositories complete that audit/refactor, a separate reusable Core chat-stream UI
package will provide the standardized widget for the extension and other clients.
