# Brief P9-N2: test fallout of the old-UI retirement

## Outcome
Done. All of `src/features/automation-studio` passes (191 files, 1228 tests).

## What changed and why
Four of the five failures were not about deleted code. They were `window` leaking between test files, which share one process under `singleFork`.
- **Cause.** `flow-editor/tests/palette-preferences-repository`, `hierarchy/tests/useHierarchyPersistence` and `instructions/tests/instructions-view` restored `window` with `Object.defineProperty(..., { configurable: true, value: original })`. When `window` did not exist, that created a read-only property. Every later file that assigned `globalThis.window` then threw `Cannot assign to read only property 'window'`. That broke `learning-summary` (at load), `flow-settings-call-count` and `max-nodes-setting`.
- **Fix.** Added `writable: true` to those `defineProperty` calls, so the restore leaves an ordinary property.
- **Second leak, exposed by the first fix.** `runtime/tests/learning-summary` and `run-control-interactions` set `window = globalThis` at module level and never restored it. Once `window` could be assigned, `cache/*`, `graph/*` and `project-phase4` tests saw a `window` without `dispatchEvent`. Both files now install their stand-ins in `beforeAll` and restore the previous descriptors (or delete) in `afterAll`.
- **`run-control-interactions`.** It no longer imports the deleted `WorkspaceHeader` (retirement brief N already removed that). Its remaining failure was the leak above.
- **Style test, `styles/tests/styles-architecture.test.ts`.**
  - Ownership rule: exactly two route manifests may import Studio view styles. They are `graph.css` (the graph editor) and `app/(panel)/runs/[runId]/run.css` (the run page, which reuses the run views).
  - Every other app stylesheet still must not import `automation-studio` styles, and `globals.css` must not mention them.
  - `run.css` must be import-only, import each file at most once, and import only files under the styles root that `graph.css` also imports. So it cannot introduce a style outside the Studio set.
  - Nothing was loosened: the stray-import check is intact and the run manifest is checked more tightly than before.

## Commands run and observed results
- `cd apps/web && npx vitest run --pool=forks --poolOptions.forks.singleFork src/features/automation-studio` -> `Test Files 191 passed (191)`, `Tests 1228 passed (1228)`.
- Web typecheck under the heavy lock (3479 MB free): `node --max-old-space-size=6144 node_modules/typescript/bin/tsc --noEmit` -> exit 0, no output. Lock released.
- `node scripts/structure-audit.mjs` -> `passed (522 warning(s), 969 baselined)`.

## Not verified
Other `apps/web` directories were not run, so other suites that rely on a leaked `window` would show only in a broader run.

## Open questions
None. Other test files assign `window` through `vi.stubGlobal` and clean up with `unstubAllGlobals`; I left them.
