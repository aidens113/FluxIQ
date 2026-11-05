# w4: run a saved part with inputs, at zero model calls, behind a guard

## Outcome

Done, with `core.run_part` built and tested but not yet offered to a live build (one line in `service.ts`, which this brief does not allow; see Seams). Nothing committed. The headed proof on job-board passes against a real service, a real browser and a part saved from a real scripted build.

## Mechanism chosen: a stop point at the step boundary, on the run's control gate

`options.runControl.checkpoint({ nodeId, step })` is asked once per step, before anything is dispatched, in every frame (Call Subflow passes it on through the boundary, and handler bodies too). The runner passes a gate of its own (`project-parts/run/step-gate.ts`) wrapping the person's gate. For a step whose node declares or resolves to something lasting, it holds, checks, then goes on from the same place with everything the run computed:

1. The step's classes are all within what was asked (strict, including a class the definition's trusted floor adds that the card did not name).
2. The permission gate answers: a person's run gets its own `AutomationStudioActionPermissionGate`; a build's run passes the check the loop handed the tool, the same check `core.run_node` passes a domain.
3. The first time only: the step's own target, `visible`, zero-wait, plus its recorded `routeSignatures.before` when it has one.

The first no stops the run with the step undispatched, and the stop is sticky, so a retry of the enclosing call stops too.

**Why not an inserted check node.** A state route or an `on failed` route can reach a lasting step by an edge the check node is not on, while no route reaches a step without the gate being asked. It would also need a new node definition, which would then appear in the catalog offered to the model. **Why not `stopAfterNodeId` then continue:** it is root-only, and a part's steps run in a child frame. The gate also looks inside calls by construction: a call step is not judged, and the callee's first lasting step is the one checked.

The hold is silent (`heldQuietly`, a new optional member of `AutomationStudioRunControlGate`, read in one line of `graph-run.ts`), otherwise the person would see "Paused" flash on every lasting part. A person's own pause still says so.

**`visible`, not `exists`, was a correction the live run forced.** My first version asked `exists`. On My jobs every row has a look-alike heart, the host answers `exists` true for an ambiguous target, the re-check passed, and four `web.dom.click` commands were sent. They failed as ambiguous, so nothing was pressed, but only because the domain's own resolver refused. `visible` answers `unknown` on ambiguity, and the start check derived from the first step now asks it too (`card/start-check.ts`). This changes w2's condition and so its digests; no version is stored outside this worktree.

## Exact shapes

`POST run-project-part`, `runtime.control`, `authoring`, `studio:RunProjectPart`, narrowed for a paired client to these seven fields:

```ts
{ projectId: string; partId: string; version?: number; inputs?: Record<string, JsonValue>;
  permittedConsequences?: string[]; acknowledgedRepeat?: boolean; newRunId?: string /* UUID */ }
```

Answer, as the payload of an ordinary successful response:

```ts
{ runId: string;
  status: "succeeded" | "failed" | "stopped" | "cancelled";
  outputs: Record<string, JsonValue>;            // by port id
  rows?: { runId: string; datasets: { datasetId: string; rowCount: number }[]; unread?: true };
  stoppedAt?: { stepLabel: string; reason: string };  // plain words only
  acts: AutomationStudioAttemptActClass[];       // classes that landed
  modelCalls: 0 }
// or, with nothing done
{ refused: true;
  code: "part.not_found" | "part.wrong_site" | "part.not_at_start" | "part.input_missing" | "part.input_unknown"
      | "part.act_not_allowed" | "part.confirm_repeat" | "part.calls_not_available" | "part.repeat_refused"
      | "parts.unavailable" | "parts.run_id_refused";
  message: string; classes?: AutomationStudioAttemptActClass[] }
```

Rows are read with the run's existing dataset endpoints. Relay: `AUTOMATION_PANEL_MESSAGES.runPart` (`fluxiq.panel.runPart`) sends exactly those fields; `projectId` is the relay's.

