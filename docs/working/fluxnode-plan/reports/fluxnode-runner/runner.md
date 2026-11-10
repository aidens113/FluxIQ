# P2b FluxNode runner: worker report

Worker: worker-heavy (Opus 5.5). Worktree `fxwork/t886/!FluxIQ`, branch `task/t886-fluxnode-runner`. Nothing committed.

## Outcome

Done. Each FluxNode run is one Answer First attempt. The runner calls `service.generateFlowBootstrapAdaptation(request, callerOptions)` and does not copy the attempt loop.

`FluxNodeService` signatures are unchanged. `fluxnode-service.ts` was not edited.

All acceptance tests (a) to (f) pass, plus extra tests for register, idempotency, resume, list, export and explore mode. The typecheck's only error is in the HTTP lane's test fake (see below). The structure audit passes.

## The factory call a server makes

```ts
import { createFluxNodeService } from "../../framework/automation-service/service/fluxnode/index.ts";
// in run-command.ts, passed to runDev as RunDevOptions.createFluxNodes:
createFluxNodes: (fluxiq) => createFluxNodeService({ service: fluxiq.programs.automationStudio, domainId: fluxiq.activeDomainId })
```

Optional fields on `FluxNodeServiceSource`:

| Field | Default |
| --- | --- |
| `modelCaller` | `{ actorUserId: "fluxnode.owner", actorSessionId: "fluxnode.open-mode" }` |
| `startLocationOf(spec)` | `spec.start` |
| `personWaitMs` | 10 minutes |
| `stopWaitMs` | 30 s: how long `stop` waits for the run to end before it answers |
| `now` | the system clock |

The barrel also exports `runFluxNode(context, run, registered, resumeHandle)`.

## What changed and why

### Engine seams (owned paths)

**`flow-bootstrap-commands/contracts.ts`.** `AutomationStudioAnswerFirstCallerOptions` gains `inputs?: Readonly<Record<string, JsonValue>>`. This is the inputs value seam.

**`answer-first/caller/options.ts`.** Reads `inputs`: it refuses anything that is not a JSON object and keeps a copy.

**New: `answer-first/flow-run/input-bound-steps.ts`.** This is the static rebinding check. It uses no model.
- It changes every fixed step value equal to an input's value into `{"$state":{"path":<input>,"fallback":<value>}}`. That is the same stored form a model's `$input` binding takes, and the engine resolves it against `options.inputs`.
- Text matches anywhere in `parameters`. A number matches only when it is a step's own top-level parameter.
- It skips:
  - a step's own settings (`recordOutput`, `ensureState`, `expectedState`, `retry`);
  - values that are already bound;
  - a value that two inputs share;
  - input names the draft rules refuse (`/^[a-z][A-Za-z0-9]{0,31}$/`, or `item`).

**`answer-first/attempt/draft-save.ts`.** One statement, at the start: with `caller.inputs`, `run.steps` are rebound before assembly. The draft and the task memory's saved steps therefore both hold the bindings, because `remember` runs after draft-save and reads `run.steps`.

**`answer-first/flow-run/flow-run.ts` and `ports.ts`.** `gatedOptions` passes `caller.inputs` as the engine run's `inputs`. `ports.input` now also picks `caller`. `flow-stage.ts` already passes the whole attempt input, so `flow-stage.ts` itself is untouched.

**`service.ts`** is untouched (still 4304 lines).

### Runner: new files under `service/fluxnode/`

**`create-fluxnode-service.ts`.** The factory and the endpoint logic.
- `register` is idempotent: it answers `created` and `previousSpecHash`.
- `start` accepts a spec (registered on the way), a name with an optional `specHash`, or a `resumeHandle`.
  - It checks the inputs against the registered spec with `checkFluxNodeRunInputs` and `fillFluxNodeGoal`, and refuses with `invalid_inputs` and issues.
  - It handles `idempotencyKey`: the same key with the same canonical request returns the same run; a different request is `idempotency_conflict`.
  - It returns `running` at once.
