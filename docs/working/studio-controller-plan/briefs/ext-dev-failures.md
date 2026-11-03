# Brief: ext-dev-failures

Goal: find and fix why these extension-repository tests fail. All of them fail on plain `dev` at `d6e5448c` too, so this refactor did not cause them, and they block promotion to `main`.

Worktree: `C:/Users/osrs_/FluxStuff/fxwork/t845/!FluxIQWebExtension`, branch `task/t845-studio-controller`, with its Core beside it at `../!FluxIQ`.

Failing, run with `node scripts/test-extension.mjs runtime/ background/` from `apps/extension`:

| Test name | Observed |
| --- | --- |
| `on a single-frame page the merged snapshot builds a byte-identical recording event` | Recording event differs from the expected bytes; compare them field by field |
| `a builder's record is the code's row in the table, not the call site's opinion` | actual `no open tab matched`, expected `tab 11 active` |
| `a switch that matches no open tab is target_not_found, naming the tab it wanted` | actual `no open tab matched`, expected `tab 11 active` |
| `an action naming a frame the tab does not have fails as target_not_found, and is never sent` | Not read yet |
| `two child frames at the path, neither with the recorded id, fail as target_ambiguous and nothing is sent` | Not read yet |
| `no child frame at the path fails as target_not_found, naming paths and never a full URL, and nothing is sent` | Not read yet |
| `a child frame that cannot be given a content script fails as target_not_found, and the action is never sent` | Not read yet |
| `several child frames at the path and no tie-break is target_ambiguous, naming the count` | Not read yet |
| `no child frame at the path is target_not_found, naming paths and never a full URL` | Not read yet |

Plus, in `packages/test-runner`: `a chat build passes at whatever ceiling the Lab started its Core with` (`src/live-llm/tests/live-llm-run.test.ts`). Observed: "held to FluxIQ's per-build ceiling of $15, and --llm-max-cost-usd 5 cannot reach". `.env.local` in this checkout sets `FLUXIQ_LLM_RUN_COST_CEILING_USD`, so the test may be reading the machine's real configuration. A test must not depend on a developer's local env file; if that is the cause, isolate the test. Do not change `.env.local`.

Method:

- Trace each to its cause before changing anything. Several look like one cause. For each group decide from `git log` on `dev` and the code whether the test is right and the code regressed, or the code changed on purpose and the test is stale. Name the commit.
- If the test still states the intended behaviour, fix the code. These tests guard real behaviour, such as never sending an action to the wrong frame, so read them carefully before calling one stale. Never weaken an assertion to get a pass. If one is genuinely stale, update it and say why.
- Do not add any execution-admission, observation or completion-proof mechanism.

Owned paths: the test files above and the source they exercise under `apps/extension/src/{runtime,background,shared,content}/**` and `packages/test-runner/src/live-llm/**`.

Must not touch: Core (`../!FluxIQ`), `domain/**`, `apps/extension/src/panel/**`, `apps/scenario-lab/**` (the lead is working there), `scripts/**`, `.structure-baseline.json`, `.env.local`. No git mutations, no commits.

Never run full suites: the user caps them at twice a day. No paid model calls, no panel, no browser.

Context: `../!FluxIQ/docs/working/studio-controller-plan.md`, Current State only.

Acceptance checks, run and quote each:

1. From `apps/extension`: `node scripts/test-extension.mjs runtime/ background/` -> 0 failed.
2. From `packages/test-runner`: build as its `package.json` does, then the live-llm tests -> 0 failed.
3. `pnpm.cmd --filter @fluxiq-web-extension/extension check` -> exit 0.
4. `node scripts/structure-audit.mjs` -> no new findings from your files.

Report: `../!FluxIQ/docs/working/studio-controller-plan/reports/ext-dev-failures.md`, with one row per failure group: cause, commit that introduced it, fix, and whether code or test changed. End your final message with the return contract: Outcome, Changed, Validation, Not verified, Report, Notes.