Service: `AutomationStudioProjectParts.run(request)` (a person), `.runAs({ ...request, caller, signal?, permission?, repeated? })` (the one runner; also hands back `landedActs`, `partId`, `version`). Guard: `automationStudioPartGuard({ card, snapshot, asked, page })` in `runtime/project-parts/guard/`. Tool: `core.run_part` with `{ partId, version?, inputs? }`, answering `{ ok, status, outputs, acts, stoppedAt? }` or `{ ok: false, code, instruction }`.

Guard order: not found; unknown input; missing input; lasting class not asked; site; start; confirm repeat. The repeat question comes last so a person is only asked when nothing else stands in the way.

## Decisions

1. **The session belongs to the throwaway root, not the source Flow** (`flowId: part-run.<partId>.v<n>`, `metadata.partRun`). A part outlives its Flow, and its runs should not read as that Flow's runs. It is written directly rather than through `startRuntimeSession`, so it does not depend on the source Flow's instruction authority.
2. **Calls resolve now.** `part_calls` pins are followed (depth 8, as `get.ts` does), and each call step in the run-only copy names the copy of the version it pins. So `part.calls_not_available` is only answered when a pin cannot be read. A call step without a pin row also answers it.
3. **`part.repeat_refused` and `parts.run_id_refused` were added** beyond the guard's closed list. The guard's own seven codes are as asked; these two are the runner's, as `part.calls_not_available` is.
4. **The site is read as facts.** One anchored `url matches` per card site, in the same zero-wait batch as the start conditions, so the origin is exact and no page address reaches Core. Every site `false` is "another site"; any `unknown` is "could not be read"; both refuse.
5. **`selfArrives` still needs its exact site.** A part that navigates by itself is refused from another origin or a blank tab, as the brief's order reads.
6. **A build's ledger gets each act through `trialRan`,** with where it sat, as a subflow trial's. The loop's gate would also record one act per call from the last declaration it saw, so the tool declares a plain read after handing its acts over. Tested through the real `automationStudioFlowBootstrapActionPermissions`.
7. **The runner loads lazily** (`run/lazy-run.ts`), as `detached/subflow.ts` does, because the candidate-trial barrel sits in the service's own cycle through recovery.

## Item 5: does a real build enter the library?

Yes, and read steps were never the problem. A real scripted project build, applied through `reviewFlowBootstrapAdaptation`, saved both of its parts. Real read and wait steps carried what they need: `web.output.dom-extract_list` is stamped `declaredConsequences: []`, and Core's `builtin.timing.wait` is not acting. So I made no classification change: **no real step skipped as `part.unclassified_step`.**

The real defect was elsewhere: **every real part saved with no start check.** A real step's control sits under `selector` and `element`, not `target`, and nothing gave the save the domain's `controlParameterKeys`, so the card had `source: "none"` and every run of a real part answered `part.not_at_start`. Fixed at the cause:

- `card/control-target.ts`: the domain's control parameters, together, in the host's own target form (`{ selector, element }`). A binding names nothing, and a lone string is no durable target.
- `project-parts/control-keys.ts`: a save reaches the library by its pool alone, from the frozen `service.ts`, so the library adopts a reader per pool as it is built, the same pattern as the trial collaborators.

## What the spec proved

`apps/extension/e2e/content/tests/part-run/tests/part-run-job-board.spec.ts`, job-board, headed, a provider that throws after the build, site state read from the Lab's `/__control/final-state` and from My jobs. `1 passed (4.6m)` on the last run; the build is about 43s and the rest is browser and module start-up and teardown.

Timings of each call, quoted:

```
{"partRunMs":383,"code":"part.not_at_start"}      read part on My jobs
{"partRunMs":27,"code":"part.wrong_site"}         read part on another host
{"partRunMs":25,"code":"part.input_missing"}
{"partRunMs":13,"code":"part.input_unknown"}
{"partRunMs":6627,"code":"succeeded"}             read part
{"partRunMs":20,"code":"part.not_at_start"}       lasting part on the home page
{"partRunMs":19,"code":"part.not_at_start"}       lasting part among My jobs' look-alike hearts
{"partRunMs":21,"code":"part.confirm_repeat"}
{"partRunMs":23,"code":"part.act_not_allowed"}
{"partRunMs":4332,"code":"stopped"}               page moved to My jobs during the prefix
{"partRunMs":4313,"code":"stopped"}               page moved home during the prefix
{"partRunMs":9546,"code":"succeeded"}             lasting part
```

