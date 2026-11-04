# Study: a searchable, runnable, nested subflow library, and detecting a known subflow
Read at Core `dev` 769fd499b and Extension `dev` 6e05436c, 2026-11-03. No code, Lab, browser, provider or panel ran.

Keys: `S/` = `!FluxIQ/packages/fluxiq/src`, `SVC/` = `S/framework/automation-service/service`, `D/` = `!FluxIQ/docs/architecture`, `X/` = `!FluxIQWebExtension`, `DOM/` = `X/domain/src/runtime`, `WEB/` = `!FluxIQ/apps/web/src`.
Marks: unmarked claims with file:line were read in code. **[I]** is my inference. **[Doc]** comes from a doc and was not traced. "Part" below means one library unit; the user's word is subflow (see Open questions on naming).

## Outcome
1. **Nesting already runs. Sharing does not exist.** The engine runs Call Subflow at any depth with a typed boundary, its own frame and a cycle refusal. But every subflow belongs to exactly one Flow, and a run can only see its own Flow's subflows. A second Flow cannot call it, and neither can a second builder in the same build.
2. **The nearest thing to a library is a dormant one: Call Flow.** Published snapshots already have pinned versions, a digest, dependencies, cycle checks and deprecation. No model can reach it, and a chat-built Flow's top level has no nodes to publish.
3. **A saved subflow knows almost nothing about itself.** No description, no purpose, no site, no start state, usually no end check, untyped ports, and a `stability` block that nothing ever updates. Search is a `LIKE` over name and id. The build's purpose and quotes are thrown away at save.
4. **A person cannot run one.** The service refuses a subflow graph outright, the chat's "run" takes only a Flow id, and neither the chat nor the extension can pass inputs at all.
5. **Most of the machinery for a zero-model part run exists:** entry preparation already runs proposals with no model and hands their acts to the ledger.
6. **Detection before exploring gives the most for the least,** with no added model call. In 188 saved project-mode builds, 66% of brief decisions came before that brief's first test.
7. **The biggest design risk is not matching. It is what a part is.** Parts today are shaped by one task, may hold fixed values, and depend on an unrecorded start page. And the pivot to one exploration removes the supervisor that cuts parts. This needs a decision before building (Open questions 1).

## 1. The model
**What exists in documents.**
- A top-level Flow is `orchestration`: it owns a Router and Subflows and cannot hold nodes. A `subflow_graph` is a graph Flow owned by exactly one Subflow [Doc `D/automation-studio.md:1014-1017`].
- "Project Flow" is not a type in code. A project holds Flows; "project" in code means the supervisor build mode (`SVC/project-build/run.ts`) and the project database.
- Subflow record: `S/flows/authoring/model/flow-adaptation.ts:69-96`. Table: `S/framework/persistence/automation/project/schema/domain-resources.ts:179-195`, `parent_flow_id not null`.
- One graph per subflow, enforced: `create unique index subflows_graph_flow_uq` (`.../schema/relation-indexes.ts:12`).
- Roles in the model: primary, site, screen, integration, recovery, fallback, utility (`flow-adaptation.ts:60-67`). A build can only write primary, integration, recovery, fallback, utility (`S/runtime/flow-authoring/bootstrap/plan/contracts.ts:183`). `site` is unused by builds.
- Categories are folders, not calls (`domain-resources.ts:196`).

**How one is called.** `builtin.control.call-subflow` with `subflowId`, `inputs`, `outputs`, `errors` (`S/components/automation/control-flow/call-subflow.ts:22-41`). Its doc says "at its latest revision" (`:7`). Run once as a container (`S/engine/automation/retry-policy.ts:82`), its steps keep their own retries. Executed by `automationStudioCallSubflow` (`S/engine/automation/frames/call-subflow.ts:45-86`).

**Parameters and returns.** The graph Flow's `interface` is the contract (`S/runtime/flow-authoring/bootstrap/adaptation.ts:225-226`). Nothing ambient crosses (`S/engine/automation/composite/boundary.ts:38-50,70-72`). Outputs are bound by `metadata.binding` (`frames/call-subflow.ts:123-132`). An unresolved output silently comes back `null` (`:119-121`). Ports from a plan are always `valueType: {kind: "unknown"}` (`S/runtime/project-agents/contracts/subflow-interface.ts:24`), and plan values connect by name alone (`S/runtime/project-agents/dispatch/call-order.ts:6-9`).

**Start and end states.**
- Contract shape exists: `entries`, `checkpoints`, `successCheck` (`S/engine/automation/lifecycle/subflow-contract.ts:47-52`), over read-only three-valued facts (`S/runtime/automation-host/contracts/fact-condition.ts:1-7`).
- End: `fluxiq.successCheck`, enforced at the frame's end (`S/engine/automation/step-loop/success-check.ts:31-46`), written only if a builder writes `done when:`; the plan carries none (`S/runtime/project-agents/supervisor/plan-input.ts:25`).
- Start: nothing is recorded. A callable part's start is "where its predecessors left the page" (`after`), and that lives in the build record, not the saved Flow. **So a saved part cannot say where it starts.**
- Route signatures (`before`, `after`, `effect`) exist per node (`S/runtime/automation-host/route-state/value.ts:14`) but only for steps that came from a draft step. "A step a model wrote has none" (`.../bootstrap/authoring/assemble.ts:645-646`, `contracts.ts:106-112`), and submissions strip them (`S/runtime/llm/harness-options/bootstrap-completion.ts:605-622`; `.../candidate/submission/submission.ts:47` omits `routeSignaturesOf`). **Project-mode Flows carry none. [I from code]**

