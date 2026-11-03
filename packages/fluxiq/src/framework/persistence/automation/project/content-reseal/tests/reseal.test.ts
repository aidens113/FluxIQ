// @fluxiq-test-group real-sql
// t747 b: the host re-seal job, on real SQLite and real files, with an AES-GCM
// host resolver holding k1 and k2. A project holds every sealed kind under k1;
// the host makes k2 current, runs the job retiring k1, and then stops
// resolving k1: everything still reads. Also: a write still sealed under k1
// after the main pass is caught by the verification passes, retiring the
// current key is refused before anything is written, an item that does not
// open is reported and left, a provider that cannot name a sealed form's key is
// refused, and no old sealed form survives in any file under the storage root.
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AutomationStudioProjectContentProtection } from "../../content-protection.ts";
import { AutomationStudioProjectContentStore } from "../../content-store.ts";
import type { AutomationStudioProjectDatabasePool } from "../../database.ts";
import { resealAutomationStudioProjectContent } from "../index.ts";
import type { AutomationStudioProjectContentResealOptions } from "../index.ts";
import { PROJECT, SwitchableHost, filesUnder, keyIdsByKind, readEverything, sealedForms, sealedProject, withDatabase, writeTrace } from "./reseal-fixture.ts";

let rootDir: string;
const pools: AutomationStudioProjectDatabasePool[] = [];

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-reseal-test-"));
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

const ALL_K1 = { objects: ["k1"], chunks: ["k1"], manifests: ["k1"], addressKeys: ["k1"] };
const ALL_K2 = { objects: ["k2"], chunks: ["k2"], manifests: ["k2"], addressKeys: ["k2"] };

