# Package Boundaries And Distribution

FluxIQ has three public ESM packages. They are compiled before use; consumers
must not depend on repository TypeScript sources, workspace aliases, or a
TypeScript runtime loader.

| Package | Owns | Environment | Runtime dependencies |
| --- | --- | --- | --- |
| `@fluxiq/contracts` | JSON primitives, program API schemas, client-gateway protocol, and external Automation Studio recording contracts | Browser and Node.js | `zod` |
| `fluxiq` | Domain-neutral framework runtime, global programs, storage, migrations, and host integration | Node.js 22 or newer | contracts, QR generation, and native SQLite |
| `@fluxiq/client-gateway-websocket` | WebSocket transport and browser-facing client helpers | Browser and Node.js 22 or newer | contracts only |

The contracts package is the dependency seam between browser clients and the
framework. It must not import the runtime. The WebSocket client must not pull
in `fluxiq`, SQLite, TypeDoc, QR generation, React, or Node filesystem modules.
The runtime preserves its existing contract-related exports as compatibility
re-exports, so current importing repositories do not have to change all imports
at once.

## Domain Ownership

These packages are domain-neutral. An importing repository defines its domain
manifest, program root, names, labels, adapters, and private assets. Framework
terms such as "global editor" describe shared ownership and persistence scope;
the imported UI still uses the active importer's domain manifest for visible
naming and branding.

## Exports And Builds

All packages are ESM-only and expose conditional `types` and `import` entries
from `dist/`. Relative source imports use TypeScript extensions during local
development and are rewritten to JavaScript extensions in emitted code and
declarations. Package tarballs include only compiled output and a package
README.

The runtime keeps its established public subpaths during the 0.1 compatibility
period. New subpaths should be added only for an independently useful surface;
internal folders are not automatically public API.

`fluxiq` is a Node.js package, but one of its subpaths is not. The runtime is
the only place the element matcher lives, and a host that scores element
candidates does so where the elements are — in a browser. So
`fluxiq/automation-studio/fingerprinting` publishes the fingerprint contracts
and `createAutomationStudioElementMatcher` on their own, away from the
`fluxiq/automation-studio` barrel, which reaches `node:crypto` and
`node:perf_hooks` through `dsl/` and `testing/` and therefore cannot be
resolved by a browser bundler at all. The subpath's compiled graph is three
files with no runtime imports of any kind; that is not a claim about today's
code but an invariant, checked by
`src/programs/automation-studio/fingerprinting/tests/index.test.ts`, which
fails if any module in the closure gains a value import. The alternative — a
second matcher written in the browser host — would give two different answers
to the same question within a release.

Two of that matcher's scoring constants are no longer Core's to change alone.
`MISSING_STABLE_IDENTIFIER_SIMILARITY` (−0.1) and
`CONTRADICTED_STABLE_IDENTIFIER_SIMILARITY` (−0.8) in
`fingerprinting/element-fingerprint.ts` are calibrated against a spec in the
downstream FluxIQ Web Extension repository: returning the first to its former
−0.55 was measured there to turn the `reworded-aria` case in
`apps/extension/e2e/content/tests/identity-resolution.spec.ts` red. Changing
either weight is therefore a cross-repository change. Re-measure that spec, push
both `dev` branches in the same work unit, and give the release a minor version
and a migration note — these numbers reach a consumer as `confidence`, and the
runtime's own safety gates read it.

TypeDoc is an optional runtime peer. Repository development installs it to
generate API reference, while normal runtime import and setup work without it.
Native `sqlite3` remains external and is installed for the consumer platform.

## Validation And Release Policy

Run the complete distribution gate with:

```bash
pnpm package:validate
```

It builds the packages, checks their manifests and type resolution, packs local
tarballs, rejects source/private files, installs clean Node and browser
consumers, imports every runtime export, performs global/domain SQLite writes,
exercises a layout-v1 to layout-v2 migration, type-checks without workspace
paths, and browser-bundles the WebSocket client while checking its dependency
graph. CI repeats the checks on Node 22 for Windows and Linux.