**Versioning.**
- A graph's revision chain: `graph_revisions`, with optional `snapshot_object_id` (`domain-resources.ts:156-168`; `S/framework/persistence/automation/project/graph-store.ts:168-176`). A run reads each graph once (`SVC/runtime-session/subflow-frame.ts:67-92`) at the latest revision. There is no pin.
- `subflowGraphs` is the executor's source of siblings (`S/engine/automation/frames/invocation-options.ts:86-89`, set at `subflow-frame.ts:53`). `calledGraphs` is the same source handed to verification to read called nodes at the revision they ran (`S/framework/automation-service/service.ts:2485`; `S/runtime/result-verification/called-nodes.ts:22-25`). `live-patch` uses a record of the same name for a part's replacement graph (`S/runtime/adaptation/live-patch.ts:339`).
- Which revisions a run executed: `calledVersions` (`subflow-frame.ts:102-113`, read at `service.ts:2560`), joined to verdicts in `flow_graph_judgements` per graph revision, with `subflow_id` (`.../schema/graph-judgements.ts:1-34`). **It only records.** `listForFlow` and `listForRun` have no caller outside the store (grep).

**May one call another, and how deep?**
| Layer | Allowed | Limit | Where |
|---|---|---|---|
| Runtime | Yes, nested | No depth constant found; only the cycle refusal, deadline and steps | `frames/call-subflow.ts:53`; nested attempts handled at `subflow-frame.ts:104-110` |
| Script authoring | `part`, `call:`; a part may call parts | Cycle refused `flow_script.call_cycle` | `.../plan/flow-script-format.ts:403-404`; `.../script-statements/called-parts.ts:158-172` |
| JSON plan | Yes | Target must be a key in the same plan: `bootstrap.unknown_call_target`. Traversal survives a cycle and does not refuse it; runtime does | `.../plan/route-validation.ts:62`; [Doc `D/automation-studio.md:955-956`] |
| Project builder | Own helper parts only | Sibling subflow refused; helpers re-keyed `<subflowKey>-<label>` | `.../subflow-candidate/scoped-submission.ts:14-18,326-332` |
| Supervisor plan | Flat: `{key, name, purpose, parts, inputs, outputs, after}`, no `calls`. `main` calls each | 39 subflows | `plan-input.ts:13,118`; `supervisor/assembly.ts` header, `:193` |
| Run loader | Loads 100 subflows of a Flow | `limit: 100, offset: 0` | `service.ts:2520` |

**Shared or owned?** Owned by one Flow, three times over: `parent_flow_id`; ownership proof `metadata.parentFlowId` and `parentSubflowId` (`SVC/runtime-session/subflow-graph-ownership.ts:14-24`); and the source only searches the Flow's own list (`subflow-frame.ts:87`). `duplicate-flow-subflow` exists as a copy within a Flow (`S/api-contracts/automation/subflow.ts:39-41`).

**Call Flow, the other mechanism.** `fluxiq.callFlow` pins `{flowId, version, scope}` (`S/flows/executable/composite/configuration.ts:5-17`) to an immutable snapshot with digest and dependencies (`S/flows/authoring/model/composites.ts:8-28`). It validates missing, deprecated, scope, bindings and cycles (`:95-130`). It shares the same boundary as Call Subflow (`boundary.ts:1-4`). Executor: `S/framework/automation-service/composite-execution/owner.ts:10,37-75`. Published via `publish-flow` (`service.ts:1963`), listed via `list-published-flow-nodes` (`:2053`). **Gaps:** no model catalog offers it (no reference in `.../plan/catalog.ts`); a snapshot copies `flow.nodes`, and an orchestration Flow has none (`composites.ts:59-69`), so **a chat-built Flow publishes empty [I]**; a Call Flow frame has `subflowId: null, graphRevision: null` (`owner.ts:69`), so in-run repair (`S/engine/automation/step-loop/incident-repair.ts:230` checks only Call Subflow), verification's called nodes and version joins all skip it; `lasting-acts.ts:42-44` treats it as "may have acted", which at least fails closed.

## 2. Running one
| Way | Today | Where |
|---|---|---|
| API, direct | **Refused:** "Subflow graph Flows cannot be launched directly; run their parent orchestration Flow." | `service.ts:2613,2627` |
| API, parent Flow | Router picks; caller cannot name a subflow. `subflowId` is declared on the run input and not read in the run path (grep) | `SVC/runtime-session/run-input.ts:21`; `service.ts:2522` |
| Chat | `flow.run` takes only `flowId`, no inputs | `S/runtime/conversations/commands/run-flow.ts:46,59` |
| Extension | Run sends `{projectId, flowId, runIntent}`, no inputs | `X/apps/extension/src/background/automation-relay/automation-relay.ts:63` |
| Model in exploration | No. `call:` must name a part of the same script; Call Subflow's `execute` answers "runs only inside a run" | `route-validation.ts:62`; `call-subflow.ts:40` |

