# Panel, Editor And Assistant Design (unit U)

Worker report for `fluxnode-plan.md` unit U, 2026-11-09. Design only; no source changed. It confirms U1-U6 with the corrections marked **Correction**, and gives P9 its briefs.

## 0. What the code says (evidence behind the corrections)

- **The registry has no payload schemas.** `programs/_shared/api.ts` stores, for each of 272 `registry.register` calls, its permission, `classification` (`read | authoring | destructive | program-gated | destructive-ungated`), IAM `action`, `accessLevel` and `resource`. Handlers parse payloads by hand (`String(payload.projectId ?? "")`). So U5's "every endpoint becomes a tool with that endpoint's schema" needs the schemas written first. That work is the largest hidden cost in P9.
- **The assistant cannot run a chain of actions today.** `runtime/conversations/instructions/` asks the model for one decision per message: invoke one capability, ask one question back, or reply. The vocabulary is the panel's hand-written catalog (`apps/web/.../conversation/capabilities/catalog`, about 38 capabilities, Studio only), and Core runs 6 of those itself (`commands/catalog.ts`). Only `delete` and `move_money` stop for the person (`dispatch.ts`, `respond.ts`).
- **Every `destructive` endpoint requires the session PIN** (`authorizeProgramPin` in `call()`). That conflicts with the user's rule of no PIN on normal actions, and with a local owner who signs in by link and has no PIN.
- **Version history exists in storage, but nothing exposes it over the API.** `graph_revisions` and `graph_operations` (`graph-store.ts`: `revisions()`, `createSnapshot()`, `restoreSnapshot()`) are numbered, parented and invertible. `apply-graph-patch` returns `inverseOperations` and a conflict result, and `flows/executable/version/contracts.ts` binds verdicts to revisions. `list-graph-revisions`, `create-graph-snapshot` and `restore-graph-snapshot` are named in `AUTOMATION_STUDIO_ENDPOINTS`, but no handler registers them. Publications (`publish-flow`, `list-flow-publications`) and model changes (`list-flow-adaptations`, `review-flow-adaptation` revert) are registered.
- **The patch ops cover most edits:** `add_node`, `move_node`, `set_node_parameters`, `set_node_metadata`, `delete_node`, `add_edge`, `delete_edge`. Changing a node's label has no op. `update-flow-settings` merges name, description, `interface`, `executionDefaults` and metadata (model, cost limit, intervention mode), with `expectedUpdatedAt`.
- **Some of the plain-words machinery for steps exists.** `runtime/project-parts/card/steps.ts` (`partStepsOf`) orders a graph breadth-first into a flat list, and `project-parts/step-words.ts` turns a step into screened plain words with its lasting classes. Neither nests branches or loops.
- **Model keys are sealed with a password-derived scrypt key** (`secret-keys/runtime/value-sealer.ts`), and a panel session reopens them (`lib/auth.ts` `presentPanelSession`). No key is marked as the default.
- **Conversations live in each project's SQLite store** (`runtime/conversations/store.ts`), with subjects `project | flow | run` (`ChatSubjectKind` in ui-components). A panel-wide thread has nowhere to live.
- **A client binds the shared chat by calling `createChatWidget(transport, options)`.** The transport implements ports for conversation, changes, activity, run, models, recordings and asks. The extension does this in `panel/chat/chat-panel.ts`. The panel does it in `features/chat-widget` (`ChatDock`, `createProgramChatTransport`). `ChatSend.onScreen` carries `flowId`, `runId` and `recordingId`.
- **The IAM audit has a store and a query** (`platform/iam/audit/query.ts`). No endpoint lists it.
- **The Playwright e2e targets a panel that is already running, on a fixture host** (`apps/web/e2e/README.md`, `fixture:e2e`). Scripted model providers exist only inside vitest tests.

## 1. Inventory: today's panel, and what happens to each part

