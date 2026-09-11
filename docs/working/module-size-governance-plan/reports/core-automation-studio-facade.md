# Report: core-automation-studio-facade (Phase 7, the centrepiece)

## Outcome

Done — **nineteen collaborators** extracted across seven dispatches.

`packages/fluxiq/src/programs/automation-studio/runtime/service.ts` went from
**12,482 lines to 7,758** and `AutomationStudioService` from **422 methods to
230**. The public surface is **178 methods, unchanged at every step**, so the
private count is the progress measure: **244 private methods at the start, 52
now**. The resolved export set of `runtime/index.ts` is the same 276 names.
Twenty differential probes drove the pre-extraction implementation and the
facade side by side over **1,058 observations** and found no difference.

Round 7 changed the operation. Rounds 1-6 moved *methods*; round 7 moved three
**public method bodies** into collaborators and left pure forwards
behind, plus the private layer one of them stood on. The method count barely
moves (232 → 230) and that is expected: the measure this round is **905 lines
out of the file in four independently revertible steps**, the largest single
round of the phase.

| Round | Collaborator | Methods relocated | `service.ts` | Class (public / private) |
| --- | --- | --- | --- | --- |
| 1 | `service/paths/` | 41 | 12,482 → 12,048 | 422 (178 / 244) → 381 |
| 1 | `service/indexes/` | 20 | 12,048 → 11,952 | 381 → 361 |
| 2 | `service/projects/` | 12 | 11,952 → 11,952 | 361 → 349 |
| 2 | `service/legacy/` | 10 | 11,952 → 11,839 | 349 → 339 |
| 3 | `service/ui-cache.ts` | 4 public | 11,839 → 11,736 | 339 |
| 3 | `service/bootstrap-adaptations.ts` | 1 public + 3 private | 11,736 → 11,656 | 339 → 336 |
| 3 | `service/locks.ts` | 3 private | 11,656 → 11,605 | 336 → 333 |
| 3 | `service/object-documents.ts` | 2 public + 11 private | 11,605 → 11,373 | 333 → 322 |
| 4 | `service/flows/` (store, mapping) | 7 public + 14 private | 11,373 → 10,734 | 322 → 308 |
| 4 | `service/recordings/` | 1 public + 23 private | 10,734 → 10,269 | 308 → 287 |
| 5 | `service/flows/writer.ts` | 2 public + 11 private | 10,269 → 9,955 | 287 → 276 |
| 5 | `service/flows/mutations.ts` | 3 public + 5 private | 9,955 → 9,765 | 276 → 271 |
| 5 | `service/adaptations/` | 10 private | 9,765 → 9,342 | 271 → 261 |
| **6** | **`service/catalogue.ts`** | **1 public + 7 private** | **9,342 → 9,259** | **261 → 254** |
| **6** | **`service/summaries/`** | **4 public + 20 private** | **9,259 → 8,665** | **254 → 232 (178 / 54)** |
| **7** | **`service/evidence/`** | **1 public body + 24 helpers** | **8,663 → 8,135** | **232** |
| **7** | **`service/proposals/generation.ts`** | **1 public body + 4 types** | **8,135 → 8,009** | **232** |
| **7** | **`service/flows/subflow-migration.ts`** | **2 private + 1 helper** | **8,009 → 7,865** | **232 → 230** |
| **7** | **`service/proposals/approval.ts`** | **1 public body + 1 helper** | **7,865 → 7,758** | **230 (178 / 52)** |

The round-6 rows above say 8,665, which is what I wrote last round; `wc -l` and
the structure audit both read that file as **8,663**, and the recorded ratchet
entry is `file-lines 8663`. 8,663 is where round 7 starts. The ratchet now reads `file-lines 7758` and
`class-methods 230` as lowerable; **`pnpm structure:baseline` was not run.**

This round also delivered the two things the dispatch asked for before any
cutting: the **corrected re-measurement of every cluster**, and — since the
runtime/LLM side does not come apart — **the measured dependency graph** instead
of a forced extraction. Both are in **Open questions**.

## What changed and why

### The corrected re-measurement, run first

The closure walk had been counting a call to an already-delegating facade method
as an outward dependency. Re-run over all 36 remaining field clusters, with the
old and new outward counts side by side:

| Cluster | seed | out (old) | out (new) | corrected closure |
| --- | --- | --- | --- | --- |
| `uiCache`, `closeLlmExecutionGrants`, `repairedRecordingStateIndexReads` | 1-6 | 0 | 0 | already collaborators |
| `recordingStateIndexes` | 5 | 1 | 1 | 9 methods / 125 lines |
| `recordingDomains` | 6 | 3 | **2** | 12 / 186 |
| `projectDatabasePool` | 4 | 4 | **2** | 13 / 400 |
| `legacy` | 15 | 7 | **3 → 2** | 19 / 342 |
| `objectStore` | 14 | 5 | **3** | 24 / 598 |
| `flowMutations` | 13 | 9 | **5** | 23 / 626 |
| `bootstrapAdaptations` | 7 | 17 | **11** | 37 / 1,176 |
| `projectPaths` | 53 | 19 | **13** | 78 / 1,782 |
| `nativeNodeRuntime` | 13 | 40 | **33** | 91 / 3,113 |

