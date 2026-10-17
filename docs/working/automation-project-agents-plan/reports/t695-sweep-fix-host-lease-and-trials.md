# t695 sweep fix: host lease and trials

Worker report for brief `t695-sweep-fix-host-lease-and-trials`, worktree
`C:/Users/osrs_/FluxStuff/fxwork/t695/!FluxIQ`, branch
`task/t695-sweep-fix-host-lease-and-trials` (from Core dev `0fcca029`).

## Outcome

Done. All 18 sweep failures are explained and fixed. There were three causes:

1. The 16 host-lease failures in 5 files were a test-resolution defect, not a
   source defect. `packages/fluxiq` vitest resolved `@fluxiq/contracts` through
   its package `exports` to the untracked, compiled `packages/contracts/dist`.
   Nothing in `vitest run` rebuilds that dist. Meanwhile `tsc` resolves the
   same specifier to `packages/contracts/src` through the `paths` in
   `tsconfig.base.json`. So `tsc` was clean while vitest read an old dist.
   Fixed structurally: vitest now maps `@fluxiq/contracts` to source the way
   `tsc` does, and a guard test was added.
2. `applied-judged-trial.test.ts:116` pinned the saved judged-trial shape from
   before t677. t677 deliberately added `firstAskConfirmed` to that record.
   The expectation is updated.
3. `provider-unavailable-authoring-modes.test.ts:178` pinned the chat cause
   from before t649. t649 deliberately appended the supervisor's screened
   reason (`endedBecause`). The expectation is updated.

## What changed and why

### Host lease (refusal, stamp, commands-host-lease, dispatch-host-lease, lease-scope)

Root cause: `packages/fluxiq/vitest.config.ts` had no alias for
`@fluxiq/contracts`, so the tests used whatever `packages/contracts/dist`
held. `packages/client-gateway-websocket/vitest.config.ts` already aliases it
to source. `apps/web/vitest.config.ts` refuses a stale dist for the same
reason (a 2026-10-02 incident).

Evidence:

- In the sweep checkout (`C:/Users/osrs_/FluxStuff/!FluxIQ`), only
  `packages/contracts/dist/client-gateway.*` carries a 23:06 mtime, three
  minutes after the sweep log was written at 23:03. The contracts
  `tsconfig.build.tsbuildinfo` dates from 2026-10-13 14:56. That is before
  `b673e70e` (2026-10-13 18:27, "feat(contracts): host lease on client gateway
  action commands") added `CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES` to
  `packages/contracts/src/client-gateway.ts`. So when the sweep ran, the dist
  lacked the export. Something rebuilt that one file afterwards; I did not
  find out what.
- In this worktree, with a fresh dist, all 5 host-lease files passed before
  any change.
- Reproduction: I deleted the constant from this worktree's
  `contracts/dist/client-gateway.js` (backed up first, restored afterwards and
  confirmed byte-identical with `cmp`). With a config without the alias,
  `src/client-gateway/service/host-lease` failed exactly as in the sweep:
  `Cannot read properties of undefined (reading 'holderMismatch')`, `'stale'`
  and `'missing'`, and `TypeError: Cannot convert undefined or null to object`
  from `Object.values(...)` in `refusal.test.ts`. With the new config and the
  same stale dist, all 4 files and 26 tests passed.

Introducing commits: there is no import cycle and no lost export. The
resolution gap goes back to `packages/fluxiq/vitest.config.ts` (last changed
in `bd61506c`). It was exposed by `b673e70e` plus `b340bccc` (2026-10-13,
"feat(client-gateway): stamp the host lease on every command, refuse stale or
missing"), the first fluxiq source to read a runtime value new to contracts.
Both are part of t536 (`40661662`). `git bisect` would not isolate it,
because the failure depends on the untracked dist state, not on a commit.

Changes:

- `packages/fluxiq/vitest.config.ts`: `resolve.alias` maps
  `@fluxiq/contracts` to `../contracts/src/index.ts` and
  `@fluxiq/contracts/<name>` to `../contracts/src/<name>.ts`, the same mapping
  as the `tsconfig.base.json` `paths`. A comment records why.
- `packages/fluxiq/vitest.quality.config.ts`: now uses `mergeConfig(base, ...)`
  over `vitest.config.ts`, so it gets the same alias. It also inherits the
  15-second hook and test timeouts.
- `packages/fluxiq/tests/vitest-config.test.ts` (new): a guard on the config.
  For every entry in the contracts `package.json` `exports`, it imports
  `@fluxiq/contracts<entry>` and the matching `src` file and asserts they are
  the same module: identical export keys, and every export is `toBe`-identical.
  Without the alias it fails even on a fresh dist (4 of 6 tests failed:
  `CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES`, `programScopeSchema` and
  `AUTOMATION_STUDIO_ADAPTIVE_FAILURE_CLASSES` were not identical). It sits in
  `packages/fluxiq/tests/` because its subject, the config, is at the package
  root.

### applied-judged-trial.test.ts:116

The record now includes `firstAskConfirmed: true`. The change came from t677
`00dabf99` ("The playback hold reads an exact first-ask yes flag", merged in
`cb3d4ca9`). That commit deliberately stores the flag on the saved Flow's
judged trial. Its follow-up `ab82689c` updated the project-build copy of this
exact-shape check but missed this one. The test's judge answers yes on both
checks in two calls, which t677 defines as a first-ask yes. So I added
`firstAskConfirmed: true` to the `toEqual`, with a one-line comment. No
assertion was weakened: the match is still exact.

### provider-unavailable-authoring-modes.test.ts:178

The chat cause is now `"the build failed: the supervisor ended it because it
could not finish the Flow: nothing on the page can do this"`. The change came
from t649 `b6383c4c` ("Project activity says what happened ... ending
reason", merged in `eca33297`). It made `progress.ts` `supervisorEndingWords`
append the diagnostic's `endedBecause`. This test was last edited in
`ffd6fba9`, an ancestor of `eca33297`, and t649 never updated it. The
scripted supervisor ends with `"Nothing on the page can do this."`. I updated
the expectation to the exact full sentence, with a comment naming t649.

## Commands run and observed results

All commands ran in the worktree. Output was stripped of ANSI codes.

- Baseline, before any change: `pnpm exec vitest run` on the 7 sweep files,
  from `packages/fluxiq`, gave `Test Files 2 failed | 6 passed (8)` and
  `Tests 2 failed | 48 passed (50)`. Only the two trial tests failed, with the
  same diffs as the sweep. All host-lease files passed.
- Guard test with the alias:
  `pnpm exec vitest run tests/vitest-config.test.ts` gave
  `Test Files 1 passed (1)`, `Tests 6 passed (6)`.
- Guard test without the alias (scratch config with only `root`):
  `pnpm exec vitest run --config <scratch>/t695-noalias.config.mts tests/vitest-config.test.ts`
  gave `Tests 4 failed | 2 passed (6)`.
- Stale-dist reproduction, without the alias:
  `vitest run --config <noalias> src/client-gateway/service/host-lease` failed
  with `Cannot read properties of undefined (reading 'holderMismatch'|'stale'|'missing')`
  and `TypeError: Cannot convert undefined or null to object`. With the alias:
  `vitest run src/client-gateway/service/host-lease tests/vitest-config.test.ts`
  gave `Test Files 4 passed (4)`, `Tests 26 passed (26)`. The dist was then
  restored and printed `restored` (`cmp` equal).
- Typecheck: `pnpm exec tsc --noEmit -p tsconfig.json` in `packages/fluxiq`
  exited 0 with no output.
- The failing files plus the guard: `pnpm exec vitest run` on the 7 sweep
  files and `tests/vitest-config.test.ts` gave `Test Files 9 passed (9)`,
  `Tests 56 passed (56)`.
- The directories:
  `pnpm exec vitest run src/client-gateway src/programs/automation-studio/runtime/project-agents src/programs/automation-studio/runtime/service/flow-bootstrap-commands src/programs/automation-studio/runtime/service/tests`
  exited 0 with `Test Files 113 passed (113)`,
  `Tests 755 passed | 1 skipped (756)`, `Duration 116.41s`.
- Quality config:
  `pnpm exec vitest run --config vitest.quality.config.ts` (without coverage)
  gave `Test Files 3 passed (3)`, `Tests 18 passed (18)`.
- Structure audit: `node scripts/structure-audit.mjs` from the Core root gave
  `structure-audit: passed (397 warning(s), 1155 baselined).` with exit 0.
  No warning names a file I changed.
- Biome: `pnpm exec biome check <changed files>` reported that the paths were
  ignored by `biome.json`, so it checked nothing.

## Not verified

- I did not run the whole Core suite, as the brief says.
- I did not run the quality config with `--coverage`.
- `packages/fluxiq/tests/vitest-config.test.ts` is outside the
  `packages/fluxiq/tsconfig.json` `include` (`src/**`), so `tsc` does not
  typecheck it. Vitest transpiles and runs it.
- I did not find out what rebuilt the sweep checkout's
  `contracts/dist/client-gateway.*` at 23:06. A rerun of the sweep there would
  now pass even without this fix.
- `apps/web` still imports Core through dist, deliberately, behind its
  stale-build refusal. I did not change it.

## Open questions or contradictions found

- The brief suggested the trial failures came from this session's merges
  t671 to t694. One did (t677). The other came from t649, merged earlier in
  `eca33297`, so that test may have been failing before this session's
  merges.
- The brief suggested an import cycle for the host-lease failures. There is
  none. The cause is that vitest resolved contracts from dist while `tsc`
  resolved it from source.
- Any other Core package whose vitest imports `@fluxiq/contracts` without an
  alias has the same exposure. I checked only `client-gateway-websocket`
  (aliased) and `apps/web` (refuses a stale dist). `packages/contracts`
  imports itself relatively.