- **(a)** The read part with input `rust` returned 11 rows equal, in order, to what the board's own catalog says it renders (`searchPostings`, `pageOfResults`, `sponsoredFor`, one row of a duplicate pair), read back from the stored dataset. The page's `q` was `rust`. `modelCalls: 0`, provider calls 0.
- **(b)** Refused on My jobs and on the same board under another host. Each time the Lab's state is byte-equal before and after, the URL unchanged, and the only commands sent were `web.page.facts` and captures.
- **(c)** The lasting part was refused on the wrong page (two pages), without `acknowledgedRepeat` (message contains "change something that already exists" and "again"), with its class not asked, and with another class asked. The saved list was unchanged after each. With everything said: `status: "succeeded"`, `acts: ["modify_existing"]`, Lab `saved` gained exactly the target's key, My jobs lists it once. The board fails the first press of a page load, so two `web.dom.click` commands reached it: the automatic retry working.
- **(d)** The page moved during the prefix, twice. Quoted: `"stoppedAt":{"stepLabel":"keep the job","reason":"This step's control could not be told apart on the page just before it, so it was not done."},"acts":[],"commands":["web.page.facts","web.page.facts"]` (My jobs), and `"The page changed: this step's control is no longer on it, so it was not done."` (home). No `web.dom.click` was sent, and the Lab's saved list is unchanged.

Screenshots, both looked at:
- `apps/extension/e2e/test-results/content/artifacts/part-run-tests-part-run-jo-d93ce-ng-step-when-the-page-moves/after-stopped-run-my-jobs.png`: "2 saved jobs".
- `.../after-lasting-run-my-jobs.png`: "3 saved jobs", Senior Rust Engineer, Quillmark first.

## Seams needing the lead

**Offering `core.run_part` to a project build needs one thing:** at `framework/automation-service/service.ts:1574`, in the `project = projectLedger ? { ..., trialEnvironment } : undefined` object, add `parts: this.projectParts`. Same line, no new line. Everything below it is already wired: `project-build/types.ts` (`parts?`), `brief-ports.ts` (bundle, build-wide `partsRun`, ledger), `harness-options/binding.ts` (`runPart?`, only beside the library). I left it off because the brief limits `service.ts` to item 3, and because it adds a tool to every paid build's request, which the study puts in phase 5. Nothing needed `evidence-loop*`, `repeat-guard/**`, `bootstrap/**` or `client-gateway/**`.

Things that line will meet, read but not run:

1. `runtime/flow-authoring/bootstrap/action-permissions.ts:413-415`: in a project build a reversible lasting declaration asks `siteReset.createBaseline`, which reads `call.value.resetDestination`. The tool's schema has no such field, so a lasting part may be refused there and stop with the "not asked for" sentence. Either add the field, as `core.run_node` has it, or say that a lasting part needs the destination read first.
2. `runtime/llm/evidence-loop.ts:356` and `node-tools/dry-run-gate.ts:354`: `requireLibrarySteps` could refuse a legacy draft holding an off-library step, if a `core.run_part` call is drafted as one. A project build submits a script, so this reads as legacy-only.
3. The Flow itself cannot yet hold a step that calls a library part (phase 4 and 5): a build can run one in exploration and must still write the steps.

Service line changed for item 3: line 455 (constructor call, three ports) and line 217 (one import name). Still 4304 lines.

## Commands and observed output

All in the t866 worktrees.