**No previously written-off cluster turned out to be closed.** The correction
lowered every outward count — typically by 20-30% — but nothing crossed to zero
at the *field* level. Where it mattered was at the *method* level, exactly as it
did for the Flow writer last round: seeding a specific group rather than a whole
field. Two candidates from the ranked list moved from "not closed" to "closed"
under the corrected rule, and both were taken this round.

The honest summary: the correction did not unlock a hidden large cluster, but it
is now the right rule and the map above is the corrected baseline for whoever
continues. `asfacade-map.mjs` reproduces it in one command.

### Round 6, collaborator 1 — `service/catalogue.ts`

Reading the catalogue: which projects exist, which Flows each holds, and which of
those are canonical, published, or publication records. **8 methods, 80 lines, 1
public, 0 outward** under the corrected rule (it measured 1 outward under the
old one). `listProjects` came in because Flow scoping derives from the project
list, and it stays on the facade as a delegation.

### Round 6, collaborator 2 — `service/summaries/`

The summary indexes every list view reads, their SQL-backed repositories and
paging, and the JSONL stream store run details are appended to. **24 methods,
334 lines, 4 public, 0 outward.**

This one is the round's real find. Three separate candidates — the summary
indexes, the recording domains, and the SQL graph methods — all measured
"1 outward" and all pointed at the *same* blocker: `tryWithRuntimeStreamStore`
and the summary writers around it. Seeding that layer directly closed it at once
and unblocks all three for a later round.

Split into three files so that no file crosses the 400-line advisory threshold,
with each split checked for direction first: `store.ts` (377) holds the class,
`conversions.ts` (251) the pure runtime-session → run-detail conversions, and
`sql-paging.ts` (67) the generic SQL pager, which reaches nothing at all. Two
public page types moved with them and are re-exported by name.

### The pre-cut white-box grep

**`catalogue.ts` — one coupled site.** `service.test.ts:4537` stubs the private
`loadProjectFlows` on an instance as a **tripwire**: the test asserts that
`createFlow` does not hydrate every persisted Flow, by making that method throw.
Repointed to `((reloaded as any).catalogue).loadProjectFlows`. Worth noting that
this one had to be repointed for the test to keep *meaning*, not merely to keep
passing — left on the facade it would have passed vacuously, since nothing calls
it there any more. That is the strongest argument yet for running this grep
before the cut rather than after the suite.

**`summaries/` — no coupled sites.** Four hits were public API calls
(`getFlowInstruction`, `getRuntimeSession`, `listRuntimeSessions`,
`saveFlowRunDetail`), all unaffected. A fifth, `tryWithFlowResourceRepository`,
looked like a hit but belongs to the round-4 flow-store extraction and already
points at `.flows` — the per-site judgement my own caveat asked for.

### The regression this round introduced, and the fix

**Bisected, not guessed.** Replaying step 1 alone (`catalogue.ts`, with
`summaries/` removed and the barrel reverted): `tsc` clean,
`service-subflow-pagination.test.ts` **5 of 5**. Replaying step 2 on top flips
it. So the fault is in `service/summaries/`, and it is one line in one method.

`ensureFlowSubflowSummaryIndex` moved into `summaries/store.ts`. Its body is
identical to the original except here:

```
baseline   const detail = await this.getFlowSubflow(projectId, summary.flowId, summary.subflowId);
extracted  const detail = await this.flows.getFlowSubflow(projectId, summary.flowId, summary.subflowId);
```

That rewrite came from the VIA rule I added in round 5: a call to a facade method
that is *nothing but a forward* can be re-pointed at the collaborator that owns
it. For a **private** callee that is exactly right and is what unlocked three
collaborators. For a **public** callee it is wrong in a way no type check can
see: it moves the dispatch point off the facade, so an override or a test stub on
the public method is no longer honoured by internal callers that have moved.

The test encodes that expectation deliberately. It replaces
`service.getFlowSubflow` with a counting wrapper and asserts
`peakReads > 0 && peakReads <= 16` — the summary migration must hydrate detail
*through the service's own reader*, and must bound that hydration to 16
concurrent reads. Routed straight at the flow store, the wrapper never ran:
`peakReads` stayed 0. The data was still correct — `page.total` was 64 and every
summary was right — which is why nothing else noticed.

**Fix:** the summary store now takes a `readFlowSubflow` port, wired by the
facade as `(projectId, flowId, subflowId) => this.getFlowSubflow(...)`, and the
migration calls that. The facade is the dispatch point again, the stub is
honoured, and the bounded-concurrency assertion measures what it was written to
measure. The extraction script carries the exclusion and the port so a replay
reproduces the fix rather than the bug.

### Why the probes did not catch it, and what the blind spot actually is

Not zero-row coverage. The probes exercise empty and missing paths heavily —
this round's transcript alone contains `listProjects.empty`,
`listRuntimeSessions.empty`, `getRuntimeSession.missing`,
`getFlowInstruction.missing` and `scopedProjectIdsForProject.unknown`, and every
earlier round has equivalents. The `0` in "expected 0 to be greater than 0" was
not a row count; it was an instrumentation counter.

