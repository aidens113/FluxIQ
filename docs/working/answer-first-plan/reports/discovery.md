# Pivot discovery: how FluxIQ turns a task into a result today

Read at Core `dev` ba73faaa8 and Extension `dev` e33004e1, 2026-11-03. No code, Lab, provider or browser ran.

Path keys: `S/` = `!FluxIQ/packages/fluxiq/src`, `SVC/` = `S/framework/automation-service/service`, `D/` = `!FluxIQ/docs/architecture`, `X/` = `!FluxIQWebExtension`.
Marks: unmarked claims with file:line were read in code. **[I]** is my inference. **[Doc]** is taken from a doc and not traced further.

## Outcome

1. **Today the product's output is a Flow, not an answer.** Even a total success tells the person only "Your automation is ready" (`S/runtime/conversations/commands/create-here.ts:94-96`). "Run it" answers "ran all the way through" (`.../run-flow.ts:92`), and a confirmed result check says nothing in chat (`S/runtime/result-verification/check-schedule/conversation.ts:16-17`). Rows reach the person only as a Download link on the automation strip (`X/apps/extension/src/panel/automations/automation-strip.ts:90-110`). So the pivot adds a result channel that does not exist yet, as well as an LLM finisher.
2. **The nearest thing to an LLM finish is the build's own loop, and it cannot end with an answer.** Its only ending is `complete` with a JSON `result` (`S/runtime/llm/evidence-loop/decision.ts:20`) that callers read as a plan or a revision. Rows read while exploring are never stored, because `onRecordBatch` is bound only for graph runs and trials (`SVC/runtime-session/graph-options.ts:71`, `SVC/trial-ports/environment.ts:48`, `S/framework/automation-service/service.ts:2488`).
3. **A saved draft is not reused in the default mode.** Project builds never load `candidate-draft.json` as a seed, and the incomplete draft is legacy-only (`service.ts:1554`). The chat model is nonetheless told "A compatible saved draft continues" (`S/runtime/conversations/instructions/prompt.ts:92`). That is a false statement today in project mode.
4. **A judged yes that runs live has already done the work, then the answer is dropped.** A trial's rows sit in the dataset store under `trial.<id>` and its acts stay on the site. Nothing hands them to the person. **[I]** So for many tasks the first useful result already exists at trial time.
5. **Failure is common and costs about the same as success.** Lab index since 2026-10-30: 14 runs, 2 passed (average $1.14), 12 failed (average $1.09); all time 151 passed, 258 failed, 2 unfinished (`lab-runs/index.md`, selection-biased toward debugging). The product's default ceiling of $0.25 is well under what those Claude builds cost. **[I]** Budget is therefore a first-order design question, not a detail.
6. **This week's live Lab runs did not test the product's default build path.** Every 2026-10-31 and 2026-11-03 run whose snapshot names a mode says `coreAuthoringMode: legacy` (`snapshots/live-llm.json`), the Lab's default when none is named. The product default is `project`. Only one Claude project-mode run was found (`run-mvy8n92p`, one call, $0.06). Project-mode runs before that used `deepseek-flash` at $0.03-$0.11. **So real project-mode cost on Claude is unmeasured.** I can't tell from here whether legacy was deliberate for those lanes.
7. **The offline tester has not saved measurable time yet, and it isn't a between-attempts tool.** See section 9: 41 saved checks, 2 kept failures, net about 43 s slower across 185 build minutes, no off/on run ever made, and it is off in the product.

---

## 1. Every way a build or run ends without a result

Default build path is `project` (`D/automation-studio/llm-flow-bootstrap.md:35-36`). The supervisor loop is in `SVC/project-build/run.ts`. Legacy mode and all re-authors use `runAutomationStudioFlowBootstrapBuildPhases` instead (`service.ts:1653`; `SVC/runtime-adaptation/reauthor-build.ts:132` sends no `authoringMode`). `flow.improve` is a candidate extend (`S/runtime/conversations/commands/build.ts:182`).

### Project build (default)

| Ending | Code / where | Saved | Person told |
|---|---|---|---|
| Promoted, applied | `promotion.ts` `proposed`; `create-here.ts:89-96` | Flow, adaptation, trial rows | "ready"; **no result** |
| Supervisor ended, candidate assembled | `run.ts:362-366` | `candidate-draft.json`, build record | Ending row, then "I kept what I wrote as a draft, and nothing was put into the Flow" (`build.ts:50`) |
| Whole test yes but ended unfinished | `project.build_ended_unfinished`, `run.ts:346`; `SVC/candidate-trial/promotion.ts:81` | Draft | Same; yes never promotes |
| Yes that does not stand | `candidate.trial_stale_revision`, `trial_record_missing`, `promotion_digest_mismatch`, `FLOW_BOOTSTRAP_STALE`, `promotion.ts:80-101` | Draft | `build.ts:63-66` |
| Latest verdict no / unsure / not judged / failed | Trial's own code, `promotion.ts:84` | Draft | `build.ts:69-75` |
| No candidate assembled | `flow_bootstrap.post_provider_validation_failed` + `project.build_<outcome>`, `run.ts:329-336` | Build record only; **no draft, because save is at `run.ts:341`** | Ending row + "has no steps yet ... you can ask me to build it again" (`create-here.ts:171`) |
| Time limit (30 min) | `project.build_time_limit`, `S/runtime/loop-limits/project-build-duration.ts:20`; `run.ts:333,352-358` | Draft if assembled | Limit row with what was tested |
| Purse refused the supervisor | `S/runtime/project-agents/supervisor/supervisor-loop.ts:343` | Draft if assembled | "spending limit could not pay..." |
| Provider silent / replies unreadable | `flow_bootstrap.provider_unavailable`, `model_replies_unreadable` (`.../generation-failure/codes.ts:197,200`) | Draft if assembled | Core's sentence plus left-on-target note, `run.ts:431-435` |
| Permission / person-only check | `flow_bootstrap.permission_required`, `user_intervention_required` (`codes.ts:175,183`; `run.ts:400`) | As above | The question itself |
| Finished with an open question | `create-here.ts:87` | Proposal | "still waiting for your permission" |
| Cancelled | `run.ts:322` | Build record | "Build stopped. The Flow was not promoted." |
| Refused before any model call | ~35 codes, e.g. `blank_target_required`, `pending_adaptation_exists` (`codes.ts:18-64`) | Nothing | Plain-worded cause |

### Legacy / re-author phases

`kind: not_doable | not_finished | budget_exhausted | replies_unreadable | provider_unavailable` (`.../generation-failure/build-ending.ts:60`), written with a person-facing `message` (`:62`). `phases.ts:530-552` writes them. Keeps an incomplete draft only for a non-extend legacy build (`service.ts:1604`, `enabled: !extend`).

### Runs

