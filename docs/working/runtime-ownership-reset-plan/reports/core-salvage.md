# Core committed-refactor salvage audit

## Recommendation

Preserve the t843 committed checkpoint and salvage reviewed migration batches. Prefer current `dev` as the integration baseline, retaining t842, unless a reproduced regression warrants a narrower reversal. A reset to pre-t842 would put real engine/node migrations back into Studio; resetting to dev also loses additional completed t843 moves. Neither baseline is proven to pass a complete runtime here.

The t843 commits mix relocation, new authority/completion mechanisms, fixes and still-program-owned orchestration. They should not be accepted or reverted as one ownership migration. Preserve original bodies where possible and assess new behavior separately. No reset or implementation was performed.

## Baselines

- True pre-t842: `16b5043c5b986cb5a31b71bbabf4d4c11c289819` (`ff8eb0be8^1`).
- Local and origin dev: `ff8eb0be8e313c851e848635a7377bd90f079b41`, the t842 merge; second parent `7311cdac4`.
- Audited HEAD: `407112d9c`; latest source checkpoint `c0dee9bbe`. Post-dev source commits: `d0b831e0a`, `6a871e623`, `cafe96dde`, `9c9a0de8c`, `c0dee9bbe`.
- `git diff --shortstat 16b5043c5 dev`: 1,401 files, 40,061 insertions, 33,054 deletions. `git diff --shortstat dev HEAD`: 2,681 files, 70,981 insertions, 27,507 deletions. These include documentation/tests.
- Dirty tree observed. All code comparisons used committed blobs; uncommitted SQL/schema, clock, descriptor and log WIP is excluded.

## Retain / restore / review

Paths are relative to `packages/fluxiq/src/`. Confidence applies to inspected samples, not every sibling.

| Decision | Paths / baseline | Evidence and confidence |
| --- | --- | --- |
| Retain t842 ownership | Pre-t842 `programs/automation-studio/runtime/executor/retry-policy.ts` -> dev `engine/automation/retry-policy.ts`; pre-t842 `programs/automation-studio/nodes/timing/wait.ts` -> dev `components/automation/timing/wait.ts` | Complete non-import declarations print identically after TypeScript comment/format normalization. Old executor index delegates to engine. High for samples; moderate for families. |
| Retain t843 environment/run control | Dev `programs/automation-studio/runtime/environment/virtual-clock.ts` and `.../run-control/run-controller.ts` -> HEAD `runtime/environment/virtual-clock.ts` and `runtime/run-control/run-controller.ts`; introduced `6a871e623` | Both byte-identical, 86 and 207 lines. Old run-controller is an alias. High. |
| Retain draft mechanism migration | Dev `programs/automation-studio/runtime/flow-draft/amendment/apply.ts` -> HEAD `runtime/flow-authoring/draft/amendment/apply.ts`; `6a871e623` | Non-import declaration AST identical despite 334 -> 209 lines. Old path is a re-export. High for this sample. |
| Retain context-packing cut | `d0b831e0a`: `runtime/models/context/**`; old `programs/automation-studio/runtime/reusable-llm-context.ts` | Packing function identical after explicit function/type renames. Smaller candidate contract replaces storage-record dependency; old entry aliases new owner. Filtering, digest deduplication, recency ordering and token accounting inspected. High. |
| Retain log relocation; review completion integration | `9c9a0de8c`: `framework/observability/exchange-log/**`; dev `programs/automation-studio/runtime/llm/step-log/field-names.ts` | Field-names file byte-identical, 42 lines. Framework owns naming/text/folder/listing/writing. Native invocation/completion wrappers add behavior. Moderate; representative original only. |
| Retain persistence destination; review behavioral delta | `cafe96dde`/`c0dee9bbe`: `framework/persistence/{sqlite,state}/**`; originals `programs/database-manager/storage/sqlite-repository.ts`, `programs/_shared/storage.ts` | Originals now aliases, so owner really moved. HEAD SQLite adds `#native`, `executionPorts`, prototype/method/driver checks and observed calls. `ProgramJsonStore.recoverMalformedState` changes rollback control flow. These are not pure moves. High for observed deltas. |
| Review admission/observation separately | `runtime/execution-admission/**`, `runtime/execution-observation/**`, `engine/automation/execution-admission/**` vs dev | 146 added files / 5,183 lines. New WeakMap capabilities, scope/source/reservation/evidence lifecycles, callback identity/contracts and settlement. Options-copy helper now must carry private companions that spreads lose. New behavior and integration obligations; no correctness verdict. High. |
| Review coupling absorbed by moved owners | `runtime/flow-authoring/project/record/store.ts`, `framework/persistence/sqlite/execution/**` | Project reads capture completion frames and invoke document callbacks with child invocations. SQLite native/operation owners register managed callback completion policies. Relocation value and added requirements must be evaluated independently. High for inspected paths. |
| Restore behavior selectively if required | Dev originals for above modified persistence/project/admission integrations | Restore an original body while preserving framework placement/aliases, adjusting paired consumers. Restoring whole `programs/**` reverses ownership. Proposed tactic only; no claim it fixes the composed-test stall. |
| Complete remaining migrations | Studio `runtime/service/project-build/{run,whole-trials}.ts`, `runtime/candidate-trials/authority/source.ts`, `runtime/service/command-run/controller.ts`, `storage/project/database.ts` | Substantive build/trial orchestration, trial authority, effect/admission handling and SQL pooling remain under the program. New `runtime/flow-authoring/execution/index.ts` exports observation/write completion, not the full build orchestrator. UI-only end state remains unfinished. High. |