The blind spot is **dispatch-point identity**. Every probe compares return values
and thrown errors between the pre-extraction implementation and the facade. This
change altered neither. What it altered was *which object the call went through*,
and a value-diffing probe cannot see that by construction — you would have to
instrument both implementations identically, which is precisely what the stub in
the test does.

So the right detector is not a probe but a static scan, because dispatch identity
is a static property. `<scratchpad>/asfacade-dispatch-scan.mjs` reports every call
inside a collaborator that targets a name still public on the facade.

### Could the same blind spot hide more? Yes — 25 further sites, none currently observed

The scan over all collaborators from rounds 4-6:

| Public method called from inside a collaborator | Sites |
| --- | --- |
| `getFlow` | 9 |
| `getFlowSubflow` | 8 (the fixed one is no longer among them) |
| `saveFlowSubflow` | 3 |
| `saveFlowRouter` | 2 |
| `getFlowRouter` | 2 |
| `createFlowSubflow` | 1 |

All 25 are the same class of change. None is currently observable: the suite is
green, and the only tests that stub any of these are the three `getFlowSubflow`
wrappers in `service-subflow-pagination.test.ts` — all honoured again, two
because their caller never left the facade and one through the new port — and the
`saveFlowRouter` spy in `service-flow-bootstrap-adaptation.test.ts`, honoured
because `applyFlowBootstrapAdaptation` was still on the facade — a conditional
that no longer applies, since that call now goes through the port and the spy is
honoured however the caller moves.

One risk I raised turned out to be a false alarm, checked by the coordinator:
`packages/test-runner/src/tests/demo-llm-adaptation-readiness.test.ts:95`
downstream stubs `getFlowRouter` on a plain fixture object rather than on the
service, so the dispatch rule never applied to it.

### The policy, applied — all 30 sites, and the guard that stops it recurring

The decision was taken: **a collaborator must never re-point a call whose callee
is a public facade method.** Public methods are external entry points, so code
inside the object dispatches through the facade and an override or a stub is
honoured. The VIA rule stays for private callees, where there is no external
dispatch contract to preserve.

**Shape: one port type and one factory per facade, not 25 fields.** Twenty-five
individual function fields would have buried the intent in wiring, and five
bespoke per-collaborator port objects would have repeated it. Instead
`service/facade-ports.ts` declares `AutomationStudioFacadePorts` — the six public
methods a collaborator may call back into — and
`automationStudioFacadePorts(service)` returns a fresh object of six closures
over it. A collaborator takes one `facade: AutomationStudioFacadePorts` parameter
and calls `this.facade.getFlow(...)`. The type states exactly what may be called;
the factory means a collaborator cannot reach anything else even at runtime,
which narrowing to the type alone would not prevent.

All six ported methods were checked to be pure single-line delegations before
routing through them, so the change adds one call hop and nothing else.

**The rule found five more sites that my scratch scan had missed**, because that
scan was scoped to automation-studio. `client-gateway/service/` — the pilot — has
the same shape: `access.ts`, `lifecycle.ts` and `pairing-flow.ts` call
`this.trustedClients.ready()` and `this.lifecycle.disconnect(...)`, and
`ClientGatewayService.ready()` and `.disconnect()` are themselves pure forwards.
Same latent exposure, same fix: `client-gateway/service/facade-ports.ts` and a
`facade` member in the three collaborator bundles.

| Facade | Sites routed through a port |
| --- | --- |
| `automation-studio/runtime/service.ts` | 25 (`getFlow` 9, `getFlowSubflow` 8, `saveFlowSubflow` 3, `saveFlowRouter` 2, `getFlowRouter` 2, `createFlowSubflow` 1) |
| `client-gateway/service.ts` | 5 (`ready` 4, `disconnect` 1) |

### The guard: `facade-dispatch`, a structure-audit rule

`scripts/structure-audit/rules/facade-dispatch.mjs`, with
`rules/tests/facade-dispatch.test.mjs` (9 tests), mirrored byte-for-byte into the
downstream repository where it also passes with its tests. It fits the rule
contract, so it runs inside `pnpm check` with everything else rather than as a
separate script.

`x/service.ts` is a facade when `x/service/` exists beside it. Inside that
directory a call `this.<field>.<method>()` is a finding when `<method>` is public
on the facade **and** `<field>` is typed as a class the facade directory exports.

**That last clause is what makes the rule usable.** A class is an implementation
a caller can reach past; an interface or type alias is a port the facade itself
fulfils, and calling a public method through one is the fix, not the defect. The
first version keyed only on the method name and flagged the corrected code — 31
findings, every one of them the fix — which is how a rule like this becomes
something people switch off. Typing the holder also rules out
`this.store.close()` in the ui-cache collaborator, where `store` is its own
SQLite store and `close` merely shares a name with a facade method.

Findings are `severity: "fail"`, `ratchet: false` — always fail, never
baselineable — because after this round there are zero, so there is nothing to
absorb and no reason to let more accumulate.

