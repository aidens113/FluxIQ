# FluxNode, Flows And The MVP Seal

Status: Active
Status detail: Revised 2026-11-09 with the user's second direction; execution started the same day (Wave 1).
Created: 2026-11-09
Last updated: 2026-11-12
Owner: Senior supervisor agent
Scope: The framework pivot. FluxNode becomes Core's main offering (a scoped automation a developer declares in code and runs on Core's engine). "Subflow" retires, so everything is a Flow in a project's folders. Data pipelines become first-class. One key-based access system covers every client. The panel is redesigned for setup, monitoring, security and an easy editor, with a panel-wide assistant. Simulated Android, Linux and Windows test environments are built, and the cloud comes later. The extension's finish, the managed browser host and the web Lab lane are owned by the paired document.
Paired document: `C:/Users/osrs_/FluxStuff/!FluxIQWebExtension/docs/working/mvp-seal-plan.md`
Related: [Answer First](./answer-first-plan.md), [hosted production](./hosted-production-plan.md), [runtime ownership](../architecture/runtime-ownership.md), [package boundaries](../architecture/package-boundaries.md), [platform](../architecture/platform.md), [state-aware recovery](./state-aware-recovery-plan.md)

---

## Current State

**Codex continuation (2026-11-12).** Durable scoped execution, immutable source occurrences and admitted target/task binding (t909) are integrated and pushed in both repositories. Core dev is 9319a1410; downstream dev is a5ffd4035. The lead independently passed the final 31-case dependency gate and the merge passed all 70 mandatory contracts. The managed-host lane (t907) completed its provider-free browser proof: two explorations and eight successor runs, each returning the exact four-row result; every successor retained the saved Flow and made zero model requests. All 14 lifecycle/isolation/accounting checks passed. Its combined-source gate after importing final t909 is running before integration. Result evidence (t905), security/handler continuation (local-only t902), P2c/P3b and simulated-environment acceptance remain unfinished. No full sweep, main promotion or package publication is claimed. See the paired downstream MVP launch plan and lane reports for current ownership.

**State (2026-11-11).** Main was promoted on 2026-11-11 with P1, P2a, P2b, P3a, P4, P7 and P9, and t899's developer overrides, docs, pinning and secret inputs (the extension's launch plan, W3). Per-FluxNode humanness (t898) and robot-check handlers (t902) are in their lanes. The user asked where FluxNodes stand on arbitrary environments, and the lead found four pieces unstaffed since the launch plan (2026-11-10). They are now running:
- **P5 managed browser host:** lane t907, downstream with paired Core.
- **P8 FluxNodes on the simulated environments:** explore, a zero-call replay and repair after a perturbation, with P11's example per environment. Branch feat/fluxnode-sims of `!FluxIQTestEnvironments`, which has no remote yet; asked of the user.
- **P2c multi-runtime engine:** designed in `reports/p2c-multi-runtime-design.md`. The four service slots become the default, and other runtimes register beside them, so the web path stays byte-identical. Its build starts with phases 0, 1 and 3. Phase 2 (the lease fix) and phase 5 (host modules) share a seam with t907. Phases 4a and 4b wait for t898 and t902.
- **P3b keys:** starts when t898 and t901 land, because they hold the permission and route files.

Lead decisions on P2c (2026-11-11; the user may overrule):
- A project holds one runtime, matching Core's rule that a Flow's domain is its project's.
- The web domain gains a manifest `runtime: "web"` rather than a rename.
- The proofs are a Core-only one (two runtimes on one engine) and a simulation-only one, with the web-plus-Android proof at phase 9.
- A FluxNode whose declared runtime the instance does not serve is refused at once. Today it silently runs on the bound domain.

**State (2026-11-09).** The user revised the direction the same day and asked for work to start at once ("Not in a few days"). Wave 1 is dispatched; the Wave 1 table below is the live list. Nothing is merged yet. The user's words are in "Direction". Everything else is the lead's design, marked (lead), and the user may overrule it.

**Going in:**
- `dev` in both repositories holds Answer First. `main` was last promoted on 2026-11-03.
- The four live lanes (`task/t875`-`t878`) hold fixes not yet on `dev`.
- The Claude credit (about $145) expires about 2026-11-10 and then refreshes to $200 at no cost to the user, so money no longer sets any date here. Paid runs are still watched by an agent and stop at the first balance error.

**Wave 1 (started 2026-11-09):**

