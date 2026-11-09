# FluxNode And The MVP Seal

Status: Active
Status detail: Plan written 2026-11-09 for the user's review; no source changed yet.
Created: 2026-11-09
Last updated: 2026-11-09
Owner: Senior supervisor agent
Scope: The framework pivot: FluxNode as Core's main offering (a scoped automation unit a developer declares in code and runs on Core's engine), the headless engine, SDK and contracts it needs, the engine gaps it exposes, and the later cloud offering. The extension's finish, the managed browser host, the Lab's FluxNode lane and the examples are owned by the paired document.
Paired document: `C:/Users/osrs_/FluxStuff/!FluxIQWebExtension/docs/working/mvp-seal-plan.md`
Related: [Answer First](./answer-first-plan.md), [hosted production](./hosted-production-plan.md), [runtime ownership](../architecture/runtime-ownership.md), [package boundaries](../architecture/package-boundaries.md), [platform](../architecture/platform.md)

---

## Current State

**State (2026-11-09).** Planning only, for the user's review. Nothing is built. The facts in "What Exists And What Is Missing" come from three read-only discovery agents on 2026-11-09, spot-checked by the lead against the source.

**The user's direction (2026-11-09), in their words:**

- "Now its time to really seal this MVP. So here is what we'll focus on. 1. Extension (which is nearly done from what i understand, all things considered) 2. The framework"
- "Although we'll still keep the automation studio controller program (at least for now), we're going to piviot to a much more client-centric system. So rather than having this centralized panel on the framework itself, the framework is simply the engine behind clients operations (which it already is), that way we dont spend so much time on the control panel UI which users wont even use anyways in 99% of cases."
- "With the framework we're going to introduce something called a FluxNode. This will be the core offering of the framework from now on. FluxNodes will be the programmatic way to use FluxIQ, which is part of how we'll demo the product."
- "for many tasks its simply too hard to both generalize the framework so it works in that scenario AND actually be able to accomplish a specific difficult task."
- "programmers will be able to set up both their inputs and their outputs to particular FluxNode, set optional parameters such as retries, whether to use judge, and all other optional params, and then have FluxIQ core run their automation task in that scoped node with the same state based engine for replaying state, deterministic cost saving, etc."
- "we can also add things like API cloud hosting access where people can have things like web automation run on the cloud at scale, OS automation on virtual machines/linux, etc. Of course that will just be an optional thing for programmers who dont want to set up everything and run it on theri own computer. That's where FluxIQ will make money from programmers, and the extension will make money from normal users."

Everything below that is not quoted above is the lead's design, marked (lead), and the user may overrule it.

**Going in (2026-11-09):**
- `dev` in both repositories holds Answer First: the attempt loop, the attempt-2 road and the extension screens. `main` was last promoted on 2026-11-03 and is 221 commits behind `dev` in Core and 133 behind in the extension.
- The four live lanes (`task/t875`-`t878`) hold fixes not yet on `dev`: 2 to 8 commits each in Core, 2 to 7 in the extension. Their open items are in [Answer First](./answer-first-plan.md), "Still open".
- About $145 of Claude credit is left. It expires about 2026-11-10.

**Next, once the user approves:** P0 (land the lanes, sweep, promote, and spend the credit on the agreed live checks), with P1 (freeze the FluxNode contracts) in parallel. Then P2 to P5 run as parallel lanes.

**Waiting on the user:** the Open Questions at the end.

## The Idea

A FluxNode is one scoped automation that a developer declares in code. It has a name, a goal, typed inputs, typed outputs, a scope (which sites it may use and which kinds of lasting act it may take), an optional check, and options (retries, judge, budget, model, mode). The program calls `run(inputs)` and gets typed outputs back. Core does the work with the engine it already has:
- The first run explores live and must reach the result.
- It saves a learned Flow.
- Later runs replay that Flow deterministically with new inputs, at zero model calls when it works.
- A run repairs the Flow live when the site changed, and explores on when repair cannot fix it.
- Every run returns the result or ends with its budget gone.