**A note on the line budget.** The guard cost `service.ts` twelve lines it did
not have: the ratchet lets a baselined entry shrink, never grow. Moving the port
construction into the factory removed eleven of them, and merging four
`export type { … } from "./service/index.ts";` re-export lines into one — better
style anyway, since they all re-export from the same module — covered the rest.
The file ends at **8,663 against a baseline of 8,665**, so the audit reports an
entry that can be lowered rather than one that grew.

### Distinguishing the flake, the right way this time

The ports change touches every hydration read, and the flaky case is
concurrency-sensitive, so the full-suite count alone proves nothing. The
discriminating experiments:

| Tree | Full scope, under load | `service-subflow-pagination.test.ts` alone |
| --- | --- | --- |
| Before the ports change | 4 failed, 4 failed | — |
| After the ports change | 4 failed, 4 failed | **5 of 5, three runs** |

Identical before and after, and green in isolation. The fourth failure is the
load-dependent flake, and today's machine shows it on every full run rather than
occasionally — which is also why the earlier "3 failures" reading and this one
both sit inside the same envelope.

### Two more rewriter shapes, found by the type checker

- **Overloaded methods.** `listSqlJsonSummaryPage` has three members (two
  overload signatures and the implementation) at one name. Keying spans by name
  moved only the first. The extractor now spans `min(start)…max(end)` across all
  members of a name.
- **Stale type ranges.** Type-alias line numbers were captured from a *later*
  version of `service.ts` than the one being cut, so the slices landed mid-type.
  Cheap to spot (the generated file fails to parse), cheap to avoid: regenerate
  ranges from the exact input file immediately before the extraction.

### Round 7 — the strategy change, and what it could actually reach

The dispatch asked for the ten largest remaining public bodies, minus the
runtime/LLM knot. Before cutting I computed, for each candidate, the transitive
closure of *private* methods it pulls (public callees are excluded: they stay on
the facade and are reached through the ports factory), the collaborator fields
it touches, and whether any runtime/LLM field appears anywhere in that closure.
**Only three of the eight non-knot candidates were movable:**

| Candidate | Lines | Closure | Verdict |
| --- | --- | --- | --- |
| `processFinalizedRecording` | 113 | — | runtime/LLM (`ioRuntime`, `nativeNodeRuntime`) |
| **`approvePolicyProposal`** | **98** | **3 methods, 233 lines** | **movable** |
| `createRecordingFlowProposals` | 98 | — | runtime/LLM |
| **`mineRecordingEvidence`** | **97** | **1 method** | **movable** |
| `proposePolicyFromModel` | 96 | — | runtime/LLM (`ioRuntime`) |
| **`generateRecordingProposal`** | **88** | **1 method** | **movable** |
| `reviewRecordingFlowProposal` | 88 | — | runtime/LLM |
| `createFlowBootstrapAdaptation` | 80 | — | runtime/LLM (`nativeNodeRuntime`) |

Five of the eight reach the knot. That is the same measurement as round 6's
entanglement graph seen from the other end, and it is why this round produced
four steps rather than ten.

**All three delegations are pure forwards**, as the dispatch required. Each is
exactly `return await this.<collaborator>.<name>(input);` under the original
signature, verbatim.

### Round 7, step 1 — `service/evidence/` (8,663 → 8,135, −528)

`mineRecordingEvidence` (97 lines) moved with the **24 module-level helpers**
that only it reached — 412 contiguous lines of fact construction, observation
derivation, state-element descriptors, state/action correlation and claim
building, plus `uniqueBy` and two window constants. Split by responsibility
into `text.ts` (23), `state-elements.ts` (119), `facts.ts` (124),
`correlations.ts` (195) and `mining.ts` (133).

One helper, `readableTokenValue`, is **shared** with
`recordingActionEntryCandidate`, which stays on the facade. It lives in
`evidence/text.ts` and the facade imports it back — the alternative, leaving a
copy behind, is how two implementations of one rule start to drift.

Removing the block left four model type imports (`StateDelta`,
`StateElementDescriptor`, `StateElementKind`, `StateValue`) with no
remaining use in `service.ts`; they were dropped.

### Round 7, step 2 — `service/proposals/generation.ts` (8,135 → 8,009, −126)

`generateRecordingProposal` (88 lines) has **no module helpers at all** and
touches one collaborator field (`recordings`). Everything else it calls is
public — `createRecordingFlowProposals`, `deleteProposal`,
`processFinalizedRecording` — so all three went into the ports type.

What made this step bigger than the body: the four result types it needs
(`ProcessFinalizedRecordingResult`, `GenerateRecordingProposalInput`,
`GenerateRecordingProposalResult`, `CreateRecordingFlowProposalsResult`) were
declared in `service.ts`, so a collaborator importing them would have closed a
cycle. They moved to `proposals/types.ts`, and
`NormalizationReviewArtifact` — which one of them references — moved to
`recordings/types.ts`, where the collaborator that owns the recording pipeline
already lives. `service.ts` re-exports all five under their original names;
the resolved barrel export set is unchanged at 276.

### Round 7, step 3 — `service/flows/subflow-migration.ts` (8,009 → 7,865, −144)