describe("re-sealing a project for host key retirement", () => {
  it("re-seals every kind under the new key, so the project reads after the old key is gone", async () => {
    const host = new SwitchableHost();
    const project = await sealedProject(rootDir, host);
    pools.push(project.pool);
    const before = await readEverything(project.pool, host.protection(), project);
    const formsBefore = await sealedForms(rootDir, project.pool);
    expect(keyIdsByKind(formsBefore)).toEqual(ALL_K1);
    expect(formsBefore.addressKeys.map((key) => key.retired).sort()).toEqual([false, true]);
    const addresses = () => withDatabase(project.pool, (database) => database.all("select object_id, content_address, content_address_key_id from objects order by object_id"));
    const addressesBefore = await addresses();

    host.current = "k2";
    const result = await reseal(project.pool, host.protection());
    host.keys.delete("k1");

    expect(result).toMatchObject({
      retiringKeyIds: ["k1"],
      resealed: { objects: formsBefore.objects.length, chunks: formsBefore.chunks.length, manifests: formsBefore.manifests.length, addressKeys: 2 },
      unreadable: [],
      filesNotRemoved: 0,
      scrub: { status: "done" },
      complete: true
    });
    expect(keyIdsByKind(await sealedForms(rootDir, project.pool))).toEqual(ALL_K2);
    expect(await addresses()).toEqual(addressesBefore);
    for (const object of formsBefore.objects) expect(await exists(path.join(rootDir, object.path))).toBe(false);
    expect(await readEverything(project.pool, host.protection(), project)).toEqual(before);
  });

  it("catches an item a stale process seals under the old key after the main pass", async () => {
    const host = new SwitchableHost();
    const project = await sealedProject(rootDir, host);
    pools.push(project.pool);
    host.current = "k2";
    let late = "";
    const result = await reseal(project.pool, host.protection(), {
      seams: {
        afterMainPass: async () => {
          const stale = host.pinned("k1");
          await writeTrace(project.pool, stale, "trace-late", "late");
          const content = await AutomationStudioProjectContentStore.open({ pool: project.pool, projectId: PROJECT, protection: stale });
          try {
            late = (await content.putBytes({ content: Buffer.from("written late under k1"), mediaType: "text/plain", protect: true })).object.objectId;
          } finally {
            await content.close();
          }
          expect(keyIdsByKind(await sealedForms(rootDir, project.pool)).manifests).toEqual(["k1", "k2"]);
        }
      }
    });
    expect(result.complete).toBe(true);
    expect(result.passes).toBeGreaterThanOrEqual(2);
    host.keys.delete("k1");
    expect(keyIdsByKind(await sealedForms(rootDir, project.pool))).toEqual(ALL_K2);
    const reads = await readEverything(project.pool, host.protection(), { objectId: late, traceIds: [...project.traceIds, "trace-late"] });
    expect(Buffer.from(reads.object, "base64").toString("utf8")).toBe("written late under k1");
    expect(reads.traces["trace-late"]!.events.length).toBeGreaterThan(0);
  });

  it("refuses to retire the host's current key before writing anything", async () => {
    const host = new SwitchableHost();
    const project = await sealedProject(rootDir, host);
    pools.push(project.pool);
    const formsBefore = await sealedForms(rootDir, project.pool);
    const filesBefore = (await filesUnder(rootDir)).map((file) => file.name).sort();

    await expect(reseal(project.pool, host.protection())).rejects.toThrow("still seals under retiring key k1");

    expect(await sealedForms(rootDir, project.pool)).toEqual(formsBefore);
    expect((await filesUnder(rootDir)).map((file) => file.name).sort()).toEqual(filesBefore);
    expect(await withDatabase(project.pool, (database) => database.get("select count(*) as n from object_pending_removals"))).toEqual({ n: 0 });
  });

  it("reports an item that does not open, by kind and id, and leaves it as it is", async () => {
    const host = new SwitchableHost();
    const project = await sealedProject(rootDir, host);
    pools.push(project.pool);
    const formsBefore = await sealedForms(rootDir, project.pool);
    const chunk = formsBefore.chunks[0]!;
    const damaged = Buffer.from(chunk.stored);
    damaged[0] = damaged[0]! ^ 1;
    await withDatabase(project.pool, (database) => database.run("update client_gateway_trace_chunks set stored = ? where digest = ?", [damaged, Buffer.from(chunk.id, "hex")]));
    const object = formsBefore.objects.find((item) => item.id === project.objectId)!;
    await writeFile(path.join(rootDir, object.path), Buffer.alloc(object.bytes.byteLength, 7));

    host.current = "k2";
    const result = await reseal(project.pool, host.protection());

    expect([...result.unreadable].sort((a, b) => a.kind.localeCompare(b.kind))).toEqual([{ kind: "chunk", id: chunk.id }, { kind: "object", id: project.objectId }]);
    expect(result.complete).toBe(true);
    expect(result.resealed.chunks).toBe(formsBefore.chunks.length - 1);
    expect(result.resealed.objects).toBe(formsBefore.objects.length - 1);
    const after = await sealedForms(rootDir, project.pool);
    expect(after.chunks.find((item) => item.id === chunk.id)).toEqual({ id: chunk.id, keyId: "k1", stored: damaged });
    expect(after.objects.find((item) => item.id === project.objectId)).toMatchObject({ keyId: "k1", path: object.path });
    expect(JSON.stringify(result)).not.toContain(object.path);
  });

  it("leaves no old sealed form in any file under the storage root", async () => {
    const host = new SwitchableHost();
    const project = await sealedProject(rootDir, host);
    pools.push(project.pool);
    const formsBefore = await sealedForms(rootDir, project.pool);
    host.current = "k2";
    const result = await reseal(project.pool, host.protection());
    expect(result.scrub).toMatchObject({ status: "done" });
    await project.pool.closeAll();

    const needles = [
      ...formsBefore.objects.map((item) => ({ label: `object ${item.id}`, bytes: item.bytes.subarray(0, 24) })),
      ...formsBefore.chunks.map((item) => ({ label: `chunk ${item.id}`, bytes: item.stored.subarray(0, 24) })),
      ...formsBefore.chunks.map((item) => ({ label: `chunk tail ${item.id}`, bytes: item.stored.subarray(item.stored.byteLength - 24) })),
      ...formsBefore.manifests.map((item) => ({ label: `manifest ${item.id}`, bytes: Buffer.from(item.text.slice(0, 60), "utf8") })),
      ...formsBefore.addressKeys.map((item) => ({ label: `address key ${item.id}`, bytes: item.sealed }))
    ];
    expect(needles.length).toBeGreaterThan(8);
    const files = await filesUnder(rootDir);
    expect(files.some((file) => file.name.endsWith("project.sqlite"))).toBe(true);
    const found = needles.flatMap((needle) => files.filter((file) => file.bytes.includes(needle.bytes)).map((file) => `${needle.label} in ${path.basename(file.name)}`));
    expect(found).toEqual([]);
  });

  it("refuses a provider that cannot name the key of a sealed form", async () => {
    const host = new SwitchableHost();
    const project = await sealedProject(rootDir, host);
    pools.push(project.pool);
    host.current = "k2";
    const full = host.protection();
    const bare: AutomationStudioProjectContentProtection = { providerId: full.providerId, seal: (input) => full.seal(input), open: (input) => full.open(input) };
    await expect(reseal(project.pool, bare)).rejects.toThrow("sealedKeyId");
    expect(keyIdsByKind(await sealedForms(rootDir, project.pool))).toEqual(ALL_K1);
  });
});