- `get`, `events`, `answer` (`unknown_event`, `event_already_answered`, `answer_mismatch`, `run_ended`), `stop` (`run_ended`), `list` and `exportFlow`.
- `request.pipeline` is refused with `invalid_request` and the message "not available on this engine yet", in both `register` and `start`.

**`owner-flows.ts`.** One owner project, "FluxNodes", found by its name and a description mark, or created on first use.
- There is one Flow per name and spec hash. Each Flow carries `metadata.fluxNode = { name, specHash, flowPath, spec }`, where `flowPath` comes from `fluxNodeNameToFlowPath`. There is no folder table.
- After a restart the registry is rebuilt from that metadata.
- The goal, filled with `fillFluxNodeGoal`, is saved as the Flow's instruction, `instruction.fluxnode.<flowId>` (one per Flow), only when its words change.
- Registration is serial.

**`caller-options.ts`.** Builds the caller options:
- `taskKey` is `fluxnode:<name>:<specHash>`. Inputs never change it.
- `mode: explore` uses `…:explore:<runId>`: it starts fresh and keeps the old task's learned Flow.
- `model`, `budgetUsd` (0 is passed through), `check` (the bridge) and `personAsk` (the sink).
- `scope`:
  - `change` → `modify_existing` + `create_new`
  - `send` → `send_or_publish`
  - `money` → `move_money`
  - `delete` → `delete`
  - sites are passed as they are.
- `inputs`.
- Judge mapping: with a type and no developer check, `auto` becomes `always`. The type is checked first, then the judge, because `auto` means "judge when there is no developer check".

**`run-fluxnode.ts`.** Runs one attempt.
- Its Stop calls `buildCancellation.cancel(projectId, flowId)`, retrying every 25 ms until an attempt is registered to cancel or the attempt is over.
- `timeoutMs` is a Stop on a timer.
- Activity-hub rows for the Flow become `step` events.

**`events/check-bridge.ts`.** The caller check.
1. It builds outputs from Core's summary.
2. It runs `validateJsonValue` against the declared type. Failure is a "no" naming at most 5 errors, and the program is not asked.
3. With `hasCheck`, it raises `check_needed` with the outputs and inputs and awaits `check_answer`. `pass:false` returns the program's reason as the "no".

It keeps the last outputs that passed (with their lineage and what passed them) and the last "no".

**`events/person-sink.ts`.** A person-only moment raises `person_needed`.
- `need` is `human_check`, `confirm` or `other`. `reason` is Core's ask text. `waitUntil` is the smaller of now + `personWaitMs` and the ask's expiry.
- It awaits `person_answer` until `waitUntil`.
- `done` maps to Continue (`person_done`), grant, or text. `declined` maps to Stop or deny.
- No answer leaves the attempt `waiting_for_person`.

**`events/event-stream.ts`, `events/step-events.ts`.** Stored events first, then live ones, ending after `ended`. An aborted reader signal ends the reading, not the run.

**`fluxnode-run.ts`.** Holds one run's state:
- events with `seq` from 1, and `cost` then `ended` last;
- waits, which a Stop or the end settles with no answer;
- the Stop;
- the `state()` and `summary()` bodies.

**`run-registry.ts`.** **In memory**: runs, idempotency keys, resume handles, the learned-version count and pins.
- Runs of the same Flow are serialized, because an attempt holds its Flow while it builds. Different Flows run in parallel.
- The resume handle is `resume.<runId>`. Only `budget_out` and `waiting_for_person` runs can be resumed. A resume is a new run with the same FluxNode, spec, inputs, options and correlation id.
- `list` is newest first. The cursor is the last run on the page, and an unknown cursor gives an empty page.

**`result-of.ts`.** Maps the answer to the result.

