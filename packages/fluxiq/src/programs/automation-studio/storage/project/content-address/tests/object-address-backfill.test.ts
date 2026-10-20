// @fluxiq-test-group real-sql
// The open-time address backfill for sealed content-store objects (t745 design
// note D4 step 3, D5): rows written before 0033 or under a retired key are
// addressed under the current key, resumably, skipping (and counting) rows
// that do not verify, and never writing damage into a valid-looking address.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rotateAutomationStudioContentAddressKey } from "../index.ts";
import { hostProtection, makeTempRoot, openTestProject } from "./keyring-fixture.ts";
import { clearSealedAddresses, objectRows, openStore, withDatabase } from "./object-address-fixture.ts";

let root: Awaited<ReturnType<typeof makeTempRoot>>;

beforeEach(async () => {
  root = await makeTempRoot();
});
afterEach(async () => root.remove());

async function writeSealed(projectId: string, contents: readonly string[]) {
  const opened = await openStore({ rootDir: root.rootDir, projectId, protection: hostProtection() });
  const written = [];
  for (const [index, content] of contents.entries()) {
    written.push(await opened.store.putBytes({ content: Buffer.from(content), mediaType: "application/json", protect: true, owner: { ownerKind: "test_owner", ownerId: `owner.${index}`, purpose: "payload" }, createdAt: index + 1 }));
  }
  await opened.store.putBytes({ content: Buffer.from("plain neighbour"), mediaType: "text/plain", createdAt: 100 });
  const addresses = new Map((await objectRows(opened.pool, projectId)).map((row) => [row.objectId, { contentAddress: row.contentAddress, contentAddressKeyId: row.contentAddressKeyId }]));
  await clearSealedAddresses(opened.pool, projectId);
  await opened.close();
  return { written, addresses };
}

