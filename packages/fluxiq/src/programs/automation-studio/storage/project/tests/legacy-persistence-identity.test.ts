import { describe, expect, it } from "vitest";
import * as canonical from "../../../../../framework/persistence/project/index.ts";
import * as canonicalSchema from "../../../../../framework/persistence/project/schema/index.ts";
import * as legacyDatabase from "../database.ts";
import * as legacyDatabaseOwner from "../database-owner/index.ts";
import * as legacyStatementCache from "../statement-cache.ts";
import * as legacyStoreError from "../store-unavailable-error.ts";
import * as legacyMutations from "../unit-of-work.ts";
import * as legacyMigrations from "../../schema-migrations.ts";
import * as legacySchema from "../schema/index.ts";
import * as legacySchemaFacade from "../schema.ts";
import type * as publicPersistence from "../../../../../framework/persistence/index.ts";

type PublicDatabase = publicPersistence.AutomationStudioProjectDatabase;
type CanonicalDatabase = canonical.AutomationStudioProjectDatabase;
type LegacyDatabase = legacyDatabase.AutomationStudioProjectDatabase;
type SameType<Left, Right> = [Left, Right] extends [Right, Left] ? true : false;

const publicTypeIdentity: SameType<PublicDatabase, CanonicalDatabase> = true;
const legacyTypeIdentity: SameType<LegacyDatabase, CanonicalDatabase> = true;
const leaseTypeIdentity: SameType<legacyDatabase.AutomationStudioProjectDatabaseLease, canonical.AutomationStudioProjectDatabaseLease> = true;
const executorTypeIdentity: SameType<legacyDatabase.AutomationStudioSqlExecutor, canonical.AutomationStudioSqlExecutor> = true;
const optionsTypeIdentity: SameType<legacyMigrations.AutomationStudioSchemaMigrationRunnerOptions, canonical.AutomationStudioSchemaMigrationRunnerOptions> = true;
const mutationTypeIdentity: SameType<legacyMutations.AutomationStudioProjectMutationContext, canonical.AutomationStudioProjectMutationContext> = true;

function expectCanonicalBindings(legacy: Record<string, unknown>): void {
  for (const [name, binding] of Object.entries(legacy)) {
    expect(binding, name).toBe(Reflect.get(canonical, name));
  }
}

describe("project persistence compatibility identity", () => {
  it("retains original database, pool, statement-cache and error constructors", () => {
    expect(Object.keys(legacyDatabase).sort()).toEqual(["AutomationStudioProjectDatabase", "AutomationStudioProjectDatabasePool"]);
    for (const legacy of [legacyDatabase, legacyDatabaseOwner, legacyStatementCache, legacyStoreError]) {
      expectCanonicalBindings(legacy);
    }
    expect(legacyDatabase.AutomationStudioProjectDatabase.prototype).toBe(canonical.AutomationStudioProjectDatabase.prototype);
    expect(legacyDatabase.AutomationStudioProjectDatabasePool.prototype).toBe(canonical.AutomationStudioProjectDatabasePool.prototype);
  });

  it("retains migration runner, checksum, digest and unit-of-work bindings", () => {
    expect(Object.keys(legacyMigrations).sort()).toEqual(["AutomationStudioSchemaMigrationRunner", "automationStudioMigrationChecksum"]);
    expect(Object.keys(legacyMutations).sort()).toEqual(["AutomationStudioProjectUnitOfWork", "automationStudioMutationDigest"]);
    expectCanonicalBindings(legacyMigrations);
    expectCanonicalBindings(legacyMutations);
  });

  it("retains the complete legacy schema surface and every schema object", () => {
    const names = Object.keys(canonicalSchema).sort();
    expect(names).toHaveLength(34);
    expect(Object.keys(legacySchema).sort()).toEqual(names);
    expect(Object.keys(legacySchemaFacade).sort()).toEqual(names);
    expectCanonicalBindings(legacySchema);
    expectCanonicalBindings(legacySchemaFacade);
  });

  it("exposes identical database and contract types through legacy and public owners", () => {
    expect([publicTypeIdentity, legacyTypeIdentity, leaseTypeIdentity, executorTypeIdentity, optionsTypeIdentity, mutationTypeIdentity]).toEqual([true, true, true, true, true, true]);
  });
});