**`core.test_subflow`** tests the builder's **own proposal in this build**: `{revision?, digest?, cannotUndo?, from?, fromStepImpossible?}` (`.../subflow-candidate/test-input.ts:13`). No inputs; values come from predecessors, and a required input nothing produces refuses the trial (`.../verification/detached/subflow.ts:20-24`). It resets, runs predecessors, judges, returns a partial receipt that is "never credit toward promotion" (`SVC/subflow-trial/run.ts:12-40`). `from` runs on the page as it stands with no judge (`SVC/subflow-trial/from-step.ts:7-27`).

**`core.run_flow`** replays steps of the current draft by number (`S/runtime/llm/node-tools/run/flow-part.ts:57-73`). Not offered to builders (`.../subflow-candidate/role-tools.ts:9`) or the supervisor (`S/runtime/project-agents/supervisor/role-tools.ts:3-12`). So not a saved graph, and no parameters.

**Missing to call one with parameters and get its result:** (1) a way past the refusal: a throwaway root of Call Subflow steps already gives a real boundary (`detached/subflow.ts:6-18`); (2) a target outside the candidate, whose source refuses accepted graphs [Doc `D/automation-studio.md:960`]; (3) inputs on the tool and API, checked against the interface; (4) a result: outputs by port id (`boundary.ts:95-97`) plus rows, and exploration stores no rows (discovery section 3), so the sink is shared with Answer First; (5) a start check, since no start is recorded; (6) acts in the build's ledger, which `SVC/project-build/entry-preparation.ts` already does ("Nothing is judged and no model is called ... every lasting act it lands is handed back").

## 3. Finding one
**What exists.**
- `list-flow-subflows` with `search`, `status`, `role`, `sort`, paged (`S/programs/automation-studio/api/handlers/subflows.ts:10-23`). `flowId` is optional in the service (`SVC/summaries/store.ts:414`), so a project-wide list works mechanically. The endpoint's resource is one Flow (`subflows.ts:17`), so a project-wide search needs its own endpoint.
- Search is `LIKE` on name, subflow id and graph id (`.../project/flow-resource-repository.ts:178`), or name, id and role on `listSubflowTargetsPage` (`:200`).
- Web panel directory: `WEB/features/automation-studio/subflows/SubflowsView.tsx`. It opens the graph; it has no run.
- `hierarchySubflows` on Flow summaries: id, name, role, graph id (`SVC/flows/hierarchy-subflows.ts:25-33`).

**Metadata today** (saved record written at `.../bootstrap/adaptation.ts:273-303`):
| Field | State |
|---|---|
| Name | Yes, from the plan or builder |
| Description / purpose | **Not written.** The graph gets boilerplate "Instruction-built graph for X" (`adaptation.ts:205`). The supervisor's `purpose` and the person's quotes live in the build record (`S/runtime/automation-activity/project/subflow-purpose.ts:13-25` makes the line for chat only) |
| Instruction | `localInstructionIds` points at the Flow's instructions, not the part's words |
| Site | **No.** Inferable only from an arrival or navigate step, which callable parts usually lack **[I]** |
| Inputs, outputs | Names only, on the graph, not the summary (`SVC/indexes/types.ts:8-19`) |
| Start state | **No** |
| End state | Only if `done when:` was written |
| Success record | `stability` zero at creation and **never updated** (grep: init sites `SVC/flows/mutations.ts:146`, `adaptation.ts:298`; readers `S/runtime/llm/harness/context-packet.ts:597`). Doc claims "stability metrics" [`D/automation-studio.md:1798-1800`]. Real data is in `flow_graph_judgements`, unread |

**Reusable index.** FTS5 is available and in use: `hierarchy_entries_fts`, `graph_nodes_fts`, `instructions_fts` (`relation-indexes.ts:49-51`; used at `graph-store.ts:56-60`, `hierarchy/repository.ts:128-135`). **No embeddings or vectors anywhere** (grep of `S/`). Fuzzy match exists for names: `S/components/automation/name-match/`.

**Needed:** a part card (design below) in a `project_parts` table with FTS5 over name, purpose, quotes and port names; exact filters on origin, lasting classes, status and trust. Text, site, inputs and outputs are then SQL. **"Action" is text only:** no action taxonomy exists, and I would not invent one. I recommend no embeddings: Core has none, it would add a model dependency, and a free shortlist plus the model already in the loop covers paraphrase.