| Ending | Where | Kept | Told |
|---|---|---|---|
| Failed at a step, no fix | `run-flow.ts:70-73` | Session, trace, **rows stored before the failure** (`S/engine/automation/node-execution/attempt.ts:496`; `SVC/datasets/run-datasets.ts:230`) | "The run failed: ...". No rows |
| Uncertain lasting act | `run.outcome_uncertain`, `S/engine/automation/step-loop/uncertain-stop.ts` | Same | Same |
| Refuted (two agreeing no) | `run-outcome.ts` sets `failed`; `check-schedule/conversation.ts:8-11` | Same; repair entry | Core's sentence with dataset attached |
| Unverified (split or no model) | `S/runtime/result-verification/verification-status.ts:23-28` | Status stays `succeeded` | Non-parking yes/no ask (`conversation.ts:60-75`) or silence |
| Waiting / cancelled / interrupted / threw | `run-flow.ts:93-97`; `SVC/runtime-session/terminal-status.ts:7`; `SVC/runtime-session/ending.ts:54` | Session | Plain sentence |
| Repair exhausted | `AUTOMATION_STUDIO_RESULT_REPAIR_MAX_ATTEMPTS = 3` (`.../refuted-result/history.ts:47`); failed-step re-author once per run (`.../step/failure-decision.ts:174`) | Marker on run | "tried re-writing... not kept" (`run-flow.ts:136`) |
| Flow has no steps | "No start node is available in this flow." [Doc `D/automation-studio.md:217`] | - | Failure |

---

## 2. What must be true for a Flow to count as working

"User" means AGENTS.md or a quoted user line states it. "Agent" means a task id or supervisor decision made it, even where it serves a user rule.

| Gate | Where | Owner | Basis |
|---|---|---|---|
| Judged whole run on the Flow as it stands | Trial gate `.../candidate/trial/gate.ts:1-9`; `phases.ts:68-71,451` | **User** | AGENTS.md:500-507: "a finished Flow needs one judged whole run as it finally stands. Core enforces this; a lane that changes the build loop must keep it." |
| Partial run never decides | `D/automation-studio.md:232`, `S/runtime/llm/node-tools/run/flow-part.ts:3-6` | **User** | Same rule; t244 quotes user 2026-10-02 |
| `fullRunRequired` | `S/runtime/flow-authoring/draft/full-run-required.ts:4-6`; `S/runtime/llm/evidence-loop.ts:357`; set at `service.ts:1608` | **User rule, agent words** | Applies on legacy and extend only; project uses trial gate. `not_a_library_step`, `not_reached` are agent-made |
| Repair live, then check from the step | `phases.ts:17-26`; `llm-flow-bootstrap.md:90-98` | **User** | AGENTS.md:503-505: "A failed test is repaired live on the failing step, from the page the test left" |
| "Not doable" only with no way left | `phases.ts:28-39,591`; `build-ending.ts:50-53` | **User, not in AGENTS.md** | Code quotes "ONLY IF THERE IS ABSOLUTELY NO WAY TO ACHIEVE IT" (`phases.ts:6`). Unverified outside code comments |
| Every node retries, first + 3 | `S/engine/automation/retry-policy.ts:27` | **User** | AGENTS.md:486 |
| Uncertain act held back | `failed-attempt.ts:33-35` | **User** | AGENTS.md:486-488 "only a lasting act whose effect is uncertain is held back" |
| Stale target re-found | `S/engine/automation/target-reacquire/` | **User** | AGENTS.md:491 |
| Judge by change, not absolute state | `gate.ts`, `.../trial-change/` | **User** | AGENTS.md:509-512 |
| In-run repair at the failing step | `S/engine/automation/step-loop/incident-repair.ts:33` | **User, not in AGENTS.md** | `D/automation-studio.md:1944` quotes 2026-10-09 |
| Yes needs a confirming second call, asked conversely | `verify.ts:53-66,315-329` | Agent | t296, t691 |
| Re-asks of contradicted / unsupported no | `verify.ts:66-120` | Agent | t503, t515, t725, t752, t810 |
| Requested-output, computed-fact, exclusion holds | `.../requested-output/`, `.../computed-facts/` | Agent | t757, P5 |
| Double no held by build's yes | `.../build-yes-hold/` | Agent | t660, t664 |
| Supervisor completion rules | `S/runtime/project-agents/supervisor/completion.ts:165,174,131,151` | Agent | `not_latest`, `nothing_assembled`, `repair_first` t743, `ended_too_soon` |
| Rescued pass accepted with a note | `completion.ts:44-65` | Agent | t603, t622, t637 |
| Promotion checks | `promotion.ts:1-16,80-101` | Agent | D2, t753, t608 |
| Trials: 3 per revision; same failure closes; unaffordable refused | `gate.ts:297`; header t368; `SVC/candidate-trial/judging-fits.ts` | Agent | t368, t661 |
| Rounds 6; no-progress ending; replies; time 30 min | `S/runtime/loop-limits/flow-bootstrap-rounds.ts:17`; `phases.ts:41-50`; `project-build-duration.ts:20` | Agent | t240, t592 |
| Blank target; no pending adaptation; project refuses extend and repair | `service.ts:1496-1500`; `S/framework/automation-service/service/flow-bootstrap-commands/generation/request.ts:56`; `run.ts:229` | Agent | "until A7" |
| New Flows: no auto promotion; manual review | `D/automation-studio.md:254-255` | Agent | |
| A run fails only on two agreeing no; check is scheduled | `run-outcome.ts` header; `.../check-schedule/settings.ts:49-56` | Agent | Sampling is agent (MVP item 23) |

---

## 3. What can do a task with the LLM alone

| Path | Acts on site | Output | Stores rows | Starts from page as it stands | Reads lasting acts |
|---|---|---|---|---|---|
| Builder exploration (`core.run_node`, `S/runtime/llm/node-tools/run/node.ts`) | Yes, whole library, under the gate | Draft + proposal | **No**; rows go to the model only | Yes, `opening: "continuing"`; a repair's opening does not reset (`llm-flow-bootstrap.md` scope section) | Ledger |
| Repair round in a build | Yes | Seeded draft (`phases.ts:612-616`) | No | **Yes, by rule** (`AGENTS.md:503`) | Ledger |
| `core.run_flow` partial | Replays draft steps; a lasting step is checked not repeated | Evidence only | No; `flow-part.ts:17-20` | Yes, "no reset first" | Verify-only |
| Recovery exploration | Domain options; **destructive never offered** (`.../recovery/exploration-budget.ts:44,97`; `annotation/exploration.ts:31-38`); 24 actions default, 64 max (`:110,131`) | Evidence for a patch only (`exploration-outcome.ts`) | No | Yes at the failing step | `actsCompleted` ids (`in-run-repair/history.ts`) |
| `run-flow` command | Runs the saved graph | Rows via graph | Yes | Needs a Flow | Run's own ledger |
| Chat turn | No acting tool | Text | No | Sees origin/path only (`commands/page.ts`) | No |