| Attempt ending | FluxNode `status` |
| --- | --- |
| `achieved` | `achieved` |
| `confirmedBy: "none"` (today's `stopped_by_person`, or a later `achieved`) | `achieved`, verdict `unverified` |
| `budget_out`, `waiting_for_person` | the same |
| anything else | `stopped` |

- `verdict.by`:
  - `judge` when the attempt says the judge confirmed it;
  - when it says the check did, `check` or `type`, depending on what passed the bridge.
- A run that ended after a type or check "no" is `refuted` with that reason.
- Outputs:
  - when the check confirmed the result, the outputs that passed the bridge;
  - otherwise, made from the result's stored rows (paged in full) and its acts. A run that did not achieve returns outputs only if they fit the declared type.
- `outputsType` is inferred only when no output type was declared.
- `path`: `explore` → `explored`, `run_flow` → `replayed`, `run_flow_then_repair` → `repaired`, `run_flow_then_explore` → `explored`.
- Also set: cost (tokens = input + output), timings, the resume handle, `waitingFor` (a sentence for each attempt wait reason), datasets and correlation id.

**`outputs/shaped-outputs.ts`.** Builds outputs only from stored rows (cut to the stored columns), landed acts and inputs. Every value gets lineage.
- A row has `source: read`, with `readId <dataset>.<row>` and `stepId read.<dataset>`.
- An input has `source: input` at `/name`.
- With a declared type:
  - an array is every row, cut to the item's properties;
  - an object takes each property from: an array property's rows, an input of the same name, or a field of the single row (matched by column id or label);
  - a scalar is the single value of the single row.
  - Text that reads exactly as a number or boolean is taken as that type.
- With no declared type: `{ records, acts }`, each only when non-empty.
- Over 1000 lineage entries, they are merged per top-level output.

**`outputs/inferred-type.ts`.** The narrowest schema in the contract subset that the outputs fit.

**`outputs/stored-rows.ts`.** Pages the run dataset through the trial collaborator registry, imported from its own module because the barrel import closed a cycle.

**`flow-export.ts`.** The export in the contract's format, with:
- `flow = { artifact: <getFlow>, learnedDraft?: { candidateId, revision, digest } }`;
- `flowVersion` = the number of distinct drafts saved in this process (at least 1);
- `pin` recorded.

### Tests

New: `fluxnode/tests/library-lane.ts`, a fixture.
- It adds one node to the lending library: "Find loans" by title, a read whose rows depend on its parameter.
- The node works both by hand and through the engine. The engine's runs record which title they ran with.

New: `fluxnode/tests/fluxnode-runs.test.ts`, which covers (a) to (f) plus the type "no".

New: `fluxnode/tests/fluxnode-registry.test.ts`:
- register, the not-found refusals and `invalid_inputs`;
- pipeline refused;
- idempotency;
- budget 0 → `budget_out` → resume;
- list with cursor;
- export with pin;
- explore mode.

New: `answer-first/flow-run/tests/input-bound-steps.test.ts`.

Extended: `answer-first/caller/tests/options.test.ts`.

## Commands run and observed results

**Free memory** before each heavy command: 1.15, 3.51, 2.58, 3.43, 4.11 GB. Every tsc ran with `--max-old-space-size=4096`.

**Acceptance run.** From `packages/fluxiq`:
`node ../../scripts/vitest-groups.mjs --groups=parallel,real-sql src/framework/automation-service/service/fluxnode src/framework/automation-service/service/answer-first/caller src/framework/automation-service/service/answer-first/flow-run src/framework/automation-service/service/answer-first/attempt/tests/draft-save.test.ts src/framework/automation-service/service/answer-first/attempt/tests/caller-seams.test.ts`
- parallel: `Test Files 7 passed (7)`, `Tests 25 passed (25)`
- real-sql: `Test Files 12 passed (12)`, `Tests 89 passed (89)`
- `[vitest-groups] all groups passed: parallel, real-sql`

**After adding the explore test**, `--groups=real-sql …/fluxnode/tests/fluxnode-registry.test.ts`: `Tests 5 passed (5)`, `all groups passed: real-sql`.

**What the acceptance tests prove.**
- **(a)** `status: achieved`, `path: explored`, `verdict {confirmed, by: check}`.
  - Outputs equal `{loans:[{title:"Atlas of Rivers",due:"2030-01-01"}]}`, validated against a declared type with `format: date`.
  - Lineage is `/loans/0` → read.
- **(b)** Run 2 by name with `{title:"Clock"}`: `asked` is 0 (no provider request of any kind), `path: replayed`, cost `{calls:0,tokens:0,usd:0}`, outputs `Clockmaking`. The engine's "Find loans" ran with exactly `["Clock"]`.
- **(c)** The first check answers `pass:false` with a reason. The next decision's evidence contains that reason, the second check passes, the run is `achieved` by `check`, and there are 0 judge calls.
- **(d)** Judge `off`, no check, no type: `achieved`, `unverified` with no `by`, 0 judge calls, outputs `{records:[…]}` with the inferred `outputsType`.
- **(e)** Stop during the run: `stopped`, no resume handle, `stop()` answered `state: stopped`. A second stop or answer is refused `run_ended`.
- **(f)** Every event passes `parseFluxNodeRunEvent`, `seq` is 1..n, there is exactly one `ended` and it is last. Results pass `parseFluxNodeRunResult`, and states pass `fluxNodeRunStateSchema`.

**Typecheck.** `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit --incremental -p tsconfig.json` gave `TSC_EXIT=2`. The only error is **not mine**:
- `src/server/fluxnode-api/tests/fake-fluxnode-service.ts(58,11): error TS2719`.
- The HTTP lane's fake `register` returns `{ specHash, flowPath, created }` with no `name`, which `fluxNodeRegisterSpecResponseSchema` requires.
- Earlier runs also showed one error of mine each (a missing wait-reason index, then a test helper's type). Both are fixed, and no error remains in my paths.

**Structure audit.** `node scripts/structure-audit.mjs` (worktree root) gave `structure-audit: passed (535 warning(s), 1095 baselined).`
- The first run failed on an `as never` in my test and an import cycle (`stored-rows.ts` → `trial-ports/index.ts` → … → `service/index.ts` → `fluxnode/index.ts`). Both are fixed.
- One advisory warning remains on my paths: `answer-first/flow-run/` has 18 files (15 is the advisory threshold).

## Not verified

- **Not tested end to end:** `person_needed` and `person_answer`. The fake library has no person-only check that reaches the attempt's sink. The mapping is unit-shaped code only.
- `timeoutMs` (a Stop on a timer) is not tested.
- The repair path, where a replay fails and the rounds re-run saved steps through `core.run_flow`, is not covered: the rounds' draft replay is not owned here. It resolves bound inputs to their default (the value the Flow was learned with), not this run's value. A repaired run with new inputs may therefore act on the old value.
- Pinned replay is **not enforced**. No seam replays a given Flow version or holds repairs as proposals, so `pin` is only recorded and returned in the export.
- The export's `flow` holds the stored Flow artifact and the latest draft's id, revision and digest. The draft's build plan is not included: the candidate draft store is private to the service. After a run that proves the whole Flow, the learned steps are applied to the artifact.
- `retries` is resolved but not passed on: there is no caller seam for it, and the engine's floor of 3 applies.
- Run records, idempotency keys, resume handles and pins live **in memory** and are lost on restart. Specs and Flows survive, through the Flow metadata.
- `startLocationOf` defaults to `spec.start`, but the tests pass `() => undefined`, so the default is untested. With a start location, the assembly requires a step that reaches it, and the fake's steps are not checked against `library://account`.
- No live run, no Lab run, no browser. No full `pnpm check` or `pnpm test`, and no Core-wide vitest run.

## Open questions or contradictions found

1. **Step event wording comes from the chat's activity rows.** `step` labels are Core's activity titles (Core's words, cut to 200 characters). If activity titles ever quote page text, they would reach the program. The chat already shows them.
2. **A Core failure ends the run `stopped`.** A throw from `generateFlowBootstrapAdaptation` (Core failing, not the task) ends the run `stopped`, after a `failed` step event that names only the error's kind. The contracts have no other shape for it.
3. **Explore mode's Flow never becomes the auto Flow.** It runs under its own task key, so its result never replaces the task's learned Flow that `auto` replays. A test confirms this. If the plan meant explore to become the new learned Flow, the attempt's route needs a "build" override; that is not a caller seam today.
4. **Rebinding is by exact equality.** An input value that happens to equal an unrelated parameter is bound too, and a substring (for example "Atlas" inside "Atlas of Rivers") is not. This is as the brief specified. A partial match would need the model.
