# Attempt interfaces (t860)

## Outcome

Done, including the lead's four follow-up decisions. The six shared records exist as types with strict parsers and tests in `@fluxiq/contracts/automation`, with a check that an attempt and its result agree. `@fluxiq/ui-components` has an optional results port with fakes, and the port now reaches the chat through its leases. No chat code calls the port yet and nothing is wired into a live path. Nothing is committed.

## What changed and why

- `packages/contracts/src/task-attempts/`: `task-attempt`, `task-result`, `attempt-act`, `attempt-result-check`, `tried-record`, `saved-state`, `subflow-card`, plus `loops-caught`, `trust`, `limits`, and the internal `field-checks`, `parse-totally`, `person-words`. Tests in `tests/`.
- `packages/contracts/src/automation.ts`: the export, and one comment line above it.
- `packages/ui-components/src/chat/ports/results.ts`, `index.ts`, `transport.ts` (`ChatTransport.results?`), `tests/results.test.ts`.
- `packages/ui-components/src/chat/lease-transport.ts`: forwards `results`, leased. `chat/tests/results-reach-chat.test.ts` is new, so the existing test files, which another lane may be editing, are untouched.
- `packages/ui-components/src/testing/results/` (`createFakeChatResultsPort`, `fakeTaskOutcomes`), and the testing barrel.
- `docs/architecture/package-boundaries.md`: a section on the entries and a migration note.

### The lead's four decisions

1. **Cross-record check:** `checkAutomationStudioTaskAttemptResult(attempt, result)`. It refuses `achieved` with no result or a `refuted` one, `budget_out` with no result, and a result that names another attempt.
2. **Carry on:** optional `ChatResultsPort.addBudgetAndCarryOn({ projectId, attemptId, addUsd })`, answering `{ attemptId, budgetUsd }`, with the fake. The same attempt goes on, keeping its result and acts.
3. **What it waits for:** `waitingFor` is `permission`, `person_only_check` or `stuck_in_a_loop`. The type is tagged, so `tsc` refuses a wait with no reason and a reason on any other status (`@ts-expect-error` tests), and so does the parser.
4. **`leaseTransport`:** forwards all five methods under the lease, the optional one only when the client has it.

**How I read "labelled honestly" for a budget-out.** Refused: `budget_out` labelled `confirmed`, from the plan's "labelled as not confirmed" (a confirmed result is `achieved`, even if the improving after it spent the rest), and any kind but `rows` or `partial`, from the first brief. Allowed: `unverified` and `refuted`. An empty `partial` satisfies "carries a result" when nothing was found. Overrule this if you meant something else.

### Where I departed from the brief, and why