## Boundary evidence

Package export keys grow 40 pre-t842 -> 49 dev -> 87 HEAD. Public runtime/framework/authoring subpaths create consumer obligations; legacy Studio paths remain. Reverting implementation without accounting for consumers is unsafe.

`git grep -n -E '(from|import).*programs/' HEAD --` selected engine, executable-flow, authoring, persistence and observability roots found no direct textual program imports. Search for Studio package imports found executable-DSL compatibility strings/tests only. This supports the direction of sampled migrations, not full resolved/transitive independence.

`git diff dev HEAD -- scripts/structure-audit/config.mjs` adds authoring/persistence/observability program boundaries, expanded transitive closure/browser entries and private-options-copy enforcement. Retain these guards, but they do not ban remaining Studio backend implementations. `scripts/declarations/public-import-resolver.mjs` adds symbol-identity-based inferred declaration rewriting; review/test separately from moves.

For scale only, non-test TS files under Studio grow 2,680 dev -> 2,909 HEAD while runtime grows 215 -> 962. Wrappers inflate counts; these are not architectural quality scores.

## Validation / limits

Observed read-only commands: `git status --short`; `git rev-parse HEAD dev origin/dev ff8eb0be8^1 ff8eb0be8^2`; `git log --oneline dev..HEAD`; exact shortstat commands above; targeted `git diff <rev>:<old-path> <rev>:<new-path>`; `git show HEAD:<path>` for wrappers, lifecycle/callback, record, database and orchestrators; targeted `git grep` above. They establish history, representative real moves and behavior deltas.

Node probes loaded TypeScript, parsed committed blobs and compared declarations with `createPrinter({removeComments:true})`, excluding imports/re-exports. Packing normalized only named function/types. Byte comparisons needed no normalization. Several guessed historical paths were absent and excluded. An initial named Wait-node selection found no declaration; the reported Wait result uses a later complete non-import source comparison.

No tests, builds, checks, providers or browser runs executed, per brief. No source/git mutation. No prior report pass claim used as acceptance evidence. Finite representative audit, not semantic equivalence proof of all changed files or complete runtime qualification. Known composed-test stall has no root-cause attribution here.

Outcome: Done
Changed: docs/working/runtime-ownership-reset-plan/reports/core-salvage.md
Validation: `git show` / `git diff` committed-blob comparisons and TypeScript declaration probes -> representative migrations confirmed; baseline hashes and behavior additions recorded.
Not verified: Tests/builds/live runtime; exhaustive equivalence; uncommitted WIP; composed-test stall cause.
Report: docs/working/runtime-ownership-reset-plan/reports/core-salvage.md
Notes: Preserve t842 and selectively retain t843 migrations. Review admission/completion additions separately. No source or git state changed.
