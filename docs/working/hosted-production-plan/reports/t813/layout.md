# t813 layout (Core lane C1, layout v3)

## Outcome
Done.

## What changed and why
New `packages/fluxiq/src/framework/layout-v3/` (one export per file plus barrel `index.ts`):
`version.ts` (FLUXIQ_LAYOUT_V3_VERSION = 3), `paths-type.ts` (FluxIQLayoutV3Paths), `paths.ts` (fluxiqLayoutV3Paths), `workspace-root-dir.ts` (fluxiqWorkspaceRootDir, id grammar `^[a-z0-9][a-z0-9-]{0,62}$`, error `storage.workspace_id_invalid:`), `inspect.ts` (inspectFluxIQLayoutV3, also exports type FluxIQLayoutV3Inspection), `initialize.ts` (initializeFluxIQLayoutV3, error `storage.layout_v3_invalid:`), `remove-workspace-root.ts` (removeFluxIQWorkspaceRoot), `tests/layout-v3.test.ts` (9 tests).
Invalid = a storage root (via programStateRoot) at or above workspacesDir, or marker unreadable/non-JSON/wrong version. Init writes the marker with atomicWriteJson only when fresh. Removal validates the id, checks direct-child, returns false on ENOENT.
`docs/operations/data-and-state.md`: new "Layout v3 (multi-tenant `service`)" section.
Not touched: framework/index.ts (supervisor adds `export * from "./layout-v3/index.ts"`), storage-layout.ts, programs/_shared, platform, apps, contracts.

## Commands run and observed results
- `pnpm test src/framework/layout-v3` (packages/fluxiq): `Test Files 1 passed (1), Tests 9 passed (9)`; real-sql group found no files; "all groups passed".
- tsc under the shared lock: output `tsc-exit=0`, no errors anywhere.
- `pnpm structure:check` (repo root): `structure-audit: passed (469 warning(s), 1152 baselined)`; 0 lines mention layout-v3.

## Not verified
- Windows-only behaviour was exercised (this machine); POSIX path semantics not run.
- Symlinked workspace roots not tested (rm removes a link itself, not its target).

## Open questions or contradictions found
- A second background tsc waiter I started while the first appeared stuck on the lock may still be running or finish later; it writes only to a temp file and only rmdirs a lock it created.
- Uppercase ids are refused rather than lower-cased, per "compared lower-case, refuse uppercase".