| Where | Brief | What I did | Why |
| --- | --- | --- | --- |
| All | `TaskAttempt` etc. | `AutomationStudioTaskAttempt` etc., `parseAutomationStudio...` | House naming in this contract |
| Port | Read the records | `ChatTaskAttempt` etc. restate them, with a type test that fails `check` on drift | `ui-components` does not depend on `@fluxiq/contracts`. Importing it passes `tsc` through workspace paths and fails the build, as the audit config records for `apps/web`. A dependency would need `package.json`, which is not owned |
| `TaskResult.answerText` | A string | `{ text, author: "model" }` | The label travels with the words, so no reader can drop it |
| `TaskResult` | No such fields | Added `missingWhat` and `rows.truncated` | The study's partial turn says what is missing. `totalRows` is not honest without `truncated` when a dataset is capped |
| `TaskResult.from` | Words | `[{ site, pages }]`, `site` a host name | The study's "host and page words" |
| `loopsCaught` | By pattern | Five patterns, each `{ steered, refused, changeApproach, askPerson }`, all required | t859's `AutomationStudioLlmLoopsCaught` |
| `TriedRecord` | Shape to align | `{ version: 1, tried, approaches }`, members and `readonly` as t859's `AutomationStudioLlmLoopAttemptRecordData` | Aligned. Keys must be digests, so no text can travel as one |
| `SavedState` | A closed set plus trust | A tagged union: `ready` cannot be `unproven`, `partly_works` cannot be `established`, `notes_only` is only `unproven`. Added `savedAtMs`, `flowId`, `lastWorkedAtMs`, `simulation` | Makes the truthful chip the only one that can be written, and the study needs "from [date]" |
| Trust tier | `unproven` | Kept, though Core's `confidence.ts` calls it `unverified` | On these records `unverified` is a result's label. Whoever derives trust maps one to the other |
| `SubflowCard.startCheck/endCheck` | Facts, per the study | `{ digest, conditions, says? }`, by reference | A fact condition's `target` is in the host's own form and its `value` can be a page literal. The real conditions stay in the version snapshot, so **the guard reads them from there, not the card** |
| `SubflowCard.calls` | `partId@version` | `{ partId, version }` | Matches the plan's pin |
| `SubflowCard` | Study also lists `digest`, `from`, `startSignature` | Left out, as the brief's list does | Add them when the library lane needs them |
| Act classes | The existing classes | Restated in the contract, with a test comparing them to the runtime's list | A contract cannot import the runtime |
| `AttemptAct.classes` | Classes | May be empty | An act with no declared class still happened (D6's disclosed limit) |
| `rowIdentity` | Row identity | Digest only | Core's row identity holds cell values, which are page text |

### What "no selector, page text or token" actually covers

Every parser refuses unknown keys, and ids, keys and digests have strict patterns. Words fields refuse markup, attribute matches, `:nth-`, path expressions, a bare `#id` or `.name`, full addresses, `Bearer` values and long mixed alphanumeric runs. They **cannot** catch a selector written like `div.card > a`, or words copied off a page: that stays the writer's job.

Three fields hold page-derived or literal values by design: `rows.previewRows` (the result itself), `answerText` (the model's words, length-bounded only) and `SubflowCard.fixedValues` (screened by the writer, and refused only if token-shaped).

## Commands run and observed results

Run against the final tree, after every change above.

- `packages/contracts`: `pnpm.cmd exec vitest run src/task-attempts --minWorkers 1 --maxWorkers 2` -> `Test Files 9 passed (9)`, `Tests 82 passed (82)`.
- `packages/ui-components`: `pnpm.cmd exec vitest run src/chat/ports --minWorkers 1 --maxWorkers 2` -> `Test Files 1 passed (1)`, `Tests 3 passed (3)`.
- `packages/ui-components`, extra, because the named check does not cover the fakes or the lease: `pnpm.cmd exec vitest run src/testing src/chat/tests/results-reach-chat.test.ts src/chat/tests/lease-transport.test.ts src/chat/tests/lease-and-beat.test.ts src/chat/tests/owner-context.test.ts src/chat/project-navigation/tests/draft-owner.test.ts --minWorkers 1 --maxWorkers 2` -> `Test Files 6 passed (6)`, `Tests 32 passed (32)`.
- `pnpm.cmd --filter @fluxiq/contracts check` -> exit 0. `pnpm.cmd --filter @fluxiq/ui-components check` -> exit 0.
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (487 warning(s), 1097 baselined).`, exit 0, with no line naming these files. Earlier runs failed on my own barrel-skipping imports and a third `fake-` file, which is why the fakes moved to `testing/results/`.
- `node scripts/structure-audit.mjs --rule browser-imports` -> `structure-audit: passed (0 warning(s), 0 baselined).`, exit 0.
- Extra: `pnpm.cmd --filter @fluxiq/ui-components build` -> exit 0 on the final tree. `pnpm.cmd --filter @fluxiq/contracts build` -> exit 0 after the last contract change. This rebuilt both ignored `dist` folders in this worktree.

Extra checks made while building, each undone afterwards:

- Mutations: ten temporary edits, each caught by a failing test: dropping each of the five rules in the cross-record check, the waiting-reason and stray-reason rules, the whole `results` forward in `leaseTransport`, leasing only `runAgain` to an always-valid lease, and losing `this` on `addBudgetAndCarryOn`.
- Drift guard: five temporary edits to `results.ts` (a `failed` status, a renamed field, an extra field, a wider trust, a narrower `waitingFor`) each made `tsc` report errors in `tests/results.test.ts`.
- t859 fit: a scratch file outside the repository assigned t859's record and loop-count types to the contract's, and the record back the other way, with 0 errors on this round. A deliberately wrong assignment in the same file did error in the first round, so the check is real.

## Not verified

- **The chat using the port.** Nothing in the chat calls `results` yet, so "reaches the chat" is proven through the two leases the chat reads its transport from (`createChatOwnerContext`, `createProjectDraftOwner`), and not through a mounted widget.
- The extension and `apps/web`: not type-checked or run. They gain only optional members on types they implement. `leaseTransport` adds no key for a client with no port, which a test confirms.
- `src/chat` as a whole: only the tests around the lease ran, per the rule on narrow checks.
- Any real record: nothing writes these yet, so the parsers and the check have only seen test values and fakes, not Core's output. No writer calls the check yet.
- t859 fit is as of this run. That lane is uncommitted and still moving.
- Literal parity of the loop patterns with t859: only the type assignment above checks it, and nothing in the repository will until t859 merges.

## Open questions or contradictions found

1. **`achieved` with an `unverified` result, or a `partial` one, still passes the check.** I kept to your list. The plan says "achieved" means a judged yes or Core's own checks, and that an unsure judge keeps looking, which suggests `achieved` should require `confirmed`. All the fakes already do. It is a one-line tightening if you want it, but a writer relying on "Core's own checks" must then label those `confirmed` with `timesChecked` of 1 or more.
2. **t859 should state the fit.** When it merges, add `satisfies AutomationStudioTriedRecord` on `data()` and the same for its loops caught, so a change there fails its build.
3. **`addUsd` is the chat's to choose.** D8 calls it one press, so whichever lane draws the button picks the amount, or the port's query changes.
4. **`established` floor.** The parser requires 2 zero-model runs. A high-risk change needs 3 under `confidence.ts`, which a card cannot see, so the floor is a minimum and not the full rule.
5. **Version bumps** are yours at merge, as you said. The migration note is written as "Next patch".