| Unit | Who | Output | Blocks |
| --- | --- | --- | --- |
| P0 Land the live lanes, then the full sweep and promotion | Lead; integration task t880 (worktrees `fxwork/t880`) | Lanes A-D merged into t880 in both repositories; one Core conflict (the judge's question lines, kept both). Narrow checks: Core vitest 5,895 + 96 + 668 pass, extension 253, scenario-lab 43, attempt lane 117, both audits pass. Two real failures being fixed on t880: a stale or regressed witness-ambiguity domain test (lineage.test.ts:106, after lane B's 175acd38f), and the scripted two-attempt proof refusing a fourth `loop_verification` request (`run-mw9tqkp0-228b64e4`). Report: `mvp-seal-plan/reports/integration-round-2-checks.md` downstream | P2a and P6 B1 branch after it lands |
| P3a Headless engine | **Done, on `dev`** (t881, `cdd9ac907`); fluxiq 0.42.0 | `fluxiq/server` and `fluxiq dev`: the gateway and program route moved by path out of apps/web, which re-exports them. Lead re-ran `vitest run src/server` -> 73 passed; apps/web lib, server and route tests -> 391 passed; apps/web `check` -> exit 0; the audit passed with 2 stale baseline entries dropped. Headless limits: no cookie sessions (every caller is a paired client with a token), so pairing can be requested but not approved headless until P3b's keys; no recording starts; always the `local` profile | P3b, P5 |
| P4 SDK and CLI | **Done, on `dev`** (t882, `3f28c4722`); `@fluxiq/sdk` 0.1.0 | Lead re-ran its typecheck -> exit 0; tests -> 82 passed, 2 skipped (POSIX-only file permissions); publint -> all good. Proven against a fake engine only; `/api/keys/session` and the key refusal shapes are assumptions until P3b. Contract gap to close in P2b: the run request and register endpoint have no pipeline member, so a pipeline can be built but not run | P2b, P11 |
| P7 Data pipelines | **Done, on `dev`** (t883, `45933057c`); fluxiq 0.41.0 | Data step executors with lineage, sinks, map with concurrency, incremental keys and a cache, and a compiler to a Flow giving the same results as the direct runner. Lead re-ran its 39 tests -> pass. Left for P2b: register executors for the compiled `builtin.data.pipeline-source` and `-step` node types; bind the real FlowCaller, dataset store and pipeline state | P2b |
| P2a Engine seams | **Done, on `dev`** (t884, `c0affbacc`) | `AutomationStudioAnswerFirstCallerOptions`, never reachable from a request body: caller task key, model, a budget able to exceed $5, a check before any judge with zero-call confirmation, judge `auto`/`always`/`off`, a person-ask sink, and a scope gate refusing ungranted acts and sites unrun. Lead re-ran: answer-first tests -> 99 files, 741 passed; the seam tests -> 82 passed; the fluxiq typecheck -> exit 0 (with a 6 GB heap; the default heap ran out of memory); the audit passed. **Lead overruled one choice:** with judging off and no check, the worker recorded the attempt as stopped by a person, because the frozen contract allowed `achieved` only when confirmed. That would show a Stop nobody pressed, so P2b changes the contract additively to allow `achieved` labelled `unverified` | P2b |
| P8a Simulated environments driven by the engine | **Done, on `dev` of `!FluxIQTestEnvironments`** (local) | `packages/fluxiq-binding` registers any simulated environment with a FluxIQ instance. One Answer First attempt per environment, scripted and provider-free, reaches the result and the task's oracle accepts it. Lead re-ran `pnpm typecheck` -> exit 0 and `pnpm test` -> 511 passed. Report: `reports/sim-bindings.md`. **Core limits it found:** (1) one evidence binding, node runtime and host boundary per instance, so one domain per engine (P2c); (2) acts are keyed by their parameters, so positional ids collide, worked around with stable handles; (3) denied evidence keys apply to Core's own keys too; (4) permission verbs must be plain lowercase words; (5) a domain cannot report after the fact what an act lastingly did, so the binding rehearses acts on a scratch copy | P8b, P2c |
| P2b FluxNode runner | **Done, on `dev`** (t886, `f1bef5053`); fluxiq 0.43.0, contracts 0.17.0, sdk 0.2.0 | `await fluxiq.run(node, inputs)` works end to end in tests: the real SDK over loopback HTTP to `/api/fluxnode/v1` and the real runner, with the scripted model on the fake library site. Covered: explore then a zero-call replay with new inputs, a failing check, replay-only at budget 0, an out-of-scope act refused, judging off ending achieved/unverified, and a pipeline mapping a node over records. The open-mode guards are on the FluxNode API from day one. Lead re-ran: runner, API, pipelines and data nodes -> 121 passed; answer-first -> 131 files, 1,235 passed; contracts -> 219; sdk -> 88; the fluxiq typecheck exit 0; the audit passed. **Open:** pinned replay is recorded but not enforced (N8 needs an engine seam); the run registry is in memory (runs and resume handles lost on restart); `retries` is not passed on (the floor of 3 applies); a compiled pipeline is stored in Flow metadata until P6 lets top-level Flows hold nodes; no live model or browser run yet | P2c, P5, P8b, P11 |
| P9 Panel redesign | **Done, on `dev`** (t887, `12faefc5b`); contracts 0.18.0, fluxiq 0.44.0, ui-components 0.12.0 | A six-item shell with the assistant docked on every page; Home, Runs, Settings, the Flows list and a numbered step-list editor (inline edits, Undo, History, Restore; the graph editor at `/flows/<id>/graph`); 313 old-UI files deleted, old routes redirected. Assistant tools come from the endpoint registry (a parity test: 266 registrations, 0 undeclared); the assistant acts as the person, runs a consequential act only when their words clearly ask, and otherwise shows Allow / Don't. A single-use 60 s press grant replaces the PIN on destructive endpoints. Two adversarial reviews, every finding fixed. React 19.2's lost-ping bug is patched in `next@15.5.24` and `react-dom@19.2.8` (`patches/README.md` says when to drop it). Lead re-ran: frozen install; fluxiq and web tsc exit 0; `programs/_shared` 273 passed; audit passed; Playwright on the isolated fixture host, Home x8 -> 32 passed, all 7 panel specs -> 43 passed; the extension's check, panel tests (690) and test-runner typecheck against this Core. **Deferred:** sign-in (H), the Flows folder tree and the Security key list (P3b, P6), the wizard and Data pages; about 100 old Studio files remain; FluxNode runs are not reachable by the assistant until P3b puts `/api/fluxnode/v1` behind IAM; the editor needs run-from-a-step and per-step values from Core | P3b, P6 |
| Speed | Downstream `docs/working/task-speed-plan.md` | User, 2026-11-10: most tasks should take "a few mins max, ideally less than 3", and web actions should be "basically instant". Landed: A1 (t888), Lab deterministic runs (t889), instant actions rounds 1-3 (t890-t892). Round 4 (t893) is running; S6 and S9 wait for the live lane (t885) to merge | none |
| P2c Multi-runtime engine | Next, after P2b | One engine serving several runtimes at once (web, Android, Linux, Windows): evidence bindings, node runtimes and host boundaries kept per domain and chosen by the Flow's runtime, instead of one per instance (P8a's limit 1). This is N10 | P8b, P11 |
| E1 Live checks | `supervisor` on t885, Lab slot 1 | Running: the napkins Sonnet pair, the apprentices Haiku pair, the kiln Sonnet pair, then breadth | none |
| Full-suite slots | Lead | 2026-11-09: one used, by a Core `pnpm task finish t882` that launched `pnpm check` by default. It failed only because the main checkout had not installed the new package (`Cannot find module ...packages/sdk/node_modules/typescript`); after an offline install the SDK's build, check and lint passed. Later finishes use `--skip-checks` after narrow checks, as Core's AGENTS.md prescribes | none |
| P1 FluxNode, Flow and data contracts | **Done, on `dev`** (merge `b4e5d6302`); contracts 0.16.0 | `@fluxiq/contracts/fluxnode`: 117 new tests. Lead re-ran the contracts `check` -> exit 0, `test` -> 783 passed, and `node scripts/structure-audit.mjs` -> passed. Lead's decisions on its open points: retries resolve as a floor of 3 that an override may replace; FluxNode Flows are filed under the top-level `nodes/` folder (names of 1-7 parts), apart from automatic `web/...` placement; the SDK drops a zod `pattern` beside a `format` and refuses a bare one; a run request may later carry a pinned Flow export so a fresh cloud engine can replay it (P2b, additive); `flowId` stays required because registering a spec creates its Flow; zod is declared browser-safe to the structure audit, and the entry is guarded as a browser bundle | P2-P4, P6, P7 |
| K Keys and access design | Done; accepted as K8 | Report held locally until the K4 guards land | P3b |
| U Panel, editor and assistant design | Done; accepted as U7 | `fluxnode-plan/reports/panel-design.md` | P9 |
| F Subflow retirement inventory | Done; decided as O4-O6 | `fluxnode-plan/reports/flow-unification-inventory.md` | P6 |
| S Simulated Android, Linux and Windows | Done, on `dev` of `!FluxIQTestEnvironments` (local; no remote yet) | Android: 6 tasks, 5 perturbations. Linux: 7 tasks, 4 perturbations. Windows: 9 tasks, 4 perturbations. Lead re-ran `pnpm typecheck` -> exit 0 and `pnpm test` -> 466 pass, 0 fail. Reports: `fluxnode-plan/reports/sim-{android,linux,windows}.md`. sim-kit gaps for P8: a task cannot declare which perturbations it survives; there is no "terminal busy" state; attributes are strings only | P8 |
| E1 Live checks on the lanes' fixes | Lane supervisors after P0 lands | Results in Answer First's table | none |