`approvePolicyProposal` stands on two private methods,
`ensureProposalPrimarySubflow` (49 lines) and
`migrateLegacyParentIntoOwnedSubflow` (85). Both are Flow-graph machinery
driven by `flowWriter`, and both have **other facade callers** —
`reviewRecordingFlowProposal` (runtime/LLM, stays) and
`migrateLegacyFlowRepresentation` (public, stays). So they were taken as their
own step, before the body that needs them, exactly as round 5's brief framed the
"layer beneath" case.

They are private, so the two remaining facade callers reach them on the
collaborator directly; the seven **public** methods they call
(`listFlowSubflowSummaries`, `getFlowRouter`, `getFlowSubflow`,
`createFlowSubflow`, `getFlow`, `setFlowMapFallback`, `saveFlow`) all go
through the ports factory. That is the policy from the previous round applied to
new output rather than retrofitted.

`AutomationStudioSubflowSummaryPage` moved to `summaries/types.ts` so the
`listFlowSubflowSummaries` port could name its return type.

### Round 7, step 4 — `service/proposals/approval.ts` (7,865 → 7,758, −107)

`approvePolicyProposal` (98 lines) moved last, onto the layer step 3 created.
It takes five collaborator fields (`projectPaths`, `projects`,
`recordings`, `repositories`, `flowSubflowMigration`) and two ports
(`getProjectArtifact`, `saveFlow`).

`canonicalFlowDocument` is shared with `reviewRecordingFlowProposal`,
`startRuntimeSession` and `runRuntimeSession` — all staying on the facade —
so it went to `flows/canonical-document.ts` and both sides import it.

### The ports type grew from 6 entries to 13

`listProjectNormalizedTimelines`, `createRecordingFlowProposals`,
`deleteProposal`, `processFinalizedRecording`, `saveFlow`,
`setFlowMapFallback`, `listFlowSubflowSummaries` and `getProjectArtifact`
were added. Every one is a public method a moved body calls, and the alternative
in each case is the dispatch-identity bug the round-6 regression was.

Two probe steps prove the ports still dispatch through the instance: each
replaces a public method on the service object with a counting wrapper, runs the
moved body, and reports whether the wrapper was seen. **`sawOverride: true` on
both sides**, for `getFlowSubflow` through the migration collaborator and for
`saveFlow` through the approval collaborator. That is the exact check that
would have caught round 6's regression on the day.

### What was deliberately not done

- **The runtime/LLM side.** Measured twice now — once as a field graph in round
  6, once as a per-candidate closure in round 7 — and not attempted either time.
  Five of the eight non-knot bodies on this round's list reach it.
- **The five runtime/LLM bodies on the round-7 list.** `processFinalizedRecording`,
  `createRecordingFlowProposals`, `proposePolicyFromModel`,
  `reviewRecordingFlowProposal`, `createFlowBootstrapAdaptation`: left whole,
  because a half-moved body that keeps a branch on the facade is worse than
  either end state.
- **`recordingStateIndexes`, `recordingDomains`, `projectDatabasePool`
  remainder.** All now unblocked by `summaries/` but not attempted this round.
- **`tests/service.test.ts` was not split.** It names none of the 208 relocated
  methods beyond the one tripwire above.
- **No baseline regeneration**, per the brief.

## Commands run and observed results

All from `F:\!FluxIQ` or `packages/fluxiq`.

**Scoped tests** — `npx vitest run src/programs/automation-studio/runtime --reporter=basic`:

| | Files | Cases | Failures |
| --- | --- | --- | --- |
| Round 6 baseline (at baeb000) | 32 (2 failed) | 400 (3 failed) | `service.test.ts` x2, `service-subflow-pagination.test.ts` x1 |
| After both collaborators, before the fix | 32 (2 failed) | 400 (4 failed) | the three, plus a **real regression** (below) |
| **After the fix** | 32 (2 failed) | 400 (3 failed) | **the same three as the baseline** |

`service-subflow-pagination.test.ts` alone: **5 passed (5), three runs out of
three**, after the fix.

**I got the fourth failure wrong in the first version of this report.** I
attributed it to the load-dependent flake on the strength of a full-suite
re-measurement at `baeb000` that also showed four. That was the wrong
experiment: the flake and the regression live in the same file, and the flake
only shows under full-suite load. Run *alone*, the file failed 1 of 5
deterministically with this round's work and passed 5 of 5 without it — which is
the experiment that separates them, and the one I should have run before writing
"identical to baeb000". The correction below is what the bisect found.

**Type check** — `npx tsc --noEmit` in `packages/fluxiq`: exit 0, no output, after
both collaborators. Six intermediate failures were mine and fixed before
proceeding: two wrong delegation argument lists (`getFlowInstruction` takes two
parameters, not three; `saveFlowRunDetail` takes `detail`, not `input`), a
missing helper closure, the overload-span bug, the stale type ranges, and two
helpers placed in the importing file rather than the owning one.

**Consumers** — `npx vitest run .../api .../client-gateway`: 11 files,
**43 passed (43)**, exit 0.

**Public method surface** — `diff` against the pre-work list is empty after every
step. **178 names, same order.**

