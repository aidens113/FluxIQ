import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "./project-database.ts";
import { AutomationStudioProjectHierarchyRepository } from "./project-hierarchy-repository.ts";
import { assertNoCriticalFullScan, assertPlanMentions, explainAutomationStudioQueryPlan } from "./query-plan.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-project-hierarchy-scale-test");

describe("Automation Studio hierarchy scale validation", () => {
  beforeEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(rootDir, { recursive: true });
  });
  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

  it("expands and deep-links a 100k-subflow hierarchy fixture with keyset pages", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const repository = await AutomationStudioProjectHierarchyRepository.open({ pool, projectId: "project.100k-hierarchy" });
    const lease = await pool.acquire("project.100k-hierarchy");
    try {
      await seedHierarchy(lease.database);
      const first = await repository.listChildrenPage({ parentEntryId: "entry.subflows", limit: 50 });
      expect(first.items).toHaveLength(50);
      expect(first.items[0]).toMatchObject({ entryId: "entry.subflow.000000", displayName: "Subflow 000000" });
      expect(first.hasMore).toBe(true);

      const tailCursor = Buffer.from(JSON.stringify({ sortKey: "subflow.099949", entryId: "entry.subflow.099949" })).toString("base64url");
      const tail = await repository.listChildrenPage({ parentEntryId: "entry.subflows", limit: 50, cursor: tailCursor });
      expect(tail.items).toHaveLength(50);
      expect(tail.items[0]).toMatchObject({ entryId: "entry.subflow.099950" });
      expect(tail.items.at(-1)).toMatchObject({ entryId: "entry.subflow.099999" });
      expect(tail.hasMore).toBe(false);

      await expect(repository.listAncestors("entry.subflow.099999")).resolves.toMatchObject([{ entryId: "entry.flow" }, { entryId: "entry.subflows" }]);
      const plan = await explainAutomationStudioQueryPlan(lease.database, "select * from hierarchy_entries where parent_entry_id = ? and is_deleted = 0 and (sort_key, entry_id) > (?, ?) order by sort_key, entry_id limit ?", ["entry.subflows", "subflow.099949", "entry.subflow.099949", 51]);
      assertNoCriticalFullScan(plan, ["hierarchy_entries"]);
      assertPlanMentions(plan, "hierarchy_entries_children_idx");
      const rootPlan = await explainAutomationStudioQueryPlan(lease.database, "select * from hierarchy_entries where is_deleted = 0 and parent_entry_id is null order by sort_key, entry_id limit ?", [51]);
      assertNoCriticalFullScan(rootPlan, ["hierarchy_entries"]);
      assertPlanMentions(rootPlan, "hierarchy_entries_children_idx");
    } finally {
      await lease.release();
      await repository.close();
      await pool.closeAll();
    }
  }, 30_000);
});

async function seedHierarchy(database: { transaction<T>(operation: (sql: { run(sql: string, params?: readonly unknown[]): Promise<unknown> }) => Promise<T>): Promise<T> }): Promise<void> {
  await database.transaction(async (sql) => {
    await sql.run("insert into hierarchy_entries (entry_id, parent_entry_id, kind, owner_id, display_name, sort_key, depth, path_key, is_system, is_deleted, revision, created_at_ms, updated_at_ms) values ('entry.flow', null, 'flow', 'flow.root', 'Flow', 'flow', 0, 'entry.flow', 1, 0, 1, 1, 1)");
    await sql.run("insert into hierarchy_entries (entry_id, parent_entry_id, kind, owner_id, display_name, sort_key, depth, path_key, is_system, is_deleted, revision, created_at_ms, updated_at_ms) values ('entry.subflows', 'entry.flow', 'folder', 'entry.subflows', 'Subflows', 'subflows', 1, 'entry.flow/entry.subflows', 1, 0, 1, 1, 1)");
    await sql.run(`with recursive seq(i) as (
        values(0)
        union all
        select i + 1 from seq where i < 99999
      )
      insert into hierarchy_entries (entry_id, parent_entry_id, kind, owner_id, display_name, sort_key, depth, path_key, is_system, is_deleted, revision, created_at_ms, updated_at_ms)
      select
        'entry.subflow.' || printf('%06d', i),
        'entry.subflows',
        'subflow',
        'subflow.' || printf('%06d', i),
        'Subflow ' || printf('%06d', i),
        'subflow.' || printf('%06d', i),
        2,
        'entry.flow/entry.subflows/entry.subflow.' || printf('%06d', i),
        0,
        0,
        1,
        i + 2,
        i + 2
      from seq`);
    await sql.run("insert into hierarchy_entries_fts (entry_id, display_name) select entry_id, display_name from hierarchy_entries");
  });
}
