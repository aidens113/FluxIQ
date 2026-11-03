// @fluxiq-test-group real-sql
// t747 b: the re-seal job interrupted and rerun, and a writer racing it, on
// real SQLite and real files. A run stopped after some batches, or between
// writing a batch's re-sealed object files and moving the rows to them, loses
// nothing: the rerun re-seals exactly what is still under the retiring key, and
// every old or orphaned object file is drained. A writer that reuses a sealed
// object (by its keyed address) while the job moves that object to its
// re-sealed file still commits its reference to the object, by its id.
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AutomationStudioProjectContentProtection } from "../../content-protection.ts";
import { AutomationStudioProjectContentStore } from "../../content-store.ts";
import { AutomationStudioProjectDatabasePool } from "../../database.ts";
import { resealAutomationStudioProjectContent } from "../index.ts";
import type { AutomationStudioProjectContentResealOptions } from "../index.ts";
import { PLAIN_OBJECT, PROJECT, SwitchableHost, filesUnder, keyIdsByKind, readEverything, sealedForms, sealedProject, withDatabase } from "./reseal-fixture.ts";

let rootDir: string;
const pools: AutomationStudioProjectDatabasePool[] = [];

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-reseal-interruption-test-"));
});

afterEach(async () => {
  for (const pool of pools.splice(0)) await pool.closeAll();
  await rm(rootDir, { recursive: true, force: true });
});

function reseal(pool: AutomationStudioProjectDatabasePool, protection: AutomationStudioProjectContentProtection, options?: AutomationStudioProjectContentResealOptions) {
  return resealAutomationStudioProjectContent({ pool, projectId: PROJECT, protection, retiringKeyIds: ["k1"], ...(options ? { options } : {}) });
}

async function exists(file: string): Promise<boolean> {
  return stat(file).then(() => true, (error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return false;
    throw error;
  });
}

/** The object files on disk, and the paths the object rows name. */
async function objectFiles(pool: AutomationStudioProjectDatabasePool): Promise<{ onDisk: string[]; named: string[] }> {
  const onDisk = (await filesUnder(path.join(rootDir, "projects", PROJECT, "objects"))).map((file) => path.relative(rootDir, file.name).replaceAll(path.sep, "/")).sort();
  const named = (await withDatabase(pool, (database) => database.all<{ relative_path: string }>("select relative_path from objects order by relative_path"))).map((row) => row.relative_path);
  return { onDisk, named };
}

const ALL_K2 = { objects: ["k2"], chunks: ["k2"], manifests: ["k2"], addressKeys: ["k2"] };

describe("an interrupted re-seal", () => {
  it("loses nothing when stopped after some batches, and the rerun completes and drains the old files", async () => {
    const host = new SwitchableHost();
    const project = await sealedProject(rootDir, host);
    pools.push(project.pool);
    const before = await readEverything(project.pool, host.protection(), project);
    const formsBefore = await sealedForms(rootDir, project.pool);
    host.current = "k2";

    let batches = 0;
    const stopped = reseal(project.pool, host.protection(), {
      batchSize: 1,
      seams: {
        afterBatch: async () => {
          batches += 1;
          if (batches === 3) throw new Error("injected stop after three batches");
        }
      }
    });
    await expect(stopped).rejects.toThrow("injected stop after three batches");
    const between = keyIdsByKind(await sealedForms(rootDir, project.pool));
    expect(Object.values(between).flat()).toContain("k1");
    expect(Object.values(between).flat()).toContain("k2");

    const result = await reseal(project.pool, host.protection(), { batchSize: 1 });
    expect(result).toMatchObject({ complete: true, unreadable: [], filesNotRemoved: 0 });
    const total = formsBefore.objects.length + formsBefore.chunks.length + formsBefore.manifests.length + formsBefore.addressKeys.length;
    const rerun = result.resealed.objects + result.resealed.chunks + result.resealed.manifests + result.resealed.addressKeys;
    expect(rerun).toBe(total - 3);

    host.keys.delete("k1");
    expect(keyIdsByKind(await sealedForms(rootDir, project.pool))).toEqual(ALL_K2);
    for (const object of formsBefore.objects) expect(await exists(path.join(rootDir, object.path))).toBe(false);
    expect(await withDatabase(project.pool, (database) => database.get("select count(*) as n from object_pending_removals"))).toEqual({ n: 0 });
    const files = await objectFiles(project.pool);
    expect(files.onDisk).toEqual(files.named);
    expect(await readEverything(project.pool, host.protection(), project)).toEqual(before);
  });

  it("drains the re-sealed files of a batch stopped before its rows moved to them", async () => {
    const host = new SwitchableHost();
    const project = await sealedProject(rootDir, host);
    pools.push(project.pool);
    const before = await readEverything(project.pool, host.protection(), project);
    host.current = "k2";

    const stopped = reseal(project.pool, host.protection(), {
      seams: { beforeObjectCommit: async () => { throw new Error("injected stop before the object rows move"); } }
    });
    await expect(stopped).rejects.toThrow("injected stop before the object rows move");
    const orphaned = await objectFiles(project.pool);
    expect(orphaned.onDisk.length).toBeGreaterThan(orphaned.named.length);

    const result = await reseal(project.pool, host.protection());
    expect(result).toMatchObject({ complete: true, unreadable: [], filesNotRemoved: 0 });
    const files = await objectFiles(project.pool);
    expect(files.onDisk).toEqual(files.named);
    host.keys.delete("k1");
    expect(keyIdsByKind(await sealedForms(rootDir, project.pool))).toEqual(ALL_K2);
    expect(await readEverything(project.pool, host.protection(), project)).toEqual(before);
  });
});

describe("a writer racing the re-seal", () => {
  it("commits its reference to a reused sealed object the job moved to its re-sealed file", async () => {
    const host = new SwitchableHost();
    const project = await sealedProject(rootDir, host);
    pools.push(project.pool);
    host.current = "k2";
    const jobPool = new AutomationStudioProjectDatabasePool({ rootDir });
    const writerPool = new AutomationStudioProjectDatabasePool({ rootDir });
    pools.push(jobPool, writerPool);
    await project.pool.closeAll();

    let armed = true;
    let job: Awaited<ReturnType<typeof reseal>> | undefined;
    const writer = await AutomationStudioProjectContentStore.open({
      pool: writerPool,
      projectId: PROJECT,
      protection: host.protection(),
      seams: {
        beforeWriterCommit: async () => {
          if (!armed) return;
          armed = false;
          job = await reseal(jobPool, host.protection());
        }
      }
    });
    try {
      const written = await writer.putBytes({ content: PLAIN_OBJECT, mediaType: "application/json", extension: "json", owner: { ownerKind: "reseal_test", ownerId: "second", purpose: "payload" }, protect: true });
      expect(job?.complete).toBe(true);
      expect(written.deduped).toBe(true);
      expect(written.object.objectId).toBe(project.objectId);
      expect(JSON.parse(written.object.encryption!).keyId).toBe("k2");
      expect(await exists(written.contentPath)).toBe(true);
      host.keys.delete("k1");
      expect((await writer.readBytesByObjectId(project.objectId)).content).toEqual(PLAIN_OBJECT);
    } finally {
      await writer.close();
    }
    const references = await withDatabase(writerPool, (database) => database.get("select count(*) as n from object_references where object_id = ?", [project.objectId]));
    expect(references).toEqual({ n: 2 });
  });
});