| Today | What it is | Decision | Goes to |
| --- | --- | --- | --- |
| `/` `ProgramLauncher` and onboarding cards | A directory of 10 programs and the domains | Replace | Home |
| `/programs/[programId]` (9 non-Studio programs) | The generic program workspace | Move out of the nav | Settings › Advanced › "Engine tools", a link list to the routes unchanged. Nothing is ported |
| Identity & Access live view | Users, roles, sessions, TOTP, PIN, vault | Replace the UI, keep the endpoints | Security › People and sign-in |
| Secret Keys live view | Model and provider keys | Replace the UI, keep the endpoints | Settings › AI keys |
| Runtime, Compute Control, Production Runner | Clients, hosts, leases, runs | Keep the endpoints; show their data | Home › Connected; Runs |
| Background Tasks, Deployment Sync, Database Manager, Docs | Operator tools | Keep, out of the nav | Settings › Advanced › Engine tools |
| `/domains/[domainId]/**` | Domain-scoped launch | Remove (redirect to `/flows`) | The domain is the Flow's runtime, the first folder level (`web/...`) |
| `/programs/automation-studio` (the workspace shell) | Panes, drawers, view host, 12 views | Replace (redirect to `/flows`) | Flows and Runs. The Studio program and its endpoints stay (user: keep the controller) |
| `/programs/automation-studio/chat` | Chat on its own page | Replace (redirect to `/?chat=open`) | The assistant dock |
| `/get-started` | Start runtime, pair, add DeepSeek key | Replace | Wizard `/start` |
| `/setup`, `/welcome`, `/reset` | Owner claim, emailed link, password reset (hosted profiles) | Keep, untouched | Hosted only |
| `LoginPanel` | Password and TOTP | Keep for hosted; on `local`, replaced by `/signin` | §5 |
| `GlobalClientGatewayPairing` | Pairing approval modal | Keep. Its wording becomes "approve this key" when K6 lands | Every page |
| `GlobalConversationPrompt` | Modal for a waiting question outside Studio | Remove | The dock's waiting badge does this on every page |
| features `flow-editor` (52), `graph` (23), `inspector` (15) | Canvas, palette, node inspector | Move, unchanged | Flow › Advanced › Graph |
| `hierarchy` (48), `subflows` (7), `project` (10) | Project tree, subflow library | Replace the UI; keep the commands until P6 | Flows › folder tree |
| `instructions` (10), `authoring` (12) | Instruction, blank-Flow and improve panels | Replace | Editor header "What it does", "Ask FluxIQ to change it" |
| `parameters` (7), `settings` (19) | Flow ports and settings | Replace the UI, keep the models | Editor interface card and Options |
| `adaptations` (11) | Review the model's changes | Replace the UI, keep the commands | Editor › History |
| `runtime` (45) incl. `attempt-story`, `audit-export` | Run list, detail, action log, controls | Move | Runs |
| `state` (36), `recordings` (29) | State explorer, recording timeline | Move under Advanced | Run › step › "Page state"; Flow › Advanced › Recordings |
| `datasets` (7) | Run datasets | Move | Data |
| `clients` (10) | Gateway clients | Move | Security › Connected clients |
| `router` (8) | Route groups | Show as branches in the step list; edit them in Advanced | Editor |
| `problems` (7) | Project problems | Move | Home › Needs you, and the editor's issue line |
| `conversation` (33) incl. hand-written `capabilities/` | Studio chat and its 38-capability catalog | Replace (§4). Its coverage test becomes the registry's parity test | Assistant |
| `chat-widget` (39) | `ChatDock` and transport over ui-components | Keep and extend | Assistant dock |
| `onboarding` (11) | In-Studio onboarding | Remove | Wizard |
| `workspace` (62), `views` (18), `live` (48), `stores` (14), `sync` (8), `cache`, `model` (15) | Multi-pane shell, view registry and migrations, scale caches | Remove (§7). Keep only the pieces the moved views import, and move them with those views | — |
| `testing` (10), `development` (3), e2e `phase7-*` and `phase8-*` | Certification fixtures for the old shell | Remove with the shell | New panel e2e (§6) |

## 2. Navigation and screens

**Shell.** A left rail with six items; a top bar holding the project switcher, the engine status and today's spend; the assistant docked on the right of every page. At phone width the rail becomes a bottom tab bar and the dock becomes a full-height sheet behind a round button. Routes: `/`, `/flows`, `/flows/[flowId]`, `/runs`, `/runs/[runId]`, `/data`, `/data/[datasetId]`, `/security`, `/settings`, `/start`, `/signin`. Flows, Runs and Data are scoped to the project; Security and Settings cover the whole engine.

```
┌──────┬──────────────────────────────────────────────────┬──────────────┐
│ ◉ FluxIQ  Project: Shopping ▾        ● Running · $0.42 today │ Assistant  ⌄ │
├──────┼──────────────────────────────────────────────────┤              │
│ Home │                                                  │ Ask me to do │
│ Flows│               (page content)                     │ anything you │
│ Runs │                                                  │ can do here. │
│ Data │                                                  │              │
│ Secur│                                                  │ [Type…]   ➤ │
│ Sett.│                                                  │              │
└──────┴──────────────────────────────────────────────────┴──────────────┘
```