describe("content object address backfill", () => {
  it("addresses a migrated store's sealed rows on protected reopen exactly as a fresh write would, and reads verify", async () => {
    const { written, addresses } = await writeSealed("project.migrated", ["first sealed", "second sealed"]);
    const reopened = await openStore({ rootDir: root.rootDir, projectId: "project.migrated", protection: hostProtection() });
    const rows = await objectRows(reopened.pool, "project.migrated");
    for (const row of rows) {
      if (row.encryption === null) expect(row).toMatchObject({ contentAddress: null, contentAddressKeyId: null });
      else expect({ contentAddress: row.contentAddress, contentAddressKeyId: row.contentAddressKeyId }).toEqual(addresses.get(row.objectId));
    }
    await expect(reopened.store.readBytesByObjectId(written[0]!.object.objectId)).resolves.toMatchObject({ content: Buffer.from("first sealed") });
    await expect(reopened.store.readBytesByObjectId(written[1]!.object.objectId)).resolves.toMatchObject({ content: Buffer.from("second sealed") });
    await expect(reopened.store.backfillContentAddresses()).resolves.toMatchObject({ addressed: 0, skipped: 0, complete: true });
    // A fresh equal write now dedupes against the backfilled row.
    const again = await reopened.store.putBytes({ content: Buffer.from("first sealed"), mediaType: "application/json", protect: true, createdAt: 50 });
    expect(again).toMatchObject({ deduped: true, object: { objectId: written[0]!.object.objectId } });
    await reopened.close();
  });

  it("resumes an interrupted backfill on the next open", async () => {
    await writeSealed("project.interrupted", ["one", "two", "three"]);
    const partial = await openStore({ rootDir: root.rootDir, projectId: "project.interrupted", protection: hostProtection(), backfill: { batchSize: 1, maxBatches: 1 } });
    const unaddressed = async (pool: typeof partial.pool) => (await objectRows(pool, "project.interrupted")).filter((row) => row.encryption !== null && row.contentAddress === null).length;
    expect(await unaddressed(partial.pool)).toBe(2);
    await expect(partial.store.backfillContentAddresses({ batchSize: 1, maxBatches: 1 })).resolves.toMatchObject({ addressed: 1, skipped: 0, batches: 1, complete: false });
    expect(await unaddressed(partial.pool)).toBe(1);
    await partial.close();
    const resumed = await openStore({ rootDir: root.rootDir, projectId: "project.interrupted", protection: hostProtection() });
    expect(await unaddressed(resumed.pool)).toBe(0);
    await resumed.close();
  });

  it("skips and counts rows whose stored bytes or seal do not verify, and the store still opens", async () => {
    const { written } = await writeSealed("project.corrupt", ["intact", "flipped bytes", "bad seal"]);
    const [intact, flipped, badSeal] = written.map((write) => write.object);
    const file = await readFile(written[1]!.contentPath);
    file[0] = file[0]! ^ 0xff;
    await writeFile(written[1]!.contentPath, file);
    const envelope = JSON.parse(badSeal!.encryption!) as { tag: string };
    const tamperedTag = Buffer.alloc(16, 1).toString("base64url");
    expect(tamperedTag).not.toBe(envelope.tag);
    const project = await openTestProject(root.rootDir, "project.corrupt");
    await project.database.run("update objects set encryption = ? where object_id = ?", [JSON.stringify({ ...envelope, tag: tamperedTag }), badSeal!.objectId]);
    await project.close();

    const reopened = await openStore({ rootDir: root.rootDir, projectId: "project.corrupt", protection: hostProtection() });
    const rows = new Map((await objectRows(reopened.pool, "project.corrupt")).map((row) => [row.objectId, row]));
    expect(rows.get(intact!.objectId)?.contentAddress).toMatch(/^[0-9a-f]{64}$/);
    expect(rows.get(flipped!.objectId)).toMatchObject({ contentAddress: null, contentAddressKeyId: null });
    expect(rows.get(badSeal!.objectId)).toMatchObject({ contentAddress: null, contentAddressKeyId: null });
    const again = await reopened.store.backfillContentAddresses({ batchSize: 1 });
    expect(again).toMatchObject({ addressed: 0, skipped: 2, raced: 0, complete: true });
    expect([...again.skippedObjectIds].sort()).toEqual([flipped!.objectId, badSeal!.objectId].sort());
    await expect(reopened.store.readBytesByObjectId(flipped!.objectId)).rejects.toThrow("digest mismatch");
    await expect(reopened.store.readBytesByObjectId(badSeal!.objectId)).rejects.toThrow("authentication failed");
    await expect(reopened.store.readBytesByObjectId(intact!.objectId)).resolves.toMatchObject({ content: Buffer.from("intact") });
    await reopened.close();
  });

  it("rekeys rows on reopen after key rotation, dedupes new equal writes against them, and leaves a row whose old address fails", async () => {
    const protection = hostProtection();
    const first = await openStore({ rootDir: root.rootDir, projectId: "project.rotate", protection });
    const kept = await first.store.putBytes({ content: Buffer.from("rotated content"), mediaType: "application/json", protect: true, createdAt: 1 });
    const forged = await first.store.putBytes({ content: Buffer.from("forged address"), mediaType: "application/json", protect: true, createdAt: 2 });
    const oldKeyId = kept.object.contentAddressKeyId!;
    await withDatabase(first.pool, "project.rotate", (database) => database.run("update objects set content_address = ? where object_id = ?", ["0".repeat(64), forged.object.objectId]));
    await first.close();

    const project = await openTestProject(root.rootDir, "project.rotate");
    const { keyId: newKeyId } = await rotateAutomationStudioContentAddressKey({ database: project.database, projectId: "project.rotate", protection });
    await project.close();
    expect(newKeyId).not.toBe(oldKeyId);

    const reopened = await openStore({ rootDir: root.rootDir, projectId: "project.rotate", protection });
    const rows = new Map((await objectRows(reopened.pool, "project.rotate")).map((row) => [row.objectId, row]));
    const rekeyed = rows.get(kept.object.objectId)!;
    expect(rekeyed.contentAddressKeyId).toBe(newKeyId);
    expect(rekeyed.contentAddress).toMatch(/^[0-9a-f]{64}$/);
    expect(rekeyed.contentAddress).not.toBe(kept.object.contentAddress);
    expect(rows.get(forged.object.objectId)).toMatchObject({ contentAddress: "0".repeat(64), contentAddressKeyId: oldKeyId });
    await expect(reopened.store.readBytesByObjectId(kept.object.objectId)).resolves.toMatchObject({ content: Buffer.from("rotated content") });
    await expect(reopened.store.readBytesByObjectId(forged.object.objectId)).rejects.toThrow(`Automation Studio object ${forged.object.objectId} does not match its content address.`);

    const again = await reopened.store.putBytes({ content: Buffer.from("rotated content"), mediaType: "application/json", protect: true, createdAt: 3 });
    expect(again).toMatchObject({ deduped: true, object: { objectId: kept.object.objectId, contentAddressKeyId: newKeyId } });
    await expect(reopened.store.backfillContentAddresses()).resolves.toMatchObject({ addressed: 0, skipped: 1, skippedObjectIds: [forged.object.objectId], complete: true });
    await reopened.close();
    expect(path.isAbsolute(again.contentPath)).toBe(true);
  });
});
