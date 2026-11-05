# w6: the known-parts shortlist, the `core.run_part` offer rule, the draft save and two gaps

Outcome: Done, with one seam the lead must close in `service/project-build/run.ts` (not owned) for `knownParts` to reach `project.read_task` in a real project build. Everything else is wired and tested. Nothing committed.

## What the model sees

One generic line and up to five cards, as `knownParts` beside what the free first look already holds:

```
knownParts: { note: "Parts this project already saved that may fit. A match is only a suggestion and nothing runs unless you ask it to. A part with fixed values does that exact item, whatever you give it.",
              parts: [{ partId, version, name, purpose, sites, inputs, outputs, fixedValues, lastingClasses, trust }] }
```

`partId` and `version` are added to the brief's field list: `core.run_part` needs them copied exactly. The note names no site, task, product or answer. The cards are this project's own (the store is per project), reach no shared prompt or system instruction, and travel only as evidence in the opening look.

- **Order:** parts on the start location's origin first, then parts the person's words matched (SQLite full-text rank, best first), then the order found. Up to 5, each once.
- **Never offered:** an unproven part with lasting classes (card trust), and any part with a lasting class the request did not allow (`permittedConsequences`).
- **Nothing to offer, nothing added:** no `knownParts` key, no extra tool, not one more byte.
- **Answer-first:** `knownParts` rides in the first opening look of the first round only (the `initial.*` call), and only when that look was not refused.
- **Project builds:** `knownParts` is in the `project.read_task` answer (seam below).

## Exact seam lines

| File | Change |
| --- | --- |
| `framework/automation-service/service.ts` line 1574 | `runHarness, trialEnvironment, parts: this.projectParts } : undefined;` (same line) |
| `framework/automation-service/service.ts` line 1570 | `baseSettingsRevision: binding.settingsRevision, parts: this.projectParts }); else if (authoringMode` (same line, the answer-first attempt input) |
| `service/answer-first/attempt/contracts.ts` | one optional member: `parts?: Pick<AutomationStudioProjectParts, "runAs" \| "shortlist" \| "saveDraft"> \| undefined` (not in my owned list; the smallest way to carry the library to the attempt) |
| `service/answer-first/attempt/run-attempt.ts` line 48 | `const input = await automationStudioAnswerFirstKnownParts(given);` (parameter renamed `given`, import on line 30) |
| `service/answer-first/attempt/draft-save.ts` line 34 | `await input.parts?.saveDraft({ ... });` after `drafts.save`, inside the existing `try` |
| `service/project-build/brief-ports.ts` line 282 | `const runPart = project.parts && await automationStudioProjectBuildKnownParts(project, { projectId, startLocation }) ? ...bundle... : undefined;` |

`service.ts` is still 4304 lines and no statement was added. Nothing in `round.ts` changed: the first look is shaped by wrapping the first-round `harnessOptions.executeTool`, which the attempt input already carries, so t869 and t870 are not touched.

### The seam for the lead (run.ts is not mine)

`project.read_task` reads `ports.knownParts?.()` (new optional member of `AutomationStudioProjectSupervisorPorts`, `() => Promise<JsonObject | undefined>`, never rejects). In `service/project-build/run.ts`, in the `ports: { ... }` literal of `runAutomationStudioProjectSupervisorLoop` (about line 295), add one member:

```ts
knownParts: () => automationStudioProjectBuildKnownParts(project, { projectId: draft.submission.projectId, startLocation: draft.submission.startLocation }),
```

(import it from `../project-parts/index.ts`; a cast `as Promise<JsonObject | undefined>` may be needed). It is memoised on the `project` object, so the supervisor's look and the briefs' tool offer (`brief-ports.ts`) are one read and agree. Until then the supervisor's look is as it always was, and the builders already get the offer rule.

## Decisions