**Does it produce the final result itself?** No path does. Acts really land, and the model reads the rows, so **[I]** the loop usually holds the answer in its context when it stops. Then:
- builder's `complete` must name a revision or an ending (`supervisor/completion.ts:19-24`);
- `explored` rows are not persisted;
- recovery may only return a patch or nothing (`engine/.../incident-repair.ts:76-84`), and a failed overlay ends the run failed [Doc `D/automation-studio.md:1965-1966`].

**Could it pick up mid-way?** Yes mechanically. Two seams hold exactly that state:
1. **The held run.** On a true failure the executor keeps frames, values, row position and the completed-act ledger, and asks `options.repairIncident` (`incident-repair.ts:33,50-84`). Only outcome today: an overlay or `none`.
2. **Post-run.** `verifyAutomationStudioRuntimeSessionResult` returns early on a failed run (`S/runtime/result-verification/run-outcome.ts:319`) and hands to `repairFailedStep` (`:454`), which routes only target-not-found. Page is still where it broke **[I]** if nothing has navigated.

**Missing for a finisher:**
1. A new loop role: `S/runtime/llm/loop-configuration.ts:316` already allows `draft: false` (the supervisor does it), so no draft is needed. Needs a completion schema of its own and tools with `core.run_node`. Note: `requireLibrarySteps` and the gate wrap around it are tied to build setup (`service.ts:1564-1570`), so the tool needs reassembling outside `generate...`.
2. A sink for rows: `AutomationStudioRunDatasets.recordBatchHandler` (`run-datasets.ts:66`) under a session opened as a trial does (`SVC/trial-ports/environment.ts:43`). The batch shape expects a node, attempt and schema (`S/engine/automation/records/capture.ts:147`).
3. A way out of `incident-repair.ts` and `run-outcome.ts:319` that is neither repair nor stop.
4. Prompting. Guidance is entirely about building a Flow (`S/runtime/llm/evidence-loop-decision.ts:45-80`, `supervisor/guidance.ts`).
5. A bound: the loop's no-progress guards were tuned for building. **[I]**

---

## 4. What survives a failed attempt

| Artifact | Where | Survives | Later attempt loads it? |
|---|---|---|---|
| Candidate draft | `<flow>/candidate-draft.json`, **latest per Flow, overwritten** (`SVC/candidate-drafts/store.ts:12,81-83`) | Only once assembled (`run.ts:341`) | **No.** Read only by promotion (`service.ts:1588-1591`). `build.ts:165-168`: "a candidate draft is not carried on from" |
| Incomplete draft | `<flow>/incomplete-draft.json` (`SVC/incomplete-drafts.ts`) | Legacy only | Yes, legacy only (`service.ts:1554,1604`), and only while digest and instructions are unchanged (`.../incomplete-draft/continuation.ts`) |
| Builder proposals | `SVC/project-build/proposals.ts` Map | **Memory only; lost at build end** | No |
| Build record | Files per build: plans, specs, briefs, returns, receipts, `lastingActs`, toggles, decisions (`S/runtime/project-agents/record/build-record.ts:40-60`) | Yes | **Only the same `buildId`** (`record/store.ts:77-85`; a new id is minted per build). Return holds a proposal ref, not the steps (`contracts/builder-return.ts:44`) |
| Saved Flow's stored steps | Flow graph | Yes | Extend/re-author only (`service.ts:1499`) |
| Trial runs | Sessions and datasets under `trial.<id>` (`SVC/candidate-trial/run.ts:11-12`) | Yes | Summaries listed by candidate (`SVC/session-listing/sql-page.ts:46`); trial's feedback not reloaded by a new build |
| Run detail, trace, attempts | Project DB | Yes | Repair of the same run; `runDatasets` by run id |
| Datasets | Project DB (`run-datasets.ts`) | Yes; a whole-Flow re-run overwrites its own earlier pass on success (`:75-115`) | Not by builds |
| Recordings | Recording store | Yes | Linked as evidence (`create-here.ts:70`) |
| Step logs | `FLUXIQ_LLM_STEP_LOG_DIR` | **Lab only** (`S/runtime/llm/step-log/directory.ts:6-12`) | No |
| Evidence window, explored page views | Loop memory (`core.recall_result` inside the build) | **Lost** | No |
| Project ledger of acts | `new AutomationStudioSiteResetProjectLedger()` with no `persist` (`service.ts:1564`) | **Memory only**; copy with descriptions in the build record | No |
| Completed-act ledger | `lifecycle.completedActs` Map per run (`S/engine/automation/lifecycle-run/run-state.ts:116,136`) | **Lost at run end**; no reader outside the engine | No |
| Toggles, paces, interruptions | Toggles in record; paces/interruptions in memory, kept only on a promoted plan (`promotion.ts:20-28`) | Partly | No |
| Domain build state | `<flow>/domain-build-state/<domain>.json`, Flow scope survives [Doc `llm-flow-bootstrap.md` ~3745] | Yes | Yes |
| Creation spend | `creation-spend.json` (`.../creation-purse.ts`) | Product: until the creation ends. Lab: forever | Yes, `carriedUsd` |

**Can an unproven draft be stored?** Stored yes (`store.ts:75`: "Candidate storage accepts unverified drafts only"). **Run?** Only as a detached trial inside a build (`candidate-trial/run.ts:13-14`). `store.ts:11`: "Reading a draft never grants execution or promotion". No endpoint runs one for real. **[I]** The trial machinery could be reused, since it runs an exact plan from its stored form.

**How versions are promoted.** Build yes → `createFlowBootstrapAdaptation` → `review-...` approve → `apply` (`service.ts:1833-1855`), writing the graphs under a digest check, on a **blank** Flow; the chat auto-approves for a new Flow (`create-here.ts:6`) and asks for extends (`improve.ts:8-11`). Run repairs are held until a judged whole run (`SVC/runtime-adaptation/judged-reauthor.ts`, `judged-promotion.ts`). Judgements join versions in `flow-graph-judgements` (`SVC/flow-graph-judgements.ts`). A saved Flow also records its judged trial (`S/runtime/flow-authoring/version/judged-build-trial/contracts.ts`). There is no "draft version" state on a Flow.

**Finding the same task later.** Nothing matches a task to a Flow. `flow.createHere` makes a new Flow per ask (`create-here.ts:64`). The chat model picks from names and context, told a name alone proves nothing (`prompt.ts:90`). **[I]** "Next time we try that task" needs a task identity that does not exist.

---

## 5. Lasting acts

Four separate records, none shared:

1. **Project ledger** (per build, memory): every act by brief and supervisor, with witnesses, places, what it created, settlement state (`S/runtime/flow-authoring/bootstrap/site-reset/project-ledger.ts:3-18`, `ledger.ts`; `llm-flow-bootstrap.md:155-182`). `persist` exists but is unused (`project-ledger.ts:73,193`; `service.ts:1564`).
2. **Build record `lastingActs`**: `{act, owner, consequences, description, undoable}` (`record/build-record.ts:103-110`, written by `SVC/project-build/acts-record.ts`). Survives, but no witnesses.
3. **Trial act ledger**: per pass, `changed | already_in_state | no_change_seen | skipped | not_run` (`SVC/candidate-trial/act-ledger.ts:1-38`), from the trace. Derived, so recomputable from a stored trace.
4. **Run completed acts**: identity = graph, node, row or resolved target + inputs (`S/engine/automation/lifecycle-run/act-identity.ts`). Skips a repeat within **one run** (`step-loop/already-done.ts:17-21`). The re-run after a repair: **[I]** a fresh run, since the Map is built in run state; not traced further.

**What the model is told already.** Builder: `earlierAttempt.lastingActs` (`contracts/earlier-attempt.ts:20-25`), `startedWith`, phase start. In-run repair: `actsCompleted` as ids only, "a fix must not repeat" (`in-run-repair/history.ts:1-6,37`). Ending: `automationStudioProjectSupervisorLeftOnTarget` gives a note and person-worded `told` (`supervisor/left-on-target.ts`).

**A gap that matters now.** Build acts and run acts never meet. The Lab resets the fixture between them (`X/packages/test-runner/src/flow-lane/creation/lane.ts:452`), which hides it. **[I]** In the product, a build whose whole trial pressed "Add to cart", followed by "run it", presses it again.

**What a handover takes.**
- A merge function: project ledger ∪ landed acts of the latest trial or run → list of `{what, where, classes, state, row}`. `left-on-target.ts` already produces most of it for a build; `act-ledger.ts` for a trial.
- A slot in the finisher's first request, screened as `in-run-repair/history.ts` is. Readers must not lean on row values there: that module deliberately carries ids and codes, and the finisher needs names, so screening rules need a decision.
- Continued gating. Reuse `automationStudioFlowBootstrapActionPermissions` (`.../bootstrap/action-permissions.ts:287`) and pass the ledger so a repeat is refused, as `rerun-check.ts` does.
- **Risk:** identity across modes is unsolved. Exploration acts are keyed by call, trial acts by step stamp, run acts by node + row. An LLM re-doing "confirm row X" has no shared key. Row identity by fields (`act-identity.ts`, `MINTED_FIELD`) is the nearest. Possibly-lasting presses are only ever "possibly" (`left-on-target.ts` t597). A finisher will have to look at the page first. **[I]**

---

## 6. Money

**Structure.**
- Default per-Flow ceiling $0.25; Lab test default $0.10; max $10 (`S/flows/authoring/model/run-cost-ceiling/*:7-9`). Only an isolated Lab uses the env var (`llm-flow-bootstrap.md:2888-2891`).
- **Build:** one purse per Flow creation, across its builds (`creation-purse.ts`, `S/runtime/agents/budget/purse.ts:22-34`). Every call is held at projected worst case and refused unsent; replies uncapped, overshoot recorded as a breach (`.../build-call-reserves.ts:6-21`). Reserves: decision reply 750 tokens, judge reply 1,250, judge input 8,000 (`:26-47`).
- **Per-call:** no share; held at its own worst case (`D/automation-studio.md:2470-2476`).
- **Reserved in a project build:** four judge calls (`SVC/project-build/reserve.ts:37,44-55`) at largest priced judge hold (`judging-reserve.ts`), plus 4 supervisor + 6 reset calls kept from allowances (`reserve.ts:33-41`). Brief allowances carved from `allocatableUsd`, topped up to at most double (`top-up.ts`).
- **Run (product):** own ledger at the Flow's ceiling; one in-run purse per run [Doc `D/automation-studio.md:2002-2007`]; repair purse one total per run (`.../refuted-result/purse.ts:1-15`); result check separately capped (`:56-59`).
- **Lab-scoped:** the Flow's one purse spans build, repairs, runs, judges (`flow-spend.ts:1-22`).

**At the ceiling.** A refused call is never sent. Build: supervisor ends with `partial`/`blocked` and "spending limit could not pay" (`supervisor-loop.ts:343`); in phases, a reserve-stopped round judges as it stands (`phases.ts:462-471`), then `budget_exhausted` with figures. Run: pipeline refuses, callback answers `none`, run ends failed [Doc `:2005-2007`]. **No path spends the remainder finishing the task.**

**Observed (Claude Sonnet 5.5, `lab-runs/2026-11-03`, all three `legacy` mode, so the evidence loop and not the project supervisor).** Cost fields only.

| Run | Verdict | Total | Build decisions | Build judge | Playback judge | Runtime repair |
|---|---|---|---|---|---|---|
| mw0l0e9y crossborder | passed | $1.12 | 10 / $0.65 | 2 / $0.20 | 2 / $0.26 | - |
| mw0jgf2o everything-store | passed | $1.16 | 16 / $0.96 | 2 / $0.13 | 1 / $0.07 | - |
| mw0jw263 crossborder | failed | $1.89 | 12 / $0.95 | 2 / $0.17 | - | 8 / $0.76 |

Single calls run about $0.06-0.14 (`steps/0032-judge/meta.json`, `0043-judge`).

**Could one budget serve Flow attempt, repair, then finish, with the finish guaranteed?** Partly yes.
- Mechanisms that fit: `allowance()` (carve, refuses over allocatable), `keepBackForJudging` (reserve no other call can touch), `keepBackCallsFromAllowances` (`purse.ts:169,226,286`). A finish reserve is the same pattern with a second flag beside `call.judge` (`purse.ts:351,358`).
- **Blocks.** (a) A guarantee is in dollars but purse holds are per call and context grows, so a reserve sized by the largest priced decision **under-holds a long finish**. **[I]** (b) Replies are uncapped by user rule (`build-call-reserves.ts:4-6`), so it can be breached. (c) Build and run are different purses in product. A one-shot "task" purse must wrap both, as Lab-scoped does (`flow-spend.ts`), but a lifetime purse is explicitly rejected for scheduled product runs (`:14-19`); it needs to be per task attempt. (d) Purse refusal mid-call ends the loop with no continuation. (e) `$0.25` cannot pay for the observed $1+ on Claude. **[I]**
- **Contradiction to settle:** AGENTS.md:437 "$5 per build ... the whole build's allowance", while the Lab's ceiling is a Flow-wide purse including playback (`flow-spend.ts`, `testing-facility.md:3770-3798`); memory says $0.25; the doc says Claude "$5 honored" (`D/automation-studio.md:370-371`).

---

## 7. Verification