**Next:** Wave 2 starts as soon as P1 is frozen: P2, P3, P4, P5, P6 and P7 as parallel lanes on disjoint files. Wave 3 is P8 bindings, P9 panel, and P11 examples and docs.

**Waiting on the user:** the Open Questions.

## Direction

The user, 2026-11-09, first message:

- "Now its time to really seal this MVP. So here is what we'll focus on. 1. Extension (which is nearly done from what i understand, all things considered) 2. The framework"
- "Although we'll still keep the automation studio controller program (at least for now), we're going to piviot to a much more client-centric system. So rather than having this centralized panel on the framework itself, the framework is simply the engine behind clients operations (which it already is)"
- "With the framework we're going to introduce something called a FluxNode. This will be the core offering of the framework from now on. FluxNodes will be the programmatic way to use FluxIQ, which is part of how we'll demo the product."
- "for many tasks its simply too hard to both generalize the framework so it works in that scenario AND actually be able to accomplish a specific difficult task."
- "programmers will be able to set up both their inputs and their outputs to particular FluxNode, set optional parameters such as retries, whether to use judge, and all other optional params, and then have FluxIQ core run their automation task in that scoped node with the same state based engine for replaying state, deterministic cost saving, etc."
- "API cloud hosting access where people can have things like web automation run on the cloud at scale, OS automation on virtual machines/linux, etc. ... That's where FluxIQ will make money from programmers, and the extension will make money from normal users."

The user, 2026-11-09, second message:

- Credits: "yes I'd like to use up expiring credits, but after that they just reset to $200 on claude plan for free, so it doesnt cost me anything."
- "Data pipelines need to become central to the fluxiq core. Devs should be able to optionally set the exact expected output data type (if any). FluxNodes should be very flexible."
- "i want you to start working on fluxnodes immediately. Not in a few days. And create test environments such as fake android emulator environments (fully simulated via tests not actually real android emulators), linux OS automation tasks, windows OS automation tasks, etc. All can be fully simulated via test environments created fully in TS."
- "FluxNodes wont operate that way UNLESS user is using API automation service OR they configure it locally (which will be off by default locally, but should warn the user in console saying they should configure a security key), in which case there will need to be some system for like a .pem key or something similar. (look into AWS and how they do it)"
- "We'll still need the web panel to work for local fluxiq, but it will be much more for configuration, monitoring, security, key storage, etc. ... It might make sense to just use the exact same type of .pem or similar key system for authing clients. Perhaps a setup wizard will be useful especially for running locally."
- "Basically everything should be the same type of client auth system, but we need to really streamline it as much as possible, so look into how to reduce user friciton, especially for programmers. So they can easily just get started developing right away with minimal setup."
- "We're not actually going to discontinue the automation studio editor. But we're going to massively simplify it, redo the entire UI, and make it extremely user friendly. It should be a place for users to be able to change fucntionality of FluxNode OR other client (eg web extension) flow functionality, see previous run logs, and edit how they function."
- "AI chat window should still be on panel as well, powered by whatever key user chooses (by default just the first key they enter, but should be configureable in settings) ... And ai chat window should become webpanel-wide for the entire fluxiq core, and controlling any and all programs or their underlying fucntionality. AI chat window should be able to do anything the user can (with same interpreted permissions from user text)"

The user, 2026-11-09, third message:

- "we're completely doing away with the whole "subflow" concept. Everything now is just a flow. And flows are within a project. Flows can call other flows, and be put in subdirecttories for organizational/readability purposes (this should be done automatically as fluxIQ runs via any client or FluxNode)"
- "But for the editor, it should be EXTREMLY easy to understand and use"

## One Concept: The Flow

**O1. Everything is a Flow (user).** A project holds Flows in folders, and any Flow may call any other Flow in its project. "Subflow", "project part" and "Call Subflow" retire from contracts, code, the UI, docs and model guidance. Call Subflow becomes **Call Flow**, keeping its invocation frames, entries, checkpoints and success check from the state-aware recovery work. The subflow library becomes the project's Flow tree.

