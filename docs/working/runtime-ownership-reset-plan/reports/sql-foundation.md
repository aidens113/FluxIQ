# SQL foundation completion

Status: Implementation complete; SQL source frozen for Root verification. Focused SQL and cleanup acceptance passed. Package/public/type gates remain for the lead on the shared frozen tree.

## Consumer manifest recorded before edits

Only the module specifier of each listed static import/export is authorized for replacement. Program implementation bodies and unrelated imports remain untouched.

- `packages/fluxiq/src/programs/automation-studio/storage/canonical-authority/project-coordinator.ts:2`: `../project/database-owner/index.ts` -> `../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/canonical-authority/whole-operation.ts:6`: `../project/database-owner/index.ts` -> `../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/canonical-authority/whole-sql.ts:2`: `../project/database-owner/index.ts` -> `../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/catalog.ts:5`: `./schema-migrations.ts` -> `../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/index.ts:11`: `./schema-migrations.ts` -> `../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/accepted-state/migration.ts:1`: `../../schema-migrations.ts` -> `../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/accepted-state/store.ts:3`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/accepted-state/store.ts:4`: `../unit-of-work.ts` -> `../../../../../framework/persistence/project/mutations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/accepted-state/store.ts:5`: `../../schema-migrations.ts` -> `../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/accepted-state/tests/store.test.ts:7`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts:11`: `./database.ts` -> `../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts:13`: `../schema-migrations.ts` -> `../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts:5`: `./database.ts` -> `../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts:6`: `./database.ts` -> `../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts:8`: `../schema-migrations.ts` -> `../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/contracts.ts:1`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/migration.ts:1`: `../../schema-migrations.ts` -> `../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/records.ts:1`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/store.ts:1`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/store.ts:2`: `../unit-of-work.ts` -> `../../../../../framework/persistence/project/mutations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/store.ts:4`: `../../schema-migrations.ts` -> `../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/tests/process.test.ts:7`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/tests/records.test.ts:6`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/tests/store.test.ts:6`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/candidate-verification/migration.ts:1`: `../../schema-migrations.ts` -> `../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/candidate-verification/store.ts:3`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/candidate-verification/store.ts:4`: `../../schema-migrations.ts` -> `../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/candidate-verification/tests/store.test.ts:8`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/command-ledger/migration.ts:1`: `../../schema-migrations.ts` -> `../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/command-ledger/store.ts:3`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/command-ledger/store.ts:4`: `../unit-of-work.ts` -> `../../../../../framework/persistence/project/mutations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/command-ledger/store.ts:5`: `../../schema-migrations.ts` -> `../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/command-ledger/store.ts:11`: `../unit-of-work.ts` -> `../../../../../framework/persistence/project/mutations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/command-ledger/tests/run-fence.test.ts:7`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/command-ledger/tests/store.test.ts:8`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/compiled-plan-store.ts:14`: `./database.ts` -> `../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/compiled-plan-store.ts:16`: `../schema-migrations.ts` -> `../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-address/keyring-input.ts:2`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-address/migration.ts:28`: `../../schema-migrations.ts` -> `../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-address/new-key-row.ts:7`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-address/open-keyring.ts:11`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-address/pending-removal-path-migration.ts:12`: `../../schema-migrations.ts` -> `../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-address/scrub-database.ts:10`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-address/scrub-request.ts:11`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-address/tests/durable-removal.test.ts:15`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-address/tests/durable-removal.test.ts:16`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-address/tests/keyring-fixture.ts:10`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-address/tests/keyring-fixture.ts:11`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-address/tests/keyring-fixture.ts:12`: `../../../schema-migrations.ts` -> `../../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-address/tests/object-address-fixture.ts:9`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-address/tests/object-address-fixture.ts:10`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-reseal/address-key-pass.ts:7`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-reseal/chunk-pass.ts:8`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-reseal/context.ts:7`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-reseal/manifest-pass.ts:6`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-reseal/reseal.ts:28`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-reseal/row-pass.ts:15`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-reseal/tests/reseal-fixture.ts:13`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-reseal/tests/reseal-fixture.ts:14`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-reseal/tests/reseal-interruption.test.ts:15`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-reseal/tests/reseal.test.ts:16`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-reseal/trace-tables.ts:5`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-store.ts:4`: `./database.ts` -> `../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/database-owner/index.ts:2`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/database-owner/index.ts:3`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/event-chunk-store.ts:2`: `./database.ts` -> `../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/event-stream-writer.ts:4`: `./database.ts` -> `../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/admission.ts:4`: `../unit-of-work.ts` -> `../../../../../framework/persistence/project/mutations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/command-link.ts:3`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/command-link.ts:4`: `../unit-of-work.ts` -> `../../../../../framework/persistence/project/mutations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/command-proof.ts:1`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/command-proof.ts:2`: `../unit-of-work.ts` -> `../../../../../framework/persistence/project/mutations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/commands.ts:3`: `../unit-of-work.ts` -> `../../../../../framework/persistence/project/mutations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/commands.ts:12`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/context.ts:1`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/context.ts:2`: `../unit-of-work.ts` -> `../../../../../framework/persistence/project/mutations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/evidence.ts:4`: `../unit-of-work.ts` -> `../../../../../framework/persistence/project/mutations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/inventory.ts:1`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/inventory.ts:2`: `../unit-of-work.ts` -> `../../../../../framework/persistence/project/mutations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/migration.ts:1`: `../../schema-migrations.ts` -> `../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/mutation.ts:1`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/mutation.ts:2`: `../unit-of-work.ts` -> `../../../../../framework/persistence/project/mutations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/proof.ts:1`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/proof.ts:2`: `../unit-of-work.ts` -> `../../../../../framework/persistence/project/mutations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/scope.ts:3`: `../unit-of-work.ts` -> `../../../../../framework/persistence/project/mutations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/state.ts:2`: `../unit-of-work.ts` -> `../../../../../framework/persistence/project/mutations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/store.ts:3`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/store.ts:5`: `../unit-of-work.ts` -> `../../../../../framework/persistence/project/mutations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/store.ts:6`: `../../schema-migrations.ts` -> `../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/tests/fixture.ts:4`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/tests/store.test.ts:3`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/write.ts:1`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-mutations.ts:3`: `./database.ts` -> `../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-mutations.ts:4`: `./unit-of-work.ts` -> `../../../../framework/persistence/project/mutations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts:4`: `./database.ts` -> `../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts:5`: `../schema-migrations.ts` -> `../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace/manifest-row.ts:15`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace/measure-rows.ts:3`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace/store.ts:47`: `../../schema-migrations.ts` -> `../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace/store.ts:52`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace/tests/keyed-trace-support.ts:14`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace/tests/sqlite-trace-fixture.ts:10`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace/tests/store-legacy-rows.test.ts:13`: `../../../schema-migrations.ts` -> `../../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace/tests/store-legacy-rows.test.ts:16`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-chunk-rows/delete-chunk-uses.ts:5`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-chunk-rows/protect-chunks.ts:11`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-chunk-rows/read-bodies.ts:8`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-chunk-rows/sweep-unused-chunks.ts:8`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-chunk-rows/write-chunks.ts:10`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-rekey/artifacts.ts:21`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-rekey/chunk-cleanup.ts:12`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-rekey/context.ts:10`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-rekey/events.ts:20`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-rekey/manifests.ts:13`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-rekey/rekey.ts:23`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-rekey/tests/migrated-project.ts:14`: `../../../schema-migrations.ts` -> `../../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-rekey/tests/migrated-project.ts:18`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-schema/chunk-migration.ts:19`: `../../schema-migrations.ts` -> `../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-schema/chunk-protection-migration.ts:14`: `../../schema-migrations.ts` -> `../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-schema/keyed-address-migration.ts:14`: `../../schema-migrations.ts` -> `../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-schema/migration.ts:7`: `../../schema-migrations.ts` -> `../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/graph-judgement-store.ts:9`: `./database.ts` -> `../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/graph-judgement-store.ts:10`: `../schema-migrations.ts` -> `../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts:6`: `./database.ts` -> `../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts:7`: `./unit-of-work.ts` -> `../../../../framework/persistence/project/mutations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts:8`: `../schema-migrations.ts` -> `../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/feed.ts:3`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/feed.ts:6`: `../../schema-migrations.ts` -> `../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/mutations.ts:2`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/mutations.ts:3`: `../unit-of-work.ts` -> `../../../../../framework/persistence/project/mutations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/repository.ts:4`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/repository.ts:5`: `../../schema-migrations.ts` -> `../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/tests/feed.test.ts:6`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/tests/mutations.test.ts:6`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/tests/repository.test.ts:6`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/index.ts:1`: `./database.ts` -> `../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/index.ts:2`: `./store-unavailable-error.ts` -> `../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/index.ts:22`: `./unit-of-work.ts` -> `../../../../framework/persistence/project/mutations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:9`: `./database.ts` -> `../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:11`: `../schema-migrations.ts` -> `../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/object-index-migration.ts:4`: `./database.ts` -> `../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/object-repository.ts:1`: `./database.ts` -> `../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/object-repository.ts:4`: `../schema-migrations.ts` -> `../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/recording-stream/projection.ts:1`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/recording-stream/reconciliation.ts:3`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/recording-stream/store.ts:3`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/recording-stream/summary.ts:2`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/recording-stream/tests/concurrency.test.ts:8`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/recording-stream/tests/incarnations.test.ts:8`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/recording-stream/tests/reconciliation.test.ts:8`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/recording-stream/tests/store.test.ts:8`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/retention-store.ts:4`: `./database.ts` -> `../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/reusable-llm-context-digest/rekey.ts:14`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/reusable-llm-context-store.ts:13`: `./database.ts` -> `../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/reusable-llm-context-store.ts:19`: `./schema/index.ts` -> `../../../../framework/persistence/project/schema/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/reusable-llm-context-store.ts:20`: `../schema-migrations.ts` -> `../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/run-dataset-store.ts:25`: `./database.ts` -> `../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/run-dataset-store.ts:27`: `../schema-migrations.ts` -> `../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/runtime-stream-store.ts:18`: `./database.ts` -> `../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/adaptation-matching.test.ts:7`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/adaptation-matching.test.ts:8`: `../index.ts` -> `../../../../../../framework/persistence/project/schema/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/adaptation-matching.test.ts:9`: `../../../schema-migrations.ts` -> `../../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/conversation-turn-decision.test.ts:7`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/conversation-turn-decision.test.ts:8`: `../index.ts` -> `../../../../../../framework/persistence/project/schema/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/conversation-turn-decision.test.ts:9`: `../../../schema-migrations.ts` -> `../../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/flow-scoped-keys.test.ts:7`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/flow-scoped-keys.test.ts:8`: `../index.ts` -> `../../../../../../framework/persistence/project/schema/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/flow-scoped-keys.test.ts:9`: `../../../schema-migrations.ts` -> `../../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/instruction-node-scope.test.ts:7`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/instruction-node-scope.test.ts:8`: `../index.ts` -> `../../../../../../framework/persistence/project/schema/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/instruction-node-scope.test.ts:9`: `../../../schema-migrations.ts` -> `../../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/recording-description.test.ts:7`: `../../../schema-migrations.ts` -> `../../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/recording-stream.test.ts:6`: `../../../schema-migrations.ts` -> `../../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/recording-stream.test.ts:8`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/recording-stream.test.ts:9`: `../index.ts` -> `../../../../../../framework/persistence/project/schema/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/runtime-run-interrupted-status.test.ts:7`: `../../database.ts` -> `../../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/runtime-run-interrupted-status.test.ts:8`: `../index.ts` -> `../../../../../../framework/persistence/project/schema/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/runtime-run-interrupted-status.test.ts:9`: `../../../schema-migrations.ts` -> `../../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/schema.ts:1`: `./schema/index.ts` -> `../../../../framework/persistence/project/schema/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/adaptation-store.test.ts:11`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/administration.test.ts:7`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/administration.test.ts:8`: `../schema/index.ts` -> `../../../../../framework/persistence/project/schema/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/administration.test.ts:9`: `../../schema-migrations.ts` -> `../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/compiled-plan-store.test.ts:7`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/content-store.test.ts:8`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/database.test.ts:6`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/durability.test.ts:6`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/event-chunk-store.test.ts:7`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/event-stream-writer.test.ts:7`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/flow-resource-repository.test.ts:6`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/graph-judgement-store.test.ts:6`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/graph-store.test.ts:7`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/migration-cutover.test.ts:6`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/object-index-migration.test.ts:6`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/object-repository.test.ts:6`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/object-stream-edge-cases.test.ts:8`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/result-check-state.test.ts:8`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/retention-store.test.ts:8`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/reusable-llm-context-store.test.ts:7`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/run-dataset-store.test.ts:8`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/run-dataset-store.test.ts:11`: `../../schema-migrations.ts` -> `../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/runtime-stream-store-update.test.ts:13`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/runtime-stream-store.test.ts:11`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/schema.test.ts:7`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/schema.test.ts:10`: `../../schema-migrations.ts` -> `../../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/ui-cache-store.test.ts:6`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/unit-of-work.test.ts:6`: `../database.ts` -> `../../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/unit-of-work.test.ts:7`: `../unit-of-work.ts` -> `../../../../../framework/persistence/project/mutations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/ui-cache-store.ts:4`: `./database.ts` -> `../../../../framework/persistence/project/sql/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/tests/schema-migrations-ready-memo.test.ts:7`: `../schema-migrations.ts` -> `../../../../framework/persistence/project/migrations/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/tests/schema-migrations.test.ts:7`: `../schema-migrations.ts` -> `../../../../framework/persistence/project/migrations/index.ts`

Total: 211 module specifiers in 149 files.

## Validation

Not run yet.

## Cleanup defect reproduction (before correction)

- `pnpm --filter fluxiq exec vitest run src/framework/persistence/project/sql/tests/database-cleanup.test.ts` did not start: PowerShell policy blocks pnpm.ps1. Subsequent commands use pnpm.cmd.
- `pnpm.cmd --filter fluxiq exec vitest run src/framework/persistence/project/sql/tests/database-cleanup.test.ts` -> 6 tests, 3 passed / 3 failed. Failed cases reproduced discarded close acknowledgement and rollback acknowledgement errors (operation and commit primary paths). Success cases proved direct primary-error identity and direct close-error identity already work.
- Accepted correction from Root: retain direct primary throw when cleanup succeeds; otherwise throw AggregateError with errors [primary, cleanup] and cause=primary. Both error objects remain original references. This follows framework/persistence/sqlite's existing error pattern.

## Separate cleanup behavior paths

- framework/persistence/project/sql/database.ts only: failed open setup plus failed close, and failed transaction callback/commit plus failed rollback, now expose both errors. Successful setup, transactions, close, pooling, cache, SQL and migration statements are unchanged.
- framework/persistence/project/sql/tests/database-cleanup.test.ts: actual temporary SQLite handles and writes, real rollback/close followed by injected acknowledgement failures; marker real-sql; no user data.

## Supplemental manifest recorded before edits

Moved SQL-only facade bindings, inline import types, and the SQL process-probe import are included; remaining administration bindings keep their existing owner.

- `packages/fluxiq/src/programs/automation-studio/storage/canonical-authority/tests/project-coordinator.test.ts:5` (moved facade bindings):

  `import { AutomationStudioProjectDatabasePool as Pool } from "../../project/index.ts";` -> `import { AutomationStudioProjectDatabasePool as Pool } from "../../../../../framework/persistence/project/sql/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/catalog.ts:4` (moved facade bindings):

  `import { AutomationStudioProjectDatabase } from "./project/index.ts";` -> `import { AutomationStudioProjectDatabase } from "../../../framework/persistence/project/sql/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/accepted-state/store.ts:2` (moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../administration.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../../framework/persistence/project/migrations/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts:8` (moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "./administration.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../framework/persistence/project/migrations/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/store.ts:3` (moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../administration.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../../framework/persistence/project/migrations/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/tests/process-probe.mjs:8` (emitted public persistence seam):

  `await import(pathToFileURL(path.join(coreRoot, "packages/fluxiq/dist/programs/automation-studio/storage/project/database.js")).href)` -> `await import("fluxiq/framework/persistence")`

- `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/tests/records.test.ts:10` (inline import type/dynamic import):

  `"../../database.ts"` -> `"../../../../../../framework/persistence/project/sql/index.ts"`

- `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/tests/store.test.ts:80` (inline import type/dynamic import):

  `"../../unit-of-work.ts"` -> `"../../../../../../framework/persistence/project/mutations/index.ts"`

- `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/tests/store.test.ts:93` (inline import type/dynamic import):

  `"../../unit-of-work.ts"` -> `"../../../../../../framework/persistence/project/mutations/index.ts"`

- `packages/fluxiq/src/programs/automation-studio/storage/project/candidate-verification/store.ts:2` (moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../administration.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../../framework/persistence/project/migrations/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/command-ledger/store.ts:2` (moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../administration.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../../framework/persistence/project/migrations/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/compiled-plan-store.ts:13` (moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "./administration.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../framework/persistence/project/migrations/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/content-address/tests/keyring-fixture.ts:7` (moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../administration.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../../../framework/persistence/project/migrations/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/store.ts:4` (moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../administration.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../../framework/persistence/project/migrations/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts:3` (moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "./administration.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../framework/persistence/project/migrations/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace/store.ts:48` (moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../administration.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../../framework/persistence/project/migrations/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace/tests/store-legacy-rows.test.ts:14` (moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../administration.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../../../framework/persistence/project/migrations/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace/tests/store-persistence.test.ts:9` (moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../administration.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../../../framework/persistence/project/migrations/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-rekey/tests/migrated-project.ts:15` (moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../administration.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../../../framework/persistence/project/migrations/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/graph-judgement-store.ts:8` (moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "./administration.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../framework/persistence/project/migrations/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts:4` (moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "./administration.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../framework/persistence/project/migrations/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/feed.ts:1` (moved facade bindings):

  `import type { AutomationStudioChangeFeedOperation } from "../administration.ts";` -> `import type { AutomationStudioChangeFeedOperation } from "../../../../../framework/persistence/project/mutations/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/feed.ts:2` (moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../administration.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../../framework/persistence/project/migrations/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/repository.ts:3` (moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../administration.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../../framework/persistence/project/migrations/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/index.ts:4` (split moved facade bindings):

  `export { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS, AutomationStudioProjectAdministration, AutomationStudioProjectMetaRepository, AutomationStudioChangeFeedRepository, AutomationStudioStorageOutboxRepository, AutomationStudioMigrationJobRepository, AutomationStudioBackgroundJobRepository } from "./administration.ts";` -> `export { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../framework/persistence/project/migrations/index.ts"; export { AutomationStudioProjectAdministration, AutomationStudioProjectMetaRepository, AutomationStudioChangeFeedRepository, AutomationStudioStorageOutboxRepository, AutomationStudioMigrationJobRepository, AutomationStudioBackgroundJobRepository } from "./administration.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:6` (moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "./administration.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../framework/persistence/project/migrations/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/object-repository.ts:2` (moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "./administration.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../framework/persistence/project/migrations/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/reusable-llm-context-store.ts:10` (moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "./administration.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../framework/persistence/project/migrations/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/run-dataset-store.ts:24` (moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "./administration.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../framework/persistence/project/migrations/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/adaptation-matching.test.ts:6` (moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../administration.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../../../framework/persistence/project/migrations/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/conversation-turn-decision.test.ts:6` (moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../administration.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../../../framework/persistence/project/migrations/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/flow-scoped-keys.test.ts:6` (moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../administration.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../../../framework/persistence/project/migrations/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/instruction-node-scope.test.ts:6` (moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../administration.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../../../framework/persistence/project/migrations/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/recording-description.test.ts:6` (split moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS, AutomationStudioProjectDatabasePool } from "../../index.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../../../framework/persistence/project/migrations/index.ts"; import { AutomationStudioProjectDatabasePool } from "../../../../../../framework/persistence/project/sql/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/recording-stream.test.ts:7` (moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../administration.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../../../framework/persistence/project/migrations/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/runtime-run-interrupted-status.test.ts:6` (moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../administration.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../../../framework/persistence/project/migrations/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/administration.test.ts:6` (split moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS, AutomationStudioProjectAdministration } from "../administration.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../../framework/persistence/project/migrations/index.ts"; import { AutomationStudioProjectAdministration } from "../administration.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/run-dataset-store.test.ts:7` (split moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS, AutomationStudioProjectAdministration } from "../administration.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../../framework/persistence/project/migrations/index.ts"; import { AutomationStudioProjectAdministration } from "../administration.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/schema.test.ts:6` (split moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS, AutomationStudioProjectAdministration } from "../administration.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../../../../framework/persistence/project/migrations/index.ts"; import { AutomationStudioProjectAdministration } from "../administration.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/schema.test.ts:9` (moved facade bindings):

  `import { AUTOMATION_STUDIO_PROJECT_DOMAIN_TABLES, AUTOMATION_STUDIO_PROJECT_INTERVENTION_MODE_MIGRATION, AUTOMATION_STUDIO_PROJECT_RUNTIME_SUMMARY_ENVELOPE_MIGRATION, AUTOMATION_STUDIO_PROJECT_SEARCH_TABLES } from "../schema.ts";` -> `import { AUTOMATION_STUDIO_PROJECT_DOMAIN_TABLES, AUTOMATION_STUDIO_PROJECT_INTERVENTION_MODE_MIGRATION, AUTOMATION_STUDIO_PROJECT_RUNTIME_SUMMARY_ENVELOPE_MIGRATION, AUTOMATION_STUDIO_PROJECT_SEARCH_TABLES } from "../../../../../framework/persistence/project/schema/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/unit-of-work.test.ts:27` (inline import type/dynamic import):

  `"../database.ts"` -> `"../../../../../framework/persistence/project/sql/index.ts"`

- `packages/fluxiq/src/programs/automation-studio/storage/query-plan.ts:1` (moved facade bindings):

  `import type { AutomationStudioSqlExecutor } from "./project/index.ts";` -> `import type { AutomationStudioSqlExecutor } from "../../../framework/persistence/project/sql/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/tests/project-hierarchy-scale.test.ts:6` (split moved facade bindings):

  `import { AutomationStudioProjectDatabasePool, AutomationStudioProjectHierarchyRepository } from "../project/index.ts";` -> `import { AutomationStudioProjectDatabasePool } from "../../../../framework/persistence/project/sql/index.ts"; import { AutomationStudioProjectHierarchyRepository } from "../project/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/tests/project-query-plan.test.ts:6` (split moved facade bindings):

  `import { AutomationStudioProjectAdministration, AutomationStudioProjectDatabasePool } from "../project/index.ts";` -> `import { AutomationStudioProjectDatabasePool } from "../../../../framework/persistence/project/sql/index.ts"; import { AutomationStudioProjectAdministration } from "../project/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/tests/schema-migrations-ready-memo.test.ts:6` (moved facade bindings):

  `import { AutomationStudioProjectDatabasePool, type AutomationStudioProjectDatabase } from "../project/index.ts";` -> `import { AutomationStudioProjectDatabasePool, type AutomationStudioProjectDatabase } from "../../../../framework/persistence/project/sql/index.ts";`

- `packages/fluxiq/src/programs/automation-studio/storage/tests/schema-migrations.test.ts:6` (moved facade bindings):

  `import { AutomationStudioProjectDatabasePool } from "../project/index.ts";` -> `import { AutomationStudioProjectDatabasePool } from "../../../../framework/persistence/project/sql/index.ts";`

Total supplemental statements: 46.

## Mechanical ownership completion

- Added project/index.ts and its framework/persistence public-barrel export; the existing server package subpath can now expose the canonical project owner after the lead builds it.
- Replaced 211 recorded static module specifiers in 149 storage files, then 46 recorded supplemental SQL statements in 43 files; union: 155 storage files. Moved SQL names from mixed facade imports were split while unrelated administration names retained their owner. Inline type imports were covered. The authority-guard process probe now imports SQL through fluxiq/framework/persistence.
- Root explicitly authorized the exact SQL import changes within storage/project/execution-admission. No implementation body there was edited.
- Fixed runner-options type import to use the SQL barrel. Expanded inherited packed statements in stableStringify, requiredId, requiredKind and positiveRevision without changing executable token order. No baseline was increased.
- Added canonical/legacy runtime constructor, prototype, checksum, digest, UOW and 34-name schema identity acceptance, plus public/legacy type aliases for the lead compiler gate.

## Four explicit cleanup behavior corrections

Each path now throws the original primary object directly if cleanup succeeds. If cleanup fails, AggregateError.errors is [primary, cleanup] in that order and cause is the identical primary object; a nested transaction AggregateError remains intact. No SQL string, migration order, retry policy or replay refusal changed.

1. sql/database.ts: open setup failure followed by close failure.
2. sql/database.ts: transaction callback or commit failure followed by rollback failure.
3. mutations/unit-of-work.ts: migration failure followed by lease.release failure.
4. mutations/unit-of-work.ts: transaction failure followed by persistFailure failure; IdempotentReplayError still bypasses failure persistence.

Root identified paths 3-4 during review and explicitly authorized their separate correction. Before correction, the new UOW-only command (`pnpm.cmd --filter fluxiq exec vitest run src/framework/persistence/project/mutations/tests/unit-of-work-cleanup.test.ts --maxWorkers=2 --minWorkers=1`) ran 5 tests: 2 passed and 3 failed, reproducing release masking, failure-record masking and nested-aggregate masking. Duration 2.66 s; collect 1.02 s, tests 991 ms. Regression fixtures use actual temporary databases, malformed preexisting schema, and a real SQLite trigger rejecting failure-ledger writes.

## Final validation observed by this worker

- `pnpm.cmd --filter fluxiq exec vitest run src/framework/persistence/project/tests/legacy-identity.test.ts src/framework/persistence/project/sql/tests/database-cleanup.test.ts src/programs/automation-studio/storage/project/tests/database.test.ts src/programs/automation-studio/storage/project/tests/administration.test.ts src/programs/automation-studio/storage/project/tests/unit-of-work.test.ts src/programs/automation-studio/storage/project/tests/schema.test.ts src/programs/automation-studio/storage/tests/schema-migrations.test.ts src/programs/automation-studio/storage/tests/schema-migrations-ready-memo.test.ts src/programs/automation-studio/storage/project/schema/tests --maxWorkers=2 --minWorkers=1` -> **15 files / 73 tests passed**. Wall 45.94 s; reported transform 11.12 s, collect 44.48 s, tests 10.72 s. Two workers avoid real-SQL contention. This included original database/cache/pool, administration, UOW, schema, migration, ready memo and all immediate schema upgrade tests.
- `pnpm.cmd --filter fluxiq exec vitest run src/framework/persistence/project/mutations/tests/unit-of-work-cleanup.test.ts src/programs/automation-studio/storage/project/tests/unit-of-work.test.ts --maxWorkers=2 --minWorkers=1` -> **2 files / 10 tests passed** after paths 3-4 were corrected. Wall 2.90 s; reported transform 743 ms, collect 1.75 s, tests 2.29 s. Original admission/replay/idempotency assertions still passed.
- Original and new cases cover **16 distinct files / 78 tests** across those focused runs; this is not a fresh combined-run claim after the last UOW change. Phase totals overlap across workers and must not be added as wall time.
- Node/TypeScript AST and source-snapshot reconstruction -> **155 consumer files exactly match only the recorded import-statement replacements; every unrelated byte is unchanged**.
- Node/TypeScript canonical source scan -> **82 non-test project source files, 148 relative import/export edges, 0 unresolved targets, 0 direct imports into programs**.
- No package-wide check/audit/build, whole suite, browser, panel, provider or user-data migration was run by this worker. Root will run shared-tree structure/type/public emitted-import acceptance after freeze.

## Preserved declarations and evidence limits

The preexisting salvage audit in wip-salvage.md accounted for all 137 original declarations: 35 exact retained, 101 exact moved and one equivalent cached-result type alias. That is prior source-audit evidence, not a new git comparison by this worker. This worker ran no git commands under the brief exclusion.

This completion did not edit the preserved pool, statement-cache, migration runner, checksum, default migration array, schema declarations, contract declarations or their module-owned maps/caches. Constructors and all legacy runtime bindings are proven reference-identical by the passing owner-local identity test; all 34 schema exports and objects are preserved. The original upgrade tests passed with representative old-key rows, columns, indexes, guards and recording/conversation data. Consumer snapshot reconstruction independently proves there were no storage implementation changes in the 155 retargeted files.

Intentional declaration changes: AutomationStudioProjectDatabase.open and transaction contain only the two explicit cleanup catches above; AutomationStudioProjectUnitOfWork.open and runIdempotent contain only the two explicit cleanup catches above. stableStringify and the three UOW validation helpers changed line layout only. Canonical source TypeScript/public emitted closure and a fresh original-declaration comparison remain lead verification gates.

## Elapsed-time reductions applied

1. Retargeted SQL-only constants/types away from broad Studio administration/project barrels, including test imports, to reduce collection dependencies.
2. Batched the stable original SQL acceptance once at two-worker SQLite concurrency; only the affected UOW tests were rerun after its later correction. No assertion was removed.
3. Shared package compilation/public emitted-import checks are deferred to the lead single frozen-tree gate, avoiding redundant builds against active sibling edits.

## Exact worker-touched path manifest

164 source/test files plus this report. The 81 preserved destination files present before dispatch remain part of Root salvage; untouched preserved files are not misreported here as worker edits.

Canonical source/tests (9):

- `packages/fluxiq/src/framework/persistence/index.ts`
- `packages/fluxiq/src/framework/persistence/project/index.ts`
- `packages/fluxiq/src/framework/persistence/project/migrations/contracts/runner-options.ts`
- `packages/fluxiq/src/framework/persistence/project/mutations/serialization.ts`
- `packages/fluxiq/src/framework/persistence/project/mutations/unit-of-work.ts`
- `packages/fluxiq/src/framework/persistence/project/mutations/tests/unit-of-work-cleanup.test.ts`
- `packages/fluxiq/src/framework/persistence/project/sql/database.ts`
- `packages/fluxiq/src/framework/persistence/project/sql/tests/database-cleanup.test.ts`
- `packages/fluxiq/src/framework/persistence/project/tests/legacy-identity.test.ts`

Exact-import-only storage consumers (155):

- `packages/fluxiq/src/programs/automation-studio/storage/canonical-authority/project-coordinator.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/canonical-authority/tests/project-coordinator.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/canonical-authority/whole-operation.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/canonical-authority/whole-sql.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/catalog.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/accepted-state/migration.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/accepted-state/store.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/accepted-state/tests/store.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/contracts.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/migration.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/records.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/store.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/tests/process-probe.mjs`
- `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/tests/process.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/tests/records.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/tests/store.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/candidate-verification/migration.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/candidate-verification/store.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/candidate-verification/tests/store.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/command-ledger/migration.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/command-ledger/store.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/command-ledger/tests/run-fence.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/command-ledger/tests/store.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/compiled-plan-store.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-address/keyring-input.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-address/migration.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-address/new-key-row.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-address/open-keyring.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-address/pending-removal-path-migration.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-address/scrub-database.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-address/scrub-request.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-address/tests/durable-removal.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-address/tests/keyring-fixture.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-address/tests/object-address-fixture.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-reseal/address-key-pass.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-reseal/chunk-pass.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-reseal/context.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-reseal/manifest-pass.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-reseal/reseal.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-reseal/row-pass.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-reseal/tests/reseal-fixture.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-reseal/tests/reseal-interruption.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-reseal/tests/reseal.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-reseal/trace-tables.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/content-store.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/database-owner/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/event-chunk-store.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/event-stream-writer.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/admission.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/command-link.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/command-proof.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/commands.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/context.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/evidence.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/inventory.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/migration.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/mutation.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/proof.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/scope.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/state.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/store.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/tests/fixture.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/tests/store.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/write.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-mutations.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-chunk-rows/delete-chunk-uses.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-chunk-rows/protect-chunks.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-chunk-rows/read-bodies.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-chunk-rows/sweep-unused-chunks.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-chunk-rows/write-chunks.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-rekey/artifacts.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-rekey/chunk-cleanup.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-rekey/context.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-rekey/events.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-rekey/manifests.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-rekey/rekey.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-rekey/tests/migrated-project.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-schema/chunk-migration.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-schema/chunk-protection-migration.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-schema/keyed-address-migration.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace-schema/migration.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace/manifest-row.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace/measure-rows.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace/store.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace/tests/keyed-trace-support.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace/tests/sqlite-trace-fixture.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace/tests/store-legacy-rows.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/gateway-trace/tests/store-persistence.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/graph-judgement-store.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/feed.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/mutations.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/repository.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/tests/feed.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/tests/mutations.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/tests/repository.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/object-index-migration.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/object-repository.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/recording-stream/projection.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/recording-stream/reconciliation.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/recording-stream/store.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/recording-stream/summary.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/recording-stream/tests/concurrency.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/recording-stream/tests/incarnations.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/recording-stream/tests/reconciliation.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/recording-stream/tests/store.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/retention-store.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/reusable-llm-context-digest/rekey.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/reusable-llm-context-store.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/run-dataset-store.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/runtime-stream-store.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/schema.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/adaptation-matching.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/conversation-turn-decision.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/flow-scoped-keys.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/instruction-node-scope.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/recording-description.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/recording-stream.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/schema/tests/runtime-run-interrupted-status.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/adaptation-store.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/administration.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/compiled-plan-store.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/content-store.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/database.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/durability.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/event-chunk-store.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/event-stream-writer.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/flow-resource-repository.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/graph-judgement-store.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/graph-store.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/migration-cutover.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/object-index-migration.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/object-repository.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/object-stream-edge-cases.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/result-check-state.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/retention-store.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/reusable-llm-context-store.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/run-dataset-store.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/runtime-stream-store-update.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/runtime-stream-store.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/schema.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/ui-cache-store.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/tests/unit-of-work.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/ui-cache-store.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/query-plan.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/tests/project-hierarchy-scale.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/tests/project-query-plan.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/tests/schema-migrations-ready-memo.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/tests/schema-migrations.test.ts`

Report: `docs/working/runtime-ownership-reset-plan/reports/sql-foundation.md`.

Outcome: Done
Changed: 9 canonical source/test paths, 155 exact-import-only storage consumer paths, and this report (full manifest above)
Validation: Focused SQL batch -> 15 files / 73 tests passed; final affected UOW batch -> 2 files / 10 tests passed; source manifests/relative edges -> passed
Not verified: Lead-only frozen-tree package typecheck, full structure audit, emitted public persistence import, and fresh HEAD declaration comparison; no live browser needed for this server-only batch
Report: docs/working/runtime-ownership-reset-plan/reports/sql-foundation.md
Notes: Source frozen. No git mutations, shared-doc edits, downstream edits or agents. Four cleanup corrections are separately enumerated.