**Home**
```
 ⚠ Anyone on this computer can run your Flows without a key.  [Require a key]
 Engine  ● Running, version 0.x       Today  12 runs · 11 passed · $0.42
 Connected                            Needs you (2)
  Chrome extension · paired 3d ago     "Cheapest listings" is waiting for you  [Open]
  Your program (sdk) · 4 min ago       Step 5 of "Post reply" failed 3 times   [Open]
  Managed browser ×2
 Recent runs                                                    [All runs]
  ✓ Cheapest listings   replayed   $0.00   2 min ago   by your program
  ✓ Find jobs in Leeds  explored   $0.31   1 h ago     by Chrome extension
```

**Flows** (folder tree, then the editor in §3)
```
 [Search Flows]                 [+ New Flow] [+ Folder]
 ▾ web
   ▾ market.example
      Cheapest listings        ✓ 2 min ago   FluxNode
      Sort and keep cheapest   ✓ 2 min ago
   ▸ jobs.example
 ▸ data
 Selected: Cheapest listings · 14 runs · last change by FluxIQ (repair) 1 h ago   [Open]
```
A row says who made the Flow (Extension, FluxNode, Assistant or You). Drag, Rename and Move go to P6's folder endpoints; until P6 lands they go to `put-project-hierarchy-node`. A person's move always wins (O2).

**Runs**
```
 Filter: [All Flows ▾] [Any client ▾] [Any result ▾]
 ✓ Cheapest listings   replayed  $0.00  0 calls   your program   2 min ago
 ✕ Post reply          budget gone $0.25 41 calls  Chrome        1 h ago
 Run › Cheapest listings · ✓ passed (confirmed by your check) · $0.00 · 6.1 s
  1 ✓ Open market.example                                  [Page]
  2 ✓ Type "lens hood" into "Search"                       [Page]
  5 ↻ Read results (retried once: list not ready)          [Page] [Why]
  Result: 3 listings                                       [See data] [Export]
```
The run view reuses `RunDetailView`, `attempt-story` and `RunActionLogView`, unchanged. "Page" opens that step's state (the moved `state` views). The verdict says what confirmed it (`by: type | check | judge`, N4).

**Data**: datasets listed with their source Flow, rows and last update, then the dataset page: a table, the schema, each row's source run and step (D1 lineage), and Export CSV/JSON. Pipeline outputs are datasets with "made by pipeline Flow X".

**Security**
```
 Access   ○ Open on this computer (no key)   ● Keys required      [Change]
 Keys                                         [+ New key]
  owner (this computer)   Admin             last used 2 min ago   [Rotate] [Revoke]
  ci-runner               FluxNodeRunner·Shopping  last used 1 d ago  [Rotate] [Revoke]
 Connected clients      Chrome extension (key 9f3…) approved 3 d ago   [Remove]
 People and sign-in     Owner (you) · [Add person] (hosted only)
 Activity log           Today 14:02  assistant (as you) deleted Flow "Old search"
```
The activity log needs a new endpoint, `list-audit-events`, over `platform/iam/audit/query.ts`. Each row shows "assistant (as you)" when the assistant made the call.