**O2. FluxIQ files Flows into folders as it runs (user; the rules are the lead's).**
- **Where a new Flow goes.** When any client or FluxNode creates a Flow, Core places it in a folder path by deterministic rules: the runtime, then the site or app, then the task (`web/market.example/cheapest-listings`, `android/messages/send-reply`). A FluxNode's dotted name maps to its path (`market.cheapest-listings` becomes `market/cheapest-listings`).
- **Reusable parts.** A part that several Flows repeat, found by the known-part detection Answer First already has, is saved as its own Flow in the same folder, with a plain name.
- **Calls survive moves.** Calls name a Flow by id, so moving or renaming never breaks one.
- **People win.** A person's own move or rename always wins over the automatic placement.

**O3. Every way of using FluxIQ makes Flows (lead).**
- An extension chat task is a Flow.
- A FluxNode is a Flow declared in code.
- A pipeline is a Flow whose steps call Flows and move data (D3).
- The panel assistant edits Flows.

So the editor, the run logs and the folders show everything any client made.

**O4. Retiring subflows is a migration, not a rename (lead, from the F inventory, `fluxnode-plan/reports/flow-unification-inventory.md`).**
- **Two concepts today.** "Subflow" means two things:
  - a hidden child graph inside a Flow (the `subflows` table, stored as a Flow row);
  - the project-parts library (`project_parts*` tables, with versions made immutable by a trigger).
- **Size.** About 23,000 occurrences in 1,717 Core files and 2,071 in 258 extension files. About half of Core's hits and 90% of the extension's are tests or the Lab.
- **Folders.** Flows have no folders today. Every way of creating a Flow goes through `saveFlowInternal`, which is the one hook for automatic placement.
- **The migration** copies the data, verifies the copy, and gets a dry run on a copy of a project database and a rollback note. It never touches the user's real data in tests.

**O5. The four decisions the inventory asked for (lead).**
1. **Versions.** A call names a Flow by id and follows that Flow's latest accepted version, as it stands when the calling run starts. A repair to a shared Flow then helps every caller, and nothing changes under a run already in progress. A call may pin a version instead, and a pinned FluxNode (N8) pins the whole tree it calls.
2. **Routing.** A Flow keeps its own routing between its entries, which state-aware recovery depends on. A route that pointed at a hidden child graph becomes a route to a Call Flow step, and each hidden child graph becomes a Flow in its parent's folder.
3. **Folders** live in a folder table, with each Flow's placement recording `placed_by: fluxiq | person`, rather than in a plain path column. A person's placement always wins.
4. **Old names** (endpoints, IAM actions, exported types, the `builtin.control.call-subflow` definition id, stored keys) are read as aliases through one promotion after E6 lands in the extension, and never written. Saved Flow source keeps parsing through a versioned reader.

**O6. Batches (lead, from the inventory's section 5).** The batches are B1 to B9; B0, the design, is O4-O5 above. Groups run in this order:
1. B1 migration and B2 contracts, wire and IAM.
2. B3 engine and graph.
3. B4 service and placement, B5 prose, B6 UI and B7 docs.
4. B5 tool ids, B8 extension and B9 tests and Lab.

B1, B3 and B4 are serial on the same persistence and service files. Each renamed directory has one owner and moves in one commit.

## FluxNode

A FluxNode is a Flow declared in code. The declaration holds:
- a name and a goal;
- optional inputs and outputs, each with an exact type when the developer wants one;
- a scope: the sites or apps it may use, and the classes of lasting act it may take;
- an optional check;
- options: retries, judge, budget, model and mode.

The program calls `run(inputs)` and gets the result back. The first run explores live and must reach the result, then saves a learned Flow. Later runs replay that Flow deterministically. A run repairs the Flow when the site or app changed, and explores on when repair cannot fix it. Every run returns the result or ends with its budget gone.

**Why it helps (lead).** The user names the problem: making FluxIQ general enough for any task and good enough at a specific hard one pull against each other. A FluxNode lets the developer supply what the general agent otherwise guesses:
- the decomposition, by splitting work into Flows that call each other;
- the parameters, by declaring inputs;
- the answer's shape, by declaring outputs;
- the judge, through a check written in code.

**One engine (lead).** A FluxNode run is an Answer First attempt with its parts made explicit, not a second engine. Every standing rule that binds an attempt binds a FluxNode run:
- keep going until the result or the budget is gone;
- one act record, so no lasting act is repeated;
- loop detection;
- the floor of 3 retries per step;
- a stale target found again from the step that found it;
- the permission classes;
- one judged run before a Flow counts as finished.

**N1. Identity (lead).** The name plus a spec hash is the task key, and inputs never change it. Changing the goal, the output type, the scope or the runtime starts a new learned Flow beside the old one, which is offered as a starting point.

**N2. Inputs are Flow inputs (lead).** Authoring binds input values to the Flow's input ports and never writes them in as fixed text. A static check, which needs no model, rebinds any fixed value that equals an input's value.

**N3. Flexible outputs, with an exact type when wanted (user; the detail is the lead's).**
- **No declared output.** The run returns whatever the task produced: records, a plain answer, or done acts with their witnesses. Each comes with an inferred schema.
- **A declared output type.** The developer may give any JSON Schema the contracts support: nested objects, arrays, unions, enums and formats. Every result is then validated exactly against it, at no cost.
- **Tracing.** Every value traces to something read or to an input. A model may choose and arrange values, but never writes one.
- **Inputs** may be typed the same way, or left untyped.

**N4. The developer's check comes before any judge (lead).**
- **Where it runs.** `check(outputs, inputs)` runs in the developer's process, reached over the event stream.
- **Order.** The type is checked first, then the check, then the judge only as configured: `auto` (only when there is no check), `always` or `off`.
- **The verdict says what confirmed it:** `by: "type" | "check" | "judge"`.
- **Zero-call replays.** A replay that passes the check makes no model call, so it costs $0.
- **A failed check** is a "no" with its reason, sent back into the loop.

**N5. Endings (the rule is the user's; the mapping is the lead's).** A run ends in one of three ways:
- its outputs pass;
- its budget is gone;
- the program stops it (an `AbortSignal`).

`budgetUsd: 0` means replay only, ending at "budget out" with the best partial result and a resume handle. A caller may set a budget above $5; the default stays at $5.

**N6. The scope is the grant (the user's PIN rule; the mapping is the lead's).**
- **The grant.** The declared scope is the standing grant, given before the run starts, so nothing asks mid-run.
- **Out of scope.** An act outside the scope is refused, and the run looks for another way within its budget.
- **Person-only moments** raise a `person_needed` event. The program may answer it through a callback. Otherwise the run returns `waiting_for_person` with a resume handle.

**N7. Modes (lead).**
- `auto`: replay, then repair, then explore.
- `explore`: start fresh while keeping the old Flow.
- Replay only, through a budget of 0.
- `fluxiq learn` runs a node over sample inputs before deployment.

**N8. Pinning (lead).** `fluxiq pin` writes the learned Flow to a reviewable file in the developer's repository. A pinned FluxNode replays exactly that Flow, and its repairs wait as proposals until the developer pins again.

**N9. One API in two places (lead).**
- **The SDK** is a thin client of a FluxNode HTTP API with an event stream, both served by Core.
- **Locally,** `fluxiq dev` serves it headless, with the panel optional.
- **The cloud** serves the same API.
- **Why not an in-process library:**
  - the runtimes need the gateway server anyway;
  - local and cloud behave identically;
  - model keys and SQLite stay out of the developer's process.

**N10. Hosts run the steps (lead).** A Flow names its runtime, and Core sends its steps to a connected host that provides that domain: a gateway `worker` client holding host leases.
- **Web hosts:**
  - the developer's own browser with the extension;
  - a managed Chromium with the extension, launched and enrolled by the engine, headed or headless, several at once (paired document).
- **Simulated Android, Linux and Windows hosts** for tests (S).
- **Later,** in the cloud: real VMs and containers, and a "functions" runtime whose tools are the developer's own API calls.

**N11. Naming (lead).** "Node" already means a step inside a Flow. The public API says FluxNode, and code uses the `FluxNode` or `fluxNode` prefix for this unit.

```ts
import { FluxIQ, defineFluxNode, z } from "@fluxiq/sdk";

const fluxiq = await FluxIQ.connect(); // finds the local engine and any key itself (K3)

const cheapestListings = defineFluxNode({
  name: "market.cheapest-listings",
  runtime: "web",
  goal: "Find the {count} cheapest listings for {query} that ship to {country}.",
  start: "https://market.example/",
  inputs: z.object({ query: z.string(), country: z.string(), count: z.number().int().max(10) }),
  outputs: z.object({ listings: z.array(z.object({ title: z.string(), price: z.number(), url: z.string().url() })) }), // optional
  scope: { sites: ["market.example"], acts: ["read"] },
  check: ({ outputs, inputs }) => outputs.listings.length === inputs.count || "wrong number of listings", // optional
  options: { retries: 3, judge: "auto", budgetUsd: 0.5, model: "claude-haiku-5-5" }, // all optional
});

const run = await fluxiq.run(cheapestListings, { query: "lens hood", country: "UK", count: 3 });
run.outputs; run.path; run.verdict; run.cost; // path: "replayed" | "repaired" | "explored"
```

## Data Pipelines

**D1. Data is first-class in every Flow (user; the detail is the lead's).**
- Typed values and datasets pass between steps and between Flows.
- Every value carries its lineage: which run, which step, and which read or input it came from.
- The existing dataset machinery is the base: record sets with schemas, per-run datasets, and CSV and JSON export.

**D2. Data steps are deterministic and make no model calls (lead).**
- **Map:** call a Flow once per record, with a concurrency limit.
- **Filter, transform, dedupe, join, sort and limit, aggregate.** A transform is a declared expression, or a function in the SDK reached over the event stream.
- **Validate** against a type.
- **Sinks:** a dataset, a JSON or CSV file, a webhook, or an SDK callback.

**D3. A pipeline is a Flow (lead).** The SDK's `pipeline()` builder compiles to a Flow, so it runs in the engine, appears in the editor's folders and shows in the run logs. Plain code that calls FluxNodes one after another also works, and is tracked as separate runs that share a correlation id.

**D4. Incremental and cached (lead).** A map step can skip records it has already processed, by their key, and can reuse a Flow's result for identical inputs within a stated time. Both save cost.

**D5. Later:** schedules and triggers (cron, webhook), and database sinks.

## Keys And Access

**K0. The user's rules.**
- FluxNodes do not use the client-pairing security unless:
  - the caller uses the cloud API; or
  - the person turned keys on locally.
- Local keys are off by default, with a console warning to configure a security key.
- Every client uses the same key system.
- Setup should be as low-friction as possible, especially for programmers.

**K1. One credential for every client (lead; the K report settles the details).**
- **The key pair.** An Ed25519 key pair whose private key lives in a PEM file and never leaves the client. Core keeps only the public key, bound to a principal (a person or a service account) with an IAM policy. The IAM engine already exists.
- **The precedents.** It is the same shape as AWS IAM Roles Anywhere (a private key plus a certificate turned into temporary credentials) and SSH authorized keys, without needing a certificate authority for local use.

**K2. Prove the key, then use a session (lead).**
- **The exchange.** The client signs a challenge (time, nonce, key id, audience). Core returns a short-lived session token, as AWS STS issues temporary credentials. The SDK renews it automatically.
- **Replay protection.** A clock-skew window like SigV4's five minutes, plus a nonce cache.
- **WebSocket hosts** sign their hello the same way.

**K3. A credential chain, AWS-style, so code never handles keys (lead).** The SDK looks for a credential in this order:
1. an explicit option;
2. `FLUXIQ_KEY_FILE` or `FLUXIQ_KEY`;
3. the project's `.fluxiq/credentials` (git-ignored);
4. named profiles in `~/.fluxiq/credentials`;
5. otherwise, local open mode.

**K4. Local open mode, off by default and warned (user; the guards are the lead's).**
- **Guards.** The engine listens on loopback only. It refuses requests whose browser `Origin` is not its own panel and whose `Host` is not a loopback name, so a web page or a DNS-rebinding attack cannot drive it while keys are off.
- **The warning.** Every start in open mode prints: "FluxIQ accepts FluxNode calls from any program on this computer without a key. Run `fluxiq keys secure` to require one."

**K5. Zero-friction setup (lead).**
- **First start.** The engine creates the owner's key pair and writes it to `~/.fluxiq/credentials` with owner-only permissions. Turning keys on is then one command and no copying: the SDK on the same machine finds the key itself.
- **The cloud.** `fluxiq login` runs a browser device flow, like `gh auth login` and `aws sso login`. The key pair is made locally and only its public key is registered.
- **The panel** can also create a key and offer its PEM for download once, like EC2 key pairs.

**K6. The same key everywhere (lead).**
- **Managed browsers and simulated hosts** get engine-issued keys, with no person to approve, because the engine launched them.
- **The extension** makes a non-extractable key in the browser, and pairing becomes "approve this key", keeping today's code entry as the approval step.
- **The local panel** opens through a one-time sign-in link that `fluxiq dev` prints, signed by the owner key. The hosted panel keeps account sign-in.
- **The panel assistant** acts as the signed-in person.

**K8. Corrections from the K report (lead, accepted 2026-11-09).** The report checked K1-K7 against Core and AWS practice. It is held locally until the K4 guards land, because it carries a threat analysis of the public code.
- **The profile variable** is `FLUXIQ_KEY_PROFILE`, because `FLUXIQ_PROFILE` already names the deployment profile.
- **Private keys** live only under `~/.fluxiq/keys/`. A project's `.fluxiq/` may name a profile, never hold a key.
- **The key id** is `fxk_` plus a SHA-256 of the public key, and credentials use an INI file in the style of AWS's shared files.
- **The string to sign** is canonical and SigV4-like: the algorithm, purpose, audience (the configured origin plus an instance id), key id, time, nonce and body hash.
- **Sessions** last 15 minutes to 12 hours, 1 hour by default as STS. The clock window is ±300 s and nonces are kept 600 s. WebSocket hosts sign the server's challenge.
- **Open mode covers the FluxNode API only.** The extension, the panel and hosts always authenticate.
- **The full K4 guard list is required before open mode ships:**
  - loopback only;
  - `Host` checks on HTTP and on the WebSocket upgrade;
  - an `Origin` check;
  - a `Sec-Fetch-Site` check;
  - unkeyed calls must be JSON carrying a `FluxIQ-Client` header;
  - never CORS;
  - unkeyed calls act as the owner under `FluxNodeRunner`, never as an administrator.
- **Keys made by the panel** are generated in the browser, so their PEM is downloaded once and the server never sees the private half.
- **The local sign-in link** sits in the URL fragment and is minted by a call proven with the owner key.
- **Managed browsers** make their own key and enrol it with a one-time launch ticket.
- **Headless model-key custody.** Model keys are sealed under the person's password today, so a FluxNode program could never spend one. A `key` custody holder fixes this: its secret comes from a deterministic Ed25519 signature, with a stored random secret as the fallback where signatures differ. Its acceptance includes a probe that the signature really is deterministic in Node, Chrome, Edge and Firefox.
- **Migrating paired extensions.** A paired extension upgrades on a normal reconnect, sending its old token with its new key. Nobody re-pairs, and model-key unlocks carry over.
- **The SDK always signs with the owner key when it finds one,** even while keys are off. The engine still accepts unkeyed calls in open mode and keeps warning. This is the lead's reading of the user's rule, and makes "turn keys on" a no-op for code.
- **IAM.** Two additive changes to the frozen IAM contracts are approved by the lead as their freeze owner: the condition key `fluxiq:AllowToken` and the request origin `panel-assistant`. The host and FluxNode actions are registered in the IAM catalog. In v1, CI keys are bound to a user; service identities come later.

**K7. Least privilege (lead).** A key is bound to a policy: `FluxNodeRunner` (run Flows in one project), `FluxIQBrowserSession`, `FluxIQHost` or `Admin`. A key is created with the least it needs. Keys are listed, rotated and revoked on the panel's Security page, which shows each key's last use.

## Panel, Editor And Assistant

**U1. What the panel is for, locally (user).** Configuration, monitoring, security, key storage and the editor. Day-to-day automation happens in clients.

**U2. A setup wizard (user; the steps are the lead's).** The first `fluxiq dev` opens the panel at its one-time link. It runs five steps, each skippable:
1. add a model key (stored encrypted; the first key becomes the default);
2. choose security (open on this computer, or keys required);
3. connect a client (the extension's pairing, or the SDK snippet to copy);
4. run a sample Flow;
5. done.

`fluxiq init` runs the same steps in a terminal for programmers.

**U3. Few top-level pages (lead; the U report settles the layout).**

| Page | What it holds |
| --- | --- |
| Home | Status: engine, connected clients and hosts, today's spend, recent runs |
| Flows | The project's folder tree and the editor |
| Runs | Logs from every client and FluxNode, with each step, its evidence and its cost |
| Data | Datasets, pipeline outputs and exports |
| Security | Keys, connected clients, permissions and the audit log |
| Settings | Model keys and the default, the assistant's model, budgets, storage and advanced options |

**U4. An editor that is extremely easy (user; the shape is the lead's).**
- **What you see.** A Flow is a plain-language numbered list of steps, saying what each does and where. Its inputs and outputs sit on a card above. A call to another Flow is a linked step.
- **How you edit.** Change a step's words or values inline, reorder steps, or ask the assistant. The graph view is optional, under Advanced.
- **Saving.** Every edit is checked against the last recording where the engine can, and saved as a new version (version history exists).
- **FluxNode Flows** show where their declaration lives in code. Their steps are editable, while the interface stays owned by the code.

**U5. A panel-wide assistant (user; the mechanism is the lead's).**
- **Where.** One chat docked on every page, rendered from `@fluxiq/ui-components`.
- **What it can do.** Its tools are generated from the program API registry: every endpoint the person's IAM policy allows becomes a tool with that endpoint's schema. So it can do what the person can, through the same checks.
- **Consequential acts** proceed only when the person's words clearly ask for them; otherwise they get a one-press Allow. These are deleting, sending, moving money, changing keys or security, and spending beyond the budget.
- **Context.** It knows the page and the selection.
- **Its model.** The model key chosen in Settings; by default, the first key the person entered.

**U7. Corrections from the U report (`fluxnode-plan/reports/panel-design.md`; lead, accepted 2026-11-09).**
- **Endpoint schemas come first.** None of the registry's 272 endpoints declares a payload schema, so tools cannot be generated until about 100 exposed endpoints have one. A check fails the build when an endpoint has neither a schema nor a stated reason to stay hidden (the report's B1-B4).
- **A press grant replaces the PIN.** Every destructive endpoint demands a PIN today, which breaks the user's no-PIN rule and cannot work for a local owner signed in by link. Instead, pressing Allow mints a single-use grant lasting 60 seconds, bound to the session, the endpoint and the payload. It goes through the keys lane's adversarial review.
- **Model keys after a link sign-in** open through K8's `key` custody holder (the owner key on local).
- **Version history** exists in storage, but its list, snapshot and restore endpoints have no handlers, and there is no operation to change a step's label. The report's brief D adds both.
- **A tool loop for the assistant.** The chat makes one decision per message today, and its threads live inside a project. The assistant gets a bounded tool loop on a new panel-wide thread type stored outside every project, watched by Core's loop detector. The extension's threads keep today's interpreter.
- **The editor** is a pure Core module that turns the stored graph into a nested numbered list in which every step appears exactly once; a step that does not nest shows as a "jump". Static checks block a bad edit; an offline check against the last run only advises.
- **The wizard's sample Flow** uses data steps only: no model, no browser, no client, $0.
- **The briefs.** The report's 15 briefs (A-O, plus W downstream) are the P9 work list, with the order and parallelism it gives.

**U6. The old panel UI plans are superseded by this (lead).** `ui-upgrade-audit-plan.md` and the `automation-studio-*` UI plans are kept only as evidence.

## Simulated Test Environments

**S1. Where (lead).** In a new sibling repository, `C:/Users/osrs_/FluxStuff/!FluxIQTestEnvironments`, which links Core as the web domain does. Core forbids domain-specific automation code, and the extension repository is the web domain only. It is local only until the user decides on its GitHub remote.

**S2. Shape (lead).**
- **`sim-kit`** holds the shared contract:
  - an environment is a deterministic state machine: observe a view tree, act with typed actions, a simulated clock, snapshot and restore, and a log of every act;
  - perturbations: renamed controls, moved items, pop-ups, slow loads;
  - tasks: an instruction that is complete and unambiguous, optional typed inputs and outputs, a scope, a seeded setup, an oracle judged on the change, and an honest path that proves the task is achievable.
- **Wave 1** builds the pure simulators.
- **Wave 2 (P8)** adds each environment's FluxIQ domain binding (a manifest, a runtime adapter, the evidence tools) and a simulated host, so FluxNodes run on them through the same path as the web.

**S3. Environments (lead).**
- **Android:** a launcher; apps (contacts, messages, settings, a shop, notes); a view hierarchy with resource ids, text, content descriptions and bounds; actions to tap, long-press, type, swipe, scroll, go back or home, open an app and wait; permission dialogs and notifications.
- **Linux:** a filesystem with users and permissions, processes, a shell subset with pipes and redirection, a package-manager stub, and a simple desktop with a file manager, an editor, a terminal and settings.
- **Windows:** a desktop with a UI Automation-like tree; apps (Explorer, Notepad, Settings, a mail app, a small spreadsheet); a registry subset, a PowerShell subset, and UAC prompts as permission moments.

Each environment has at least six tasks (reading, changing, across apps, and recovery after a change) and at least three perturbations.

## What Exists And What Is Missing

Discovery, 2026-11-09. "AF" is `packages/fluxiq/src/framework/automation-service/service/answer-first/`.

| Need | Exists today | Missing |
| --- | --- | --- |
| Learn from a goal | `runAutomationStudioAnswerFirstAttempt` (AF `attempt/run-attempt.ts`), tested provider-free | No public entry (reached only inside `generateFlowBootstrapAdaptation`, `service.ts` ~1483-1570). The instruction is stored on a Flow, and the mode is a process env var |
| Run a learned Flow | `runRuntimeSession` (`service.ts:2433`, `inputs?: JsonObject`) | No outputs returned; rows are read separately |
| Identity | AF `task-key/task-key.ts`: a digest of the instruction plus the start origin | No caller key |
| Budget | A $5 default, `Math.min` of every limit (`runtime/answer-first/attempt-purse/budget-usd.ts:23`) | Cannot be raised |
| Judge | A Flow-less judge; `completion.check` takes `judge(summary)` injected | No off switch and no caller check; every saved-Flow run makes one judge call |
| Model | One provider per attempt, from Flow settings or env | No per-call model |
| Outputs and data | Flow ports (`flows/executable/interface/`), record sets, run datasets, export | No schema from code, no exact typing of nested outputs, no lineage, no data steps |
| Subflows | The project-parts library (`service/project-parts/`), Call Subflow, `core.run_part`, the extension's Library | Everything renames to Flows in folders (O1), and there is no automatic foldering |
| Permissions and asks | `permittedConsequences`, gates, asks parked on a conversation | No event or callback path |
| Keys | Gateway pairing with a rotating credential; the IAM engine; model calls paid by an unlocked person session | No key pairs, no service credentials, no credential chain, no local open-mode guards |
| Server | The gateway and the program route live in `apps/web` (Next.js) | No headless server |
| Hosts | The gateway `worker` client type and host leases; the Lab's launcher downstream | No product host and no simulated hosts |
| Assistant | Conversations and the shared chat widget | Not panel-wide; tools are not generated from the registry |
| Improve in simulation | The state engine and the offline state trial, unit tested | Not wired (`attempt/ending.ts`); answers 28% of recorded commands; 0 passes on saved explorations |
| Domains | Web only | Simulated Android, Linux and Windows (S) |
| Hosted | IAM, provisioning and tenancy on `dev` | Not deployed, no billing, no cloud execution |

## Phases

| Phase | Wave | Builds | Done when |
| --- | --- | --- | --- |
| P0 Land and promote | 1 | Integration round 2, the full sweep and promotion of both repositories; then E1's live checks | Both `main`s equal a swept `dev` |
| P1 Contracts | 1 | `@fluxiq/contracts` entries for: the Flow interface with optional exact types; the FluxNode spec; run request and result; events; errors; data steps and lineage; the Flow folder path and Call Flow names; the HTTP endpoints | Parsers and tests merged, and both documents name them stable |
| P2 Engine facade | 2 | `runFluxNode` over the attempt loop (N1-N7): caller key, mode, model, budget (raise allowed), judge port, check port, scope as grant, asks as events, outputs typed and traced, zero-call replays, input rebinding | Scripted-model tests for each N rule; the answer-first tests still pass |
| P3 Headless engine and keys | 2 | A `fluxiq/server` entry outside `apps/web`; `fluxiq dev`; K1-K7 from the K report; open-mode guards and warning | The gateway and the FluxNode API serve without `apps/web`; a keyed and an open call both behave as K says; an adversarial key review finds nothing open |
| P4 SDK and CLI | 2 | `@fluxiq/sdk` (`defineFluxNode`, `connect`, `run`, `stream`, `pipeline`, the credential chain) and the CLI: `init`, `dev`, `keys`, `login`, `runs`, `pin`, `learn` | A sample program in an empty directory runs with no setup beyond `npx fluxiq dev` |
| P5 Managed browser host | 2 | Downstream (paired document) | See there |
| P6 Flow unification | 2 | O1-O3, from the F inventory: the renames, Call Flow, folders, automatic placement, a versioned data migration, and the extension's Library as the Flow tree | No "subflow" left in contracts, UI or guidance; saved projects migrate and still run |
| P7 Data pipelines | 2 | D1-D4: data steps, lineage, map fan-out, sinks, `pipeline()` compiling to a Flow | A pipeline that maps a FluxNode over records runs, incremental on a second run, with lineage shown |
| P8 Simulated hosts | 3 | Domain bindings and hosts for Android, Linux and Windows; FluxNode tests on them | Each environment runs FluxNodes: explore, replay at zero calls, and repair after a perturbation, provider-free |
| P9 Panel | 3 | U1-U6 from the U report: the wizard, the six pages, the editor, the assistant | A new person goes from `fluxiq dev` to a running Flow through the wizard, and the assistant edits a Flow from plain words |
| P10 Improve in simulation | alongside | Wire the improve step, with the go/no-go gate | The gate passes, or the step stays off with the reason recorded |
| P11 Lab lane, examples, docs | 3 | The web lane downstream; `docs/fluxnode/` here; examples on the web and on each simulated environment | Each example shows explore, replay at $0 and repair |
| P12 Cloud | after the seal | C1 design and pricing; C2 the hosted API; C3 browser pools and VMs; C4 metering; C5 real OS hosts; C6 the functions runtime | Each step gets its own plan |

**Schedule (lead; cut for parallel lanes):**

| Dates | Work | What sets the date |
| --- | --- | --- |
| 11-09 to 11-10 | Wave 1 | The three design reports and P1 are each about a day's work for one agent |
| 11-10 to 11-13 | Wave 2: P2-P7 in parallel | P1 frozen. P2 and P3 are the longest |
| 11-12 to 11-16 | Wave 3: P8, P9, P11 | P9, a redesigned panel, is the longest lane of the whole plan |
| 11-17 | Seal: the full sweep in all three repositories, then promote | P9 |

## Wave 2 Briefs (written before dispatch)

**Parallel limit.** This machine has 11.9 GB of memory. With Wave 1's nine agents running, 1.4 GB was free (2026-11-09). So a lane that builds Core or opens a browser starts only when about 3 GB is free, whatever the plan's parallelism allows.

| Lane | Starts when | Tier | Owns | Builds | Done when |
| --- | --- | --- | --- | --- | --- |
| P2a Engine seams | P0 on `dev` | `worker-heavy` | AF (`attempt/`, `completion/`, `task-key/`), `runtime/answer-first/attempt-purse/`, the attempt's dispatch in `service.ts` (~1483-1570), `flow-bootstrap-commands/contracts.ts` | Per-attempt and caller-supplied: task key; authoring mode (no env var needed); model; budget, which may be raised above $5 when the caller says so; a judge mode (`auto`, `always` or `off`) with an injected `check(summary)` run before the judge, confirming with zero calls when it passes; a person-ask port that can be an event sink instead of a conversation; scope given as `permittedConsequences` plus a site allow list | Scripted-model tests per seam; AF's existing tests pass; the chat path is unchanged in behaviour |
| P2b FluxNode entry | P1 frozen and P2a merged | `worker-heavy` | new `framework/automation-service/service/fluxnode/` | `runFluxNode(spec, inputs, options, events)`: project and Flow per spec hash at its O2 path; the goal stored as the Flow's instruction; inputs bound as Flow inputs, plus the fixed-value rebinding check; outputs assembled from rows and answers, checked exactly against the declared type, and traced; events; resume handles | The N1-N7 tests listed in P2 |
| P3a Headless server | Memory allows | `worker-heavy` | `apps/web/src/server/client-gateway-websocket/*` and the program route, moved by path into a new `packages/fluxiq/src/server/` entry; `apps/web` mounts the moved handlers | A plain Node HTTP and WebSocket server serving the gateway and the program API without Next.js, plus `fluxiq dev` starting it with a data directory. No new mechanisms; auth unchanged until P3b | The extension pairs to the headless server; the `apps/web` route and gateway tests pass |
| P3b Keys | The K report accepted | `worker-heavy` | Per the K report's own briefs | K1-K7 | The K report's checks, plus an adversarial review |
| P4 SDK and CLI | P1 frozen | `worker` | new `packages/sdk` | N9 and K3 on the client side; `init`, `dev`, `runs`, `pin` and `learn` | A sample program in an empty directory |
| P6 B1 Migration | P0 on `dev` | `worker-heavy` | the inventory's B1 paths | O4-O5 | A dry run on a copy of a saved project, with a rollback note |
| P7 Pipelines | P1 frozen | `worker` | new `framework/automation-service/service/pipelines/` | D1-D4 | P7's done-when |
| P8 Simulated hosts | P1 frozen and the S packages merged | `worker` per environment | `!FluxIQTestEnvironments/packages/*/src/fluxiq/` | Domain bindings and an in-process host | P8's done-when |

## Guardrails

- **No new machinery beyond this plan.** t843 stalled when a system nobody asked for took over the critical path. Each lane gets its file list at dispatch, and a newly found need becomes a plan revision.
- **One engine.** Nothing copies or forks the attempt loop.
- **The standing rules stand:** the result or the budget, no PIN mid-Flow, the ten realistic scenarios for every browser run, visible Lab browsers, no weakened oracle, and no model guidance shaped to a test task.
- **Security.** Keys, enrolment and open mode get a `worker-heavy` adversarial review. Keys and tokens are never logged. Both public repositories hold unfixed security findings on local branches until they are fixed.

## Risks

1. **The live reliability of the web engine is the ceiling for web FluxNodes.** Developer checks and scoping help most.
2. **Exact nested output types traced to reads** are the hardest new engine piece (P2).
3. **Retiring subflows touches stored data and saved Flow source.** It needs a versioned migration and a test on real saved projects.
4. **Open mode is a real exposure,** even on loopback: any local program can spend the model key. K4's guards, and the warning on every start, are the mitigation the user chose.
5. **The panel redesign is the largest lane** and sets the seal date.
6. **The cloud runs automation on third-party sites from FluxIQ's addresses,** which needs an acceptable-use policy before launch.

## Work Ledger

### 2026-11-12 - Durable scope, source and target acceptance

- Agent: Codex lead; act_scope and act_scope_resume (Sol Max).
- Changed: durable scoped act records, exclusive execution ownership, atomic task documents, immutable source references, original task and reachable target binding; architecture documentation.
- Validation: lead `pnpm --filter fluxiq exec vitest run src/framework/automation-service/service/fluxnode/act-scope/tests/pipeline-source.test.ts src/framework/automation-service/service/fluxnode/pipeline/tests/source-continuation.test.ts src/framework/automation-service/service/fluxnode/pipeline/tests/source-secrets.test.ts src/framework/automation-service/service/fluxnode/tests/corrupt-scoped-memory.test.ts src/framework/automation-service/service/fluxnode/act-scope/tests/scoped-memory.test.ts src/framework/automation-service/service/fluxnode/act-scope/tests/execution-targets.test.ts src/framework/automation-service/service/fluxnode/act-scope/tests/execution-task.test.ts src/framework/automation-service/service/fluxnode/tests/pin-act-scope.test.ts src/framework/automation-service/service/fluxnode/pipeline/tests/pipeline-runs.test.ts --maxWorkers=1 --minWorkers=1` -> 9 files / 31 passed, exit 0, 130.21s. Earlier independent storage 27 and ownership/settlement 83 passed; worker final package check and full structure audit passed (544 warnings / 916 baselined, no growth).
- Validation: `pnpm task finish t909 --skip-checks` -> merged with 70/70 mandatory contracts passed; the full sweep was not repeated per merge, under the standing sweep policy. Downstream `pnpm task finish t909` -> audit passed, merged, authoring worktree removed.
- Outcome: integrated into both dev branches; no full sweep, paid run, package publication or main promotion. Downstream report codex-t909-resume.md records prior failures and the exact shared-seam integration patches.


### 2026-11-09 - Plan

- Agent: lead; three read-only discovery agents.
- Changed: this document, and the paired `mvp-seal-plan.md`. No source.
- Why: the user asked for a full plan to seal the MVP around the extension and FluxNode.
- Validation: not validated; this is a plan. Discovery claims checked by the lead: `rg runAutomationStudioOfflineStateTrial` finds only its own module and test; `attempt/ending.ts` imports no simulation; `budget-usd.ts:23` is `Math.min(...limits)`; `framework/index.ts:146` is `export class FluxIQ`; `contracts/src/client-gateway.ts:24` lists `"worker"`.
- Outcome: shown to the user for review.
- Follow-up: P0 and P1 on approval.

### 2026-11-09 - Revised with the user's second and third messages; Wave 1 dispatched

- Agent: lead.
- Changed: this document (O, D, K, U and S sections, the phases and the schedule). No source.
- Why: the user added data pipelines, flexible outputs, key-based access, the panel redesign, the panel-wide assistant, the simulated environments and Flow unification, and asked for work to start at once.
- Validation: not validated; this is a plan.
- Outcome: Wave 1 dispatched.
- Follow-up: integrate the Wave 1 outputs, then freeze P1.

## Open Questions

- **The seal date (user).** The plan aims at 2026-11-17 for the extension, local FluxNode, the simulated environments and the redesigned panel, with the cloud after it.
- **Cloud pricing and licensing (user),** needed before P12 C1.
- **A GitHub remote for `!FluxIQTestEnvironments` (user):** private or public. The other two repositories are public.
- **Carried from Answer First (user):** a first-time PIN for dangerous acts at the start of a chat (the lead recommends not yet), and deleting merged task branches on GitHub.
