# t667 project-mode-is-the-default (tests) - worker report

## Outcome

Done. The five tests that assumed `candidate` when the setting is unset now say what they mean under the `project` default. Every candidate-path assertion is still there. No production code changed.

## What changed and why

All paths are under `packages/fluxiq/src/programs/automation-studio/`.

- `api/handlers/tests/llm-generation.test.ts`: the "resolves a configured authoring mode" test is renamed "... legacy proposes, candidate drafts, unset or blank builds as a project". The loop now pairs each setting with what it resolves to: `undefined`, `""` and `"  "` resolve to `project`, and `"candidate"` resolves to `candidate`. It asserts `authoringMode: resolved` on the generate call. The other assertions are unchanged for every setting: a draft is answered as a candidate, a proposal is refused, and a raw caller that omits the mode keeps the legacy wire contract. A stale comment that named candidate as the configured mode is reworded.
- `runtime/conversations/commands/tests/build.test.ts`: the `describe.each([undefined, "", "  ", "candidate"])` block is now "explicit candidate authoring mode" and stubs `"candidate"`. Its two tests are unchanged. A new `describe.each([undefined, "", "  "])` block, "unset authoring mode (setting %s) resolves to project", has two tests:
  - the same refusal of an invalid candidate or a proposal;
  - a create that requests `authoringMode: "project"`, while an extend still sends `authoringMode: "candidate"`.
- `runtime/conversations/commands/tests/extension-chat.test.ts`: "in the default candidate authoring mode" is now "in the explicit candidate authoring mode" and stubs `"candidate"` instead of `""`. All three tests in the block are unchanged. The file's existing `vi.unstubAllEnvs` cleanup restores the environment.

The environment is restored by the existing `afterEach(vi.unstubAllEnvs)` in `build.test.ts` and `extension-chat.test.ts`, and by the `finally` block in `llm-generation.test.ts`.

## Commands run and observed results

- `npx vitest run` on the three test files (from `packages/fluxiq`): 3 files, 53 tests passed.
- `npx vitest run` on `model`, `runtime/conversations`, `api`, `runtime/tests/service-bootstrap`, `runtime/service/flow-bootstrap-commands` and `runtime/service/project-build`: 130 files, 830 tests passed.
- `npx tsc --noEmit -p tsconfig.json` (packages/fluxiq): no output, exit 0.
- `node scripts/structure-audit.mjs`: "structure-audit: passed (389 warning(s), 1156 baselined)". Two of the advisory file-lines warnings name files I edited: `llm-generation.test.ts` at 755 lines and `extension-chat.test.ts` at 547. Both were already over the threshold, and I did not change their line counts.

## Not verified

- No live run, as the brief says.
- Full package suites were not run.

## Open questions or contradictions found

None. No test exposed a production path that still assumes `candidate` when the setting is unset.
