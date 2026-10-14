# t584 read-builder-config: worker report

## Outcome

Partial. The cause is found and fixed, and the loop's result now names the failed check. The brief's return reason does not show that name yet: it is built in `project-agents/dispatch/ending.ts`, which this brief does not own. The exact one-function change is under "Open questions".

## Cause

The configuration check that failed was the tool set's, not a limit. The 64-turn / 116-call sizing was fine: the brief's `maxCalls` sizes the purse allowance, not `maxToolCalls`, which stays 64.

`automationStudioLlmEvidenceValidTools` (`llm/evidence-loop-decision.ts:670`, and the same bound in `llm/deepseek/preflight.ts`) refuses any tool whose `description` is over 2,000 characters. The builder's `core.submit_subflow` description included `briefWords(scope)`: every part's text in the person's words plus, for a callable subflow, the exact `part` / `input:` / `output:` lines. In launch 6 the everything-store plan's `find_earbuds` had two parts (179 and 235 characters of quote text) and `outputs: ["earbuds"]`, so the brief carried an interface with one output. I rebuilt that scope in a local probe from the run's own plan file (only lengths and keys were read; the probe was deleted). The submit description came to 2,165 characters, and the loop returned `invalid_configuration` with 0 calls. Without the interface it was 1,885 and the loop ran.

Crossborder (`add_hubs`) ran because it had one part and no outputs, so its description stayed under the bound. Whether a part asks for a lasting act was not the cause.

## What changed and why

All paths are under `packages/fluxiq/src/programs/automation-studio/runtime/`.

- **The cause.** `flow-bootstrap/subflow-candidate/builder-loop.ts`: the brief (`briefWords`) now opens the description of the submit tool's `flow` input property, before the script format. Property descriptions have no length bound, and that one already holds several thousand characters of format. The tool's own description keeps only the text that is the same for every brief, and points to where the brief is ("The description of "flow" opens with your brief ..."). The header has a new t584 paragraph explaining this.
- **Structural.**
  - New `llm/configuration-issue/issue.ts` and its barrel `index.ts` define:
    - the type `AutomationStudioLlmEvidenceLoopConfigurationIssue`, with fields `{ check, values, words }`;
    - `automationStudioLlmEvidenceLoopConfigurationIssue(check, figures, words)`, which turns figures into JSON (a non-finite number becomes text);
    - `automationStudioLlmEvidenceLoopToolSetIssue(tools)`, which names the first check a refused tool set fails, in the same order as `automationStudioLlmEvidenceValidTools`. The names are `tools.none`, `tools.too_many`, `tool.id`, `tool.duplicate_id`, `tool.description_length`, `tool.input_schema`, `tool.effect`, `tool.per_call_effect`, `tool.action_input_key`, `tool.repeat_policy`, `tool.initial_observation`, `tools.initial_observations` and `tools.repeat_policy_without_mutation`. A refusal it cannot name comes back as `tools.invalid`, never as nothing.
  - It sits beside `evidence-loop/` because `evidence-loop/` and its `tests/` were both at the audit's 25-file limit. `evidence-loop/index.ts` re-exports it, the same way it re-exports `../evidence-progress/`.
  - `llm/loop-configuration.ts`: `resolveLimits` now returns `EvidenceLoopLimits | EvidenceLoopLimitsRefused` (`{ issue }`). Each check names itself with its figures, for example `limits.max_tool_calls {maxToolCalls, ceiling}`, `limits.max_iterations`, `limits.min_tool_calls`, `limits.budget` and `limits.max_steps_without_progress_agrees`. The checks, their order and their verdicts are unchanged.
  - `llm/evidence-loop/result.ts`: the failure variant gains an optional `configuration` field, present only on `invalid_configuration`, and `automationStudioLlmEvidenceLoopFailure` takes it as a trailing optional argument.
  - `llm/evidence-loop.ts`: the one configuration failure line passes the limits' issue or the tool set's. The file stays at 800 lines with no new packed statements. All other results are unchanged: no `configuration` key on success or on any other failure (tested).