**Resolved barrel export set** — **276 exports, identical** to the pre-work
original.

**Differential probes**, both durable and memory mode:

| Round | Probes | Observations |
| --- | --- | --- |
| 1-5 | paths, index stores, project store, legacy store, ui cache, bootstrap adaptations, locks, object documents, flow store, recording store, flow writer, flow mutations, durable adaptations | 830 |
| **6** | **catalogue** | **30** |
| **6** | **summary store** | **36** |
| | **total** | **896**, every one equal — and one regression still slipped past, see above |

The catalogue probe drives `listProjects` empty, with one project and
domain-filtered, `listFlows`, `publishFlow`, and all seven private readers before
and after publication. The summary probe drives `saveFlowRunDetail`,
`listFlowRunSummaries` plain and filtered, `listFlowAdaptationSummaries`, then
every `ensure*SummaryIndex`, both `tryWith*Store` wrappers, `writeJsonLines` and
`tryPersistRuntimeRunDetail` directly.

Transcript at `<scratchpad>/asfacade-round6-transcript.txt`; the probe is kept at
`<scratchpad>/asfacade-round6-probe.test.ts.kept` and is **not** in the tree,
nor is the baseline copy of `service.ts` it imports.

**Structure audit** — after `git add -N` on everything created:

| Rule | New findings under `runtime/service` |
| --- | --- |
| `imports`, `class-methods`, `file-lines`, `directory-files`, `naming`, `exported-values`, `test-placement` | **0 each** |

The only warnings remain the two accepted ones from round 4 (`flows/store.ts`
590, `recordings/store.ts` 506). Round 6 added none: `catalogue.ts` is 112 lines
and the three `summaries/` files are 377, 251 and 67.

```
class-methods  runtime/service.ts::AutomationStudioService   232  (recorded 261)
file-lines     runtime/service.ts                           8665  (recorded 9342)
```

### Round 7 commands and results

**Scoped tests** — `npx vitest run src/programs/automation-studio/runtime`:

| | Files | Cases | Failures |
| --- | --- | --- | --- |
| Round 7 baseline (at 4787780, before any change) | 32 (2 failed) | 400 (3 failed) | `service.test.ts` x2, `service-subflow-pagination.test.ts` x1 |
| **After all four steps** | **32 (2 failed)** | **400 (3 failed)** | **the same three, same names** |

**The three baseline failures are not all flakes, and that is a finding.** Run
*alone* against the untouched `4787780` service:

- `service.test.ts -t "approves edited recording Flow proposal graphs into Flows"`
  → **1 failed**, deterministic.
- `service.test.ts -t "turns mapped observations into reviewed Flow actions..."`
  → **1 failed**, deterministic.
- `service-subflow-pagination.test.ts` alone → **5 passed (5)**; it only fails
  under suite load. That is the known flake.

So two of the three are **pre-existing deterministic failures at HEAD**, not
load artifacts. Running the whole `recording persistence` block at the
untouched baseline produces **three** failures — the two above plus "deletes
recording batches with one index and pipeline cleanup pass" — and the same block
with round 7 applied produces **two**, a strict subset, with byte-identical
assertion messages. Nothing in this round changed either failure's shape.

With round 7 in the tree, `service-subflow-pagination.test.ts` **alone passes
5 of 5** — the discriminating experiment the round-6 regression taught me to run
before claiming a failure is the flake. A wider run
(`src/programs/automation-studio`, 96 files / 671 cases) shows a second
pagination case failing under that heavier load; alone, both pass, and both are
timing-bounded cases (18.5s and 10.1s when run alone).

**Type check** — `npx tsc -p tsconfig.json --noEmit` in `packages/fluxiq`:
**exit 0, no output**, after each of the four steps. No intermediate failures
this round; the AST-driven slicer (`asfacade-cut.mjs`) takes every line range
from the TypeScript AST of the exact file being edited, which is what produced
the off-by-one and overload bugs in earlier rounds.

**Structure audit** — `node scripts/structure-audit.mjs` after `git add -N`
on every created file: **passed (115 warnings, 256 baselined), 0 failures**,
after each step. Two intermediate `imports` failures were mine and were fixed
by importing through the barrel rather than the file — `facade-ports.ts`
reaching `./proposals/types.ts` and `proposals/types.ts` reaching
`../recordings/types.ts`. **The rule was obeyed, not worked around.**

**`facade-dispatch` against this round's own output: 0 findings.** The rule is
part of the audit above, and every port call this round routes through
`automationStudioFacadePorts(this)` rather than through the collaborator that
owns the callee.

`node --test scripts/structure-audit/rules/tests/facade-dispatch.test.mjs`:
**9 pass, 0 fail.**

**Public method surface** — `diff` against the pre-round-7 list is empty after
step 1, step 2 and step 4. **178 names, same order.**

**Resolved barrel export set** — **276 exports, identical**, checked with the
type checker after the type moves.

**Round 7 differential probes**, durable and memory mode, each a separate file
driving the pre-extraction `service.ts` and the facade side by side:

| Step | Probe | Observations |
| --- | --- | --- |
| 1 | evidence mining | 42 |
| 2 | recording proposal generation | 36 |
| 3 | Subflow migration | 38 |
| 4 | policy proposal approval | 46 |
| | **round 7 total** | **162**, every one equal |
| | **phase total** | **1,058** |

The evidence probe drives a domain-registered recording through normalization
and mining by recording id and by timeline id, both failure paths, the
collaborator directly, and then compares every mined fact, observation, claim
and correlation by title, summary, score and descriptor. The generation probe
drives the mapper path and the evidence-miner fallback path separately (the
transcript shows `recording_mapper`, `evidence_miner` and `signal_miner`
provenance), blank hint trimming, replacement with an existing and a missing
proposal id, and the unknown-recording error. The migration probe drives the
legacy mismatch rejection, the successful migration, its idempotent repeat, the
orchestration path, a fresh Flow with no Subflow, and the Subflow-graph
rejection. The approval probe drives the full recording → normalize → review →
mine → learn → propose → approve pipeline, then repeat approval, a policy
override, both `requireExisting` rejections, a cross-project target Flow and an
unknown proposal.

Two of them additionally assert **dispatch identity**: the probe replaces a
public method on the service instance with a counting wrapper and checks the
wrapper was seen from inside the moved body. `sawOverride: true` on both sides
for `getFlowSubflow` (step 3) and `saveFlow` (step 4).

Transcripts at `<scratchpad>/asfacade-r7-{evidence,proposals,subflow-migration,approval}-transcript.txt`;
the probes are kept at `<scratchpad>/asfacade-r7-*-probe.test.ts.kept` and are
**not** in the tree, nor is the baseline copy of `service.ts` they import.

**Ratchet** — recorded `file-lines 8663` / `class-methods 232`; now 7,758 and
230, reported by the audit as "2 baseline entries can be lowered".
**`pnpm structure:baseline` was not run**, per the brief.

## Not verified

- **`pnpm check`, `pnpm test`, `pnpm build` at repository scope.** Not run.
- **The built `dist/`.** Not rebuilt; the resolved export set is provably
  identical and every collaborator field on the facade is `private`.
- **`apps/web` and the downstream extension repository.** Out of scope.
- **Live browser behaviour.** Nothing here is browser-side.
- **`prepareArtifactDocument`'s object-reference branch** (round 3; unchanged).
- **`pnpm structure:baseline`.** Not run, per the brief.
- **Separate commits.** Round 7 snapshots are
  `<scratchpad>/asfacade-service-r7-step0.ts` (at 4787780) through `-step4`,
  one per step. Each extraction script reads line ranges from the AST of the file
  it is given and refuses to run if its target directory already exists, so a
  replay is either clean or refused — it cannot append twice.
- **`pnpm check`, `pnpm test` at repository scope, round 7.** Only
  `packages/fluxiq` `tsc` and `scripts/structure-audit.mjs` were run
  repository-wide; the test scope was `src/programs/automation-studio`.
- **Whether the two deterministic `service.test.ts` failures are worth fixing.**
  They pre-date this round and this phase's brief does not cover them. I
  established only that they are deterministic at HEAD and unchanged by round 7.

## Open questions or contradictions found

### 0. Probe leakage was committed in round 5 — `ce7e38b` — and should be removed

Running a probe in **memory mode** constructs the service with no `dataDir`, and
`AutomationStudioProjectPaths(undefined)` then resolves to paths relative to the
package rather than to a temporary directory. Round 5's probes therefore wrote
runtime artifacts into `packages/fluxiq`, and `ce7e38b` committed them:

```
packages/fluxiq/indexes/pipeline.json                                    (+23)
packages/fluxiq/recordings/recording.probe/recording.json                (+30)
packages/fluxiq/recordings/recording.probe/derived/index.json            (+25)
packages/fluxiq/recordings/recording.probe/snapshots/initial-state.json   (+4)
packages/fluxiq/recordings/recording.probe/timeline.jsonl                 (+0)
packages/fluxiq/recordings/recording.probe-unavailable/derived/index.json (+24)
```

That is my defect, from an earlier round, and none of it is source. **Round 7's
own leakage was cleaned up before reporting**: `packages/fluxiq/indexes/pipeline.json`
was restored with `git checkout --` and the four `recordings/recording.{approval,
mapped,mining-probe,unmapped}/` trees were deleted; `git status` is clean apart
from this round's source changes. The six paths above are *tracked*, so removing
them is a commit, which is yours to make. They contain only synthetic probe data
— no recorded page data, no tokens — but they should not be in the repository.

### 1. The runtime/LLM side is genuinely entangled — measured, with the graph

Thirteen fields, 28 methods seeding them, and the union closes at **71 methods,
2,834 lines, 43 of them public — 31% of the whole class.** As one collaborator
that is five times the method limit and three times the line limit; it is not a
cut, it is a second service.

It cannot be subdivided along the fields either, because **13 methods each touch
several of them at once** (1,142 lines in total):