1. **Offer rule.** `core.run_part` is offered iff the shortlist is not empty, decided at the start: for a project build, the first brief (or the supervisor's look) memoises the read for the build; for answer-first, `run-attempt.ts` decides before round 1. A project with none keeps the very same input object (answer-first: `toBe(given)`, tool bytes compared) and `runPart` stays `undefined` in the brief registry as before the library existed.
2. **Answer-first tool list** is composed, not rebuilt: a registry holding only the library's bundle yields the `core.run_part` tool and its executor, appended to the existing binding's tools, routed by tool id. This avoids needing the service's `buildId`. The bundle is `automationStudioProjectBuildRunPartBundle` (unedited), with a per-attempt `done` set.
3. **Library failures are not swallowed at call sites.** The structure audit refuses `.catch(() => undefined)`. `shortlist()` and `saveDraft()` never reject: they trace the error's name (`known-parts`, `save-draft-parts`) and return a typed result. Callers just await.
4. **Draft save** (`service/project-parts/draft-parts.ts`): the draft's plan goes through `normalizeAutomationStudioFlowBuildPlan` (adaptation id `draft.<candidateId>`, a blank parent Flow shell) and then the unchanged `saveProjectPartsOfAppliedFlow`, with no graph revision. A primary part stays `part.primary_not_explicit`. Same part id as the applied copy (Flow id plus the plan's symbolic key). Its signature is untouched.
5. **Gap 5, sources.** `project_part_version_sources (part_id, version, graph_flow_id, revision null)` added to `0026_sa_project_parts` in place (id kept), unique on `(part_id, version, graph_flow_id, ifnull(revision, 0))`, `insert or ignore`, written in the same transaction as the version, and on `existing` (both the pre-check and the raced path) in its own transaction. New `store.listVersionSources`. Versions stay immutable (triggers untouched). `stores.ts` (`cardOf`, used by `list`, `get` and the shortlist) reads judgement rows from the version's own graph plus every source.
6. **Gap 6, fixed value in a control.** `card/target-leaves.ts`: the default `targetWords` is every string leaf of the target at any depth, under any key, with no web vocabulary; leaves with no letter or digit, or shaped like a locator or markup (`#[]>=/\{}<`), are dropped. In `fixed-values.ts` a target leaf counts only when it **occurs whole** in the request (word boundaries, case-insensitive), and is never listed unless it does. A leaf is exempt when the step is lasting (non-empty `declaredConsequences`) and the leaf is a whole-word part of that step's own `label`: "Save" pressed with label "Press Save" and request "save the job" does not refuse; a non-lasting step that opens "Red Shoes" with request "add the red shoes" makes a lasting part refuse (`part.fixed_value_from_request`). Typed literals keep their old substring rule.

## Limits of the item 6 heuristic

- The exemption needs the lasting step to carry a label that holds the leaf. A lasting step with no label, or whose label also holds the item ("Remove Red Shoes" with the item as a leaf of its target), is treated by the label rule only; the item usually also appears in an earlier non-lasting step, which still refuses.
- Leaves are not typed, so an id or tag name that is a whole word of the request ("button", "go", "input") counts. That fails closed (a lasting part is refused, never saved wrongly). The existing derive-card test line that expected no control text by default was updated to the new default (`arrayContaining`), and its lasting expectation split into own-label (kept) and renamed-step (refused).

## Commands run and observed

From `packages/fluxiq` of the t866 Core worktree:

- `pnpm.cmd exec vitest run src/runtime/project-parts/shortlist src/runtime/project-parts/card src/runtime/project-parts/trust src/framework/automation-service/service/project-parts/tests src/framework/persistence/automation/project/parts src/framework/automation-service/service/answer-first/attempt/tests src/runtime/project-agents/supervisor/tests/read-task --minWorkers 1 --maxWorkers 2` -> `Test Files 13 passed (13)`, `Tests 83 passed (83)`. New: shortlist 5, target-leaves 4, known-parts 9, draft-parts 3, draft-save 3, read-task 2, store sources 1.
- `pnpm.cmd exec vitest run src/framework/automation-service/service/project-build/tests/project-build-brief-ports.test.ts --minWorkers 1 --maxWorkers 1` (real service, `parts: this.projectParts`, empty library) -> `Test Files 1 passed`, `Tests 9 passed (9)`.
- From the Core root: `pnpm.cmd --filter fluxiq check` -> no `error TS` (the build-cache line only; the first runs found my own errors, fixed).
- `node scripts/structure-audit.mjs` -> 4 violations, all in `project-parts/run/**` (the other worker): `as-never` in `driving-gate.test.ts`, `part-rows-harness.ts`, `row-recheck.test.ts`, and an `imports` reach in `run/driving-gate.ts`. None in my files; my first run's findings (`as-never`, `failure-as-empty`, `swallowed-failure`, `imports`, `naming` for a third `save-` file, supervisor `tests/` at 26 files) were fixed.

## Not verified

- `knownParts` in a real project build's `project.read_task`: the helper, the port and the read-task code are tested, but `run.ts` does not pass the port yet (seam above). The brief-side offer through a real service was only run with an empty library (nothing offered), not with a seeded part.
- `core.run_part` called by a model in an answer-first attempt, and through `evidence-loop`, was not run. The answer-first tool is proven by its tool list, its executor routing for other tools, and the first-look evidence, with fakes.
- **A part's landed acts in answer-first.** The attempt's act record is not told what a part's steps landed (`landed` is a no-op there); the only repeat guard is the per-attempt `done` set (same version and values). The permission check of the loop still gates each lasting step. Worth a decision before a live answer-first run offers a lasting part.
- The draft save was tested with a real store and a two-subflow plan, and `draft-save.ts` with a stubbed completion check; not through a real attempt. The applied-copy path that adds a source was exercised through two `saveProjectPartsOfAppliedFlow` calls, not through a real apply.
- Reading `project_part_version_sources` rows already written by a pre-edit copy of the migration: none exist outside worktrees.
- No browser, no Lab, no provider calls. Full suites were not run.

## Open questions

1. Close the `run.ts` seam (above), or tell me to.
2. Should answer-first record a part's landed acts in the attempt's act record? It needs a mapping from the runner's landed acts to `AutomationStudioAttemptActCall` identities that I did not invent.
3. `structure-audit` is red only on the other worker's `run/**` files.