- **Tests.**
  - `flow-bootstrap/subflow-candidate/tests/builder-loop.test.ts`:
    - the brief test now reads the `flow` description, and asserts the brief is no longer in the tool description;
    - new reproduction: a read-only builder (two long synthetic parts, no predecessors) at 64 turns with a 116-call allowance runs to completion;
    - new bound test: six long parts, a 64-character key and a callable interface still keep the submit description at 2,000 characters or less.
  - `service/project-build/tests/project-build-call-shares.test.ts`: reads the brief from the `flow` description (one block changed).
  - New `llm/configuration-issue/tests/issue.test.ts`:
    - a limit refusal names its check and figures;
    - several limits are named in the loop's order;
    - a too-long tool description is named;
    - success and other failures carry no `configuration`;
    - 15 refused tool sets are each named and each also refused by `automationStudioLlmEvidenceValidTools`, so the diagnosis cannot drift from the check unnoticed;
    - 32 tools and 2,000 characters are both still allowed.
- `service/project-build/brief-ports.ts` was not edited. The cause was not there, and the coordinator moved that file to t585.

## Commands run and observed results

All from `packages/fluxiq` in the Core worktree unless noted.

- Reproduction on the old code: I put the HEAD `builder-loop.ts` back in place temporarily and ran `npx vitest run .../builder-loop.test.ts -t "read-only builder"`. It failed with `{"ok":false,"code":"llm_evidence_loop.invalid_configuration",...,"configuration":{"check":"tool.description_leng...`. My first version of the reproduction used parts too short to go over the bound and passed on the old code; I lengthened the parts until it failed as above. Afterwards the fixed file was restored (`git diff --stat` shows 13+/2-).
- Same file on the fixed code: `Tests 8 passed (8)`.
- `npx vitest run runtime/llm runtime/flow-bootstrap/subflow-candidate runtime/service/project-build runtime/project-agents`: `Test Files 241 passed (241)`, `Tests 2261 passed (2261)`. This was after moving into `configuration-issue/`; a later type-only import change was re-run on the two new test files: `Tests 28 passed`.
- `npx tsc --noEmit -p .`: exit 0, no output.
- `node scripts/structure-audit.mjs` (repository root): `structure-audit: passed (356 warning(s), 1156 baselined)`. The first run had 3 failures (the two 25-file directories, and `evidence-loop.ts` at 802 lines); the move fixed those. A barrel-import finding was then fixed.

## Not verified

- No live run, and no provider was reached (as the brief says).
- That the model reads and follows the brief now that it sits in the `flow` property description. The provider request body was not inspected. The format text was already in that description, and the tool description points to it.
- Full `pnpm check` / `pnpm test` were not run (the twice-a-day rule).

## Open questions or contradictions found

1. **The return reason (outside my ownership).** The brief asks for the return reason to name the check, but that reason is built in `project-agents/dispatch/ending.ts`, `stopReason`, which is not in "Owns". I did not edit it. The suggested change:

   ```ts
   function stopReason(loop: Extract<AutomationStudioLlmEvidenceLoopResult, { ok: false }>, allowance: AutomationStudioLlmBuildPurse | undefined): string {
     const refusal = allowance?.refusal;
     if (refusal) return `This brief's allowance could not pay for its next call (${refusal.code}), so the builder stopped.`;
     const named = loop.configuration ? ` ${loop.configuration.words} (check ${loop.configuration.check})` : "";
     return `The builder stopped before completing (${loop.code}).${named}`;
   }
   ```

   Add a test in `project-agents/dispatch/tests/brief-return-reason.test.ts`: a loop result with `configuration` should give a reason containing its `check` and `words`. The reset path uses the same `stopReason`, so it would gain the same wording.
2. **A duplicated bound.** The limits 32 and 2,000 are now written in `evidence-loop-decision.ts`, `deepseek/preflight.ts` and `configuration-issue/issue.ts`. The new test pins the second copy against the first. Making `automationStudioLlmEvidenceValidTools` simply return `automationStudioLlmEvidenceLoopToolSetIssue(tools) === undefined` would remove the duplication, but `evidence-loop-decision.ts` was not mine to edit.
3. **NaN budget throws instead.** A budget with `maxCostUsd: NaN` throws while the purse is built ("A build purse's ceiling must be a finite, non-negative amount."), before the configuration check runs, so it never becomes `invalid_configuration`. This was already the behaviour and is left unchanged; the test uses `maxTotalTokens: 0` for the budget case instead.