## 4. Detection
### What can be reused
| Thing | Verdict | Why |
|---|---|---|
| Mining, learning, durable behaviour | No | Mining reads one recording's timeline (`SVC/evidence/mining.ts:38-60`). `TaskModelLearner` is a type with no implementer (`.../learning/contracts.ts:58`, grep). Durable behaviour only says a run changed the Flow |
| Element fingerprint (`S/runtime/target-matching/fingerprinting/`) | Yes, narrowly | Identifies a target across pages. Input to a step's shape hash |
| Route signature (`DOM/route-state/signature.ts:25-34`, `compare-signatures.ts:32-37`) | **Yes, the best signal** | Hashes only: path shape, layers, 64-control sketch; `matches` needs equal layers, equal path, Jaccard at least 0.5. Host-agnostic in Core (`S/runtime/automation-host/route-state/host.ts:31-51`). State routing already asks "which node's pre-state is this page" (`S/engine/automation/state-routing/decision.ts:114-117`). **Two gaps: no origin in it (`page-features.ts:8-14`), and project steps do not carry it** |
| Exploration reduction (`S/runtime/adaptation/exploration-reduction/`) | Partly | Cuts wandering, with receipts (`reduction.ts:1-19`). Useful to turn an exploration into a part. Its digest precondition is "stricter than it should be" by its own words (`state-predicate.ts:9-19`), so not for matching |
| Confidence and replay (`.../confidence/replay.ts`, `flow-change/confidence.ts:1-16`) | **Yes, for trust** | `unverified / provisional / established`, 2 zero-model replays, a failure drops it. Per adaptation today; the same rule fits a part version |
| Reusable LLM context (`.../project/reusable-llm-context-store.ts`) | No | Exact scope by flow, subflow, domain; TTL at most 7 days. A hint cache, not an identity |
| Flow-change `lasting-acts.ts:28-53` | **Yes** | Decides "may have acted" through nested frames, fails closed on an unreadable child. A static version gives a card's lasting classes |
| Facts (`DOM/facts/evaluate.ts:1-27`) | **Yes** | Zero-wait, read-only, `unknown` never passes. The right start check, no model |
| Candidate, unit digests (`.../candidate/digest.ts:6`, `S/runtime/adaptation/live-patch/`) | Yes | Exact dedupe of a graph |
| Repeat guard (`S/runtime/llm/repeat-guard/outcomes.ts:1-5`) | No | Catches a repeat of a failed or no-effect call. Repeating successful work is not its subject |

**Nothing today compares anything across Flows.** Discovery section 4 agrees: "Nothing matches a task to a Flow."

### The rule above all three
**A match only ever produces an offer. A wrong guess can waste a look, never spend an act.** Enforced by mechanics, not by asking the model:
1. No detector runs a part. Only an explicit tool call or a person does.
2. A run of a part passes: exact origin; its start check (facts: `unknown` fails); required inputs present; lasting classes within what this task asked.
3. Read-only prefix first. Before the part's **first lasting step**, the start of that step is re-checked by route signature against the recorded pre-state, else it stops there having done nothing lasting. **[I: design]**
4. Each step goes through the same gate as `core.run_node` (`.../bootstrap/action-permissions.ts:255`) and the project ledger, which refuses a repeat (`S/runtime/llm/node-tools/rerun-check.ts`).
5. Uncertain acts stop the run (`boundary.ts:80-83`). Already covered.

Note the limit: this catches the wrong **page**, not the wrong **meaning**. See fixed values below.