| Method | Lines | Fields it touches |
| --- | --- | --- |
| `runRuntimeSession` (public) | 265 | ioRuntime, nativeNodeRuntime, hostRuntime, runtimeService, runtimeAbortControllers, adaptiveRuntimeAdmissions, revokeLlmExecutionGrant |
| `generateFlowBootstrapAdaptation` (public) | 241 | nativeNodeRuntime, llmProviderResolver, llmEvidenceRuntime, revokeLlmExecutionGrant |
| `maybeAnnotateRunDetailWithRuntimeLlm` | 305 | llmProviderResolver, llmEvidenceRuntime, reusableLlmContextEnabled |
| `processFinalizedRecording` (public) | 113 | ioRuntime, nativeNodeRuntime |
| `createRecordingFlowProposals` (public) | 98 | ioRuntime, nativeNodeRuntime |
| `bindLlmExecutionProvider` (public) | 10 | llmProviderResolver, revokeLlmExecutionGrant, closeLlmExecutionGrants |
| 7 more | 110 | mostly the three `reusableLlmContext*` fields together |

`runRuntimeSession` is the hub: one 265-line public method wiring seven fields.
Every pairwise overlap in the graph runs through it or through
`generateFlowBootstrapAdaptation`. There is no boundary between "IO runtime" and
"native node runtime" and "LLM grants" to draw, because the same method needs all
of them in one call.

**What a cut would need**, stated plainly so the plan can decide rather than
guess:

1. **Split `runRuntimeSession` itself first** — 265 lines, seven fields, public.
   Until that method is decomposed into phases with explicit inputs, the runtime
   side has no seam. That is a behaviour-bearing refactor of the single most
   central method in the program, not a mechanical relocation, and it deserves
   its own dispatch with a scenario probe written *before* any edit.
2. **Or accept a runtime collaborator that owns all thirteen fields** and carries
   71 methods, which needs the class-method limit raised for one file, or a
   directory of classes sharing mutable state through a context object — the
   shape this work has deliberately avoided since round 2.

My recommendation is neither, for now: **stop here.** The one genuinely separable
piece on that side is the **reusable LLM context** trio (6 methods, 74 lines, one
outward call to `packReusableLlmContexts`), which is small and self-contained and
would make a fine opener if the plan ever returns to it.

### 2. What is left, measured as composition rather than as clusters

`service.ts` is **7,758 lines**. Measured from the AST:

| Part | Count | Lines |
| --- | --- | --- |
| Public methods, thin (≤ 4 lines) | 56 | 169 |
| Public methods still carrying a body | 122 | 3,496 |
| Private methods | 52 | 1,490 |
| Class fields, constructor, wiring | — | 326 |
| Top-level helper functions still in the file | 119 | 1,493 |
| Top-level type declarations | — | 307 |
| Imports, re-exports, blank lines | — | 477 |

The class itself spans lines 670-6,150. The **119 remaining top-level helper
functions** are the part this phase has not touched at all: they are 1,493 lines,
nearly a fifth of the file, and each one belongs to whichever body reaches it.
Round 7's first step moved 24 of them in a single cut because one body owned them
all; that is the shape to look for next.

The next movable public bodies, after the five runtime/LLM ones named above:

| Body | Lines |
| --- | --- |
| `deleteRecordings` | 78 |
| `applyFlowGraphPatch` | 74 |
| `reviewFlowAdaptation` | 72 |
| `listFlowSubflowSummaries` | 66 |
| `listFlowInstructionSummaries` | 58 |

Round 6's cluster table (recording state indexes, recording domains, the
`projectDatabasePool` remainder, legacy retirement, the `objectStore`
remainder) was **not re-measured this round** — round 7 worked on bodies, not
clusters — so those outward counts are as of `baeb000` and three of the five
groups have had methods change around them since.

### 3. The floor — I had this wrong in round 6, and the arithmetic is now measured

Round 6's version of this section said roughly 4,000 lines of public method
bodies had to stay, and concluded the 800-line limit was unreachable without
changing the public API. **The first half of that was wrong**, and the dispatch
was right to say so: a public body is not pinned to the facade by being public.
Moving one out and leaving a pure forward is a different operation from moving a
method, and round 7 did it three times for **905 lines**.

What the corrected arithmetic says:

- 178 public names is still the floor, and it is a floor on *names*, not on code.
- As a pure forward each costs three lines, so **178 delegations are ~534 lines**
  of irreducible class body.
- Add the fields, constructor and collaborator wiring (**326 lines today**) and
  the import block (**~250 lines**, growing slowly as collaborators multiply).
- Types and helper functions are not irreducible at all: the 307 type lines and
  1,493 helper lines can move with the bodies that own them, as rounds 5 and 7
  both showed.

So the realistic floor for `service.ts` as a facade over collaborators is
**roughly 1,100-1,400 lines**, not the 6,500-7,000 I projected in round 6. That
is still above the 800-line limit, and the gap is exactly the 178 delegation
stubs — so the conclusion that the limit needs either a smaller public API or
several services survives, but the distance is about **1.5x, not 8x**, and
everything between here and there is ordinary extraction work rather than a
product decision.

The honest caveat: the five runtime/LLM bodies are 475 lines and the knot around
them was measured at 71 methods / 2,834 lines. Getting to the floor above means
that knot comes apart, and nothing in rounds 6 or 7 found a way to cut it.