**Settings**: AI keys (add, test, the Default radio, "Assistant uses [key ▾] [model ▾]"), Budgets (default per Flow run $5, the assistant's per-message allowance), Storage (paths, size, "Clear caches"), Setup ("Run the setup again"), Advanced (Engine tools links, the developer views, reusable LLM contexts, legacy migration).

## 3. The editor

**What you see.**
```
 web › market.example › Cheapest listings               [▶ Run] [⋯]
 What it does: Find the {count} cheapest listings for {query} that ship to {country}.
 ✓ Last whole run passed 2 min ago · $0.00 · version 14            [History]
 ┌ Needs  query (text) · country (text) · count (number, at most 10)
 │ Gives  listings: a list of { title, price, url }
 │ May    read on market.example · Budget $0.50 · Judge: when there is no check
 └ Declared in code: src/nodes/market.ts:12 — change these there      [Copy path]
 Steps
  1  Open market.example
  2  Type {query} into “Search”                                       ✎ ⋯
  3  Press “Search”
  4  Read the list of results → results
  5  For each of results, up to {count}:
       5.1  Only if “Ships to” is {country}:
              5.1.1  Keep title, price and link → listings
  6  Run Flow ▸ Sort and keep cheapest (data/)                         ↗
  7  Give back listings
  If something goes wrong: Run Flow ▸ Close cookie banner, then try again
  [+ Add a step]                [Ask FluxIQ to change this Flow…]
 ▸ Advanced
```
A step that causes a lasting act carries a badge (`sends`, `deletes`, `pays`, `changes`), from its declared lasting classes. Inputs appear as `{chips}`.

**Graph to list (new pure Core module `flows/executable/outline/`).** It produces `FlowOutline = { interface, steps: OutlineStep[], issues }`. Each `OutlineStep` has `{ number, nodeIds, kind, words, lasting, children?, arms?, link? }`.
1. Start from `builtin.control.start` and follow the main path. `start`, `end`, `merge` and `noop` are hidden. `end` becomes "Give back …" when the Flow has outputs.
2. `branch` and `switch` become "Only if …" or "When …" with "Otherwise:" arms. Each arm nests up to the nodes' immediate post-dominator (the merge), and numbering continues after it. A Flow router's routes (`get-flow-router`, stored beside the graph rather than as a node) become arms the same way.
3. `for-each`, `loop` and `repeat` become "For each X in Y:" or "Repeat …" with the body nested (body port) and the `done` port continuing.
4. `call-subflow`, `flow.call` and Call Flow (P6) become "Run Flow ▸ Name", linked to that Flow's editor by its id.
5. `handler` regions become a closing "If something goes wrong:" section.
6. Data nodes (`builtin.data.*`, P7's map, filter, sort, dedupe, join, limit, aggregate, validate, sinks) get fixed sentences: "Keep rows where …", "Sort by price, lowest first", "Save to dataset …".
7. Act nodes (`builtin.policy.action` and domain outputs) use `step-words.ts`: the build's label when it reads as plain words, otherwise the plain name of the step. An optional domain hook, `describeOutput(outputId, params)`, gives better sentences ("Press “Search”"). The web domain implements it downstream.
8. A graph that does not nest (a jump back that is not a loop, several entries) is never hidden. The step reads "Go back to step 3", and the issue line says "This part is clearer in the graph" with a link to Advanced. Invariant, tested as a property: every node appears in exactly one step.

**Edits and the APIs they use.** Every graph edit is one `apply-graph-patch` with `baseRevision`, a fresh `mutationId` and a plain `message` ("Changed step 2: the search box"). The module also exports `outlineEdit(outline, edit) → GraphPatchOperation[]`, so the editor and the assistant build identical patches.

| Edit | How | API |
| --- | --- | --- |
| Change a value, or bind it to an input | Inline field; `{` opens the input picker | `set_node_parameters` |
| Change a step's words (its label) | Inline | **New op `set_node_label`** (the ops have none; small Core change) |
| Reorder | Drag, or ⋯ › Move up/down, within one block | `delete_edge`/`add_edge` splice. Refused when it breaks a value dependency ("Step 4 uses *results*, which step 3 reads") |
| Delete | ⋯ › Delete step | `delete_node` plus a bridging edge; refused if it is an output's only source |
| Add "Run another Flow" | Picker over the project's Flows | `add_node` (Call Flow) plus a splice |
| Add a data step | Short menu: Keep rows where, Sort, Keep first N, Remove duplicates, Save to dataset, Export | `add_node` plus a splice |
| Add or change a site act | "Describe it", then FluxIQ finds it live | `generate-flow-bootstrap-adaptation` (improve). **Nobody hand-types a click target**: saved elements need full fingerprints |
| Wrap in "Only if" or "For each" | ⋯ menu | `add_node` (control) plus edges |
| Make steps their own Flow | Select steps › "Make this a Flow" | P6's extract operation (O2 reusable parts), then a Call Flow |
| Name, description, inputs, outputs, options | Interface card and Options | `update-flow-settings` (`interface`, `executionDefaults`, metadata) with `expectedUpdatedAt` |
| Undo | The banner after a save | Apply the returned `inverseOperations` as a new patch |
| History, restore | History drawer | **Register** `list-graph-revisions`, `restore-graph-snapshot` and `create-graph-snapshot` (names exist, handlers do not); model changes via `list-flow-adaptations`/`review-flow-adaptation`; `publish-flow` |
| Run | ▶ Run, or "Test from this step" | `start-runtime-session` / `run-runtime-session` |
| Rename or move a Flow | Tree | P6 folder endpoints |

A `conflict` result (FluxIQ repaired the Flow while the person edited) shows: "This Flow changed while you were editing (FluxIQ repaired step 5). Your change was not saved. [See what changed] [Apply mine again]".

**Checks before saving** (one new endpoint, `check-flow-edit`, which the editor calls with the proposed operations):
1. **Static, instant, blocks the save:** `flows/executable/validation` (interface and value types), the outline round trip (every node exactly once), type flow along data edges, N2 (a fixed value equal to an input's value is offered as a binding), each act class inside the declared scope (N6), and the interface of a FluxNode Flow left untouched.
2. **Against the last run, offline and advisory:** the state engine replays the edited Flow over the last run's recorded states where it can answer. It reports "Checked against the last run: steps 1-4 still match. Step 5 changed and can only be checked by running it." It never blocks; today it answers 28% of recorded commands, and P10 owns improving that.
3. **Save:** a new revision, and the banner "Saved as version 15 · Undo · Test from step 5". Under the standing rule, the status line then reads "Changed, not yet run whole" until a judged whole run passes.

**FluxNode Flows.** The interface card is read-only and shows `declaredAt` (file and line, sent by the SDK on registration: **an interface request to P1/P4**). Steps stay editable. A pinned FluxNode (N8) saves panel edits as a proposal: "Saved as a proposal. Run `fluxiq pin` in your project to take it."

**Advanced** (one disclosure per Flow, closed by default): Graph (the existing canvas and inspector, moved unchanged), Source (TypeScript via `generateFlowTypeScript` and `compile-flow-source`), Recordings, Routes (router editing), the raw parameters of a selected step, version diffs with their operations, and Reusable contexts.

## 4. The assistant

**Tools from the registry.** Registration gains an optional `assistant` field:
`{ input: JsonSchema; summary: string; phrases?: string[]; consequence?: AssistantConsequence | "per-call"; contextArgs?: Record<string, PanelContextKey> } | { hidden: string /* reason */ }`.
- **Schemas** live in `@fluxiq/contracts` beside the existing request types (`api-contracts/automation/*.ts` already hold them as TypeScript), as runtime parsers that emit JSON Schema. A handler adopts the same parser when its file is touched.
- **A generator** writes `assistant-tools.generated.ts`, in the style of the IAM catalog under `platform/iam/catalog/generated/`.
- **A parity test fails the build** when an endpoint has neither an `assistant` declaration nor a `hidden` reason. The rule is enforced mechanically, not by review.
- **Expect about 100 exposed tools.** Legacy migration, cache internals, recording appends from clients, `execute-client-action` and performance metrics are hidden with reasons.
- **The hand-written panel catalog retires.** Its phrases seed `summary` and `phrases`, and its `fromContext` idea becomes `contextArgs`.

**What the model is offered.** About 100 tools do not fit well in one request. Each turn offers:
- the current page's tools, about 15;
- `find_tools(query)`, a lexical search over summaries and phrases with no model, which returns the matching tools' schemas;
- `call_tool(name, input)`;
- the client's own navigation tools (`panel.open`, `panel.select`), sent as today's client vocabulary and run in the dock.

**IAM per person.** At the start of a turn the list is pre-filtered with `registry.authorize` for the person's actor, which cuts noise. Every call then goes through `registry.call` with that same actor (`channel: "panel"`, plus `via: "assistant"` written to the audit row), so the assistant can never exceed what the person can do; enforcement happens at the call. Resource-conditioned denials come back as a normal refusal the model reads.

**Consequence classes** `read | change | send | money | delete | security`, derived (overrides in one table):
- `read` comes from `read`, and from accessLevel `List`/`Read`.
- `change` comes from `authoring`.
- `delete` comes from `destructive` and `destructive-ungated`.
- `security` comes from accessLevel `PermissionsManagement`, from `program-gated`, from any endpoint of `identity-access` or `secret-keys`, from P3's key endpoints, and from `revoke-client-trust`.
- `send` and `money` never belong to a panel endpoint itself. They arrive through runs: `start-runtime-session`, `run-runtime-session`, `run-task-again`, the FluxNode run and `run-project-part` are `per-call`. Each takes the union of the target Flow's declared lasting classes and permitted consequences (`send_or_publish` → send, `move_money` → money, `delete` → delete).
- **Budget:** a call whose projected spend exceeds the remaining budget is gated as well, whatever its class.

**Confirming (U5, confirmed, with the rule made checkable).**
- `read` and `change` run at once.
- `send`, `money`, `delete`, `security` and over-budget calls run without asking only when the person's own words clearly ask. That test is deterministic, not the model's opinion:
  - the person's latest words (`person-words.ts`) contain one of the class's verbs ("delete, remove, erase" / "send, post, publish, email" / "pay, buy, order, transfer" / "key, revoke, rotate, permission, access"); and
  - the object they name resolves to the call's target, by name or by "this/these" plus the current selection; and
  - no more than the named items are affected.
- Otherwise the turn shows a one-press card, as a `confirm` ask the widget already renders: "Delete the Flow “Old search”? It removes the Flow and its 12 runs. [Allow] [Don't]".
- **Correction (the PIN):** the registry demands a PIN for every `destructive` call, and that breaks both the user's no-PIN rule and the local owner who has no PIN. Proposal: `call()` accepts, instead of a PIN, a **press grant**. The server mints it when the person presses Allow (or the page's own Delete button). It is single-use, lives 60 seconds, and is bound to the session, the endpoint and a digest of the payload; a model can never mint one. A PIN stays wherever the profile or the person turned one on. This needs the K lane's adversarial review.

**Its model.** Add `defaultModelKeyId` (new `set-default-key` in `secret-keys`; the first created key becomes the default when none is set). When the default is deleted, the next enabled key takes over, with a notice. Settings › AI: "Assistant uses [key ▾] [model ▾]". Flows keep their own model option and fall back to the default key.

**The loop.** New `runtime/conversations/assistant/`:
- a bounded tool loop on `runtime/agents/iteration` (`runAgentIterations`), with the provider from the chosen key;
- the repeat guard and loop detection, which the user's rule requires for every agent role;
- a per-message allowance shown in Settings;
- every tool call posted as its own step message ("**Renaming step 2** — you asked for clearer words"), as the chat already does for builds;
- long work (builds, runs) started through the existing Core commands and followed by the activity feed, not waited on.

It answers `panel` threads only. The extension's threads keep today's interpreter, so nothing the extension relies on moves.

**Page and selection context.** Each page publishes a `PanelContext { page, projectId?, flowId?, stepNumbers?, nodeIds?, runId?, datasetId?, keyId?, folder? }`. The dock sends it on `ChatSend.onScreen`, which gains `page` and `selection` (**ui-components minor bump, 0.12.0**). Core gives the model one context line ("On Flows › Cheapest listings, step 5 selected") and fills `contextArgs` from it.

**Persistence.** A panel thread is subject `panel`, stored in a workspace-level conversation store. It uses the same store class and rows over a reserved database outside every project, owned per person through an owner resolver. The dock offers the threads list (`threads` option), "New chat", and "Chat about this Flow", which opens the Flow's own project thread.

**Reuse.** The dock is the existing `ChatDock` with `createProgramChatTransport` and subject `panel`. The widget itself only gains the subject kind and the `onScreen` fields.

## 5. Local sign-in and the wizard

**Sign-in (K5-K6; details depend on the K report).**
1. On first start, `fluxiq dev` creates the owner key pair in `~/.fluxiq/credentials` (owner-only permissions) and an owner principal (identity-access user, Admin policy, no password). It prints:
   `Open the panel: http://127.0.0.1:4310/signin#t=<token>` and the K4 open-mode warning, then opens the browser unless `--no-open`. `fluxiq open` prints a fresh link at any time.
2. The token is signed by the owner key: `{aud: panel origin, purpose: "panel-signin", nonce, exp: +10 min}`. It sits in the URL fragment, so it never reaches the server log or a Referer, using the `welcome/client/readFragmentToken` pattern. `/signin` POSTs it with the Origin check. The server verifies the signature against the owner's public key, then that the nonce is unused and the token unexpired, issues the session cookie and redirects to `/start` (setup not finished) or `/`.
3. **The vault (a risk to settle in K):** model keys are sealed by a password-derived key, and a link sign-in has no password. Proposal: on `local`, the vault key is wrapped for the owner key, so the engine can open it on the same machine. The protection is the same as the OS account, which already guards the PEM.
4. On `local` the login form and "Sign out" become "Signed out. Run `fluxiq open` for a new link." Hosted profiles keep account sign-in.

**Wizard `/start`** (U2's five steps, confirmed; every step is skippable; "Run the setup again" lives in Settings):
```
 Step 1 of 5 · Add a model key
 Provider [Anthropic ▾]  Key [••••••••••]   [Check key]   (one tiny call, about $0.0001)
 This key powers the assistant and any Flow that needs a model. You can add more later.
                                                    [Skip]  [Save and continue]
 Step 2 · Who may run your Flows
 ● Only programs on this computer, no key needed (simplest; shows a warning)
 ○ Require a key. Your key is already saved at ~/.fluxiq/credentials, and programs
   on this computer find it by themselves.        [Download a key for another computer]
 Step 3 · Connect something
 [Browser extension]  Open the extension and press Connect. Then approve it here:
                      “Chrome on this computer wants to connect”  [Approve]
 [Your code]  npm i @fluxiq/sdk   then paste:  const fluxiq = await FluxIQ.connect() …
              Waiting for your program… ● Connected
 Step 4 · Try a sample Flow
 “Tidy a price list”: keeps rows under £20, sorts them, saves a dataset. No model, $0.
 [Run it]  ✓ Done in 0.4 s · 6 rows   [See the run] [See the data]
 Step 5 · You're set
 Flows holds everything you and your programs make. Ask the assistant anything →
```
- Step 1 calls `create-key` and then `set-default-key`.
- Step 2 calls P3's equivalent of `keys secure`. The PEM download uses K5's create-key with a one-time download.
- Step 3 embeds the pairing approval and watches the clients and hosts snapshot.
- Step 4 is a data-only Flow made of today's `builtin.data.*` nodes (`filter-rows`, `write-records`, …) in a "Getting started" project. It needs no host, no model and no browser, so it works before anything connects and is testable without the ten-scenario rule.
- On `service`, step 2 is fixed to "keys required".

`fluxiq init` runs the same steps in the terminal (P4).

## 6. Implementation briefs (P9)

Owner paths are disjoint. "→" means "needs first". Everything is in Core unless marked. Checks are narrow, per the twice-a-day rule: the typecheck of the touched package, vitest in the touched directories, and the structure audit.

| # | Brief | Owns | Tier | Order | Acceptance |
| --- | --- | --- | --- | --- | --- |
| A | Assistant declaration on the registry: field, consequence derivation, generator, parity test | `programs/_shared/assistant/**` (new), `programs/_shared/api.ts`, `platform/iam/catalog/generated/assistant-tools.generated.ts` | worker-heavy | first; parallel with C, D, G | vitest: a bare endpoint fails parity; the derivation table covers all 5 classifications and 4 access levels; `per-call` runs union a Flow's classes |
| B1-B4 | Input schemas and `assistant` entries, one brief per handler file group: (1) `flows`, `flow-lifecycle`, `instructions`; (2) `runs`, `run-control`, `runtime-*`, `datasets`; (3) `projects`, `conversations`, `recordings`, `client-gateway`, rest of Studio; (4) `secret-keys`, `identity-access`, other programs (mostly `hidden`) | those handler files, plus schema files in `packages/contracts/src/program-api/<group>/` | worker ×4 | → A; parallel | parity test green; vitest: each exposed tool's schema accepts a valid sample request, and the handler accepts the schema's minimal example |
| C | Flow outline: graph → nested steps, `outlineEdit` → patch ops | `packages/fluxiq/src/flows/executable/outline/**` | worker-heavy | first | vitest: fixtures for linear, branch, switch, for-each, handler, call, router and unstructured graphs; property test "every node in exactly one step"; the round trip edit → patch → outline matches |
| D | Version endpoints and the label op | `programs/automation-studio/api/handlers/graph-revisions.ts` (new), `graph-store.ts` (`set_node_label`), `api-contracts/automation/graph.ts` | worker | first | vitest: list, snapshot and restore over a 3-revision Flow; inverse of `set_node_label` restores the old label; conflict on a stale base |
| E | `check-flow-edit`: static checks and the offline last-run check | `framework/automation-service/service/flow-edit-check/**`, handler registration in a new `handlers/flow-edit-check.ts` | worker-heavy | → C, D | vitest: a broken type, an unbound fixed input value and an out-of-scope act are refused with plain reasons; offline check reports checked/unchecked steps and never blocks |
| F | Assistant loop, `panel` subject, workspace conversation store, the words-clearly-ask matcher, press grants | `runtime/conversations/assistant/**`, `runtime/conversations/store.ts` (reserved store only), `programs/_shared/authorization.ts` (press grant) | worker-heavy, then an adversarial review | → A, G | vitest with a scripted provider: a 3-tool chain completes; IAM-denied tool refused at call; "delete Old search" runs while "clean things up" gets an Allow card; a grant is rejected when replayed, expired or used with another payload; loop detection stops a repeated call |
| G | Default model key and the assistant model setting | `programs/secret-keys/**` (default flag, `set-default-key`) | worker | first | vitest: first key becomes default; deleting the default promotes the next enabled one |
| H | Local sign-in link: `/signin` page and route, vault wrap on `local` | `apps/web/src/app/signin/**`, `apps/web/src/app/api/auth/link/route.ts`, `secret-keys/runtime/unlocks/owner-wrap.ts` | worker-heavy | → P3 owner key, K report | vitest: a valid link signs in once; replay, expiry, wrong aud and wrong Origin are refused; vault opens after a link sign-in |
| M | ui-components: `panel` subject, `onScreen.page/selection`, minor bump | `packages/ui-components/src/chat/ports/**`, `package.json` | worker-light | first | ui-components vitest; extension typecheck unchanged (downstream lead runs it) |
| I | Panel shell: route group `app/(panel)/layout.tsx`, rail, top bar, `PanelContext`, dock mount | `apps/web/src/features/panel-shell/**`, `apps/web/src/app/(panel)/layout.tsx` | worker | → M | vitest for the context reducer; Playwright `panel-shell.spec.ts`: six items navigate; dock opens on every page; phone width has no horizontal scroll |
| J1-J5 | Pages: Home, Runs (moves `runtime/`, `state/`), Data (moves `datasets/`), Security (incl. `list-audit-events`), Settings | `features/{home,runs,data,security,settings-page}/**` and their `app/(panel)/<page>/**` | worker ×5 | → I; parallel | vitest per feature; Playwright `panel-<page>.spec.ts` on the e2e fixture host |
| K1-K3 | Flows: (1) tree and page; (2) step-list editor on C's outline and E's check; (3) interface card, options, history and Advanced (moves `flow-editor`, `graph`, `inspector`) | `features/flows/{tree,steps,flow-meta}/**`, `app/(panel)/flows/**` | worker ×3 (K2 worker-heavy) | → C, D, E, I | Playwright `panel-flows.spec.ts`: edit a value, reorder, delete, undo, restore a version, conflict banner; vitest for edit-to-patch wiring |
| L | Wizard `/start` | `apps/web/src/app/start/**`, `features/setup-wizard/**` | worker | → G, H, I | Playwright `panel-wizard.spec.ts`: from a fresh fixture host, link sign-in → five steps → sample run passes at $0 → Home shows it |
| N | Retire the old UI: delete §7, add redirects | the deleted paths, `app/page.tsx`, `app/layout.tsx`, `next.config.ts` redirects | worker | last, serial | web typecheck, structure audit, `pnpm structure:baseline`; Playwright `panel-redirects.spec.ts` |
| O | e2e seam: a scripted assistant provider available only on the fixture host, and the specs' fixture data | `apps/web/scripts/e2e-fixture/**`, `apps/web/e2e/panel-*.spec.ts` helpers | worker | with I | Playwright `panel-assistant.spec.ts`: "rename step 2 to …" edits the Flow; "delete Old search" deletes it; "delete it" with nothing selected shows Allow |
| W | Downstream (extension repo): web `describeOutput` sentences | the web domain's output describer | worker | → C | domain vitest on the ten scenarios' recorded outputs |

Running e2e needs the fixture panel running. The lead starts it under Core's panel rules. No brief points a test at real `~/.fluxiq` data; tests use a temp home.

## 7. Risks, and what to delete instead of port

**Risks**
1. **Schema backlog (B).** About 100 endpoints need real schemas, and a schema that drifts from the handler's own parsing makes the assistant fail confusingly. Mitigation: the parity test, and the "minimal example accepted by the handler" test. Handlers adopt the parser when touched.
2. **Wrongly reading "clearly asked".** A false "yes" is the dangerous direction, so the matcher is deterministic and conservative; a false "no" costs one press.
3. **The press grant changes the destructive gate.** It is a security change: adversarial review, single use, bound to the payload, refused cross-site (the existing middleware guard).
4. **Link sign-in and the password-sealed vault.** Unsolved until K decides. Without it, the assistant has no key after a link sign-in.
5. **Graph-to-list fidelity.** Answer First Flows can hold routers and handlers that do not nest. The "jump" fallback and the exactly-once property keep the list honest, but some Flows will read worse than the graph.
6. **Edits racing repairs.** The engine repairs Flows while people edit them. The conflict result covers correctness; the banner keeps it understandable.
7. **Tool count and cost.** A message that searches tools makes more model calls. The per-message allowance and loop detection bound it.
8. **Dependencies.** P1 (`declaredAt`, Call Flow, folder path), P3 (owner key, open mode), P6 (folders) and P7 (data steps) all land before K and L finish. The sample Flow avoids P7 by using today's data nodes.
9. **The seal date.** P9 is the longest lane. If it is cut, keep Advanced as the old canvas, moved unchanged, and ship Data as the dataset table only.

**Delete, do not port:** `features/automation-studio/{workspace,views,live,stores,sync,cache,model,onboarding,subflows,testing,development}`, its `styles/{workspace,router-subflows}`, `hierarchy/components`, `conversation/capabilities/catalog` (after A takes over its coverage rule), `app/ProgramLauncher.tsx`, `app/GlobalConversationPrompt.tsx`, `app/get-started/**`, `app/domains/**`, the `phase7-*` and `phase8-*` e2e specs and their fixture profiles. Before deleting any file, `rg` its importers. The moved views (`runtime`, `state`, `datasets`, `flow-editor`, `graph`, `inspector`, `adaptations` commands, `settings/ai-provider*`, `clients`) take exactly the helpers they import, and nothing else. `ui-upgrade-audit-plan.md` and the `automation-studio-*` UI plans stay as evidence only (U6, confirmed).
