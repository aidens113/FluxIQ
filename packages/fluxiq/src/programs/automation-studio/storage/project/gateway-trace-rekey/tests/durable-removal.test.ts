// @fluxiq-test-group real-sql
// t745 u5: what a rekey removes stays removed across a crash. A process that
// stops after a batch committed but before it removed the released object's
// file leaves a pending removal and a scrub request, both in that batch's
// commit; the next protected open removes the file and its row, finishes the
// conversion and scrubs. A scrub request left by a run that stopped after its
// last batch is honoured by the next protected open even with nothing left to
// convert, and the open after that has none to honour.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { requestContentAddressScrub } from "../../content-address/index.ts";
import { AutomationStudioProjectContentStore } from "../../content-store.ts";
import { hostProtection, projectKeyring } from "../../gateway-trace/tests/keyed-trace-support.ts";
import { rekeyGatewayTraceStore } from "../index.ts";
import { expectKeyedEndState, fileExists, filesUnder, needlesFound, objectRows } from "./keyed-end-state.ts";
import { MigratedProject, readProject } from "./migrated-project.ts";

let rootDir: string;
let project: MigratedProject | undefined;

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-trace-rekey-test-"));
});

afterEach(async () => {
  await project?.closePool();
  project = undefined;
  await rm(rootDir, { recursive: true, force: true });
});

async function count(target: MigratedProject, statement: string): Promise<number> {
  return (await target.rows<{ n: number }>(statement))[0]!.n;
}

describe("durable removal across an interrupted rekey", () => {
  it("finishes a pending removal and honours the scrub request a crash between a batch's commit and its drain left", async () => {
    const created = await MigratedProject.create(rootDir, "project.trace-rekey", "drain");
    project = created.project;
    const oldObjects = await objectRows(project);
    const legacyObject = (await project.rows<{ object_id: string; relative_path: string }>(
      "select o.object_id, o.relative_path from objects o join client_gateway_trace_events e on e.event_object_id = o.object_id"
    ))[0]!;
    const key = hostProtection(7);

    // The pieces a protected open runs, with a drain that stops the process once the event batch has committed.
    const content = await AutomationStudioProjectContentStore.open({ pool: project.databasePool, projectId: project.projectId, protection: key });
    const lease = await project.databasePool.acquire(project.projectId);
    try {
      const keyring = await projectKeyring(project.databasePool, project.projectId, key);
      await expect(rekeyGatewayTraceStore({
        database: lease.database,
        sealing: { projectId: project.projectId, protection: key, keyring },
        content: {
          readBytesByObjectId: (objectId) => content.readBytesByObjectId(objectId),
          putBytes: (input) => content.putBytes(input),
          drainPendingRemovals: async () => {
            throw new Error("process stopped");
          }
        }
      })).rejects.toThrow("process stopped");
    } finally {
      await lease.release();
      await content.close();
    }
    expect(await project.rows("select object_id from object_pending_removals")).toEqual([{ object_id: legacyObject.object_id }]);
    expect(await project.rows("select object_id from objects where object_id = ?", [legacyObject.object_id])).toEqual([]);
    expect(await fileExists(path.join(rootDir, legacyObject.relative_path))).toBe(true);
    expect(await count(project, "select count(*) as n from content_address_scrub_requests")).toBe(1);
    expect(await count(project, "select count(*) as n from client_gateway_trace_events where event_chunk_address_key_id is null")).toBe(0);

    const store = await project.open({ protection: key });
    try {
      expect(store.rekey).toMatchObject({
        events: { converted: 0, skipped: 0 },
        artifacts: { rekeyed: 2, sealed: 2, skipped: 0, objectsRemoved: 2 },
        manifests: { sealed: 2, skipped: 0 },
        skipped: [],
        complete: true,
        scrub: { status: "done", checkpoint: { busy: 0 } }
      });
      expect(await readProject(store)).toEqual(created.before);
    } finally {
      await store.close();
    }
    expect(await count(project, "select count(*) as n from object_pending_removals")).toBe(0);
    expect(await count(project, "select count(*) as n from content_address_scrub_requests")).toBe(0);
    for (const object of oldObjects) expect(await fileExists(path.join(rootDir, object.relative_path))).toBe(false);
    await expectKeyedEndState(project, (await projectKeyring(project.databasePool, project.projectId, key)).currentKeyId);
    await project.restartPool();
    expect(needlesFound(await filesUnder(project.directory), project.needles())).toEqual([]);
  });

  it("honours a scrub request left after the last batch on the next protected open, with nothing left to convert", async () => {
    const created = await MigratedProject.create(rootDir, "project.trace-rekey", "scrub");
    project = created.project;
    const key = hostProtection(7);
    const first = await project.open({ protection: key });
    expect(first.rekey?.scrub).toMatchObject({ status: "done" });
    await first.close();

    // A run that committed its last batch and stopped before its scrub; free pages show whether a VACUUM ran.
    const lease = await project.databasePool.acquire(project.projectId);
    try {
      await lease.database.run("create table scratch_pages (body blob not null)");
      for (let index = 0; index < 64; index += 1) await lease.database.run("insert into scratch_pages (body) values (randomblob(4000))");
      await lease.database.run("drop table scratch_pages");
      await lease.database.transaction((sql) => requestContentAddressScrub(sql, Date.now()));
    } finally {
      await lease.release();
    }
    expect(await count(project, "select freelist_count as n from pragma_freelist_count()")).toBeGreaterThan(0);

    const again = await project.open({ protection: key });
    try {
      expect(again.rekey).toMatchObject({ events: { converted: 0 }, chunks: { chunksDeleted: 0, usesDeleted: 0 }, batches: 0, scrub: { status: "done", checkpoint: { busy: 0 } } });
      expect(await readProject(again)).toEqual(created.before);
    } finally {
      await again.close();
    }
    expect(await count(project, "select count(*) as n from content_address_scrub_requests")).toBe(0);
    expect(await count(project, "select freelist_count as n from pragma_freelist_count()")).toBe(0);

    const third = await project.open({ protection: key });
    try {
      expect(third.rekey?.scrub).toEqual({ status: "not-requested" });
    } finally {
      await third.close();
    }
  });
});