**Why it helps (lead).** The user names the problem: making FluxIQ general enough for any task and good enough at a specific hard one are in tension. A FluxNode removes most of that tension, because the developer supplies what the general agent has to guess:
- **Decomposition.** The developer splits the job into nodes.
- **Parameters.** The inputs say which values vary, so one learned Flow serves every input.
- **The answer's shape.** The outputs say exactly what to return.
- **The judge.** A check written in code replaces a model judging in most cases, so it is cheaper and does not guess.

**One engine, two faces (lead).** A FluxNode run is an Answer First attempt with its parts made explicit. A chat task is an implicit node: its goal is the message, it has no declared inputs, and its outputs are inferred. There is no second engine and no fork of the loop. Every standing rule that binds an attempt binds a node run:
- keep going until the result or the budget is gone;
- one act record, so no lasting act is repeated;
- loop detection;
- the floor of 3 retries per step;
- a stale target found again from the step that found it;
- the permission classes;
- one judged run before a Flow counts as finished.

## What Exists And What Is Missing

Discovery, 2026-11-09. "AF" is `packages/fluxiq/src/framework/automation-service/service/answer-first/`.

| Need | Exists today | Missing |
| --- | --- | --- |
| Learn from a goal | `runAutomationStudioAnswerFirstAttempt` (AF `attempt/run-attempt.ts`), built and tested provider-free | No public entry: it is reached only inside `generateFlowBootstrapAdaptation` (`service.ts` ~1483-1570), which assembles more than 20 internal fields. The instruction must first be saved on a Flow, and the mode is a process env var (`FLUXIQ_AUTHORING_MODE`). The product default is still `project` |
| Run a learned Flow with inputs | `runRuntimeSession` (`service.ts:2433`; `inputs?: JsonObject` in `runtime-session/run-input.ts`) | No typed outputs are returned: rows are read separately through the run-dataset endpoints |
| Task identity | AF `task-key/task-key.ts`: a digest of the folded instruction plus the start origin | No caller-supplied key |
| Budget | A $5 default purse, `Math.min` of every limit (`runtime/answer-first/attempt-purse/budget-usd.ts:23`) | A caller can lower it but never raise it |
| Judge | A Flow-less judge, one call; `completion.check` takes `judge(summary)` as an injected function | No off switch and no caller check. A saved-Flow run always makes one judge call, so no run is truly zero-call (auction attempt 2: one call, $0.0012) |
| Model | One provider per attempt, from Flow settings or env | No per-call model and no per-role model |
| Outputs | Flow interface ports (`flows/executable/interface/`), record-set schemas, run datasets, CSV and JSON export | No bridge from a schema in code, and no single `outputs` object |
| Retries and repair | The retry policy (4 attempts, `engine/automation/retry-policy.ts`), the stale-target re-find, the recovery ladder, and live repair then explore | Nothing for FluxNode; reused as is |
| Loop detection and acts | The loop detector (`runtime/llm/repeat-guard/loop-detection/`), the act record and run gate | Nothing new; open defects stay with Answer First |
| Subflows | The subflow library (`service/project-parts/`), Call Subflow, `core.run_part` | No link from a node's declared `uses` |
| Permissions and asks | `permittedConsequences`, the money, delete and send gates, asks parked on a conversation | Asks need a chat thread: no event or callback path for a program |
| Keys | Model calls are paid by an unlocked person session | No headless service credential |
| Server | The gateway WebSocket server and the program route live in `apps/web` (Next.js) | No headless server: the engine cannot be served without the panel |
| Hosts | Gateway `clientType: "worker"` and host leases (gateway 0.2). Downstream, the Lab launches Chromium with the extension and pairs it | No product browser host, and pairing needs a person's approval |
| Improve in simulation | The state engine (`client-gateway/trace-state/`) and the offline state trial (`service/offline-trial/state/run.ts`), unit tested | **Not wired.** `attempt/ending.ts` never calls it. The engine answers 28% of recorded commands and passed 0 saved explorations (Answer First's engine go/no-go report) |
| Domains | Web only (downstream). Native-node grants already name filesystem, process and child process | No non-web domain |
| Hosted | IAM engine, platform store, provisioning, tenancy prerequisites, route IAM (t784-t814 on `dev`), service profile | Not deployed (no VM, DNS or Caddy); billing ports are no-ops; no cloud execution of any kind |

## Design

**N1. Identity: the name plus a spec hash is the task key (lead).** Inputs never change the key. Changing the goal, outputs, scope or runtime changes the spec hash and starts a new learned Flow; the old Flow is kept and offered as a starting point, as a related draft is in Answer First's D10. This is what lets one learned Flow serve every input. The chat keeps its instruction digest.

**N2. Inputs are Flow inputs (lead).** The goal names its inputs, as in `{query}`. The first exploration runs with real values, and authoring binds them to the Flow's input ports instead of writing them in as fixed text (the general Flow authoring work already supports Flow inputs). A static check that needs no model backs this up: any fixed value in the Flow equal to an input's value is rebound to that input. A replay that the Flow cannot do with new inputs falls to repair, then exploration, and the result still comes back.

**N3. Outputs are declared, validated and traced (lead).**
- **Declared.** The output schema (zod in the SDK, a JSON Schema subset on the wire) becomes the Flow's output ports and a record schema.
- **Validated.** Every run validates its outputs against the schema, at no cost.
- **Traced.** Every value must trace to something read on the page or to an input. A model may choose and arrange values but never writes one, as Answer First's D9 already rules for rows.
- **MVP shapes:** a list of records, scalar fields, and done acts with their witnesses. Deeper nesting comes later.

**N4. The developer's check comes before any judge (lead).**
- **The check.** `check(outputs, inputs)` is a deterministic test the developer writes. It runs in the developer's process: the engine asks for it over the event stream and waits for the answer, locally and in the cloud alike.
- **Order.** Schema, then check, then the judge only as configured: `judge: "auto"` means only when there is no check; the others are `"always"` and `"off"`.
- **The verdict says what confirmed it:** `by: "schema" | "check" | "judge"`.
- **Zero-call replays.** A replay that passes the check makes no model call, so a deterministic run costs $0.
- **A failed check** is a "no" with its reason, sent back into the loop as a judge's no is today.

**N5. Budget and the hard rule (the rule is the user's; the mapping is the lead's).**
- **Endings.** A run ends in one of three ways:
  - its outputs pass the schema, the check and, if on, the judge;
  - its budget is gone;
  - the program stops it (an `AbortSignal`, the program's Stop button).
- **Replay only.** `budgetUsd: 0` means the run may only replay. If the saved Flow cannot do the task, the run ends at "budget out" with its best partial result and a resume handle. A production pipeline can forbid spending this way without adding a new failure ending.
- **Raising the budget.** A caller may set a budget above $5. The $5 default stays.

**N6. The scope is the grant, and asks become events (the PIN rule is the user's; the mapping is the lead's).**
- **The grant.** The declaration lists the sites and the classes of lasting act the node may take: read, change, send, money, delete. Declaring them is the standing grant, given before the run starts by the developer as the person. Nothing asks mid-run, which keeps "never in the middle of a Flow".
- **Out of scope.** An act outside the scope is refused, and the node looks for another way within its budget, as a declined permission does today.
- **Person-only moments.** A robot check or a code sent to a phone raises a `person_needed` event. The program may answer it through a callback. Otherwise the run waits until its timeout and returns `waiting_for_person` with a resume handle; Answer First already has that state.

**N7. Modes (lead).**
- `auto`, the default: replay, then repair, then explore.
- `explore`: start fresh while keeping the old Flow.
- Replay only, through a budget of 0 (N5).
- `fluxiq learn <node> --inputs samples.json` runs a node over sample inputs before deployment, so production calls start deterministic.

**N8. Composition in code (lead).** Nodes call nodes in plain code. A node may also list `uses: [otherNode]` so its Flow can call them as subflows, through the existing Call Subflow node and subflow library. The developer does the decomposition, which is what makes hard tasks tractable. The project supervisor agents stay off, as Answer First's D7 decided.

**N9. Learned state lives in a store and can be pinned (lead).**
- **The store.** Each node's Flows, recordings, notes, act record and run history live in the engine's store: locally, one project per app in the engine's data directory; in the cloud, the account's workspace.
- **Pinning.** `fluxiq pin <node>` writes the learned Flow to a reviewable file in the developer's repository. A pinned node replays exactly that Flow. Its repairs are kept in the store as proposals until the developer pins again.
- **Why.** Production runs are reproducible, and a Flow change goes through code review.

**N10. One API in two places (lead).**
- **The SDK** is a thin client of a FluxNode HTTP API with an event stream, both served by Core.
- **Locally,** `fluxiq dev` starts Core headless: the engine, the gateway and the API, with no web panel needed.
- **In the cloud,** the same API takes an API key. The same program runs in both places, and a later Python SDK is just another thin client.
- **Why not an in-process library:**
  - the web runtime needs the gateway server running anyway;
  - local and cloud behave identically;
  - model keys and SQLite stay out of the developer's process.

**N11. Hosts run the steps (lead).** A node names its runtime, and Core sends its steps to a connected host that provides that domain, through the gateway's `worker` client type and host leases.
- **Web hosts:**
  - the developer's own browser with the extension, for watching a run or using a site they are signed in to;
  - a managed browser the engine launches itself: Chromium with the FluxIQ extension, enrolled automatically, headed or headless, several at once. Downstream builds it from the Lab's launcher.
- **Later:**
  - cloud browser pools;
  - Linux and VM hosts for OS automation;
  - a "functions" runtime whose tools are the developer's own API calls.

**N12. Naming (lead).** "Node" already means a step inside a Flow. The public API and the docs say FluxNode. Code uses the `FluxNode` or `fluxNode` prefix, never a bare "node", for this unit.

**N13. The panel and Studio (the direction is the user's; the detail is the lead's).**
- **Studio** stays as Core's controller program.
- **The web panel** gets no new feature work. It stays for sign-in and pairing approval, and as an optional inspector of Flows, runs and recordings.
- **Panel UI plans move to Paused once this plan is approved:** `ui-upgrade-audit-plan.md` and the `automation-studio-*` UI plans.
- **For programmers,** the SDK, the CLI and the docs are the interface.

## The Developer Surface (sketch, lead)

```ts
import { FluxIQ, defineFluxNode, z } from "@fluxiq/sdk";

const fluxiq = await FluxIQ.connect(); // local engine from `fluxiq dev`; or { url, apiKey } for the cloud

const cheapestListings = defineFluxNode({
  name: "market.cheapest-listings",
  runtime: "web",
  goal: "Find the {count} cheapest listings for {query} that ship to {country}.",
  start: "https://market.example/",
  inputs: z.object({ query: z.string(), country: z.string(), count: z.number().int().max(10) }),
  outputs: z.object({
    listings: z.array(z.object({ title: z.string(), price: z.number(), url: z.string().url() })),
  }),
  scope: { sites: ["market.example"], acts: ["read"] },
  check: ({ outputs, inputs }) => outputs.listings.length === inputs.count || "wrong number of listings",
  options: { retries: 3, judge: "auto", budgetUsd: 0.5, model: "claude-haiku-5-5", mode: "auto" },
});

const run = await fluxiq.run(cheapestListings, { query: "lens hood", country: "UK", count: 3 });
run.outputs.listings; // typed and schema-checked, every value traced to a read
run.path;             // "replayed" | "repaired" | "explored"
run.verdict;          // { label: "confirmed", by: "check" }
run.cost;             // { calls: 0, tokens: 0, usd: 0 } on a replay that passed its check
```

`fluxiq.stream(node, inputs)` yields the same run's events: steps, asks, `person_needed`, cost and the ending. The program can stop a run with an `AbortSignal`.

## Phases

The MVP is P0 to P6. P7 runs in parallel and does not block it. P8 comes after the seal.

| Phase | Owner and tier | Builds | Done when |
| --- | --- | --- | --- |
| P0 Land and promote | Lead; both repositories | Integration round 2 (lanes A-D into `dev`, narrow checks on the merged tree), the full sweep, a fast-forward of both `main`s, and the live checks on the remaining credit (paired document, E1) | Both `main`s equal a swept `dev`, and each lane has `dev` merged back at its ready point |
| P1 Freeze the contracts | `worker-heavy` design, lead review; `packages/contracts` | `@fluxiq/contracts/fluxnode`: the spec (name, runtime, goal, start, inputs and outputs as a JSON Schema subset, scope, whether a check exists, options), the run request, the run result (outputs, verdict with `by`, path, cost, timings, run id, resume handle), the events (`step`, `ask`, `check_needed`, `person_needed`, `cost`, `ended`), the errors, the HTTP endpoints, and the mapping rules (schema to ports and record schema; scope to grants and a site allow list) | Parsers and tests merged, and both paired documents name the contracts stable. Every later lane builds against them |
| P2 Engine facade | `worker-heavy`; `framework/automation-service` | `runFluxNode(spec, inputs, options)` over the attempt loop: a project and Flow per spec hash; key = name plus spec hash; per-call mode, model and budget (raise allowed); a judge port (off, auto, always); the check port; scope to grants; asks to events; outputs assembled from rows and answers, schema-checked and traced; zero model calls when the check confirms a replay; the fixed-value rebinding check | Provider-free scripted-model tests: an exploration returns outputs; a replay with new inputs makes 0 calls; a failed check goes back into the loop; budget 0 ends at "budget out"; an out-of-scope act is refused. The existing answer-first tests still pass |
| P3 Headless engine | `worker`; `packages/fluxiq` | A `fluxiq/server` entry: a plain Node HTTP and WebSocket server for the gateway, the program API and the FluxNode API, with `apps/web` mounting the same handlers. `fluxiq dev` with a local data directory and the model key from env or the existing key store. API keys as IAM principals under a `FluxNodeRunner` policy. Moved by path, with no new mechanisms (see Guardrails) | The gateway and the FluxNode API serve without `apps/web`, the extension pairs to it, and the `apps/web` route tests still pass |
| P4 SDK and CLI | `worker`; new `packages/sdk` (npm `@fluxiq/sdk`) | `defineFluxNode`, `FluxIQ.connect`, `run`, `stream`, `AbortSignal`, typed errors, zod to JSON Schema, the check callback served over the event stream, `onPersonNeeded`; the CLI commands `dev`, `runs`, `inspect`, `pin` and `learn`. It depends only on `@fluxiq/contracts`, like the WebSocket client | A sample program in a temporary directory runs a scripted-model node end to end against `fluxiq dev` |
| P5 Managed browser host | Downstream (paired document) | A product package that launches Chromium with the extension and enrols it as a worker host; the Lab moves onto it | See the paired document |
| P6 Lab lane, examples, docs | Downstream for the lane and examples; Core for the developer docs | `pnpm lab node <example>`; three example programs on realistic scenarios; in Core, `docs/fluxnode/` with a quickstart, the concepts, and an API reference generated from the contracts | Each example shows run 1 exploring, run 2 with new inputs replaying at $0, and a perturbed site repaired, provider-free, plus one live proof per example |
| P7 Improve in simulation | `worker-heavy`; `client-gateway/trace-state`, AF `attempt/` | Wire the improve step after the answer (Answer First D3), only where recording is on; save the best result; measure against the go/no-go report | The go/no-go measures pass on the saved corpus, with zero false passes on the wire-form arm. Otherwise the step stays off and the reason is recorded. A pass in simulation never proves the live site |
| P8 Cloud | After the seal | C1 design and pricing; C2 the hosted FluxNode API on the `service` profile; C3 a browser pool (containerised Chromium hosts, a fresh profile per run, named persistent profiles for signed-in sites, secrets through secret handles, egress controls, the real-site policy); C4 metering and billing on the existing `BillingProvider` and `EntitlementPolicy` ports; C5 an OS host spike (a Linux container host for a minimal shell-and-files domain, proving the host contract is domain-neutral); C6 the functions runtime | C1 approved by the user; each later step gets its own plan |

**Schedule (lead; cut for parallel lanes, with each date's constraint named):**

| Dates | Work | What sets the date |
| --- | --- | --- |
| 11-09 to 11-10 | P0, and P1 drafted | The Claude credit expires about 11-10. P1 needs the user's yes on this design |
| 11-11 to 11-13 | P2, P3, P4 and P5 as four parallel lanes on disjoint files | P1 frozen. P2 is the critical path |
| 11-13 to 11-14 | Integration, and the provider-free FluxNode lane on realistic scenarios | All four lanes |
| 11-14 to 11-15 | Live proofs, examples and docs (P6) | After the credit expires, live runs spend real money; one live proof per example |
| 11-16 | Seal: the full sweep in both repositories, then promote | Full suites run at most twice a day |
| From 11-11 | P7, alongside | Not on the critical path |
| From 11-14 | P8 C1 design; C2 onwards after the seal | The user's pricing decisions, and the hosted VM and DNS (the user's items in the hosted plan) |

## Guardrails

- **No new machinery beyond the gaps in the table above.** t843 stalled when a system nobody asked for took over the critical path. Each lane gets its file list at dispatch, and a newly found need becomes a plan revision with its impact stated.
- **One engine.** The facade calls the attempt loop, and no lane copies or forks it.
- **The standing rules stand:** the result or the budget, no PIN mid-Flow, the ten realistic scenarios for every browser run, visible Lab browsers, no weakened oracle, and no model guidance shaped to a test task.
- **Security.** Managed-host enrolment and API keys get a `worker-heavy` adversarial review. Tokens are never logged. Both repositories are public, so an unfixed security finding stays on a local branch until it is fixed.

## Risks

1. **The engine's live reliability is the ceiling.** Nodes inherit today's pass rates, which are still partial. Scoping and developer checks help most, and the examples start from tasks the live lanes have already passed.
2. **Typed outputs traced to reads are the hardest new piece (P2).** The MVP limits the shapes (N3).
3. **The headless server move could sprawl as t843 did.** It moves by path with a fixed file list.
4. **Learning concurrency.** Parallel runs of one node that both repair could conflict. Learning is serialised per node (the per-Flow lock exists), replays run in parallel, and a parallel run's repair is kept as a proposal.
5. **The simulation may miss its gate.** The MVP does not depend on it.
6. **The cloud runs automation on third-party sites from FluxIQ's addresses.** That raises terms-of-service, abuse and robot-check questions, and needs an acceptable-use policy before launch.

## Work Ledger

### 2026-11-09 - Plan

- Agent: lead; three read-only discovery agents (programmatic surface, engine inventory, extension and hosted status).
- Changed: this document, and the paired `mvp-seal-plan.md`. No source.
- Why: the user asked for a full plan to seal the MVP around the extension and FluxNode.
- Validation: not validated; this is a plan. Discovery claims checked by the lead: `rg runAutomationStudioOfflineStateTrial` finds only its own module and test; `attempt/ending.ts` imports no simulation; `budget-usd.ts:23` is `Math.min(...limits)`; `framework/index.ts:146` is `export class FluxIQ`; `contracts/src/client-gateway.ts:24` lists `"worker"`.
- Outcome: shown to the user for review.
- Follow-up: P0 and P1 on approval.

## Open Questions

- **The MVP date and its scope (user).** The plan seals the extension and local FluxNode on 2026-11-16, with the cloud as the next milestone. Should any part of the cloud be inside the MVP instead?
- **Cloud pricing and licensing (user).** Per browser-minute plus model cost, a free tier, the developer's own model key or FluxIQ's; and the license of the SDK and the local engine (`COMMERCIAL-LICENSING.md` applies today). Settled by the user's decision; needed before P8 C1.
- **Carried from Answer First (user):** a first-time PIN for dangerous acts at the start of a chat (the lead recommends not yet), and deleting merged task branches on GitHub.
