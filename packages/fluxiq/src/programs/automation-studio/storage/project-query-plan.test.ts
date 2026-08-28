import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectAdministration } from "./project-administration.ts";
import { AutomationStudioProjectDatabasePool } from "./project-database.ts";
import { assertNoCriticalFullScan, assertPlanMentions, explainAutomationStudioQueryPlan } from "./query-plan.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-query-plan-test");

describe("Automation Studio project query plans", () => {
  beforeEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(rootDir, { recursive: true });
  });
  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

  it("keeps hierarchy expansion, graph viewport, runtime, and stream chunk reads on indexes", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    let admin: Awaited<ReturnType<typeof AutomationStudioProjectAdministration.open>> | null = null;
    let lease: Awaited<ReturnType<AutomationStudioProjectDatabasePool["acquire"]>> | null = null;
    try {
      admin = await AutomationStudioProjectAdministration.open({ pool, projectId: "project.plans" });
      lease = await pool.acquire("project.plans");
      const cases = [
        {
          sql: "select entry_id, display_name from hierarchy_entries where parent_entry_id = ? and is_deleted = 0 order by sort_key, entry_id limit ?",
          params: ["entry.root", 50],
          table: "hierarchy_entries",
          indexes: ["hierarchy_entries_children_idx"]
        },
        {
          sql: "select node_id, label, x, y from graph_nodes where flow_id = ? and partition_id = ? and deleted_at_ms is null order by node_id limit ?",
          params: ["flow.1", "partition.1", 200],
          table: "graph_nodes",
          indexes: ["graph_nodes_partition_idx"]
        },
        {
          sql: "select run_id, status from runtime_runs where flow_id = ? and status = ? and (started_at_ms < ? or (started_at_ms = ? and run_id < ?)) order by started_at_ms desc, run_id desc limit ?",
          params: ["flow.1", "running", 1_000, 1_000, "run.cursor", 50],
          table: "runtime_runs",
          indexes: ["runtime_runs_flow_status_idx"]
        },
        {
          sql: "select chunk_id from runtime_event_chunks where run_id = ? and first_sequence <= ? and last_sequence >= ? order by first_sequence limit ?",
          params: ["run.1", 10_000, 10_000, 2],
          table: "runtime_event_chunks",
          indexes: ["runtime_event_chunks_sequence_idx", "runtime_event_chunks_run_first_uq"]
        },
        {
          sql: "select mutation_id from mutation_records where owner_kind = ? and owner_id = ? order by updated_at_ms desc, mutation_id limit ?",
          params: ["flow", "flow.1", 50],
          table: "mutation_records",
          indexes: ["mutation_records_owner_idx"]
        },
        {
          sql: "select object_id from object_references where owner_kind = ? and owner_id = ? and purpose = ? limit ?",
          params: ["runtime_run", "run.1", "event_chunk", 50],
          table: "object_references",
          indexes: ["object_references_owner_idx"]
        }
      ] as const;
      for (const entry of cases) {
        const plan = await explainAutomationStudioQueryPlan(lease.database, entry.sql, entry.params);
        expect(() => assertNoCriticalFullScan(plan, [entry.table])).not.toThrow();
        expect(entry.indexes.some((index) => {
          try { assertPlanMentions(plan, index); return true; } catch { return false; }
        })).toBe(true);
      }
    } finally {
      await lease?.release();
      await admin?.close();
      await pool.closeAll();
    }
  });

  it("keeps search and spatial lookup on virtual indexes", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    let admin: Awaited<ReturnType<typeof AutomationStudioProjectAdministration.open>> | null = null;
    let lease: Awaited<ReturnType<AutomationStudioProjectDatabasePool["acquire"]>> | null = null;
    try {
      admin = await AutomationStudioProjectAdministration.open({ pool, projectId: "project.search-plans" });
      lease = await pool.acquire("project.search-plans");
      const ftsPlan = await explainAutomationStudioQueryPlan(lease.database, "select node_id from graph_nodes_fts where graph_nodes_fts match ? limit ?", ["checkout", 20]);
      const rtreePlan = await explainAutomationStudioQueryPlan(lease.database, "select bounds_id from graph_node_bounds where min_x <= ? and max_x >= ? and min_y <= ? and max_y >= ? limit ?", [100, 100, 200, 200, 100]);
      expect(() => assertNoCriticalFullScan(ftsPlan, ["graph_nodes_fts"])).not.toThrow();
      expect(() => assertNoCriticalFullScan(rtreePlan, ["graph_node_bounds"])).not.toThrow();
      expect(() => assertPlanMentions(ftsPlan, "virtual table index")).not.toThrow();
      expect(() => assertPlanMentions(rtreePlan, "virtual table index")).not.toThrow();
    } finally {
      await lease?.release();
      await admin?.close();
      await pool.closeAll();
    }
  });
});
