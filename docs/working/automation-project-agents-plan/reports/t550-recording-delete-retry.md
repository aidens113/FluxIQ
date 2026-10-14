# t550-recording-delete-retry

## Outcome
Done.

## What changed and why
- New `packages/fluxiq/src/programs/automation-studio/runtime/service/recordings/directory-removal.ts`: `removePathWithRetry(target, options?)`. It wraps `rm(target, { recursive: true, force: true })` (recursion can be turned off) and retries on EPERM, EBUSY, EACCES and ENOTEMPTY with waits of 10, 25, 50, 100, 200 and 400 ms (six retries, about 0.8 s at most). It throws immediately on any other error, and once the retries run out it throws the last error unchanged, so a lasting failure is never swallowed. The `remove` and `wait` functions can be injected for tests. I found no existing Core removal helper. The only bounded-retry helpers are rename helpers (`_shared/storage.ts` `renameWithWindowsRetry` and the two `replaceFileWithRetry` copies), so I added this one focused helper in the recordings service area. It is exported from `recordings/index.ts`.
- `recordings/deletion.ts` (`deleteRecordings`): the three parallel removals of a recording's proposal root, `derived` directory and session directory now go through the helper. This is the path that failed in the sweep with `rmdir ...\recording.batch-b\derived`.
- `recordings/store.ts` (`deleteOrphanedPhysicalRecordingSessionDirectories`): the recursive removal of orphaned session directories now uses the helper. This is the same kind of removal, and it runs at the end of every delete.
- `service/object-documents.ts` (`deletePipelineArtifactDocuments`): the removals of each pipeline artifact path and proposal directory now use the helper. They run inside the same `deleteRecordings` pass.
- New test `recordings/tests/directory-removal.test.ts` (4 tests):
  - one transient EPERM, after which a real directory tree is removed (checked: ENOENT afterwards, one wait of 5 ms);
  - a lasting EPERM that is rethrown as the same error object after 1 + 3 attempts;
  - EINVAL, which is not retried;
  - a non-recursive call, whose options pass through unchanged.

## Commands run and observed results
- Contracts build: skipped, because `packages/contracts/dist` already existed.
- `pnpm.cmd exec vitest run src/programs/automation-studio/runtime/service/recordings src/programs/automation-studio/runtime/tests/service-recordings/tests/assets.test.ts` (in packages/fluxiq) -> `Test Files 8 passed (8)`, `Tests 95 passed (95)`. This run includes `assets.test.ts` and the new test.
- `pnpm.cmd exec vitest run src/programs/automation-studio/runtime/service/tests/object-documents.test.ts` -> `Tests 1 passed (1)`.
- `pnpm.cmd check` (packages/fluxiq, tsc --noEmit) -> exit 0.
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (349 warning(s), 1156 baselined)`. It also printed "1 baseline entries can be lowered". I did not run `pnpm structure:baseline`, and I did not check whether my change caused that entry.
- `git diff --check` -> exit 0. It printed only LF->CRLF working-copy warnings.

## Not verified
- I could not reproduce the original EPERM, because the sweep failure is intermittent. The fix is tested by injecting the error, not by reproducing the real race.
- I did not run the full Core suites (they are excluded by rule).

## Open questions or contradictions found
- `runtime/service.ts` `deleteRecording` (the single-recording delete, around lines 941 and 944) still calls `rm(recordingSessionDirectory, { recursive: true, force: true })` directly, with no retry. The brief puts that file off limits, so I did not edit it. Whoever owns `service.ts` should switch those two calls to `removePathWithRetry`, which is exported from `service/recordings/index.ts`.
- Other recursive `rm` calls that are not part of recording deletion were left unchanged: `flows/writer.ts`, `projects/files-removal.ts`, and the `object-documents.ts` `deleteProjectArtifactFile` legacy path.