**When.**
- Build trial: every whole-run test that reached its end; subflow trials too (`candidate-trial/run.ts:5-17`; `SVC/project-build/subflow-trials.ts`). Not started if the purse can't hold two calls.
- Run: only a `succeeded` run (`run-outcome.ts:319`). Schedule: first 3 runs, then interval/decay; always after a repair or refutation (`check-schedule/decide.ts:50-62`, `settings.ts:49-56`). Caller's key pays only for repair checks on a chat run (`run-flow.ts:59`; `result-check.ts:147-153`); other runs need a standing authorization, else `unverified` `core.result.no_model_available`.

**Calls.** Core's free checks first (`verify.ts:166`-ish computed facts, refused rows). Build: minimum 2, more on re-asks, each check asked up to 2 times (`verify.ts:285`). Runtime: 1 on yes, 2 otherwise. Deadline 120 s (`deadline.ts:43`). Judges are about a fifth to two fifths of run cost in the table above: **$0.46 of $1.12** in mw0l0e9y.

**What the person is told.**
- Build no/unsure: the draft sentences (`build.ts:69-75`); ending row carries no judge reasoning beyond Core's words.
- Run refuted: Core's `reason`/`observation` with dataset (`check-schedule/conversation.ts:8-11`). Run `failed`.
- Run unsure: "I could not tell whether this run answered what you asked for" and a non-parking ask (`conversation.ts:60-75`). Confirmed: silence (`:16-17`).

**If the judge labels rather than gates.**
- Mechanical gate sites: `phases.ts:451`, `gate.ts` completion, `promotion.ts:84`, `run-outcome.ts` `failing`, `automationStudioResultVerificationFailsRun` (`contracts/verification-reading.ts:28-31`).
- A label needs a target: judge today takes a Flow's trial or run (`.../result-summary.ts`, `summary.buildTest`). A finisher has no steps, trace or graph; `summary` must accept rows + acts + end view with no Flow, and the "shape of the Flow" fields become optional. **[I]** That's the largest single change here.
- Keep two separate questions: "is the answer right" (labels the result) and "does this Flow do it" (gates promotion). AGENTS.md:506 still requires the second for a Flow to be *finished*.
- Run status: `failed` carries retry and repair meaning (`run-outcome.ts:382`). Label as metadata, like `resultVerification`, not a status change.
- Saving money: a labelled finish could use one call instead of two. Unsure stays unsure, but **t296's reason (one yes finished a build on wrong rows) still applies if a label is shown as "correct"**. Say "checked once" honestly. **[I]**
- `unverified` already exists as a third word (`verification-status.ts:23-28`). Reuse it.

---

## 8. Chat and Lab

**How results reach the person.** Build/Run outcome → `progress.succeeded|failed` summary → thread turn (`command.ts:169`). Activity stream cards during (`S/runtime/automation-activity/`). Rows: strip exports CSV/JSON of the **last run** (`controller.ts:158,366`; `automation-strip.ts:90-110`). Refutations attach a dataset (`conversation.ts:9`). Rendering is Core's `@fluxiq/ui-components` (AGENTS.md "extension's chat renders from Core"). No row preview in chat found: searched `ui-components/src` and `runtime/conversations/commands` for `dataset`; only the composer and a fake DOM mention it. Trial runs: **no extension code references `candidateTrial`** (grep of `apps/extension/src`), so trial rows are unreachable to the person.

**Lab pass definition.**
- Start from the chat (`testing-facility.md:1736-1740`, user order 2026-10-01). Note Lab default authoring mode is `legacy` unless named (`X/packages/test-runner/src/live-llm/authoring-mode-env.ts:4,37`), and `testing-facility.md:1650` ("never the default of Core") is stale against Core's default.
- Draft: lane throws `lab.candidate_not_promoted` as `runtime.behavior` (`lane.ts:411-413`; `candidate-outcome.ts:221`). **Oracle is never consulted.**
- Promoted: reset fixture (`lane.ts:452`) → playback → `judgeCreatedFlowOracles` records + final state (`lane.ts:499`; `oracles.ts`) → `assertCreatedFlowReachesItsOwnPage`, `assertFlowDidNotStopEarly`, `assertFlowFailure`, oracles (`lane.ts:518-522`).
- Zero-call replay: `lab replay`, separate invocation, no model anywhere, zero provider accounting, hash unchanged, oracles hold (`testing-facility.md:695-750`; `saved-flow-replay/replay-saved-flow.ts`). `LlmRunEvaluation.deterministicReplay` is `required: true`, `llmCalls: 0` (`X/packages/test-contracts/src/llm.ts:213-218`). AGENTS.md:481 "a zero-call replay" (user).
- Evaluation fields already split `flowCreated`, `oracleVerdict`, `reportedVerdict` (`X/packages/test-contracts/src/evaluation.ts:287-315`), but: `oracleVerdict` is null without a Flow (`lane-observation.ts:163`); `reportedVerdict` must be null when no Flow (`evaluation-validation.ts:137`).

**To score the two separately.**
- **"The person got the right answer":** judge the finisher's stored rows and in-place final state against the same private oracle, on the build's own attempt, **with no fixture reset first**. Needs a new stage before `lane.ts:452`, a dataset source without a persisted Flow (`judgeCreatedFlowDataset` takes `run: PersistedFlowRunOutcome`, `judgement.ts:22-28`), and a screened view of what chat actually showed. **Final-state oracles are absolute** (`testing-facility.md:1600-1602`); a finish on a dirtied site (trial acts on top) may read wrong, so a seeded baseline per attempt and a "did it double-act" oracle are needed. **[I]**
- **"The Flow became deterministic":** today's chain unchanged: promoted, playback, replay at zero calls. Also useful: **attempts until deterministic**, which needs a run-to-run series.
- Contract: add `answerVerdict`, make `oracleVerdict` mean Flow playback only, relax validation; bench reports (`bench-report.ts`) must carry both. Keep `failureCategory` test-rig only (`run-outcome.ts` in run-evaluation).
- New attempt-two lane: run a task twice on one workspace, proving the saved draft shortened the second. No such lane exists; `persistent-isolated` + `lab replay` are the nearest.
- Old pass rates are not comparable once the first score exists. **[I]**

---

## 9. The internal tester, and one-shot / two-shot

**Is offline trials what he means?** Yes, as far as I can tell. "State engine" appears nowhere: I grepped both repositories' source and docs for it and got no hit. Offline trials are the only thing that runs a Flow without a site. Two neighbours serve his "more efficient over time" and are not testers: `S/runtime/adaptation/exploration-reduction/reduction.ts` (cuts a build's wandering down to the steps that mattered, used by `.../bootstrap/draft-reduction.ts:88`) and `S/runtime/adaptation/confidence/replay.ts` (a change earns trust through later zero-model runs). One line to confirm with him would be cheap.

