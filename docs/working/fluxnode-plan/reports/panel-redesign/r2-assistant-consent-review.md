# P9-R2: adversarial review of the panel assistant's consent path

Worker report, 2026-11-09. Scope: `runtime/conversations/assistant/**` and
`programs/automation-studio/api/panel-assistant/**`, against U5 ("consequential
acts proceed only when the person's words clearly ask, otherwise one-press Allow").

## Outcome

Done in my paths. Every hole a test confirmed (the High rows below) failed first and is fixed at its cause there. Two smaller gaps and one audit gap are outside my paths; each has an exact suggested change below. The vitest suites, the structure audit and the fluxiq typecheck pass.

The worst finding: **"delete Old search" deleted a whole project at once.** It
needed only that the model (wrong, or misled by data it read) call `delete-project`
with the Flow's id beside the project id.

## Attack results

| # | Attack | Result |
| --- | --- | --- |
| 1 | Payload widens the target: `delete-project {projectId, flowId: <Old search>}` after "delete Old search" | **Broken, fixed.** High. It ran at once, and the card would also have asked about the Flow, not the project. |
| 2 | Payload points elsewhere: `delete-flow {…, nodeIds:[selected step]}` after "delete this" | **Broken, fixed.** High. The whole Flow was deleted. |
| 3 | Stale selection after Allow: "delete this" (Flow A selected) → card → the person moves to Flow B and presses Allow → the model deletes B | **Broken, fixed.** High. The work after Allow used the selection the press came from. |
| 4 | Stale words after Allow: card raised under "clean things up", then a later message "delete this", then Allow on the old card | **Broken, fixed.** High. The work after Allow used the newest message's words. |
| 5 | Over-budget class: `carry-on-task-attempt {addUsd: 25}` with no request | **Broken, fixed.** High. It ran at once because no spend was projected. Two calls that each fit could also add up past the allowance. |
| 6 | Matcher: negation hidden by punctuation ("…or not.", "Don't!") | **Broken, fixed.** Medium. |
| 7 | Matcher: question with no "?" ("should I delete X", "how do I delete X", "can I delete X") | **Broken, fixed.** Medium. |
| 8 | Matcher: quoting (`The note says "delete Old search"`) | **Broken, fixed.** Medium. |
| 9 | Matcher: a verb inside a name ("open Delete old rows") | **Broken, fixed.** Medium. |
| 10 | Matcher: the verb applies to another item ("delete Old search and rename New search" → delete New search) | **Broken, fixed.** High. This is the main way a misled model picks another target. |
| 11 | Matcher: "remove X from my favourites" read as deleting X | **Broken, fixed.** Medium. |
| 12 | Matcher: bare "this" with a Flow selected meant the project around it (`delete-project` passed) | **Broken, fixed.** High. |
| 13 | Matcher: two target items that share a name, both "named" by it | **Broken, fixed.** Medium. |
| 14 | Matcher: a choice or condition ("X or Y", "if it has no runs", "maybe") | **Broken, fixed.** Medium. |
| 15 | Matcher: words that also mean something harmless ("order … by date" as money, "access this key" as security) | **Broken, fixed.** Low. "order" and "access" were removed from the verb list. |
| 16 | "undelete", "deleted", "re-send" | Held. These are whole-word mismatches. |
| 17 | Prompt injection (Flow names, step labels, run outputs, page text, tool results) | **Held, given the fixes above.** Consent reads only the person's stored words and page. Model output, tool answers and context-line names never reach `words`. An injected target is caught by #1, #2, #10 and #12. |
| 18 | Every tool call carries `via: "assistant"` and the person's actor | Held for calls and name lookups. One audit gap is outside my paths (S3). |
| 19 | A grant minted on clearly-asked words is bound to exactly that call and spent once | Held. It is minted on the same `call.input` that is then sent; press-grant is trusted. |
| 20 | Allow/Don't replayed, double-pressed, answered by another person, answered on another thread, answered after the call changed | Held. The ask and its call live in the person's own database. `take` is a conditional update. The call row is insert-only. A different second answer is refused. New test: another user gets "That question does not exist." and nothing runs. |
| 21 | The assistant answers its own card, or raises its allowance | Held. Both endpoints are hidden, so they are not in the catalog, and `call()` refuses them via the assistant. New test. |
| 22 | Per-person isolation of threads | Held. There is one database per user, keyed from the actor and never from the payload. New test. |
| 23 | Per-call runs ask first (no lasting-class resolver) | Held: this fails safe. An unresolved run is send+money+delete, so it always gets a card unless the words name all three as commands. New test. |
| 24 | `resume-runtime-session` is `change` | Not fixed, outside my paths. Low/medium (S1). |

## What changed and why

**Target = the resource IAM decides on** (`programs/automation-studio/api/panel-assistant/call-target.ts`).
- The old target was "the most specific id field present in the input". So any extra id the model added became the target, while the handler acted on something else (#1, #2).
- Every live registration declares `resource` from the fields its handler acts on. `describe` now evaluates `registration.resource.of(request)` and names those refs.
- If the input carries an id (`id`, `…Id`, `…Ids`) that no ref uses, the target is `partial`. A partial target is never clearly asked, and the card keeps the tool's own words: "Delete a project and everything in it: the project “Project one”? It cannot be undone."
- Workspace, program and self-user resources have no nameable target, so the call always gets a card.

**Words and page kept with each card** (store migration `9003_panel_waiting_call_words`, `waiting-calls.ts`, `panel-threads.ts`, `call-step.ts`, `panel-assistant.ts`).
- A card's waiting call now stores the `words` and `context` of the message it was raised under.
- After Allow, the work goes on with those, never with the press's `onScreen` or the newest message (#3, #4).
- `answer()` no longer takes `onScreen`, and `answer-panel-ask` ignores one if sent.
- Rows from before 9003 read as empty words, which clearly ask nothing.

**Spend projection** (`programs-port.ts` `dollarsAdded`, `call-step.ts`, `panel-assistant.ts`, `purse.ts`).
- `projectedCostUsd` is the sum of the input's `…Usd` amounts. Today that is only `addUsd` on `carry-on-task-attempt`, the one assistant tool that adds money.
- Over what is left of the message's allowance, the call is gated `budget` (#5).
- Once it runs, including after Allow, the amount counts against the allowance, so small additions cannot add up past it.
- Runs keep no projection: they are bounded by their own Flow's budget, which the person set.
- **Decision:** the never-firing gate did break U5. `carry-on-task-attempt` is literally "spending beyond the budget", and it ran on the model's say-so.

**Matcher rewrite** (`consent/`). New files:
- `spoken-words.ts`: a tokenizer. Punctuation is its own token, and quotation spans are marked.
- `request-words.ts`: the word lists.
- `said-as-request.ts`: negation, condition or choice, and questions.
- `selected.ts`: "this" means the innermost selection, unless a kind is said.

`clearly-asked.ts` now requires all of the following:
1. Each gated class has a verb **said as a command**: it opens a clause after only lead words ("please", "can you", "go ahead and"), and it is not quoted and not inside a name.
2. Each item is that command's **object**: only small words, kind words and other named items stand between them.
3. Nothing after the item in its clause moves the act elsewhere ("from", "out", "off").
4. Shared names name nothing.
5. `partial` is never asked.

The design's four tests stand; this makes them checkable against the attacks above. Every list errs toward one press of Allow.

## Tests added (each failed before its fix)

- `runtime/conversations/assistant/consent/tests/clearly-asked-attacks.test.ts`: 13 cases. Against the old matcher, 12 failed and the "still runs what is clearly asked" case passed (observed: `Failed Tests 12`).
- `programs/automation-studio/api/panel-assistant/tests/consent-attacks.test.ts` (real registry, IAM, press grants): 8 cases. Against the old code, the 5 attack cases failed:
  - project deleted: `expected "spy" to not be called at all, but actually been called 1 times`;
  - Flow deleted through `nodeIds`: the same message;
  - stale selection: `expected [ 'flow.x', 'flow.new' ] to deeply equal [ 'flow.x' ]`;
  - stale words: the same message;
  - carry-on: `called 2 times`.

  The 2 held cases passed. The add-up case was added after the fix and is verified only after it.
- `consent/tests/confirm-words.test.ts`: one case for the partial card.
- Updated tests:
  - `store/tests/panel-threads.test.ts`: the waiting call carries `words` and `context`.
  - `panel-assistant/tests/register.test.ts`: its stand-in `get-flow` and `delete-flow` registrations now declare `resource` as every live registration must. Without it, "delete Old search" correctly gets a card.

## Commands run and observed results

- `npx vitest run src/runtime/conversations src/programs/automation-studio/api/panel-assistant --pool=forks --poolOptions.forks.singleFork` → `Test Files 42 passed (42)`, `Tests 338 passed (338)`.
- Baseline before any change (assistant dirs only) → `10 passed (10)`, `41 passed (41)`.
- `node scripts/structure-audit.mjs` → `structure-audit: passed (538 warning(s), 1095 baselined).` No warning names a file under `conversations/assistant` or `panel-assistant`.
- fluxiq typecheck: `node --max-old-space-size=6144 node_modules/typescript/bin/tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/fluxiq-build/check.tsbuildinfo` → no output, `exit 0`.
  - It ran on the third memory check (2497 MB, then 1263 MB, then 4068 MB free).
  - The lock `.p9-heavy-lock` was taken and removed.

## Not verified

- The web dock: it still sends `onScreen` on `answer-panel-ask`, which is now ignored and harmless.
- Live models. Prompt injection was reasoned from the data flow and covered by tests of a scripted model choosing the wrong target, not by a real model reading hostile text.
- Real handlers. The integration tests use stand-in handlers with the live declarations' shapes: inputs, resources and classifications copied from `flow-lifecycle.ts`, `projects.ts`, `attempt-carry-on.ts` and `runtime-execution.ts`.

## Suggested changes outside my paths

- **S1 (`programs/_shared/assistant/consequence-overrides.ts`).** Add `"automation-studio/resume-runtime-session": "per-call"`.
  - Today "Lets a held run carry on." is `change`. The model can resume a run the person deliberately held (`takeControl`, holder `person`), and the run's lasting acts go on.
  - Low/medium: the run was started with consent, and its own permission gates still apply.
- **S2 (`programs/_shared/assistant/consequence-overrides.ts`).** Consider an explicit declaration for `carry-on-task-attempt`.
  - My projection gates it through its `addUsd`. A declared `consequence` cannot express "budget" because `AssistantConsequence` has no such class.
  - The structural fix is a `spends?: (input) => number` hook on the `assistant` declaration, so each endpoint states its own projection instead of the `…Usd` naming convention my port reads.
- **S3 (`programs/_shared/api.ts` `mintPressGrant`).** A grant minted on clearly-asked words (server code, no `via`) is audited as `["allow", null]`: the person's own decision. Recommend that `PressGrantMintRequest` carry `on: "assistant-words" | "press"` and write it to the audit row, so words-minted grants can be told from presses. Low; nothing runs that should not.
- **S4 (the design or a contract).** The full fix for "no more than the named items" is a per-endpoint declaration of which input field(s) hold what the call acts on.
  - A boolean that widens a call (a hypothetical `all: true` beside a resource id) is not an id and so is not `partial`.
  - None of today's assistant-visible destructive tools has one: `delete-flow`, `delete-project`, `delete-recording(s)`, `delete-run-datasets`, `delete-project-category`.

## Open questions or contradictions found

- **Two items from the design's verb list were removed.** "order" (it also means "sort") and "access" (it also means "open") are gone from U5's list. A person who writes "order X" to buy gets one Allow press.
- **The security nouns ("key", "permission") are almost never commands.** In practice a security act runs unasked only on "revoke" or "rotate"; everything else gets a card. This is conservative, and the design may want "change"-style verbs scoped to keys.
- **`delete-run-datasets` without `datasetId` acts on all of a run's tables.** Its resource is the run, so "delete this run" (run selected) clearly asks it. That removes less than the words name (the tables, not the run). The card reads "Delete this run?", which overstates the act.
- **A Flow name that is unique within the call but shared across projects is still matched.** If the model picks another project's same-named Flow, "delete Old search" matches it. Suggest that for a Flow outside the selected project (`context.projectId`) the words must also name the project. This needs a product decision, so it is not done here.
- **Cards never expire.** An old card pressed days later runs its exact stored call. That is the person's own press of a described call, so I judged it held. A time limit would be a product decision.
- **The allowance is workspace-wide (F2 note 6), not per person.** Any holder of `secrets.manage` sets it for everyone.