- `pnpm.cmd exec vitest run src/runtime/project-parts src/framework/automation-service/service/project-parts src/programs/automation-studio/api/handlers/tests/project-parts src/runtime/llm/node-tools/tests --minWorkers 1 --maxWorkers 2` -> `Test Files 33 passed (33)`, `Tests 443 passed (443)`. New: guard 41, runner 23, tool 15, handler 2, card 2.
- `pnpm.cmd exec vitest run src/engine/automation/tests/graph-run.test.ts src/framework/automation-service/run-control` -> `Test Files 4 passed`, `Tests 41 passed` (for the `graph-run.ts` line).
- `FLUXIQ_REGENERATE_IAM_CATALOG=1 pnpm.cmd exec vitest run src/platform/iam/catalog` -> 11 passed; added the one action to `packages/contracts/src/iam/actions.generated.ts`.
- `pnpm.cmd --filter fluxiq check` -> no `error TS`; the build-cache stamp matched on the last run.
- `node scripts/structure-audit.mjs` (Core) -> `structure-audit: passed (494 warning(s), 1097 baselined).`
- Web, from `apps/web`: `pnpm.cmd exec vitest run src/lib/tests/program-route.test.ts "src/app/api/programs/[programId]/[endpoint]/tests/route.test.ts"` -> `Test Files 2 passed`, `Tests 78 passed`.
- `node scripts/test-extension.mjs background/automation-relay/tests` -> `# tests 17`, `# pass 17`, `# fail 0`.
- `pnpm.cmd --filter @fluxiq-web-extension/extension check` -> exit 0. Extension `node scripts/structure-audit.mjs` -> `structure-audit: passed (234 warning(s), 553 baselined).`
- From `apps/extension`: `pnpm.cmd run test:content e2e/content/tests/part-run/tests/part-run-job-board.spec.ts --headed --workers=1` -> `1 passed (4.6m)`. Needs `pnpm run test:e2e:build` first, since it uses the extension fixture.

## Not verified

- **`core.run_part` in a real build loop.** Tested through the harness registry and the real permission gate with a fake site-reset port, never through `evidence-loop` or a live or scripted build. Its outputs reach the model unscreened by this tool; I did not check that the loop's evidence projection covers them.
- **A recorded route signature on a real lasting step.** The spec's press was written, not explored, so it has none. Mismatch and match are proven only with fakes in `run/tests/run-part.test.ts`.
- **A real part that calls a part, in a browser.** Proven with the real executor and fakes only.
- **A person's pause or Stop during a part run in a browser.** `openRun` uses the same registries as a Flow's run and the stop path passes with a fake gate; nobody pressed anything.
- **The paired HTTP route end to end, and the panel:** no screen sends `runPart`. A long part run through the relay was not tried against its request timeout.
- **An uncertain act on a real page.** Proven with a fake domain and the real engine.
- Firefox, and the other nine scenarios. Full suites were not run, as asked.

## Open questions and things found

1. **A lasting step bound to a row cannot run.** A target held as `$row...`, or a binding the run's inputs cannot answer, cannot be asked about before the press, so the re-check stops it (`no_target`). So a part that loops a lasting act over rows always stops at its first act. That is what "anything else stops there" says, but the lead should know it rules out that whole shape until the check can read the row's value.
2. **A part run is not refused beside another run of the project.** Admission holds only adaptive runs to one per project, so a part run can drive the same tab as a running Flow, as a deterministic run can today.
3. **`targetWords` is still unwired (w2's open point).** Now that `controlParameterKeys` reach the save, the words a control shows still do not, so `part.fixed_value_from_request` catches typed literals only. A lasting part saved from "add the red shoes" whose press carries those words on its control is not refused by that check. The target's fingerprint may still stop it on another item; I did not test that.
4. **`visible` is stricter than a step's own readiness.** A control that renders late fails a zero-wait start check, and the person gets `part.not_at_start` where a run would have waited. I chose the refusal; a slow site may need the caller to try again.
5. **A run's `stopped` counts toward trust as `recordRun` records it.** A re-check stop caused by a person moving the page is recorded `stopped`, not `failed`. I did not check how the trust adapter weighs it.
6. **`docs/architecture/automation-studio.md` and `client-gateway.md` do not yet describe this endpoint.** Shared docs were off limits. The substantial-change rule in AGENTS.md applies when this merges.
7. I added `labState` to `e2e/site-reset/installed-build.ts` and exported `bindDetectingRuntime` and `detectedColumns` from the site-reset barrel, which the brief did not list but does not forbid.
