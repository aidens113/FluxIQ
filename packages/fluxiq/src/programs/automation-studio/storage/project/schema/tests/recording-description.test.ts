import { expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS, AutomationStudioProjectDatabasePool } from "../../index.ts";
import { AutomationStudioSchemaMigrationRunner } from "../../../schema-migrations.ts";

it("adds optional descriptions to legacy summaries without inventing or losing data", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "recording-description-migration-"));
  const pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
  const lease = await pool.acquire("project");
  try {
    const prior = AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS.filter(migration => migration.id !== "0026_recording_description");
    await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: prior }).migrate();
    await lease.database.run("insert into recordings (recording_id,name,status,started_at_ms,event_count,updated_at_ms) values ('legacy','Existing demonstration','completed',1,7,2)");
    await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS }).migrate();
    expect(await lease.database.get<{ description: string | null; event_count: number; name: string }>("select description,event_count,name from recordings where recording_id = 'legacy'")).toEqual({ description: null, event_count: 7, name: "Existing demonstration" });
  } finally {
    await lease.release();
    await pool.closeAll();
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  }
});