### 9a. What it can really check

The runner is the normal trial runner, with a matcher in place of the client (`SVC/offline-trial/run.ts:3-13`). The matcher is strict: each command must equal the recorded one at the cursor, and after one mismatch every later command is a gap (`S/client-gateway/trace-matcher/matcher.ts:7-19`).

| Candidate change | Result | Where |
|---|---|---|
| Computation only: mapping, filters, sort, dedupe, loop limits over rows already read | **Real offline answer**, then judged | Tier 1, Core plan `:101-103` |
| Changed read or target, **in the product** | Gap, then live. No reevaluator is bound | `D/automation-studio/client-gateway.md:1234` "Production binds tier 1 only"; `S/runtime/recording/gateway-trace/wiring/host.ts:78` |
| Changed read or target, in Lab tooling | Answered from the saved page, offline = live on 84/84, 566/566, 906/906 cells (Core plan `:64`) | `X/domain/src/runtime/offline-reads/` |
| **Any changed act, or act order** | Never evaluated: "what it would do lastingly is not in any snapshot" | `read-eligibility.ts:1-6`; `argument_mismatch`, `ambiguous_context` |
| A new step, or a page or branch the recording never reached | Gap, `missing_transition` | `gap-reasons.ts` |
| Content a static page can't show | Gap, `dynamic_content`, with a control re-read to prove the copy is faithful | `dynamic-content.ts:1-15` |
| Typed secret; missing capture | Gap, `redacted_input`, `incomplete_capture`, `missing_artifact` | `gap-reasons.ts` |
| Firefox | No page capture [Doc Core plan Risks] | |

**Branches.** The recording holds only the path taken. A candidate following the same path gets the recorded answers, so **a branch not taken is never exercised**. **[I]** State-route logic that reads recorded state may still run; only the commands it then sends are compared.

**Acts are the hole for his purpose.** A kept `no` needs a run on recorded support. `siteChange`, what the judge now reads for act tasks, is absent offline (`SVC/candidate-trial/run.ts:81`: "an offline trial has none"). Trials are judged by change since t775, and act-only negatives need an act record to be grounded (Extension plan ledger `:362-369`). **[I]** Act tasks (cart, confirm, send) get little offline value, read and scrape tasks more.

**Capture gaps.** 3,333 of 3,333 saved-Flow points matched, and 4,274 of 6,941 live points, labelled honest capture gaps (Core plan `:50`). Not re-measured since. Those ledger entries show 0 intake defects, so the gap is capture, not the matcher. In the 26 inconclusive saved checks, matched/recorded ranged 3/34 to 26/39.

**When it answers "unknown"** (`SVC/offline-trial/evidence-result.ts:11-29`; `SVC/offline-first/answer.ts:5-13`): any gap, whatever the judge said; a judge that is unsure or unjudged; nothing reached the recording; entry not prepared. **`inconclusive` is never a soft pass** (`vocabulary.ts:7`). Then the trial runs live in the same call. Refused outright, also live: exploration phase, derived or incomplete source, no session view (`SVC/offline-trial/matcher-session.ts:6-13`).

**Its one-way rule is already enforced.** An offline yes is only a note and the gate runs live anyway (`.../offline-first/gate-step.ts:10-13`, `KEPT_YES`). Only an original, live, whole-run pass counts (`flows/authoring/model/offline-trial/live-success-eligibility.ts:1-21`), and for the exact revision and digest (`whole-run-gate-eligibility.ts:1-22`). Replays can't raise the tally (`live-episode-tally.ts:1-5`). This is the best-built part and can carry your "never proof" requirement unchanged.

### 9b. Where it runs

**Only inside a live build, and not in the shipped product.**
- Asked once per revision, first test only; every retest is live (`.../candidate/trial/gate.ts:463`; `.../subflow/trial-gate.ts:233`; D41). Phases `test` and `repair`; exploration is refused (`SVC/offline-trial/contracts.ts:26`).
- **Product: off.** It installs only with tracing, and "Unset is the product's configuration" (`S/runtime/recording/gateway-trace/environment.ts:2-4`; `wiring/host.ts:8,78`; `SVC/offline-first/installation.ts:13-17`). The Lab sets it on (`X/packages/test-runner/src/environment.ts:158`). Capture adds about 11.5% [Doc Core plan `:49`].
- **Project and candidate only.** Legacy and re-author builds use the dry-run gate instead (`service.ts:1653-1655`), so the 2026-10-31 and 2026-11-03 legacy runs have no offline steps, confirmed by folder count.
- Lab experiment CLI: `survey`, `trial`, `reads` on a copied store, no model, `not_judged` judge, with the task's oracle judging rows, plus one hand correction `--process` (`X/packages/test-runner/src/offline-trial-experiment/run/not-judged-judge.ts:1-4`; `cli-arguments.ts:24-26`). **This is the only between-attempts path today, and it's a manual lab tool.**

### 9c. What is missing to refine a saved draft between attempts

| Need | Today | Gap |
|---|---|---|
| Last attempt's trace, per task | Trace per episode in the project DB when tracing is on; manifest names `flowId` (`.../gateway-trace/types.ts:22`). Trial records carry `traceId` | Source is memory per build (`SVC/offline-first/sources.ts:31`), scoped to one candidate id or build id. Store lists only by `episodeId` (`.../project/gateway-trace/store.ts:200`), so **no "latest trace for this Flow"**, and no task identity at all. Tracing is off in product. No retention rule for traces found: `deleteTrace` exists (`:274`), and I found no caller outside the store. "Never merge episodes" (T17) needs revisiting |
| A repair loop against it | None. The trial runs against a recording, but the **builder's tools go to the live client**. `core.run_node`, looks and `find_on_page` have no offline form, and exploration is refused by Decision 2 | New loop role, tools bound to a scoped environment (`createAutomationStudioScopedRunEnvironment`, `S/framework/automation-service/environment/scoped.ts:26`), answering looks from the saved page. Needs the snapshot page in the host: **deferred to after MVP, because it needs a hidden browser in the person's panel** (a supervisor decision the user can overrule: Extension plan `:382`; `t769/tier2-hosting.md`). Without it only tier-1 changes can be repaired |
| Model cost | "Offline iterations still call the build model and the judges; they save site time, resets and waits, not model spend" (Core plan Risks). An offline pass pays the judge twice (D42, `SVC/offline-first/spend.ts`) | At the legacy Claude rates in section 6, about $0.065 a decision and $0.06-0.14 a judge call. **[I]** A repair of 5 decisions and a judge pair is about $0.45-0.60 per pass. Between attempts nobody is waiting and no paid run may go unsupervised (global lesson), so this needs a decision: run it while a person's task is live, or at the start of the next attempt |
| Run with no judge | Lab has an oracle; product doesn't | Provider-free check can only say "the same reads gave the same rows", or check Core's computed facts (`.../result-verification/computed-facts/`) |
| Marking a draft | `AutomationStudioTrialEvidenceResult` is the right record, but offline evidence lives in a factory's memory (`SVC/offline-first/whole.ts`, `offline`). Draft store accepts only `verification: "not_performed"` (`store.ts:75`) | Add evidence beside the draft, bound to its digest, without touching that field. Show "checked against a recording", wording exists (`offline-first/words.ts`). `satisfiesAutomationStudioWholeRunGate` already refuses it. Ageing: a recording can go stale; `stale_checkpoint` is in the vocabulary but I found no producer |
| Entry in the phase type | `exploration | test | repair` | New value; `offline_not_allowed_in_phase` keeps refusing the rest |

