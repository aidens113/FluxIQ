// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../administration.ts";
import { AutomationStudioProjectDatabasePool } from "../../database.ts";
import { AUTOMATION_STUDIO_PROJECT_CONVERSATION_TURN_DECISION_MIGRATION } from "../index.ts";
import { AutomationStudioSchemaMigrationRunner } from "../../../schema-migrations.ts";

// Migration 0026_responded_turn_decision records which decision Core answered a
// person's message with (t728 F3). What must hold on a database migrated before
// it: a turn already in a thread keeps everything it said and reads back with
// no recorded decision, and a new turn takes only a kind Core writes.

let rootDir = "";
const MIGRATION = AUTOMATION_STUDIO_PROJECT_CONVERSATION_TURN_DECISION_MIGRATION;
const PREVIOUS = AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS.filter((migration) => migration.id !== MIGRATION.id);

beforeEach(async () => { rootDir = await mkdtemp(path.join(os.tmpdir(), "conversation-turn-decision-migration-")); });
afterEach(async () => { await rm(rootDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 }); });

const turnInsert = "insert into conversation_turns (conversation_id, turn_id, ordinal, author, body, attachment_kind, attachment_ref, actor_id, created_at_ms) values ('conversation.a', ?, ?, 'automation', ?, null, null, null, 1)";

it("keeps a thread's turns, reads them with no recorded decision, and takes only the kinds Core writes", async () => {
  const pool = new AutomationStudioProjectDatabasePool({ rootDir });
  const lease = await pool.acquire("project");
  try {
    const sql = lease.database;
    expect(MIGRATION.id > "0026_relaxed_instruction_node_guard" && MIGRATION.id < "0026_staged_project_snapshots_v1").toBe(true);
    await new AutomationStudioSchemaMigrationRunner({ database: sql, migrations: PREVIOUS }).migrate();
    await sql.run("insert into conversations (conversation_id, subject_kind, subject_id, created_at_ms, updated_at_ms) values ('conversation.a', 'project', 'project', 1, 1)");
    await sql.run(turnInsert, ["turn.legacy", 1, "Which shop should it look at?"]);

    await new AutomationStudioSchemaMigrationRunner({ database: sql, migrations: AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS }).migrate();
    expect(await sql.get("select turn_id as turnId, body, decision_kind as decision from conversation_turns where turn_id = 'turn.legacy'")).toEqual({ turnId: "turn.legacy", body: "Which shop should it look at?", decision: null });

    const decided = "insert into conversation_turns (conversation_id, turn_id, ordinal, author, body, decision_kind, created_at_ms) values ('conversation.a', ?, ?, 'automation', 'Words.', ?, 1)";
    for (const [index, kind] of ["reply", "clarify", "invoke"].entries()) await sql.run(decided, [`turn.${kind}`, index + 2, kind]);
    await expect(sql.run(decided, ["turn.other", 9, "guess"])).rejects.toThrow(/CHECK constraint failed/u);
    expect(await sql.all("select decision_kind as decision from conversation_turns order by ordinal")).toEqual([{ decision: null }, { decision: "reply" }, { decision: "clarify" }, { decision: "invoke" }]);
  } finally {
    await lease.release();
    await pool.closeAll();
  }
});
