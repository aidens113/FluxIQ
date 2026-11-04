# Second attempt: task key, memory, route (t870)

## Outcome
Done. Provider-free: no model, Lab or browser. `AF/` = `packages/fluxiq/src/framework/automation-service/service/answer-first/`.

## Exported names (all re-exported from `AF/index.ts`)
- `task-key/`: `automationStudioAnswerFirstTaskKey(input: { instructionText: string; startLocation?: string | undefined }): string` returns `task.<40 hex>`.
- `task-memory/`:
  - `automationStudioAnswerFirstTaskMemoryOf(owner: object, ports: AutomationStudioAnswerFirstTaskMemoryPorts): AutomationStudioAnswerFirstTaskMemoryStore`. The ports are `{ paths: Pick<AutomationStudioProjectPaths, "root" | "projectFile">; projects: Pick<AutomationStudioProjectStore, "ensureProjectStructure"> }`.
  - `class AutomationStudioAnswerFirstTaskMemoryStore` with `get(projectId, taskId): Promise<TaskMemory | undefined>`, `update(projectId, taskId, change: (current: TaskMemory) => TaskMemory): Promise<TaskMemory>`, `attemptLocation(projectId, attemptId): Promise<{ taskId; flowId } | undefined>` and `provenance(projectId, attemptId): Promise<AttemptProvenance | undefined>`.
  - The design's types, as written there: `AutomationStudioAnswerFirstSavedFlow`, `...TaskNote`, `...StepOrigin`, `...AttemptProvenance`, `...TaskMemory`.
  - `automationStudioAnswerFirstBetterFlow(kept: SavedFlow | undefined, next: SavedFlow, how: { flowFailedLive: boolean; wholeRunYes: boolean }): SavedFlow | undefined`.
  - `automationStudioAnswerFirstStepsDigest(steps: readonly Pick<AutomationStudioFlowDraftStep, "position" | "actionId" | "input">[]): string` (sha256 hex).
  - `automationStudioAnswerFirstScreenedNote(note): { worked?; failed?; quirks? } | undefined`. It screens each field with `automationStudioFlowLessScreenedWords` and cuts it to 600 characters. It returns nothing if no field is left.
- `route/`:
  - `automationStudioAnswerFirstRoute({ memory, projectId, flowId, taskId, assemble, related? }): AutomationStudioAnswerFirstRoute`. `assemble(steps)` answers `{ ok: true } | { ok: false; codes }`.
  - The route is `build { notes, related? } | use { saved, notes } | repair { saved, notes, why }`.
  - `automationStudioAnswerFirstKnownFlow(owner, ports, { projectId, instructionText, startLocation? }): Promise<string | undefined>`.
- `completion/`: `notes?: { worked?, failed?, quirks? }` is on the schema. `AutomationStudioAnswerFirstCompletionState.notes` holds the screened notes.

## Decisions
- **Files.** Task files are `<project dir>/task-memory/<taskId>.json`. The attempt index is `<project dir>/task-memory/attempt-index.json`, kept to the last 2000 entries. With no data root it lives in memory.
- **Unreadable files.** A file that is unreadable or the wrong shape is moved aside as `.unreadable` on the next write, and `get` reads it as nothing. Only `ProgramStateReadError` counts as unreadable; any other error propagates (the structure audit's failure-as-empty rule).
- **Writes.** They are queued one at a time per task, and one at a time per project for the index.
- **Caps and screening.** Notes keep the last 10, attempts the last 100. Every write re-screens all notes. Screening is idempotent, and a note with nothing left is dropped.
- **`update`'s `change`.** It receives `{ taskId, flowId: "", notes: [], attempts: [] }` for a new task. The store forces `taskId`.
- **BetterFlow edge case.** If `next.steps` is empty it returns `kept`, which is not in the design's table. The design's first row said "anything with steps".
- **Route.**
  - A best Flow with no steps, or one with a damaged shape, routes to `build`.
  - A throw from `assemble` routes to `repair`.
  - `why` is plain words with no codes.
  - `repair` only looks at `best`, never `latest`.
- **KnownFlow.** It answers `memory.flowId`, falling back to `best` or `latest`, and only where a `best` or `latest` exists. A task with notes only answers none.
- **Completion check.** It reads `result.notes` only to fill `state.notes`. The judge's summary never sees them, and no verdict path changed. Nothing else in the repo read the schema as a closed list of two, and no existing test pinned it.

## Commands and observed results
- `pnpm.cmd exec vitest run <task-key> <task-memory> <route> <completion dirs> --minWorkers 1 --maxWorkers 2` printed `Test Files 5 passed (5)` and `Tests 38 passed (38)`.
- `pnpm.cmd --filter fluxiq check` from the worktree root printed errors only in other workers' files: `run-acts/settling.ts` (TS2322, 2 errors) and `tests/fake-library-engine.ts` (TS2554). None are in my files.
- `node scripts/structure-audit.mjs` first failed on my files: `as never` casts, failure-as-empty, packing and a swallowed failure. I fixed them. The last run showed 2 violations, both in another worker's `flow-run/` (`steps-ran.ts` imports, `dispatch-watch.ts` line 54 packing). Nothing in my paths.
- I re-ran the audit and the check after the audit fixes (the check printed only the other workers' errors above). I re-ran vitest after them as well. I did not run the audit again after the last test edit (the `assemble` throw stub in `route.test.ts`). The vitest run printed 38 passed after it.

## Not verified
- A clean full `fluxiq:check` (other workers' files fail).
- The wiring: nothing calls `route`, `BetterFlow` or the memory store yet. The attempt driver and `create-here` are other lanes.
- Real-key shapes beyond the one the screen caught in the test (a fake key built from parts).
- Behaviour on a SQLite-owned layout. I only tested the JSON-file layout.

## Open questions
None.

```text
Outcome: Done
Changed: AF/task-key/**, AF/task-memory/**, AF/route/**, AF/completion/{schema.ts,check.ts,tests/notes.test.ts}, AF/index.ts
Validation: `vitest run task-key task-memory route completion` -> 5 files, 38 tests passed; `structure-audit` -> only other workers' flow-run violations; `pnpm --filter fluxiq check` -> errors only in run-acts/settling.ts and tests/fake-library-engine.ts
Not verified: clean full check; wiring into the attempt driver; SQLite layout
Report: C:/Users/osrs_/FluxStuff/fxwork/t870/!FluxIQ/docs/working/answer-first-plan/reports/second-attempt/memory.md
Notes: the audit's failure-as-empty rule shaped the unreadable-file handling (only ProgramStateReadError is swallowed).
```