### 9d. Measured savings

**Project-mode runs on 2026-10-28 and 2026-10-29, all 12 runs with offline steps, `deepseek-flash`, tier 1. Read from step `meta.json` timings.**

| Measure | Value |
|---|---|
| Runs / total build wall time | 12 / 11,078 s (185 min) |
| Test windows (`tool-core.test_subflow`) | 61 / 3,451 s, **31% of wall time** |
| Resets | 91 / 609 s |
| Offline asks | 41 |
| `refused:no_live_source` (first test of a scope) | 12 / 0 s |
| `inconclusive`, then ran live | **26 / 104.5 s** |
| `passed`, then ran live | 1 / 18.3 s |
| `kept_no`, **the only outcome that avoids a live trial** | **2 / 30.8 s, both in `run-mvtdn37t`** |

**Avoided live trials: 2 of 61 test windows (3.3%).** Kept windows took 37.8 s and 39.9 s. That run's live windows after a first ask took 54.9-100.7 s, median 78.8 s. Gross saving **about 80 s**; offline time that bought nothing **about 123 s**. **Net: about 43 s slower, 0.4% of wall time**, ignoring reset time saved. That comparison is mine, against same-run windows, not an experiment.

**No controlled measure exists.** P7's off/on comparison (Core plan `:134-136`) was never run: `FLUXIQ_OFFLINE_TRIALS=0` appears only in plan and report text, not in any ledger result I found. Zero offline data on Claude. Why each check was inconclusive isn't saved: `meta.json` says "it was inconclusive" with `gapStep: null`, in all 26. **That is a cheap fix and the first thing to do.**

The older headline is about potential, not achieved savings: live trials were 49.8% of build time pooled, 35.6% mean (`.../reports/lane-t-u1-baseline.md:9,146,204`). **[I]** Most revisions change reads or targets, and the product has no way to answer those. Tier 2 is the likely unlock; its fidelity results are strong but it has never run in a build.

### 9e. Making one-shot / two-shot measurable

| Wanted | Recorded today | Missing |
|---|---|---|
| Same task across attempts | Lab: `task` string on each run (`X/.../lab-runs/ledger-task.ts`), but **each build starts blank in a fresh workspace** (`testing-facility.md:2571`), so these are repeats, not attempts. Product: nothing | Task identity (see Capability row "Choosing"); `attemptOrdinal` |
| Attempts until a right answer | Lab: oracle per run (`evaluation.ts:289`), null without a Flow | Oracle on the finish; same-workspace two-attempt lane. **Product truth:** judge label, and the person's answer to "is that what you asked for". Nothing reads that answer: `did_not_answer` appears only where it's defined (`check-schedule/conversation.ts:70`) |
| Model calls and cost per attempt | Per Flow, Lab scope only: `spentUsd, builds, calls, byPhase` (`get-flow-spend`, `llm-flow-bootstrap.md:2939-2961`; **product records are `null`**). Per run: `llmGate.providerCalls`, `costAccounting` ([Doc] `D/automation-studio.md:2432-2445`). Lab: `evaluation.json` | A per-attempt row `{task, attempt, path: flow | repair | rebuild | finish, calls, tokens, usd, ms, liveTrials, offlineChecks, label}`. Report **calls and tokens as well as dollars**, since models and prices change; the $0.03-$0.11 versus $1+ gap above is mostly the model |
| Falling over time | Pieces: `adaptationReuse`, `adaptationCost` (`evaluation.ts:345-360`); zero-provider run (`.../result-verification/zero-provider-run.ts`); version judgements (`SVC/flow-graph-judgements.ts`); confidence tier (`.../confidence/replay.ts`); `bench-report.ts` tolerances | Nothing joins them per task. No curve, no chart, no regression check. Adaptation plan's gates P5 and P6 are a two-shot proof for **repairs only** (`adaptation-and-breadth-plan.md:419-432`) |
| Live trials and site time | Step timings; `liveTrialCount`, `offlineTrialCount` (`X/.../build-time/`). Note the CLI's `dist` fails to load today (`ERR_PACKAGE_PATH_NOT_EXPORTED`), a stale build | Per-attempt aggregation |

**Proposed definitions, for him to confirm.** One-shot: right answer on attempt 1. Two-shot: right on attempt 2 at most. Flow deterministic: attempt reached a right answer with zero model calls. **[I]** These need a Lab-side task series, since only the Lab has ground truth.

---

## Capability table

