# t809 w5: mixed custom resources and generated catalog

## Outcome
Partial. The declarations are fixed and the catalog regenerated, but the regeneration cannot carry the
change: the generator does not read `resource.types` at all.

## What changed and why
- `recordings.ts` (`projectOrWorkspaceResource`, also used by `workspace.ts`), `caches.ts`
  (listProjectUiCacheStats) and `conversations.ts` (listConversations) now declare `["project"]`.
  There are three mixed resources, not two (B3 listed two shapes, `["*","project"]` and `["project","*"]`).
- Runtime behaviour is unchanged. `types` is catalog metadata only: nothing under `programs/` reads
  `resource.types`. `of` still returns `{ kind: "workspace" }` when no project is named, and the workspace ref is
  evaluated as before. Only the declaration of a call's resource types changed.
- Regenerated with the owning path: `FLUXIQ_REGENERATE_IAM_CATALOG=1 pnpm exec vitest run
  src/platform/iam/catalog` (live-registry.test.ts writes actions.generated.ts and the two fluxiq generated files).

## Finding for the lead
`generateIamActionCatalog` hard-codes `resourceTypes: isOps ? ["program"] : ["*"]` and
`IamEndpointRegistration` has no `resource` field. So the regenerated `actions.generated.ts` has no resource-type
change from my edits. The only diff (3 lines) is the other worker's classification flip:
`ops:Rollback`, `ops:RunMigration`, `ops:Sync` went `destructive:false` -> `true`. Feeding declared
`resource.types` into the catalog needs a generator change (endpoint-registration.ts and
generate-iam-action-catalog.ts, outside my ownership, and it changes every non-ops action's resourceTypes, so it
needs the lead's decision). Union of types across merged sources would be needed for shared actions. I did not do it.
`packages/contracts/dist` is not tracked and not touched.

## Commands run and observed results
- Regeneration (under lock): live-registry tests passed, files rewritten.
- `pnpm exec vitest run src/programs/automation-studio/api src/platform/iam` (packages/fluxiq): Test Files 58 passed (58), Tests 436 passed (436).
- `pnpm test` (packages/contracts): Test Files 37 passed (37), Tests 522 passed (522).
- `pnpm exec tsc --noEmit -p .` (packages/fluxiq): first run died with a V8 out-of-memory crash; rerun with
  `NODE_OPTIONS=--max-old-space-size=6144` exit 0, no output.

## Not verified
- The final re-run after the other worker finishes: the diff reflects deployment-sync/database-manager as of 19:3x;
  re-run the regenerate command once more at the end.
- apps/web and other packages' tsc.

## Open questions
- Should the generator consume `resource.types`? If yes, assign it as its own brief.

Outcome: Partial
Changed: packages/fluxiq/src/programs/automation-studio/api/handlers/{recordings,caches,conversations}.ts; packages/contracts/src/iam/actions.generated.ts; packages/fluxiq/src/platform/iam/catalog/generated/{destructive,read-only}-actions.generated.ts
Validation: `vitest run src/programs/automation-studio/api src/platform/iam` -> 58 files, 436 tests passed; contracts `pnpm test` -> 522 passed; tsc exit 0
Not verified: final regeneration after the other worker's edits land
Report: docs/working/hosted-production-plan/reports/t809/w5-resources-generated.md
Notes: generator ignores resource.types, so no resourceTypes change appears
