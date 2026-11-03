# Report: thin-handlers

## Outcome

Done. All ten flagged functions are gone from Studio's handlers. Their logic now lives in the framework, and the endpoint tests give the same results as before: 35 files and 246 tests passing, before and after.

The full structure audit still exits 1, on two findings in files the `dev-failures` worker is editing. None come from this work.

## What changed and why

Each endpoint keeps its registration, including `permission`, `resource` and `classification`. A flagged handler now reads its request, makes one framework call and shapes the reply. The moved modules sit outside `service/index.ts`, so the public surface did not grow. Handlers import each new directory's barrel directly.

New directories under `packages/fluxiq/src/framework/automation-service/service/`:

| Directory | Holds | Came from |
| --- | --- | --- |
| `flow-bootstrap-requests/` | `generate.ts`, `readiness.ts`, `sanitized-generation.ts`, `bounded-identifier.ts`, barrel | `llm-generation.ts`: the generate handler (102 lines), `sanitizedFlowBootstrapGeneration` (42) and their helpers |
| `run-requests/` | `run-session.ts`, `refusal-response.ts`, barrel | `runtime-execution.ts`: the run handler (91) and `reauthoredOf`; `handlers/run-refusal/` |
| `conversation-requests/` | `list.ts`, `append-turn.ts`, `answer-ask.ts`, `command-context.ts`, `on-screen.ts`, `requested-fields.ts`, `types.ts`, barrel | `conversations.ts`: three handlers (22, 34, 21), `commandContext` (21) and their helpers |
| `flow-instruction-requests/` | `save.ts`, `scope.ts`, barrel, `tests/scope.test.ts` | `instructions.ts`: the save handler (33); `handlers/instruction-scope.ts` |
| `flow-settings-requests/` | `update.ts`, `size-settings.ts`, `llm-execution-settings.ts`, `bounded-whole-number.ts`, barrel, `tests/llm-execution-settings.test.ts` | `flows.ts`: the update handler (29); `handlers/llm-execution-settings.ts` (28); `handlers/bounded-whole-number.ts` |

Handler files edited: `llm-generation.ts`, `runtime-execution.ts`, `conversations.ts`, `instructions.ts`, `flows.ts`.

Three things went beyond the flagged list, because moved code needed them and the framework may not import Studio:

- **Unflagged helpers moved:** `handlers/bounded-whole-number.ts`, `handlers/instruction-scope.ts` and `handlers/run-refusal/` are deleted from Studio and now live in the framework.
- **Barrel edited:** `handlers/index.ts` re-exports `flowInstructionScopeFromPayload` and `assertFlowLlmExecutionSettings` from their new homes, so it still publishes the same three names.
- **Two test files moved:** `tests/instruction-scope.test.ts` and `tests/llm-execution-settings.test.ts` followed their subjects. Only their comments and one import changed.

Where the code is not a line-for-line copy:

- **Signatures and imports:** values the body reached from the handler's scope are now parameters, and imports point at the owning directories' barrels.
- **Conversation store reads:** `conversations()` became `service.conversations`. It is still read at call time, so registering the API still touches nothing on the service.
- **Reply shape:** `list`, `append`, `answer`, `update settings` and `save instruction` return their data and the handler wraps it in `{ ok, payload }`. The keys and their order are unchanged.
- **Domain check:** append and answer still assert the project's domain access in the handler, before any logic runs.
- **One reorder:** in save-instruction, `Date.now()` now runs after the title and body validation instead of before it. A refused request never used the value, so nothing observable changes.

`.structure-baseline.json` is untouched, so it still holds the ten old `program-controllers` entries. None is reported as a finding now. The lead should run `pnpm structure:baseline` when it adopts this work.

## Commands run and observed results

**1. `node scripts/structure-audit.mjs --rule program-controllers`**

- Before: `structure-audit: passed (0 warning(s), 10 baselined).`
- After: `structure-audit: passed (0 warning(s), 0 baselined).` Exit 0.

**2. `pnpm.cmd --filter fluxiq check`**

Exit 0, with 0 `error TS` lines. This run includes the `dev-failures` worker's edits at the time.

**3. Studio API tests, from `packages/fluxiq`**

Before, with `pnpm.cmd exec vitest run src/programs/automation-studio/api --minWorkers 1 --maxWorkers 2`:

```text
Test Files  35 passed (35)
Tests  246 passed (246)
```

After, with `src/framework/automation-service/service/flow-settings-requests` and `.../flow-instruction-requests` added to the same command:

```text
Test Files  35 passed (35)
Tests  246 passed (246)
```

The after run covers the same tests in new places: 33 files and 236 tests under `api`, plus the two moved files (4 and 6 tests).

**4. `node scripts/structure-audit.mjs`**

Exit 1 with two failures, neither from this work:

- `as-never` in `packages/fluxiq/src/runtime/llm/repeat-guard/tests/outcomes.test.ts`
- `statement-packing` in `packages/fluxiq/src/runtime/flow-authoring/bootstrap/subflow-candidate/subflow/trial-gate.ts`

Both files are modified in the working tree by the `dev-failures` worker. I filtered the failures and the lowerable list by the new directories and `automation-studio/api/handlers/`, and neither has an entry. The four warnings under the handlers are on `recordings.ts` and test files, which are advisory size notices; I did not compare them with a pre-change audit, and none of those files was edited except by deleting two tests from the `tests` folder.

**5. Moved-text check (scratch script, not part of the brief)**

Of the 817 lines removed from the handlers, 754 appear verbatim in the new modules or the edited handlers. I read the other 63. They are imports, signatures gaining `export` or new parameter types, `conversations()` reads, reply wrapping and comments naming old paths.

## Not verified

- **No new direct unit tests:** the moved logic is exercised through the existing endpoint suites, and I added no new tests, in line with the no-new-mechanism rule. I grepped those suites for the main moved features and found matches for re-author results, run refusals, size settings and sanitising. I did not measure line coverage.
- **Wider builds:** I did not run `pnpm build`, the downstream extension's checks, the whole package suite, or a live run. No browser, panel or paid call was used.
- **Load order in production:** handlers now reach `runtime/...` barrels through the new modules. Test loading was clean, and the import-cycle rule reports nothing from these files, but the real server entry was not started.

## Open questions or contradictions found

- **Stale references outside my paths:**
  - `docs/reference/framework-reference.md` and `packages/fluxiq/docs/reference/framework-reference.md`, lines 123 and 3657, name the old handler paths. `scripts/docs-reference.mjs` references this file, so it looks generated, but I did not confirm that or regenerate it.
  - A comment at `runtime/llm/flow-execution-limits/resolution-within-flow-settings.ts:32` names `api/handlers/llm-execution-settings.ts`. It is under `runtime/**`, so I left it.
  - A comment in `runtime/flow-authoring/bootstrap/generation-failure/failed-builds.ts` names `api/handlers/llm-generation.ts`. It is also under `runtime/**`, and it was already an out-of-date path.
- **Stale comments moved unchanged:** the `../../model/authoring-mode/` path in `generate.ts` and the `../../../runtime/service/...` path in `refusal-response.ts` were already wrong. I kept them under the no-cleanup rule.
- **Endpoint tests in a scope test:** `scope.test.ts` also holds four tests of endpoint constants that have nothing to do with its subject. They moved with the file rather than being split, also under the no-cleanup rule.
- **No defect was exposed by the move.**
