# P9 Panel Redesign (sub-supervisor report)

Workstream P9 of `fluxnode-plan.md`, on `task/t887-panel-redesign` in `fxwork/t887/!FluxIQ`. Briefs A-O of `reports/panel-design.md`, as the lead scoped them. Worker reports are in `reports/panel-redesign/`. Nothing is committed; the lead does all git.

## Outcome

**Done for everything the lead asked to do now, with the deferrals the lead named.** Every acceptance check passes when I re-run it: vitest in every changed directory, the fluxiq and web typechecks, the Playwright panel specs (shell, editor step list, assistant turns with a scripted model, plus Home, Runs, Settings and redirects: 43 passed), and the structure audit. Two adversarial reviews (press grant; assistant consent) found and fixed real holes. Leftovers that need other lanes or a follow-up brief are under "Not done".

## What is done

**Core**
- **Every endpoint declares itself to the assistant (A, B1-B4).** Registration takes an `assistant` field: a tool with a real input schema, or `{ hidden: reason }`. The parity test fails the build on any endpoint with neither. All 255+ registrations are declared: about 100 exposed, the rest hidden, each with a one-line reason in the B reports. The schemas are zod parsers that also emit JSON Schema, in `@fluxiq/contracts/program-api-inputs` (a new subpath, so the extension's bundle does not grow). The consequence of each tool is derived from its classification, access level and program, with one overrides table. The run endpoints are `per-call`.
- **The generated tool list is data, not code.** `platform/iam/catalog/generated/assistant-tools.generated.json` (supervisor change). It was a 4,705-line TypeScript module that nothing imported (the assistant builds its tools from the live registry), which failed the file-lines rule. The drift test checks the JSON.
- **The Flow outline (C).** `flows/executable/outline/`: a stored graph becomes a numbered, nested list in plain words, with "jump" steps for parts that do not nest, linked "Run Flow" steps, lasting-act badges and a "If something goes wrong" section. A property test over 600 random graphs proves every node appears in exactly one step. `outlineEdit` turns an edit by step number into patch operations, or a plain refusal.
- **Version history and the step label (D).** `list-graph-revisions`, `create-graph-snapshot` and `restore-graph-snapshot` have handlers. Restoring makes a new version. A new patch operation `set_node_label` changes a step's words, and its inverse restores them.
- **Outline endpoints (K0).** `get-flow-outline`, `edit-flow-steps` (re-outlines at the base version, applies, returns the new version, Undo operations, or the conflict facts) and `undo-flow-edit` (hidden from the assistant).
- **The default model key (G).** The first key becomes the default. Deleting or disabling it promotes the next enabled key, with a plain notice. `set-default-key`, `get-`/`set-assistant-model`, and a resolver the assistant uses.
- **The press grant replaces the PIN on destructive endpoints (F1).** Single use, 60 seconds, bound to the session, the person, the endpoint and a digest of the exact payload. Only a person's own request can mint one. The PIN still applies to a person who turned one on. Reviewed adversarially (R): two Low gaps fixed (one reading of the payload for the digest, IAM and the handler; the PIN check read once). Supervisor additions: `iam:MintPressGrant` in the user policy's SelfService (a hosted user could not confirm deleting their own data), `frame-ancestors 'none'` and `X-Frame-Options: DENY` on every panel page (a page on another local port could frame the panel and lure a press), and `call()` refuses any assistant call to an endpoint declared hidden.
- **The panel-wide assistant (F2).** `runtime/conversations/assistant/`: `panel` threads stored per person outside every project; a tool loop on `runAgentIterations` with the model from the chosen key; every call through `registry.call` as the person with `via: "assistant"`; each call posted as its own step. Bounded only by the per-message allowance (default $0.50, in Settings) and Answer First's loop detector, reused; no round or call caps. Consequential calls run only when the person's words clearly ask, by a deterministic matcher; otherwise an Allow / Don't card, and Allow mints a grant for exactly that call. Reviewed adversarially (R2): the worst hole was the model adding a Flow id to `delete-project` after "delete Old search" and deleting the whole project; the target now comes from the endpoint's declared IAM resource. Also fixed: Allow used the newest words and selection instead of the card's; the over-budget gate never fired; ten ways to fool the matcher. Its follow-ups S1-S4 are done (S): resuming a run is `per-call`; money fields are marked in the schema and each spending endpoint declares `spends`; audit rows record whether a grant was earned by a press or by words; a destructive or security tool must declare its target, and any extra widening field forces a card.
- **ui-components 0.12.0 (M).** Subject kind `panel`, `onScreen.page` and `onScreen.selection`. Supervisor additions: the thread list no longer drops `panel` threads, and a confirm card may name its own answers, so the assistant's card reads Allow / Don't (other confirmations keep Yes / No).
- **The e2e seam (O).** A scripted assistant model that is honoured only when the data directory holds the e2e fixture marker AND `FLUXIQ_E2E_SCRIPTED_ASSISTANT=1`; seeded panel fixture data; `e2e/README.md` "Panel specs".

**apps/web**
- **Shell (I).** Route group `app/(panel)/`: a left rail with Home, Flows, Runs, Data, Security, Settings (a bottom bar on phones), a top bar (project, engine status, today's spend shown as "—" until an endpoint gives it), and the assistant docked on every page, publishing the page and selection with each message. `?chat=open` opens it (supervisor change).
- **Home (J1).** Engine, Today, Connected, Needs you, Recent runs; each section loads and fails on its own.
- **Runs (J2).** A filtered list and a run page reusing the run detail, attempt story and action log unchanged (the run page now loads their styles: supervisor change).
- **Settings (J5).** AI keys (add, default, remove), the assistant's key, model and per-message allowance, and Advanced › Engine tools linking the other programs.
- **Flows and the editor (K2).** `/flows` lists the project's Flows; `/flows/<id>` is the editor: "What it does", the status line, the Needs / Gives / May card, the numbered steps, inline edits through `edit-flow-steps`, Undo, the conflict banner, History with Restore, "Ask FluxIQ to change this Flow", and Advanced linking the graph editor at `/flows/<id>/graph`.
- **Old UI retired (N).** 313 files and 32,989 lines deleted: the Studio workspace shell, its views, onboarding, the launcher, the global prompt, `/get-started`, `/domains`, the Studio route, and the phase 7/8 e2e suites. Redirects: `/programs/automation-studio/chat` to `/?chat=open`, the rest of the Studio route and `/domains` to `/flows`, `/get-started` to `/`. Saving the graph no longer asks for a PIN the server never read.

## Workers

Reports in `reports/panel-redesign/<label>.md`. At most two ran at once. No escalations were needed.

| Label | Tier | Brief | Outcome | What I verified |
| --- | --- | --- | --- | --- |
| a-registry-assistant | worker-heavy | A: assistant field, derivation, catalog, generator, parity | Done | tests; parity failed only with the expected list |
| c-flow-outline | worker-heavy | C: outline module | Partial (one audit import) | I fixed the barrel; tests and audit |
| b1-flow-schemas | worker | B1: 75 Flow endpoints | Done | tests, typecheck |
| g-default-key | worker | G: default key, assistant model | Done | tests |
| b2-run-schemas | worker | B2: 52 run endpoints | Partial (typecheck not run: memory) | I ran it: passes |
| d-version-history | worker | D: version endpoints, `set_node_label` | Partial (typecheck not run) | I ran it: one error, fixed |
| b3-project-schemas | worker | B3: 61 project/recording/client endpoints | Done | tests |
| m-ui-components | worker-light | M: `panel` subject, onScreen | Done | tests, tsc; I fixed the thread list |
| b4-program-schemas | worker | B4: the other nine programs | Partial (typecheck not run) | parity 0 undeclared; I ran the typecheck |
| f1-press-grant | worker-heavy | F1: press grant | Done | tests; I added the policy and frame fixes |
| r-press-grant-review | worker-heavy | adversarial review of F1 | Done (2 Low fixed) | tests; I added its hidden-endpoint refusal |
| f2-assistant-loop | worker-heavy | F2: assistant loop | Done | tests; I bound the model in runtime.ts |
| r2-assistant-consent-review | worker-heavy | adversarial review of F2 | Done (one serious hole fixed) | tests; I applied S1 |
| i-panel-shell | worker | I: shell, dock, PanelContext | Done | web tests after the Core build |
| k0-outline-endpoints | worker | outline endpoints for the editor | Done | tests |
| s-declaration-hardening | worker-heavy | R2's S2-S4 | Done | tests |
| j1-home, j5-settings | worker | Home, Settings | Partial / Done | web tests, typecheck |
| j2-runs | worker | Runs | Partial (store lacks facts) | web tests |
| k2-editor | worker-heavy | the editor screen | Done | web tests, typecheck, e2e |
| o-e2e-seam | worker | fixture data, scripted assistant, assistant spec | Done | tests, seed |
| n-retire-old-ui | worker-heavy | retire old UI, graph route, redirects | Partial (~100 files kept) | typecheck, audit |
| n2-test-fallout | worker | 5 failing test files after N | Done | 191 files pass |
| e2e-panel-specs | worker | fix the 11 e2e failures | Done | I re-ran: 43 passed |

## Deferred, as briefed
- Local sign-in link and vault wrap (brief H): waits on the keys lane.
- The Flows folder tree: waits on the subflow-to-Flow migration. `/flows` is a flat list.
- The Security page (keys, clients, audit log) and the Data page: still placeholders. The key list waits on keys; Security and Data were not in this lane's list.
- FluxNode runs in Runs beyond what the run store shows.
- The setup wizard (L) and `check-flow-edit` (E): not in this lane's list.

## Not done, and what it needs
- **About 100 files of the old Studio UI remain** (N): the kept run, state, dataset and graph views import the old view registry, stores and parts of the workspace, and `programs/program-api.ts` reaches the view registry through `data-request-policy.ts`. Removing them means editing kept modules: a follow-up brief.
- **The hand-written chat capability catalog remains** (N): the dock's chat transport still loads it through the project-thread branch of `chat-widget`, which no kept page uses. Remove that branch and the catalog in the same follow-up.
- **Facts the run store does not record** (J1, J2): which client started a run, how it ran (explored, replayed), who started it, what confirmed it, the call count, engine version and today's spend. The pages read them when present and otherwise leave them out; Core should stamp them on the run summary.
- **Editor gaps needing Core** (K2): start a run at a step ("Test from step N"); a run start that returns at once (runs are synchronous, so a long run shows "it may still be going" with a link); editable values on each outline step (the editor reads them from `get-graph-viewport` today); `declaredAt` for FluxNode Flows (P1/P4); `stepNumbers` as strings so "5.1" can be passed; a dock open call (the editor presses the dock's own button). The editor also does not refresh after the assistant edits the Flow.
- **Top-level Flows own no steps** (O, K0): the editable steps live on a Flow's Subflow graph today, so the specs open that graph's Flow id. This resolves with the subflow-to-Flow migration (P6).
- **Added steps do not run yet** (C): an added data step is `builtin.data.pipeline-step` and an added "Run Flow" step is `builtin.control.call-flow`; neither has an executor in an ordinary Flow until P2b/P6.
- **A person who turned a PIN on cannot confirm the assistant's deletes** (F1 note 3, seen in e2e): the assistant's call cannot carry a PIN, so it is refused "PIN is required for this action". The e2e seed no longer gives the fixture person a PIN (no spec used it; the product asks for no PIN on normal actions). A server-side way for the Allow card to take the PIN, or dropping the PIN for confirmed presses, is a keys-lane decision.
- **Removing a model key still asks for the password** (J5): `delete-key` is `program-gated`, so the press grant does not cover it. See the questions.

## Integration changes I made
- `api-contracts/automation/graph.ts`: the `set_node_label` operation type, fixed before C and D started, so both built against it.
- `framework/automation-service/service/project-parts/index.ts`: exports `projectPartStepOf`, so the outline imports a barrel (structure audit).
- `contracts/src/program-api/automation-studio/{flows,graph,runs,projects}/index.ts`: per-group barrels created before B1-B3, so parallel workers did not share one file.
- `handlers/graph-revisions.ts`: an `exactOptionalPropertyTypes` error D left (typecheck).
- `ui-components/src/chat/conversation/thread-list/{parse,summary,labels}.ts`: a `panel` thread is listed ("FluxIQ assistant"), not dropped.
- `platform/iam/predefined/user-access.ts`: `iam:MintPressGrant` in SelfService.
- `apps/web/next.config.ts`: `frame-ancestors 'none'` and `X-Frame-Options: DENY`.
- `programs/_shared/api.ts`: an assistant call to an endpoint declared hidden is refused (test `programs/_shared/tests/assistant-hidden-call.test.ts`).
- `programs/_shared/runtime.ts`: the assistant's model binding (later extended by O for the fixture host).
- `programs/_shared/assistant/consequence-overrides.ts`: `resume-runtime-session` is `per-call` (R2's S1).
- `programs/_shared/assistant/generated-module.ts` and its test, `platform/iam/catalog/generated/index.ts`: the tool list is written as JSON data; the old `.ts` file is deleted.
- `ui-components/src/chat/conversation/ask-copy.ts` (+ test) and `runtime/conversations/assistant/loop/call-step.ts`: a confirm card may name its two answers; the assistant's reads Allow / Don't.
- `apps/web/src/features/panel-shell/dock/AssistantDock.tsx`: `?chat=open` opens the dock.
- `apps/web/src/app/(panel)/runs/[runId]/{layout.tsx,run.css}`: the run page loads the run views' styles.
- Regenerated the IAM catalog (`FLUXIQ_REGENERATE_IAM_CATALOG=1`) and the assistant tool list (`FLUXIQ_REGENERATE_ASSISTANT_TOOLS=1`) after every endpoint wave.
- Built Core's libraries (`pnpm --filter @fluxiq/contracts --filter fluxiq --filter @fluxiq/ui-components build`) so the web tests run against current `dist`.
- `apps/web/e2e/README.md`: the panel specs run against a production build (`next start`), because `next dev` compiles each route on first visit and outlasted the specs' navigation wait.

**Found by the e2e loop (E2E worker, fixed in product code):** the dock never passed `panel` to the chat transport, so the assistant used the project endpoints; the dock ignored the top-bar project; the web chat widget's own card renderer showed the assistant's card as Confirm / Cancel; the Runs filters had wrong accessible names. Fixing the old-UI fallout (N2) found four tests leaking a read-only `window` between files.

## Commands run and observed results

All by me, after the last worker finished unless noted. vitest runs were serial (`--pool=forks --poolOptions.forks.singleFork`); parallel runs crashed on this machine.

| Check | Result |
| --- | --- |
| fluxiq vitest per directory (after regenerating both catalogs): `programs/_shared`, `platform/iam`, `programs/secret-keys`, `programs/automation-studio/api`, `runtime/conversations`, `flows/executable`, `framework/persistence/automation/project`, `service/flows`, `service/project-parts`, the nine other programs | 273, 242, 195, 357, 324, 45, 523 (+4 skipped), 10, 197, 90+11+1+47+1+2+1+5 passed; 0 failed |
| fluxiq vitest after the last Core edits: `runtime/conversations/assistant` + `api/panel-assistant` | 14 files, 77 passed |
| contracts `npx vitest run src/program-api` | 23 files, 64 passed |
| ui-components `npx vitest run src/chat` | 102 files, 671 passed (`conversation/` re-run after the card change: 25 files, 160 passed); `tsc --noEmit -p .` exit 0 |
| Core libraries build (`pnpm --filter @fluxiq/contracts --filter fluxiq --filter @fluxiq/ui-components build`) | Done x3 (first attempt failed on my own card-option type; fixed) |
| fluxiq `tsc --noEmit` (6 GB heap, under the lock) | exit 0 |
| web `tsc --noEmit` (6 GB heap, under the lock) | exit 0 (also exit 0 by N2 and E2E after their changes) |
| web vitest, new panel: panel-shell, chat-widget, home, runs, settings-page, flows, `app/(panel)` | final: 35 files, 233 passed |
| web vitest, kept old features: `features/automation-studio` | first 5 files failed (retirement fallout); after N2: 191 files, 1,228 passed |
| web vitest `app/tests`, `lib` | 4 files 44 passed; 18 files 179 passed |
| Playwright, 7 panel specs, desktop-chromium, fresh seed, production build on port 3187, scripted assistant | first run on `next dev`: 30 passed, 11 failed; after the E2E fixes: **43 passed (3.6m)** |
| `node scripts/structure-audit.mjs` | `passed (522 warning(s), 969 baselined)`; N ran `pnpm structure:baseline` (126 entries for deleted files removed, 2 lowered) |
| Paths owned by the FluxNode-runner lane | 0 changes |

The fixture panel was a test server on the isolated `.e2e-host` data, port 3187, with model-key variables unset; it was stopped after each run (port 3187 has no listener now).

## Not verified
- The mobile, tablet, zoom and Firefox/Edge Playwright projects: only desktop Chromium was run.
- A live model: the assistant was exercised with a scripted model only, and prompt injection was reasoned and tested with scripts, not a real model reading hostile text.
- The extension against ui-components 0.12.0 (downstream).
- The hosted `service` profile end to end (reviewed in code and unit tests only).
- The graph page at `/flows/<id>/graph` in a browser beyond the redirect spec; draft recovery after reload is not wired there.
- Full suites (`pnpm check`, `pnpm test`, `pnpm build`) were not run, per the twice-a-day rule.

## Open questions for the lead
1. **Versions.** `@fluxiq/contracts` gained the public subpath `program-api-inputs` and stays 0.16.0; `fluxiq` stays 0.42.0; `@fluxiq/ui-components` went to 0.12.0 (additive). Bump contracts and fluxiq (minor) when this merges.
2. **Merge with P2b.** Any endpoint the FluxNode runner registers (e.g. the FluxNode run) must declare `assistant` or `hidden`, or the parity test fails the build; a run endpoint belongs in the overrides table as `per-call`. Both lanes regenerate the IAM catalog and `assistant-tools.generated.json`: regenerate once after merging. The other lane's edits to `programs/_shared/runtime.ts` may touch the same block as P9's assistant binding.
3. **The extension.** ui-components 0.12.0 is additive and a confirm ask without `grant`/`deny` options still reads Yes / No, but the extension was not compiled against it here (downstream lead's check).
4. **Removing a model key.** `delete-key` is `program-gated` and asks for the password. Reclassifying it `destructive` would make removal one press with a grant. That is a security posture change for the keys lane to decide (K8), so I left it.
5. **Docs.** `docs/architecture/automation-studio/persistence.md` and other docs that say every destructive endpoint needs the PIN, and developer docs naming deleted routes and specs (listed in `n-retire-old-ui.md`), need updating; `packages/ui-components/README.md` names deleted specs.
6. **Public repositories.** The R and R2 reviews found and fixed holes in code that is only on this local branch. Nothing unfixed is known, but both reports describe attacks in detail; keep them local until merged if the security-findings rule applies.

```text
Outcome: Done
Changed: Core worktree fxwork/t887/!FluxIQ: packages/contracts (program-api inputs subpath, IAM actions), packages/fluxiq (programs/_shared assistant + press-grant + api.ts + runtime.ts, all program handlers' assistant declarations, secret-keys default key, automation-studio api/{panel-assistant,flow-outline,handlers/graph-revisions}, runtime/conversations/assistant, flows/executable/outline, graph store set_node_label, IAM catalogs), packages/ui-components (0.12.0: panel subject, onScreen, thread list, confirm answer labels), apps/web (app/(panel)/**, features/{panel-shell,home,runs,settings-page,flows}, chat-widget panel transport, 313 old-UI files deleted, next.config.ts headers + redirects, e2e panel specs and fixture), reports under docs/working/fluxnode-plan/reports/
Validation: Playwright 7 panel specs (desktop-chromium, production build, fresh seed) -> 43 passed; fluxiq and web `tsc --noEmit` -> exit 0; vitest in every changed directory -> all pass (e.g. web new panel 233, automation-studio 1,228, fluxiq api 357, conversations 324); `node scripts/structure-audit.mjs` -> passed
Not verified: non-desktop Playwright projects; a live model; the extension against ui-components 0.12.0; hosted service profile end to end; full suites (twice-a-day rule)
Report: docs/working/fluxnode-plan/reports/panel-redesign.md
Notes: Tiers: worker-light x1, worker x14, worker-heavy x9; no escalations. Deferred as briefed: sign-in link/vault (H), Flows folder tree, Security key list, FluxNode runs; Data/Security pages and wizard still placeholders.
Follow-ups: ~100 old Studio files and the hand-written chat catalog remain (kept views import them); contracts/fluxiq version bumps; P2b endpoints must declare assistant entries.
```

## Integration after the merge with dev (2026-11-10)

The lead committed P9 (`708d4343b`) and merged Core `dev` into it (`fb0cd6571`). This section covers items 1-6 of the lead's integration brief. Nothing was committed; the changes are in the working tree.

**Outcome: Partial.** Every check passes except one Playwright spec: the "All runs" link on Home fails to navigate in about half of runs. The cause is a React 19.2 bug in the React that Next 15.5.24 bundles. Fixing it means patching `next`, which needs the root `package.json` and a `patches/` file, both outside the paths this lane may edit. Details and the exact change are below.

1. **P2b's endpoints.** None needed declaring. The FluxNode runner's API (`/api/fluxnode/v1`, `server/fluxnode-api/`) is its own HTTP handler, not program-registry registrations, so there is no registry run endpoint to put in the overrides table. The parity test refuses an override that names an endpoint the registry does not have. Both catalogs were regenerated and nothing drifted.
   - Consequence for the assistant: it cannot start or read FluxNode runs, because they are reachable only through that open-mode API with no registry entry or IAM. When P3b brings keys and IAM to that API, a registry endpoint for it should be declared `per-call`.
2. **`.structure-baseline.json` is legitimate; I kept it.** The diff only removes entries for files the old-UI retirement deleted (or that no longer violate) and lowers `hierarchy` from 30 to 29. That is the retirement worker's `pnpm structure:baseline` output, which the commit left out. `node scripts/structure-audit.mjs --update` on the merged tree reports "baseline already current, not rewritten: 969 entries across 13 rules (0 lowered, 0 removed)", and the file is byte-identical (ignoring line endings) to a fresh `--update`.
3. **Versions.** `@fluxiq/contracts` 0.17.0 -> 0.18.0; `fluxiq` 0.43.0 -> 0.44.0. `@fluxiq/ui-components` stays 0.12.0: dev held 0.11.0, so 0.12.0 carries only P9's content. Nothing pins these versions: every internal dependency is `workspace:*`, and the only lockfile matches for those strings are Node engine ranges.
4. **Docs.** A docs worker updated the docs below (report `panel-redesign/doc-updates.md`):
   - `docs/README.md`;
   - in `docs/architecture/`: `code-structure`, `current-system`, `program-layout`, `automation-studio`, `package-boundaries`, `automation-studio/persistence`, and `automation-studio/workspace` (marked retired);
   - `docs/programs/global-programs.md`;
   - `docs/operations/automation-studio-scale-certification.md`;
   - `docs/reference/framework-reference.md` and `packages/fluxiq/docs/reference/framework-reference.md`, regenerated with `pnpm docs:reference`, which also picked up other drift in the API reference;
   - `packages/ui-components/README.md` and `apps/web/e2e/README.md`.

   It deleted three operations docs for the deleted phase 7/8 and performance specs and fixed their links. I fixed four more stale PIN statements myself: in `docs/architecture/automation-studio/client-gateway.md` and `docs/architecture/automation-studio.md`, endpoints described as "PIN-authorized" are in fact classified `authoring`, so they ask for no PIN, and `execute-client-action` is `destructive`, so it takes a press grant.
5. **Keys questions (not built).** The user's standing rule: no PIN on normal actions, never mid-Flow, at most a PIN for a dangerous action the first time a person does it. Under that rule the keys lane (P3b) decides two things: whether `delete-key` becomes one-press (today it is `program-gated` and asks for the password), and how a person who turned a PIN on confirms the assistant's acts.

### Navigation stall from Home to Runs: root cause (worker-heavy, report `panel-redesign/nav-home-to-runs.md`)

- **The defect.** `e2e/panel-home.spec.ts:36` failed 1 of 43 in the full run, then 5 of 8 with `--repeat-each=8`. After "All runs" is clicked, Next fetches `/runs` and its chunks (all 200), but the URL never commits.
- **The cause.** It is a lost-ping bug in React 19.2's work loop, fixed upstream by React PR #36134 (issue #35821). Next 15.5.24 bundles React 19.2.0-canary-0bdb9206-20250818, which lacks the fix.
  - A navigation's page module finishes loading between React's read and the moment it attaches its ping listener.
  - The ping then arrives synchronously during render, and this React build drops it.
  - Nothing restarts the render until an unrelated update arrives (on Home, the 30-second refresh).
  - Any navigation whose page module is still loading can stall the same way. It is not specific to this link.
- **The proof.** The worker instrumented stuck runs. In 8 of 8 runs, a module that was already resolved when React attached its listener meant the navigation stuck, and one still loading meant it navigated. With the upstream one-line fix applied to the served React chunk, 15 of 15 navigations succeeded. The `.runs` stylesheet preload warning is a side effect: with the sheet already loaded, the spec still failed 8 of 12.
- **No workaround shipped.** A full prefetch on that one link, or a `(panel)/loading.tsx`, would hide the symptom, which the root-cause rule forbids.
- **The fix, needing your approval (root `package.json` and `patches/`, outside my paths).** Either:
  - `pnpm patch next@15.5.24` with React #36134 applied to the bundled react-dom builds: in `pingSuspendedRoot`'s render-context branch, record `workInProgressRootPingedLanes |= pingedLanes` instead of dropping it. The exact lines are in the worker's report. Or:
  - upgrade Next to a release that bundles a React with #36134. A third-party note says 16.3.0; this is unverified.

  Then rebuild and re-run `panel-home.spec.ts` with `--repeat-each=8` and the seven specs.

### Commands run on the merged tree and their output

All vitest runs used `--pool=forks --poolOptions.forks.singleFork`.

| Command | Output |
| --- | --- |
| parity: `npx vitest run src/programs/_shared/assistant/tests/assistant-parity.test.ts` (packages/fluxiq) | `{"registrations":266,"undeclared":0,"byProgram":{}}`, Tests 5 passed (5) |
| `FLUXIQ_REGENERATE_IAM_CATALOG=1 npx vitest run src/platform/iam/catalog` | Tests 11 passed (11); no file changed |
| `FLUXIQ_REGENERATE_ASSISTANT_TOOLS=1 npx vitest run src/programs/_shared/assistant` | Tests 36 passed (36); no file changed |
| `node scripts/structure-audit.mjs --update` | `baseline already current, not rewritten: 969 entries across 13 rules (0 lowered, 0 removed)` |
| fluxiq vitest `src/programs/_shared` | 36 files, 273 passed |
| fluxiq vitest `src/platform/iam` | 25 files, 242 passed |
| fluxiq vitest `src/programs/secret-keys` | 18 files, 195 passed |
| fluxiq vitest `src/programs/automation-studio/api` | 64 files, 357 passed |
| fluxiq vitest `src/runtime/conversations` | 42 files, 335 passed |
| fluxiq vitest `src/flows/executable` | 7 files, 45 passed |
| fluxiq vitest `src/framework/persistence/automation/project` | 75 files passed (2 skipped), 523 passed (4 skipped) |
| fluxiq vitest `service/flows`, `service/project-parts` | 2 files 10 passed; 16 files 197 passed |
| fluxiq vitest `src/framework/automation-service/service/fluxnode` (P2b) | 3 files, 15 passed |
| fluxiq vitest `src/server` (P2b) | 14 files, 112 passed |
| fluxiq vitest identity-access, background-tasks, compute-control, database-manager, deployment-sync, docs, production-runner, runtime-control | 90, 11, 1, 47, 1, 2, 1, 5 passed; 0 failed |
| contracts `npx vitest run src/program-api` | 23 files, 64 passed |
| ui-components `npx vitest run src/chat` | 102 files, 671 passed |
| `node --max-old-space-size=6144 node_modules/typescript/bin/tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/fluxiq-build/check.tsbuildinfo` (packages/fluxiq) | exit 0 |
| `node --max-old-space-size=6144 node_modules/typescript/bin/tsc --noEmit` (apps/web) | exit 0 |
| `pnpm --filter @fluxiq/contracts --filter fluxiq --filter @fluxiq/ui-components build` | contracts Done, fluxiq Done, ui-components Done |
| web vitest: panel-shell, chat-widget, home, runs, settings-page, flows, `app/(panel)` | 13, 113, 15, 10, 24, 51, 7 passed; 0 failed |
| web vitest `src/features/automation-studio` | 191 files, 1,228 passed |
| `pnpm --filter @fluxiq/web build` | exit 0; "Runtime build identity is stamped: no placeholder in 1238 server files." |
| seed `FLUXIQ_E2E_FAST_STUDIO=true node e2e/support/seed-fixtures.mjs`, then `next start` on 127.0.0.1:3187 (no model keys, gateway off, scripted assistant) | seed exit 0; "Ready in 3.9s" |
| `FLUXIQ_E2E_BASE_URL=http://127.0.0.1:3187 npx playwright test e2e/panel-{shell,home,runs,settings,flows,assistant,redirects}.spec.ts --project=desktop-chromium --workers=1` | **1 failed, 42 passed (2.2m)**; the failure is `panel-home.spec.ts:36` (the React stall above) |
| same server, `npx playwright test e2e/panel-home.spec.ts --repeat-each=8` | 5 failed, 27 passed; all 5 are `panel-home.spec.ts:36` |
| after each run: listeners on 3187 | 0 (server stopped; heavy lock removed) |
| `node scripts/structure-audit.mjs` | `passed (524 warning(s), 969 baselined)` |
| `node scripts/structure-audit.mjs --rule docs-links` | `passed (0 warning(s), 0 baselined)` |

Free memory was 3,021 to 4,676 MB at each heavy step. Playwright ran only at 3 GB or more free.

**Not verified:** the React patch applied through `pnpm patch` with a rebuild (proven only by rewriting the served chunk in a browser); the stall on other links (same mechanism, not reproduced); non-desktop Playwright projects; the extension against ui-components 0.12.0.

```text
Outcome: Partial
Changed: packages/contracts/package.json (0.18.0), packages/fluxiq/package.json (0.44.0), docs/README.md, docs/architecture/{automation-studio,code-structure,current-system,package-boundaries,program-layout}.md, docs/architecture/automation-studio/{client-gateway,persistence,workspace}.md, docs/programs/global-programs.md, docs/operations/automation-studio-scale-certification.md, docs/reference/framework-reference.md, packages/fluxiq/docs/reference/framework-reference.md, packages/ui-components/README.md, apps/web/e2e/README.md; deleted docs/operations/{automation-studio-ui-performance-profiling,web-panel-phase8-browser-scale-certification,web-panel-responsive-visual-certification}.md; .structure-baseline.json kept (legitimate); reports panel-redesign.md (appended), panel-redesign/{doc-updates,nav-home-to-runs}.md
Validation: fluxiq and web `tsc --noEmit` -> exit 0; parity -> 266 registrations, 0 undeclared; vitest in every changed directory plus service/fluxnode (15) and server/ (112) -> all pass; structure audit -> passed; Playwright 7 panel specs -> 42 passed, 1 failed (panel-home.spec.ts:36, React 19.2 lost-ping bug in Next 15.5.24's bundled React; 5/8 with --repeat-each=8)
Not verified: the React fix through pnpm patch + rebuild; the stall on other links; non-desktop Playwright projects; extension against ui-components 0.12.0
Report: C:/Users/osrs_/FluxStuff/fxwork/t887/!FluxIQ/docs/working/fluxnode-plan/reports/panel-redesign.md
Notes: Needs the lead: approve `pnpm patch next@15.5.24` with React #36134 (root package.json + patches/, outside my paths) or a Next upgrade; exact lines in nav-home-to-runs.md.
P2b's FluxNode API is outside the program registry, so nothing to declare; the assistant cannot reach FluxNode runs until P3b puts that API behind IAM.
Tiers this round: worker x1 (docs), worker-heavy x1 (navigation root cause); keys questions noted for P3b, not built.
```

## React lost-ping patch (2026-11-10, lead-approved)

**Outcome: Done.** All seven panel specs pass: 43 of 43, and the Home spec 32 of 32 with `--repeat-each=8` (it failed 5 of 8 before). The upstream React fix, PR #36134, is applied through `pnpm patch`, and the lockfile records it.

**One deviation from the approval, and why.** You approved patching `next@15.5.24`, as `nav-home-to-runs.md` proposed. I applied that patch to all ten vendored builds, rebuilt, and checked the shipped client chunk. It still held the unpatched branch, `?0==(2&iI)&&ud(e,0):iG|=n`, and carried the version string "19.2.8". The panel's browser bundle runs the installed `react-dom@19.2.8`, not Next's vendored canary, so the next patch alone fixes nothing the browser runs.
- I applied the same fix to `react-dom@19.2.8` as a second `pnpm patch`, using only the files you allowed: `patches/`, `pnpm.patchedDependencies` and the lockfile.
- I kept the approved next patch, so no path through Next's vendored copy keeps the bug.
- After the rebuild, the shipped chunk reads `(…&&0==(2&ij))?ud(e,0):iG|=n`. The minifier folded the nested branch, and a ping that arrives during a render now records its lanes instead of dropping them.
- No Next upgrade.

**The patch, matching the upstream diff.** Upstream #36134 changes one source file, `packages/react-reconciler/src/ReactFiberWorkLoop.js`. In `pingSuspendedRoot` it records `workInProgressRootPingedLanes = mergeLanes(workInProgressRootPingedLanes, pingedLanes)` when a render is in progress. Here the same branch becomes `? 0 === (executionContext & 2) ? prepareFreshStack(root, 0) : (workInProgressRootPingedLanes |= pingedLanes)`, or its `RenderContext`/`NoContext` form in the development builds.
- `patches/react-dom@19.2.8.patch` covers 4 files: client and profiling, production and development.
- `patches/next@15.5.24.patch` covers 10 files: `react-dom` and `react-dom-experimental`, client, profiling and testing builds.
- Every patched file passed `node --check`.
- `patches/README.md` documents what the patches fix, the upstream PR and issue, why there are two, and when to remove them: once both the installed `react-dom` and Next's bundled React contain #36134. Re-run the Home spec with `--repeat-each=8` after removing them.

**Files changed**
- `package.json`: `pnpm.patchedDependencies` lists both patches.
- `pnpm-lock.yaml`: the `patchedDependencies` block, and `patch_hash` on `next` and `react-dom` and on the packages that depend on `react-dom` (`@xyflow/react`).
- New: `patches/next@15.5.24.patch`, `patches/react-dom@19.2.8.patch`, `patches/README.md`.

### Commands and output

| Command | Output |
| --- | --- |
| `pnpm patch next@15.5.24 --edit-dir <scratch>`, edit, `pnpm patch-commit <scratch>` | exit 0; `patches/next@15.5.24.patch`, 10 `diff --git` entries |
| `pnpm patch react-dom@19.2.8 --edit-dir <scratch>`, edit, `pnpm patch-commit <scratch>` | exit 0; `patches/react-dom@19.2.8.patch`, 4 files |
| `pnpm install --frozen-lockfile --offline` (after both patches) | "Done in 1.9s", exit 0; the lockfile is unchanged by it. The only warning is the existing one about the SDK's unbuilt `dist` bin. |
| installed `apps/web/node_modules/react-dom` | resolves to `react-dom@19.2.8_patch_hash=v4db5easgq7dk5zsilxvbslzbm`; `cjs/react-dom-client.{production,development}.js` contain the patched branch |
| `node --max-old-space-size=6144 node_modules/typescript/bin/tsc --noEmit` (apps/web) | exit 0 |
| web vitest: panel-shell, chat-widget, home, runs, settings-page, flows, `app/(panel)` | 13, 113, 15, 10, 24, 51, 7 passed; 0 failed |
| web vitest: `src/features/automation-studio` | 1,228 passed |
| `pnpm --filter @fluxiq/web build` | exit 0 (the cache saw the lockfile and package.json change and rebuilt); "Runtime build identity is stamped" |
| fresh seed, then `next start` on 127.0.0.1:3187 (no model keys, gateway off, scripted assistant) | seed exit 0; "Ready in 3.1s" |
| `FLUXIQ_E2E_BASE_URL=http://127.0.0.1:3187 npx playwright test e2e/panel-home.spec.ts --project=desktop-chromium --workers=1 --repeat-each=8` | exit 0, **32 passed (1.6m)** |
| server stopped; fresh seed; `next start` again | listeners on 3187: 0; seed exit 0; "Ready in 1770ms" |
| `... npx playwright test e2e/panel-{shell,home,runs,settings,flows,assistant,redirects}.spec.ts --project=desktop-chromium --workers=1` | exit 0, **43 passed (2.0m)** |
| server stopped | listeners on 3187: 0; heavy lock removed |
| `node scripts/structure-audit.mjs` | `passed (524 warning(s), 969 baselined)` |

Free memory at the heavy steps was 3,148 to 4,703 MB; each run waited for 3 GB.

**Not verified:**
- Other worktrees taking the lockfile: only this tree's frozen offline install was run.
- The development server (`next dev`) with the patch.
- Non-desktop Playwright projects.
- Stalls on other links: they share the mechanism, and the patch covers it, but they were not separately reproduced.

```text
Outcome: Done
Changed: package.json (pnpm.patchedDependencies), pnpm-lock.yaml, new patches/next@15.5.24.patch, patches/react-dom@19.2.8.patch, patches/README.md; docs/working/fluxnode-plan/reports/panel-redesign.md (appended)
Validation: `npx playwright test e2e/panel-home.spec.ts --repeat-each=8` -> 32 passed; 7 panel specs -> 43 passed; `pnpm install --frozen-lockfile --offline` -> Done, exit 0; web `tsc --noEmit` -> exit 0; web vitest (panel features 233, automation-studio 1,228) -> all pass; `node scripts/structure-audit.mjs` -> passed
Not verified: other worktrees taking the lockfile; next dev with the patch; non-desktop Playwright projects; other links' stalls reproduced separately
Report: C:/Users/osrs_/FluxStuff/fxwork/t887/!FluxIQ/docs/working/fluxnode-plan/reports/panel-redesign.md
Notes: Deviation: the browser runs react-dom@19.2.8, not Next's vendored React, so the same upstream fix is also a pnpm patch of react-dom@19.2.8; the approved next patch is kept. No Next upgrade.
Removal condition and upstream links are in patches/README.md.
No workers this round.
```
