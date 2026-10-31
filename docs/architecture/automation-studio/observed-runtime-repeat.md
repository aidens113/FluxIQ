# Observed unchanged runtime execution

The optional `AutomationStudioHostRuntimeBoundary.observeRuntimeRepeat` port
lets an executor stop a repeated unchanged action before dispatching it again.
It is independent of the existing Repeat no-progress check, state-routing
return limits and whole-run maxSteps ceiling.

A first successful logical visit establishes one unchanged observation. A
second identical successful visit is allowed and must also finish unchanged.
The prospective third identical visit is refused **before dispatch**: two real
executions, followed by an unacted terminal attempt. Its fixed failure code is
`executor.runtime.unchanged_repeat`. The graph recognizes the private execution
sample that produced this stop; a client returning identical public failure
JSON cannot grant itself terminal routing authority or bypass normal handling.
Actual child stops carry private trace identity bound to their run holder, so
calling frames also stop without retrying or repairing the child. Copied or
foreign public trace JSON has no such authority. The stop launches no retry,
repair or model call.

The tuple includes node/definition, actual resolved parameters after any
accepted identity-refresh overlay, effective dispatch inputs, identified
subject, resource and semantic view digest. Native dispatch inputs are the
Flow inputs plus wired ports, rather than the merged trace input bag that also
contains every earlier command ID and capture timestamp.

## The optional host contract

The input extends the existing host action context with `point` before_action
or after_action, the required accepted `stateRef`, and optional cancellation
signal. The host derives its answer from that existing capture. Observation
adds no browser captures or actions, and may use the capture's existing reuse
path. An absent method retains existing execution behavior.

An observed answer has `kind: "observed"`, `coverage: "complete"`, opaque
`resource`, `target` (`{kind: "none"}` or `{kind: "identified", key}`), and
`viewDigest`. Resource identifies the relevant resource/document incarnation;
equivalent content in another resource is different. Target identity must be
positive, independently of an old handle, position or selector. None means a
genuinely targetless operation. The digest represents comparable relevant
state, independently of snapshot IDs and capture times. Complete coverage is
positive evidence, not an inference from a nonempty checksum.

Unavailable answers use `kind: "unavailable"` with the closed reasons missing,
partial, unreadable or unsupported. Missing scope, incomplete capture,
unidentified required subject or unobservable relevant effects are unavailable.
Core reads closed plain-data descriptors without invoking answer getters;
malformed, throwing, foreign or overlong answers are unproven. Tokens are
nonempty strings of at most 256 characters. They remain private to execution,
outside state refs, summaries, durable traces, activity and model context.
Observation grants no permission, effect certainty or retry authority.

## Control progress and proof boundaries

Private checkpoints contain only the current strongly connected graph
component's real dependencies: resolved parameters, consumed deterministic
Core input ports, relevant Get/Set Variable values, native effective inputs,
and actual active For Each/Repeat indices. Later exports and unreachable
consumers of changing result IDs cannot mask a stalled cycle. Genuinely
consumed structured data remains intact; Core does not strip guessed volatile
fields. Exact canonical Constant.value edges use the Constant's resolved
literal dependency, avoiding a fictitious progress event when its cache slot
is first initialized. Feedback counters and arbitrary output values are not
substituted this way.

The strict streamed canonical JSON hash is shared with the command-ledger
machinery. A checkpoint over 1 MiB, 20,000 JSON values or depth 48 is unproven;
graphs over 512 nodes or 2,048 edges are unsupported by this guard. These are
proof limits, never new execution refusals. Candidate/component maps hold at
most 512 entries and retain fixed-size digests/counts, not raw data copies.

Exact canonical deterministic Core definitions, with their original execute
function identity, can be transparent without host snapshots. These include
ordinary control, Boolean, arithmetic and in-memory data/variable operations.
A model effect label or a builtin-looking name cannot establish transparency.
Real counter/wired-input/variable/loop progress resets the whole unchanged
chain. Observed resource or view changes do so as well, including between
actions or when another action later restores an earlier view. Different
stable subjects at two read-only nodes are separate tuples, not view progress.

Failures and their retries are unproven visits. They keep the full existing
retry ladder and source/identity re-find boundary; a later successful retry can
establish a new baseline. Internal source rereads are never visits. Unknown
implementations without complete host evidence, random/time operations,
record persistence, children, registered lifecycle handlers and unsupported
readiness/fact conditions are proof barriers. State-route/handler/checkpoint
jumps, reacquisition, skips and graph repair changes also clear the chain.
Children receive their own private guard. An in-memory pause retains private
memory and re-observes on release; a seeded/parked continuation starts fresh,
without reconstructing evidence from stored traces.

Completed-act skips remain ahead of the dispatch gate. Lasting-act uncertainty,
required receipts, permissions, cancellation and admitted effect floors keep
their existing authority. Pure-only and skip-only cycles are intentionally
left to existing guards/maxSteps. A visible tuple cannot prove general future
termination: hidden state, timers, randomness and unsupported external facts
must remain unproven rather than being called unchanged.


## Verified execution paths

Core owning tests cover the registered NativeNodeRuntime and canonical Core
control nodes. The installed company-website proof covers the canonical
policy action through the real web output, durable required receipts and the
native browser gateway: two unchanged reads stop before a third dispatch;
seven deliberate ForEach passes all finish. Observation adds no commands.
Direct importer execution remains refused in required-receipt mode; this
port does not broaden that admission boundary. Missing frame/view proof
still abstains rather than stopping ordinary execution.