`@fluxiq/contracts` is at version `0.2.0` and `fluxiq` at `0.3.0`;
`@fluxiq/client-gateway-websocket` is at `0.1.0`. Before 1.0, compatible
changes increment the patch version and intentional API breaks increment the
minor version with a note under [Migration Notes](#migration-notes).
"Compatible" is judged on what a consumer observes, not on the type surface: a
change that moves a published number a host gates on is a minor increment even
when every signature is identical, and it takes a migration note like any other
break. Registry publication, tags, signing, and provenance are separate release
actions and are not performed by validation.

All public packages carry the repository's source-available FluxIQ license and
include an exact copy in their tarball. Commercial use outside the community
terms is available only through a separate written agreement. Registry
publication, tags, signing, provenance, the final legal licensor identity, and
commercial contract templates remain separate owner-controlled release work.

## Migration Notes

### Unreleased: the element-target trace claims only what Core applied (`fluxiq`)

`AutomationNodeTargetResolution` is now a union discriminated by `status`. Its
`unresolved_no_candidates` member carries `candidateCount: 0` and no
`minimumConfidence`: with no runtime candidates Core scores nothing and enforces
no floor, so the number it used to write there named a threshold nothing was
compared against. The dispatch diagnostics' `reason` now says so. The other
three statuses keep `minimumConfidence`. A host that reads `minimumConfidence`
from every resolution must narrow on `status` first, and a parser that treats a
resolution without it as malformed must accept this member.

Recording-mapped element targets change without any host opt-in. When a mapped
action's parameters carry `element`, the node's `parameters.target.fingerprint`
now holds that element's identity, with `implicitRole` read as `role`, beside
the parameters' own locator signals; the parameters' own `text` is no longer
copied into `visibleText`. The same normalization applies at dispatch to
parameters that carry no explicit target.

`appendRecordingDomainEvent` now refuses a finalized recording, as the other
recording appends already did, and the client gateway bridge reports a domain
event that arrives in that window as `recording.event_discarded` instead of
writing it into the recording.

### 0.3.0: a missing stable identifier costs less (`fluxiq`)

No type or export changed. One published number moves. An element candidate
that does not carry a stable identifier the recording captured is now charged
−0.1 of that identifier's weight where it was charged −0.55. A candidate
carrying a *different* identifier is untouched and still costs −0.8. The two
branches of `compareExactSignal` in `fluxiq/automation-studio/fingerprinting`
are now the named constants `MISSING_STABLE_IDENTIFIER_SIMILARITY` and
`CONTRADICTED_STABLE_IDENTIFIER_SIMILARITY`.

**Who is affected.** Only candidates missing an identifier the fingerprint
recorded. For those, `totalScore` rises by `0.45 × w` for each recorded
identifier the candidate lacks — at the default weights `id` 26, `testId` 28,
`automationId` 28, `entityId` 24, `statePath` 22 — over an unchanged
`possibleScore`. So `confidence` only ever rises or stays equal; it never falls.
`matchedSignals` and `failedSignals` are identical before and after, because an
absent identifier is still a negative contribution and still a failed signal, so
a diagnostic reading those lists sees nothing change.

**Measured, on the case this was weighed against.** A candidate matching
`visibleText` and `accessibleName` exactly and carrying no `id`, scored against
a fingerprint that recorded one: `(24 + 24 − 2.6) / 74 = 0.614` normalized,
times the two-strong-match multiplier `0.94`, so **confidence 0.577** — from
`33.7 / 74 = 0.455`, `× 0.94 = 0.428`.

**Which rungs of the element-target ladder that crosses.** The runtime's default
minimum confidence for an element target is destructive `0.9`, privileged
`0.82`, review `0.68`, safe `0.45`, and `0.5` for an output declaring no safety
level. The candidate above newly clears **`safe` and the default rung**;
`review`, `privileged` and `destructive` still refuse it.

That is a statement about that candidate, not about every candidate, and the
difference decides whether you are exposed. Across the 1,024 combinations of
which of five recorded identifiers, three text signals and two loose signals a
candidate carries (matching exactly wherever present), 170 profiles newly clear
`safe`, 145 the default rung, 44 `review`, and 7 `privileged`. Those reaching
`review` already matched three of the five identifiers exactly and all three
text signals; those reaching `privileged` matched four of five. And a candidate
agreeing exactly on everything else a recording captured — all three text
signals, role, tag name, entity kind, all three structural paths, URL, class
names, attributes, bounds, and visibility — while missing one recorded
identifier crosses **`destructive`** as well: missing `statePath` goes
`0.883 → 0.917`, missing `entityId` `0.873 → 0.910`, missing `id`
`0.862 → 0.902`. No rung is categorically out of reach; what still protects the
high ones is that clearing them takes near-total agreement on every other
signal.

**The selected candidate can change, not only its score.** Candidates rank by
`totalScore` and only candidates missing an identifier gain, so a ranking can
invert. Against a fingerprint recording `id`, `testId`, `visibleText` and
`accessibleName`: a candidate with exact text and neither identifier scores
`18.3` before and `42.6` after, while a candidate carrying both identifiers
exactly and contradicting the text stays at `27.6` throughout.
`bestElementFingerprintCandidate` returns the second before this release and the
first after it.

**What to check.** If you gate on `confidence` — your own floor, an output's
`elementTargetMinConfidence` metadata, or the default ladder — re-measure
against your own recordings rather than reasoning from these figures: the delta
depends on which identifiers your fingerprints capture and how you weight them.
Nothing needs to change where your candidates carry the identifiers they
recorded, since that path is untouched. A host that filled an absent identifier
with a placeholder to dodge the old penalty should stop doing so — a wrong
value now costs far more than an absent one, as the
[importing-repos guide](../integrations/automation-studio-importing-repos.md)
now explains.

**Why a minor increment, and why `0.2.1` is ambiguous.** This behaviour shipped
in `a575df2` on 2026-09-12 under `0.2.1`, a version `fafe7c7` had already
published earlier the same day for an unrelated additive export, and it took no
increment of its own. Two builds therefore bear `0.2.1`, one refusing the
candidate above and one accepting it, and no version string tells them apart;
treat `fluxiq@0.2.1` as unspecified on this behaviour and read the commit.
`0.3.0` is the first version that names it. Minor rather than patch because the
change is not opt-out-able and moves a number the runtime's own safety gates
read — the same reason the 0.2.0 note's closing paragraph carries a behaviour
change under a minor increment.

### 0.2.0: one failure taxonomy (`@fluxiq/contracts`, `fluxiq`)

`AutomationStudioAdaptiveFailureClass` now lives in `@fluxiq/contracts`
(`@fluxiq/contracts/automation-studio`, with the frozen list
`AUTOMATION_STUDIO_ADAPTIVE_FAILURE_CLASSES`) and `fluxiq/automation-studio`
re-exports it under the same name. It gains seven members: `target_not_found`,
`target_ambiguous`, `navigation_unexpected`, `output_not_observed`,
`page_changed`, `auth_required`, and `user_intervention_required`.
`AutomationStudioTransitionComparisonStatus` gains `target_not_found` and
`target_ambiguous`. An exhaustive `switch` or `Record` over either type must
handle the new members; code that only reads the values needs no change.
Domains take category names from this export and never keep their own list.

Everything else is additive and optional: `failure`
(`AutomationStudioFailureRecord`) on `ClientGatewayActionResult`,
`FluxIQRuntimeCommandResult`, `OutputDispatchResult`,
`AutomationNodeExecutionResult`, `AutomationStudioNodeAttemptTrace`, and
`AutomationStudioFlowRunActionAttemptRecord`; `status` on
`OutputDispatchResult`; `message` and `targetResolution` on
`AutomationNodeExecutionResult`; `targetResolution` on the attempt trace; and
`failureCategory` on the LLM recent-action context. Validate a record that
crossed a process or storage boundary with `parseAutomationStudioFailureRecord`,
which returns `null` for anything inexact, unbounded, or self-contradictory.

One behaviour changes without any host opt-in: Core now names the failures its
own structured signals prove instead of leaving them to message matching. A
`timed_out` runtime command classifies as `timeout`, a `rejected` one as
`blocked_by_capability_or_policy`, a dispatched output whose bound confirmation
input never arrives as `output_not_observed`, and an element target without a
confident candidate as `target_not_found`. Failed dispatch attempts also carry
the dispatch error as their `message`.