### The three points
| | 1. Before exploring | 2. During exploration | 3. After exploration |
|---|---|---|---|
| **Signals** | Exact: origin vs card sites; same instruction digest (`.../version/instruction-digest.ts:28`); input names. Text: FTS5 rank of the person's words. Model: choosing among the shortlist | Exact: origin plus signature of the page the last call left, which calls already carry as `routeState` [Doc `D/automation-studio.md:973`], so no host call. Recent calls as a prefix of a card's step shapes | All exact: normalised step-shape hash (definition, fingerprinted target, values masked); graph digest |
| **What it does** | Free opening look, which makes no provider call (`S/runtime/project-agents/supervisor/read-task.ts:9-17`), gains `knownParts`: about 5 cards, origin first | A note beside the evidence, only on a match, at most 3, each part once per page shape | Dedupes the library at save; links "this step range is part X" |
| **False matches** | Exact origin filter; **fixed values** on the card expose a different item; model nominates, Core checks the interface, start check gates | Generic pages (home, login, a site's shared template) will match: Jaccard 0.5 is tuned for "same place", not "same job" (`compare-signatures.ts:25`). A hit says "could start here", never "should". **[I]** Measure precision first (phase 7) | Low when shapes must be equal; near-matches stay unmerged |
| **Cost** | No added model call; a few hundred input tokens once **[I]** | One local compare per card on this origin per decision; tokens only on a hit; signatures must first be recorded from judged runs | No model. **But replacing steps changes the Flow**, which needs a judged whole run as it stands (AGENTS.md:500-507). Replace only before the first whole test; otherwise record the link and replace at the next repair |
| **Wrong match** | Start check refuses with nothing done, or a read returns wrong rows, caught by the judged run. Lost: seconds and a step's tokens | Ignored, or refused at the start check. Risk: it pulls the model off course | Caught by the whole test; never spends more than that test |
| **Saves** | A whole brief: exploration, submission, subflow test, subflow judge | Parts deep in a task the opening could not foresee: the user's sub-subflow | Nothing this attempt. Stops copies, and alone fixes two builders writing one helper (`scoped-submission.ts:14-18`) |

### Which gives most for least
**Point 1**, plus the exact-hash half of point 3 at save, because the library is worthless if it bloats. Point 2 last: it needs new recorded data and has an unmeasured false-match rate. If only one thing ships, it is the shortlist.

### Exact versus model
| Exact, no model | Needs a model |
|---|---|
| Same origin; same instruction digest; port names present; start facts; signature compare; step shape and graph digest; lasting classes; version pin; trust counts | "This part of the person's words means what this part does"; mapping the person's words onto inputs; whether a read part's rows answer this need (the judge); naming and describing a part |

## 5. The user's example through today's code
Dashboard Flow → site subflow → sub-subflow for one action, used from two places.
| Step | What happens | Verdict |
|---|---|---|
| Ask in chat | `flow.createHere` creates a new Flow per ask (`S/runtime/conversations/commands/create-here.ts:64`); no check for existing | Works, re-explores everything |
| Project Flow | Orchestration Flow, Router, `main` calling each part in order (`assembly.ts`, `:193`). Each builder arrives at **the build's one** start location (`detached/subflow.ts:41-52`) | A second site means a navigate step inside a part. **Multi-site is not modelled [I]** |
| Site subflow | One plan subflow, callable | Works |
| Sub-subflow | Supervisor cannot plan it: no `calls` field (`plan-input.ts:13`). A builder may write a helper part, re-keyed `siteA-<label>` | **Works only by a builder's choice; cannot be asked for** |
| Testing the sub-subflow alone | `core.test_subflow` targets the scope's own part | **Breaks:** only tested through its caller |
| Used from a second place, another subflow, same build | Refused as a sibling, and a builder cannot reach another's helper | **Breaks:** two copies under two keys, each paid for |
| Later Flow in the project | `bootstrap.unknown_call_target`; ownership check; source lookup | **Breaks three ways, and nothing tells the model it exists.** The build's context has no other Flow's subflows (`context-packet.ts:89,265`, `input.subflows` **[I]**) |
| Adding to the dashboard Flow | Project refuses extend (`.../generation/request.ts:56`; `run.ts:229`) | **Breaks in default mode** |
| Find it | Name or id `LIKE`; name is whatever the model chose; extension cannot call it (`WEB/lib/program-route.ts:88-116`) | Panel only, by name |
| Run the action alone with a value | Refused (`service.ts:2627`); no inputs from chat or extension | **Breaks** |
| Inspect | Trace nests (`attempt.subflowTarget`, `childTrace`); panel `runtime/attempt-story/child-run.ts`. Extension shows Flow rows only (`X/apps/extension/src/panel/automations/types.ts:30`) | Panel yes, extension no |

**On repair of a shared sub-subflow, today.**
- In a run: a failed step in the child can be fixed at node level; a broken child can be replaced whole as `{kind: "part"}` (`incident-repair.ts:230`), held for the rest of the run in `subflowOverrides` (`invocation-options.ts:53`; `frames/call-subflow.ts:59`).
- Kept only after a judged whole run that ran it (`SVC/runtime-adaptation/judged-promotion.ts:1-45`, user rule), written with a digest guard so a graph edited since is refused (`SVC/adaptations/unit-repair-change.ts:6-13`).
- **Who else is affected:** every caller in the same Flow gets the new revision on its next run, including a route the judged run never took. Nothing names the callers: `listFlowRouterTargetReferences` covers routes and fallback only (`service.ts:2776-2800`); there is no Call Subflow reverse lookup. Nothing warns. Other Flows are unaffected only because they cannot share.
- **Silent break risk:** a part's replacement mints new node ids and keeps the interface (`S/runtime/adaptation/live-patch/unit-replace.ts` `replaceAutomationStudioPartUnit`). Output bindings name node keys, and an unresolved one comes back `null` (`frames/call-subflow.ts:119-121`). I found no check that outputs still resolve in `unit-replace.ts` or `run-repair.ts` (grep). The repaired run's judge would catch it for that caller only. **[I; worth a provider-free probe]**

**How to keep it safe with sharing** (design): versions are immutable; callers pin; a repair makes a new version; only the caller whose judged whole run ran it moves. Other callers stay on the old version and see "a newer version passed elsewhere". When an old-version caller next **fails at that part**, it tries the newer version first, at zero model calls, and moves only after its own judged run. A changed interface is a new line, never offered automatically.

## 6. Efficiency
**Measured.** All 188 saved project-mode builds with steps, read from `meta.json` (187 `deepseek-flash`, 1 Claude with one call; includes failures; selection-biased toward debugging):
| Measure | Value |
|---|---|
| Decisions | 9,853, $9.59 |
| Builder / supervisor | 8,495, $8.59 / 1,358, $1.01 |
| Judge calls | 1,659, $2.79 |
| Briefs | 449 (2.4 a build) |
| **Brief decisions before that brief's first test** | **5,577 of 8,398 (66%); $5.57 of $8.40** |
| Before first test, per brief | 12.4 decisions, 7.3 `core.run_node` (3,300 in all) |

A brief never tested counts wholly as "before", so 66% is a little high. **[I]** At discovery's $0.065 a Claude decision, about $0.80 a brief, ignoring context growth. **That is the ceiling of a hit, not a saving: hit rate is unmeasured and cannot be measured today, because each Lab build starts blank in a fresh workspace (`testing-facility.md:2571`, via discovery).**

**What a hit saves.** Exploration, submit, subflow test window (31% of build wall time across the 12 runs in discovery section 9d), subflow judge pair. **What it does not save.** The Flow's judged whole run (user rule) and the supervisor's plan.

**Improves over attempts.** Each part version carries `{liveRuns, judgedYes, judgedNo, zeroCallRuns, lastFailureAt, repairs}`, derived from `flow_graph_judgements` plus `zero-provider-run.ts`. Tiers reuse `flow-change/confidence.ts`:
- `unproven`: from a best-attempt save. Findable and offered, marked, run with a look at its end.
- `provisional`: one judged yes on a run that executed that version.
- `established`: 2 later zero-model runs with no failure since.
- A failure after the last success drops to `unverified`, as today. Sites change, so trust is lost fast and earned slowly.

A subflow trial's partial yes is **not** credit for a Flow (`subflow-trial/run.ts:37-40`), but may count as evidence for that part's own card. **[I: a decision to make]**

**Can a trusted sub-subflow run with zero model calls inside a task still being explored? Yes, mechanically, and the path already exists.** `entry-preparation.ts` runs proposals through the detached runner mid-build with `allowLlmDiagnosis: false` and no patches (`.../detached/execution.ts:117`), with acts handed to the ledger. Needed: the target being saved rather than a proposal, inputs, rows, and a return shape. On failure it stops at a step and returns: the exploring model carries on from the page as left, which matches "repaired live on the failing step" (AGENTS.md:503-505). Its result to the model should be outputs and where it stopped, not per-step evidence, which also saves tokens. Attribution in the draft: a `call` step, not expanded steps. No judge fires, since a tool run is not a test. **[I for the last three; the mechanism is verified]**

## 7. The person's view
**Today.** Extension: Flow rows with name and last run (`panel/automations/types.ts:30`); choosing one opens its chat (`choose-automation.ts`). No subflow anywhere, except `onScreen.subflowId` passed through for context (`X/apps/extension/src/shared/protocol.ts:236`). Paired-client endpoints have **no subflow endpoint and no `get-flow`** (`WEB/lib/program-route.ts:88-116`). `list-flow-summaries` is allowed and carries `hierarchySubflows`, so names are already within reach. Panel: directory, graph editor, nested run story, no run or search beyond name. Chat: no command. The person-facing check bans the word "subflow" (`S/ui/person-facing/internal-terms.ts:8`) while the user uses it.

**Minimum API** (all in Core, added to `PAIRED_CLIENT_ENDPOINTS` and the relay, since both narrow per `automation-relay.ts:7-10`):
| Endpoint | Input | Output |
|---|---|---|
| `list-project-parts` | `projectId, query?, origin?, inputName?, outputName?, lasting?, trust?, usedByFlowId?, limit, cursor` | Cards, ranked |
| `get-project-part` | `partId, version?` | Card; step labels in plain words; calls tree; versions; callers with their pin |
| `run-project-part` | `partId, version?, inputs, permittedConsequences?, newRunId?` | Same as `run-runtime-session`, plus `outputs` and `stoppedAt`, or a closed refusal (`part.not_at_start`, `part.input_missing`, `part.act_not_allowed`) |
| `list-flow-runs` + `partId` filter | | Run history of a part |
| `set-part-pin` | `flowId, callNodeId, version` | For a person moving a caller; goes through a judged run |

Permissions already held: `programs.read`, `runtime.control`, `flows.write` (`program-route.ts:139`). Chat commands `part.find` and `part.run` then wrap the same calls. Run a part with lasting acts: permissions ask as today. Everything returned is names, labels and hashes, and never recorded page data (AGENTS.md); rows only through the existing export.

## What changed and why; commands run
Nothing changed in either repository: this is a read-only study. Commands were file reads, `grep`, `sed`, `git log` and `git status` on Core, and two read-only Node scripts over saved Lab `meta.json` and `snapshots/live-llm.json`. Observed: 188 project-mode builds, 449 briefs, the table in section 6. No test suite, Lab, browser, provider or panel ran. No row values, page text, cookies or tokens were printed.

## Capability table
| Capability | State | Smallest change | Risk |
|---|---|---|---|
| Nested call, typed boundary, cycle refusal | **Exists** | Depth bound and static cycle check at publish; warn when a bound output resolves to nothing | `null` is silent today; a JSON plan cycle reaches runtime |
| Supervisor plans nesting | Missing | Only if parts stay the unit: `calls` in plan format | Plan refusals were costly (t569) |
| Shared across Flows | Missing, three ownership checks | Composite source: siblings, then library by pin, at `AutomationStudioSubflowGraphSource.load` | All Call Subflow readers must accept a non-sibling |
| Pinned versions | Partial: Call Flow has them; subflows float | Version store reusing snapshot shape; `{partId, version}` on Call Subflow | Two call mechanisms; keep one execution path |
| Part card | Missing | Written at apply from build record and judged trace | Text must come from the person's words, never page text |
| Search | Partial: `LIKE`; FTS5 pattern exists | `project_parts_fts`, origin filter | Paraphrase misses; model covers |
| Start state | Missing | Signature + facts from the judged trial at frame start | Needs one host read per frame; absent for old Flows |
| End state | Partial: `done when:` optional | Require on library parts, or use `after` signature | Weak checks read as proof |
| Run a part, API | Missing | Throwaway root, real session, `run-project-part` | Fresh ledger each run, so re-running repeats acts by design: must be said to the person |
| Run a part, model tool | Missing | `core.run_part` beside `core.run_node`, via entry-preparation path | Rows sink shared with Answer First |
| Inputs from chat, extension | Missing | Add `inputs` to `flow.run`, relay | Value screening in chat |
| Trust record | Partial: data recorded, unread; `stability` dead | Reader over `flow_graph_judgements`; drop `stability` | Judgement rows only cover checked runs (sampling) |
| Detection, before | Missing | `knownParts` in opening look | Wrong-meaning match; judge is the backstop |
| Detection, during | Partial: compare exists; data absent | Add origin; sign project steps from judged runs | False matches on generic pages, unmeasured |
| Detection, after | Partial: digests exist | Shape hash at save | Replacement forces a re-test |
| Reverse lookup, callers | Missing | Table `part_calls` written at apply | Must stay transactional with graph writes |
| Repair isolation | Missing | Repair writes vN+1; only judged caller moves | Part graph immutability conflicts with `applyAutomationStudioUnitRepairPatch`, needs a branch |
| Extension access | Missing | Endpoints above | UX is the other study |
| Multi-site | Missing as a concept | Card has `sites[]`; arrival per part | One start location per build today |

## Recommended design
```text
Core owns it. Extension and panel only read and call.
PART     An immutable, versioned, project-scoped graph with a card.
         Own parts stay as they are: owned, latest revision, inside one Flow.
         A part enters the library only when its Flow is saved.
CARD     partId, version, name, purpose (the person's words), sites[] (origins),
         inputs[], outputs[], fixedValues[] (screened literals in its steps),
         lastingClasses[], startCheck (facts) and startSignature, endCheck,
         calls[] (partId@version), digest, stepShapeHash,
         trust (tier, counts, last failure), from (flow, build, run ids).
         No page text. Signatures are hashes.
STORE    project_parts, project_part_versions (snapshot object), part_calls
         (caller graph, node, partId@version), project_parts_fts.
         Reuses content store and FTS5. Per project. Nothing global yet.
CALL     Keep one execution path: builtin.control.call-subflow gains
         { part: { partId, version } }. subflowGraphs.load tries siblings, then
         the library at the pin. Frame, boundary, retries, repair, verification,
         versions, ledger all keep working on subflowTarget. Depth bound at
         publish. Call Flow stays for published global Flows.
RUN      run-project-part and core.run_part share one runner: throwaway root
         (as detached/subflow.ts), real session, no model (as entry-preparation),
         rows through the dataset sink, acts into the ledger,
         returns outputs and stoppedAt.
DETECT   Offers only. Opening look: up to 5 cards, origin first, FTS on the
         person's words. Save: exact shape hash dedupes. During: later, once
         precision is measured on saved Flows.
GUARD    A run needs: same origin, start check true (unknown fails), required
         inputs, classes within what was asked. Re-check before the first lasting
         step. Same gate and ledger as core.run_node.
TRUST    Derived, never stored by hand. confidence.ts tiers, per part version,
         from flow_graph_judgements and zero-call runs.
REPAIR   Never edits a version. Fix becomes vN+1 on the failing caller. Only a
         caller whose judged whole run ran it moves its pin. Others stay, flagged.
         On their next failure at that part, try vN+1 first at zero model calls.
         Interface change: a new line, no automatic offer.
FEEDS    Exploration ending in a best-attempt Flow saves unproven parts;
         each later run raises or drops trust. Costs fall as parts reach
         established and are called, not explored.
```

## Phases
Provider-free unless said. All realistic-scenario browser runs use only the ten scenarios.
| # | Build | What it proves |
|---|---|---|
| 0 | **Decide what a part is** (Open questions 1). Add a provider-free probe: replace a part, does a bound output go `null`? | The unit is right before anything is stored; a likely live bug confirmed or cleared |
| 1 | Card and store. Written at apply from build record and judged trial. Read `flow_graph_judgements`; retire `stability` | Every saved project-mode Flow produces valid cards; screen test finds no page text; trust numbers match run history |
| 2 | Search and browse API, FTS5, paired access | Two Flows' parts found by text, site, input, output; extension can read them; each new version writes its card in the same transaction |
| 3 | `run-project-part` with inputs, start check, refusals | On a realistic scenario: right result at zero calls; refused on the wrong page with **no site change**; acts recorded |
| 4 | Library call: pin, composite source, `part_calls`, depth bound. Dedupe at save | Part called from two Flows, sub-part from two parts: replay at zero calls, trace shows versions; changing a version leaves pinned callers identical |
| 5 | Model use: `knownParts`, `core.run_part`, a `call` step in the draft. **First paid phase: state the runs and cost first, supervised.** New Lab lane, same workspace, two tasks on one site | Second task: fewer decisions and dollars, oracle holds, no double act, Flow still judged whole. First real hit-rate number. A deliberately wrong-meaning case fails safely |
| 6 | Repair isolation, try-newer-first | Repair for one caller leaves another byte-identical; other caller's next failure heals at zero model calls; judged-run rule intact |
| 7 | Signatures on project steps; origin; measure precision offline against saved Flows; ship offers only if precision is good | Numbers decide whether point 2 ships at all |

Dependency: phase 5 needs Answer First's row sink and act handover. Phases 1-4 do not. Core boundary: all of this is Core, so the lead must alert the user first (AGENTS.md).

## What is risky
1. **What a part is.** Parts today are cut for one task. Guidance puts asks on one page into one subflow (`S/runtime/project-agents/supervisor/guidance.ts:81`), so "search and add to cart" may be one part, and reuse needs "search" alone. The pivot removes the supervisor and briefs that cut parts at all, and legacy-mode builds, which this week's Lab rounds ran, mostly produce one graph **[I]**. **The library has nothing to harvest until this is answered.**
2. **Fixed values, the worst false match.** A part saved from "add the red shoes" may hold the words as a literal. Same site, same page, start check true, wrong item: a lasting act, and no page check can catch it. So: list `fixedValues` on the card, refuse a lasting part with a literal from the person's request (a static check), and require generalisation to enter the library. Values must be screened, since a step can hold typed text.
3. **Unrecorded starts.** A part that needs "after search" has no page of its own. Without a start check it acts on a wrong page, with one it is often refused, and offers look useless until it is reached.
4. **Trust that lies.** A read part may return plausible wrong rows at zero calls. Judgement is sampled (`S/runtime/result-verification/check-schedule/settings.ts:49-56`), so a stale part can pass unseen inside a larger Flow. Trust must decay with failures, and the whole-run judge stays.
5. **Repeating acts.** `run-project-part` is a fresh run, so the completed-act ledger cannot help (discovery section 5). Running "add to cart" twice adds twice, correctly. Say so before running.
6. **Model drift.** Offers may pull a model into a near-match rather than looking. Must be measured in phase 5, with a wrong-meaning case.
7. **Test integrity.** A card built from an earlier task's words shown to a later task is user data, not guidance (AGENTS.md:520), but only if it never reaches shared prompts. Keep it per project. Lab pass rates stop being comparable once a workspace holds parts.
8. **Two call mechanisms.** Call Flow and pinned Call Subflow overlap. My design keeps one execution path but leaves Call Flow as dormant code to be reconciled.

## Verified versus inferred
**Verified by reading code:** everything marked with file:line in sections 1-3; ownership at three points; refusal of direct runs; chat and relay send no inputs; `stability` has no updater (grep); judgement rows have no reader (grep); search columns; FTS5 tables; no embeddings (grep); signature contents and threshold; entry preparation runs with no model and no judge; paired endpoint list; builder sibling refusal; plan format has no calls.

**Measured:** section 6 table, by a read-only script over `meta.json` and `snapshots/live-llm.json`, cost and count fields only. Scripts: `C:/Users/osrs_/AppData/Local/Temp/claude/c--Users-osrs--FluxStuff--FluxIQWebExtension/8f43228c-dbdb-476a-a7e2-84eabbfcc82d/scratchpad/study-subflows-measure.mjs`, `study-subflows-keys.mjs` beside it.

**Read from docs, not traced:** routeState on calls, orchestration Flows holding no nodes (doc plus `composites.ts` copying `flow.nodes`; I did not publish one), candidate source refusing accepted graphs, Lab fresh workspace (via discovery).

**Inferred, worth a probe:**
- Project-built Flows carry no route signatures. From code paths; snapshots in the Lab run I checked hold no graph, so I could not see a saved one.
- A replaced part can return `null` outputs silently.
- A chat-built Flow publishes as empty.
- Multi-site in one build is awkward, not impossible.
- Token and dollar estimates for offers and hits. Hit rate is entirely unknown.
- All of "Recommended design" is proposal. Its seam fit is read from types, not tried: a non-sibling through `AutomationStudioSubflowGraphSource`, and `subflowOverrides` on an immutable part, may hit checks I did not trace.

**Not read:** `automation-studio.md` beyond its subflow, router and repair sections (grep led); `automation-studio-native-nodes.md` and `-flow-dsl.md`; the project-agents plans beyond grep hits; `D/automation-studio/flow-authoring.md`, `flow-version-history-plan.md`, `answer-first-plan.md` beyond its status line (it lists "subflow library" as being rewritten), web editor internals, `listSubflowTargetsPage`'s use, repair-rerun of nested failures. Extension UX is the other study.

## Open questions and contradictions
**For the lead or user:**
1. **What is a part once exploration is single-loop?** Options: (a) the model marks them with the `part` grammar it already has; (b) Core cuts after the fact at site changes and lasting acts, with reduction, and a model names them; (c) a person says "save this as a part". My recommendation is (a) with a one-line guidance change, plus (c), since (b) needs a whole new segmenter. Generic guidance only.
2. **Project scope, or across projects?** The user said "within a project flow". I scoped to one project; signatures and trust do not obviously travel.
3. **Word for the person.** The user says "subflow"; `internal-terms.ts:8` bans it from person-facing text; chat prompts say "part" (`S/runtime/conversations/instructions/prompt.ts:116`).
4. **Does a part's own partial yes count as trust?** Today it is explicitly no credit for a Flow.
5. **Does an unproven part get offered at all?** The pivot saves best-attempt Flows, so most parts begin unproven. I would offer read-only ones and mark them, and not offer lasting ones until `provisional`.

**Contradictions found:**
- `D/automation-studio.md:1798-1800` says Subflows persist "stability metrics"; nothing writes them beyond zero.
- `run-input.ts:21` declares `subflowId`; the run path does not read it.
- `call-subflow.ts:12` names `runtime/executor/frames/call-subflow.ts`; it is at `engine/automation/frames/`.
- Role `site` exists in the model and cannot be written by a build.
- `core.test_subflow` is described as running with "its interface inputs" (`automation-project-agents-plan.md:271-272`), yet takes none: they come only from predecessors or the Flow.

```text
Outcome: Done
Changed: C:/Users/osrs_/AppData/Local/Temp/claude/c--Users-osrs--FluxStuff--FluxIQWebExtension/8f43228c-dbdb-476a-a7e2-84eabbfcc82d/scratchpad/study-subflows.md
Validation: read-only study; no checks named; measure script over saved Lab meta.json -> 188 project-mode builds, 66% of brief decisions before first test
Not verified: design seams not tried; route signature absence on saved project Flows read from code only; hit rate unmeasured; part-repair null outputs not probed
Report: the same path
Notes: Nesting runs today; sharing, search, start state and running one do not. Recommend the opening-look shortlist first. Open question 1, what a part is under one exploration, must be decided first.
```