| Capability | State | Smallest change that closes it | What is risky |
|---|---|---|---|
| **LLM finish from any page state** | Partial: loop, gate, ledger, held run exist; no answer ending or row sink | New loop role, `draft: false`, tools with `core.run_node`, completion `{answer, rows?, actsDone, couldNot}`; session opened like a trial, rows through `recordBatchHandler`; entry at `run-outcome.ts:319` and at build endings | Rows from a model's claim vs a read: store only what the read returned, never model-written rows. A finisher pressing things under uncapped permission scope. Destructive-off rule in recovery vs the build's gate: decide which applies |
| **Choosing saved Flow, rebuild or pure LLM** | Missing: only the chat model's guess among Flow names; no task identity | Task key on the Flow (instruction digest exists: `.../version/instruction-digest.ts`); deterministic ladder: Flow applied with last judged yes → run; draft exists → build seeded; else build | Wrong-Flow match spends real acts. Digest is exact-match, so paraphrases miss; semantic match adds a call and is a model guess |
| **Ordered budget** | Partial: purse primitives exist; build and run are separate in product | One task purse wrapping attempt; `keepBackForFinish` beside judging; allowance for Flow attempt + repair; finish draws on reserve | Worst-case hold grows with context, so a fixed reserve under-holds. User's "no cap on output" means it can breach. $0.25 default looks unworkable on Claude |
| **Lasting-act handover** | Partial: four unconnected records | Merge function + screened slot; persist the project ledger (`persist` hook exists); carry across attempt/finish | No shared act identity across modes. Page-text screening vs names. Double-act on every "already tried" path. This is the highest-consequence risk |
| **Honest result labelling** | Partial: `confirmed/refuted/unverified` exist for runs only | Result record `{answer, source: flow | llm_finish | mixed, label, checks, acts}` on the task; chat shows it | Judge summary needs a Flow-less form. A "checked" label on one call repeats t296. Copy must say which came from a Flow |
| **Saved draft reuse** | Partial: `incomplete-draft` works for legacy; candidate draft stored, unread | Let a project/candidate build take the stored draft as seed via the extend path (`draft-from-flow.ts`), with carried steps rerun as now; drop the blank-Flow and project-extend refusals for own-draft reuse | Latest-only store loses the best draft: keep best-judged too. Stale digest throws drafts away on any instruction edit. Carried-step refusals (`full-run-required.ts`) spent rounds before (t274). `proposals` are memory-only, so builder work before assembly is lost |
| **Two Lab scores** | Partial: fields half exist; oracle skipped without a Flow | `answerVerdict`, new stage before reset, validation relaxed, second-attempt lane | Absolute final-state oracle vs a site left dirty by attempts. Rate history discontinuity. Extra live time (AGENTS.md:481) |
| **Refine a draft offline between attempts** | Missing: only the Lab's manual CLI. In builds it answers once per revision | In order: save why each check was inconclusive; P7 off/on on Claude; trace lookup by Flow; tracing decision for product; then a repair role over a scoped environment; tier 2 host | Acts and untaken branches can't be proven, so it can mislead on act tasks. Model spend stays. Page data kept in traces raises privacy and storage cost in product. Today's measured benefit is about nil, so **measure before building** |
| **Per-task efficiency tracking** | Partial: per-run and per-Flow numbers exist, Lab-scoped; nothing per task | Task id + attempt row (9e); Lab same-workspace two-attempt lane; report over it | A task key that drifts breaks the series. Dollars mislead across models. Only the Lab has ground truth, so the product curve rests on judge labels |
| **Results shown to the person** (added, not on your list) | Missing in chat | Answer turn with rows preview + export; also say a trial's answer | Must never expose recorded page data beyond the person's own session (AGENTS.md "Never expose"); the chat thread is stored |

## Standing rules the pivot would have to change or re-read

**Change or explicitly narrow (user rules; ask him):**
- AGENTS.md:500-507 "a finished Flow needs one judged whole run". Likely **keeps** for a Flow counting as deterministic, but today's reading "no Flow, no result" is what the pivot removes. His sentence supports keeping the Flow gate; the code's `phases.ts` adds nothing that forbids a result. Needs his confirmation in one line.
- "Not doable only if absolutely no way" (`phases.ts:6`): a finish makes "not doable" rarer still. Compatible.
- AGENTS.md:437 "$5 per build": needs a new statement of what the ceiling covers.
- AGENTS.md:481 "Only a few tasks run fully end to end": a two-attempt lane raises time per task.
- Memory `flows-authored-as-general-structure`, `recording-is-evidence-not-a-script`: compatible.

**Agent-made, free to change without him:** confirmation pair on a labelled result, rescued pass, promotion chain's refusal of unfinished yes (keep), repair-first, blank-Flow-only proposal, project-refuses-extend, `incomplete` legacy-only, `flow.createHere` makes a new Flow per ask, `lab.candidate_not_promoted` meaning a failed lane, rounds, time limit.

**Must stay (user, and the pivot needs them more):** permission gates (`no-action-restrictions-beyond-permissions`), retries (AGENTS.md:486), stale target (AGENTS.md:491), judge the change (AGENTS.md:509), ten realistic scenarios and task audit (AGENTS.md:457,466,474), model guidance never teaches to the test (AGENTS.md:520: supervisor-made, but a finisher prompt is a new place for it to slip), no paid unsupervised runs, chat-first (`extension-ui-is-chat-first-core-owns-the-rest`), Core owns it, extension renders (AGENTS.md, Repository Boundaries).

**Core boundary:** nearly all of this is Core. Lead must alert the user before the first Core edit (AGENTS.md Repository Boundaries).

## Verified versus inferred

**Verified by reading code:** all ending codes and their chat words; which build uses which loop; rows only bound for graph runs; draft and incomplete-draft load points; ledger classes and lifetimes; purse mechanics; verification order and schedule; Lab draft failure and reset placement; chat prompt's draft claim; no extension reference to trial runs.

**Read from docs, not traced:** in-run purse and overlay-drop, domain build state lifetime, recovery plan kinds.

**Inferred, and worth a probe before the plan leans on it:**
- A product "run it" after a build double-acts: read from run/ledger separation, not run. Provider-free probe is possible.
- The loop usually holds the answer at stop: from 3 runs' structure only.
- Page at a post-run failure is usable as left. Extension tab handling after a run was not read.
- Re-run after a repair gets a fresh completed-act ledger: `run-state.ts` shows per-run construction, not traced through `rerunAfterRepair`.
- $0.25 is unworkable on Claude: from Lab costs on chosen tasks; other tasks and models may differ.
- Cost table is 3 runs, chosen as the most recent with both outcomes. Not a sample.

**Not read:** extension content scripts, web panel UI, `flow.improve` beyond its header, hosted plan, `candidate-generation.ts` body (candidate mode is not the default), and working-doc plans. `run-flow`'s Lab path differs from the chat's (`lane.ts:475`, `authorizeRun`).

**Section 9 limits.** Savings are from 12 runs on one model and my own same-run comparison. `client-gateway.md` says a project build's whole trials are offline-first (D48); saved runs show only `test_subflow` windows, while the step's `trialToolId` always reads `core.test_candidate`, so I can't say from the logs which gate asked. I did not read matcher tests or tier-2 hosting. Rows and page text were not opened; offline figures came from `meta.json` only.

**A tool note.** One read-only summing script was blocked by a safety check that could not parse it (it contained no removal). I rewrote it in plain `grep`/`awk`; it is at `C:/Users/osrs_/AppData/Local/Temp/claude/c--Users-osrs--FluxStuff--FluxIQWebExtension/8f43228c-dbdb-476a-a7e2-84eabbfcc82d/scratchpad/offline-sum.sh`. I also ran the build-time CLI as a read-only report; it failed to load and changed nothing.

**Contradictions found:**
- Live Lab rounds this week ran `legacy`; the product default is `project` (Outcome 6).
- `prompt.ts:92` tells the chat model a saved draft continues; in project mode it does not.
- `D/automation-studio.md:404` "USD 0.25 per call, USD 2 per run" vs `S/runtime/llm/session-key-provider.ts:63-70`, both the ceiling.
- `testing-facility.md:1650` "never the default of Core" vs `llm-flow-bootstrap.md:36`.
- Ceiling: AGENTS.md $5 vs memory $0.25 vs doc $0.10 default.
- Explore's capability text says "continues ... saved unfinished draft" only in legacy wording (`explore.ts:33`), while `prompt.ts` does not branch.
