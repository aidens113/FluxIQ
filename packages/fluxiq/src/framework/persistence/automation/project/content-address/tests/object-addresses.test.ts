// @fluxiq-test-group real-sql
// Keyed addresses on sealed content-store objects (t745 design note D2): equal
// sealed content dedupes within a project through its keyed address, the
// address never repeats across projects and never exposes a plain digest, and
// every sealed read checks it.
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { automationStudioContentObjectAddress, openAutomationStudioContentAddressKeyring } from "../index.ts";
import { hostProtection, keylessProtection, makeTempRoot, openTestProject, storedKeyRows } from "./keyring-fixture.ts";
import { clearSealedAddresses, filesContaining, objectRows, openStore, referenceCount, withDatabase } from "./object-address-fixture.ts";

let root: Awaited<ReturnType<typeof makeTempRoot>>;

beforeEach(async () => {
  root = await makeTempRoot();
});
afterEach(async () => root.remove());

const owner = (ownerId: string) => ({ ownerKind: "test_owner", ownerId, purpose: "payload" });

describe("sealed content-store objects with keyed addresses", () => {
  it("dedupes equal sealed bytes and media type into one object with two references, but not across media types", async () => {
    const opened = await openStore({ rootDir: root.rootDir, projectId: "project.dedupe", protection: hostProtection() });
    const content = Buffer.from("{\"prompt\":\"equal sealed content\"}");
    const first = await opened.store.putBytes({ content, mediaType: "application/json", protect: true, owner: owner("a"), createdAt: 1 });
    const second = await opened.store.putBytes({ content, mediaType: " Application/JSON ", protect: true, owner: owner("b"), createdAt: 2 });
    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);
    expect(second.object.objectId).toBe(first.object.objectId);
    expect(second.contentPath).toBe(first.contentPath);
    expect(second.reference).toMatchObject({ objectId: first.object.objectId, ownerId: "b" });
    expect(await referenceCount(opened.pool, "project.dedupe", first.object.objectId)).toBe(2);

    const otherType = await opened.store.putBytes({ content, mediaType: "text/plain", protect: true, owner: owner("c"), createdAt: 3 });
    expect(otherType.deduped).toBe(false);
    expect(otherType.object.objectId).not.toBe(first.object.objectId);
    expect(otherType.object.contentAddress).not.toBe(first.object.contentAddress);

    const rows = await objectRows(opened.pool, "project.dedupe");
    expect(rows).toHaveLength(2);
    await expect(opened.store.readBytesByObjectId(first.object.objectId)).resolves.toMatchObject({ content });
    await opened.close();
  });

  it("leaves unsealed puts unaddressed and deduped by their plain digest, as before", async () => {
    const opened = await openStore({ rootDir: root.rootDir, projectId: "project.plain", protection: hostProtection() });
    const first = await opened.store.putBytes({ content: Buffer.from("plain bytes"), mediaType: "text/plain", createdAt: 1 });
    const second = await opened.store.putBytes({ content: Buffer.from("plain bytes"), mediaType: "text/plain", createdAt: 2 });
    expect(first.object).toMatchObject({ encryption: null, contentAddress: null, contentAddressKeyId: null });
    expect(first.object.sha256).toBe(createHash("sha256").update("plain bytes").digest("hex"));
    expect(second.deduped).toBe(true);
    expect(second.object.objectId).toBe(first.object.objectId);
    await opened.close();

    const bare = await openStore({ rootDir: root.rootDir, projectId: "project.bare" });
    const unprotected = await bare.store.putBytes({ content: Buffer.from("plain bytes"), mediaType: "text/plain", createdAt: 1 });
    expect(unprotected.object).toMatchObject({ objectId: first.object.objectId, contentAddress: null, contentAddressKeyId: null });
    await bare.close();
  });

  it("stores a 64-hex address under the current key that recomputes from the plaintext", async () => {
    const protection = hostProtection();
    const opened = await openStore({ rootDir: root.rootDir, projectId: "project.address", protection });
    const content = Buffer.from("addressed content");
    const written = await opened.store.putBytes({ content, mediaType: "application/json", protect: true, createdAt: 1 });
    const keys = await withDatabase(opened.pool, "project.address", storedKeyRows);
    expect(keys).toHaveLength(1);
    expect(written.object.contentAddressKeyId).toBe(keys[0]!.keyId);
    expect(written.object.contentAddress).toMatch(/^[0-9a-f]{64}$/);
    const keyring = await withDatabase(opened.pool, "project.address", (database) => openAutomationStudioContentAddressKeyring({ database, projectId: "project.address", protection }));
    expect(written.object.contentAddress).toBe(automationStudioContentObjectAddress(keyring, keys[0]!.keyId, content, "application/json"));
    expect(written.object.contentAddress).not.toBe(createHash("sha256").update(content).digest("hex"));
    await opened.close();
  });

  it("keeps the plain SHA-256 of sealed content out of every file under the project directory", async () => {
    const opened = await openStore({ rootDir: root.rootDir, projectId: "project.probe", protection: hostProtection() });
    const content = Buffer.from("{\"secret\":\"probe content that must not be confirmable\"}");
    await opened.store.putBytes({ content, mediaType: "application/json", protect: true, owner: owner("probe"), createdAt: 1 });
    await opened.store.putBytes({ content, mediaType: "application/json", protect: true, owner: owner("probe.2"), createdAt: 2 });
    const digest = createHash("sha256").update(content).digest();
    const needles = [Buffer.from(digest.toString("hex"), "utf8"), Buffer.from(digest.toString("hex").toUpperCase(), "utf8"), digest, Buffer.from(content)];
    const projectDir = path.join(root.rootDir, "projects", "project.probe");
    expect(await filesContaining(projectDir, needles)).toEqual([]);
    await opened.close();
    expect(await filesContaining(projectDir, needles)).toEqual([]);
  });

  it("gives the same content different addresses in two projects under one host key", async () => {
    const protection = hostProtection();
    const content = Buffer.from("shared across projects");
    const one = await openStore({ rootDir: root.rootDir, projectId: "project.one", protection });
    const two = await openStore({ rootDir: root.rootDir, projectId: "project.two", protection });
    const first = await one.store.putBytes({ content, mediaType: "application/json", protect: true, createdAt: 1 });
    const second = await two.store.putBytes({ content, mediaType: "application/json", protect: true, createdAt: 1 });
    expect(first.object.contentAddress).toMatch(/^[0-9a-f]{64}$/);
    expect(second.object.contentAddress).toMatch(/^[0-9a-f]{64}$/);
    expect(second.object.contentAddress).not.toBe(first.object.contentAddress);
    await one.close();
    await two.close();
  });

  it("refuses to read a sealed object whose address was swapped with another row's, naming only the object id", async () => {
    const opened = await openStore({ rootDir: root.rootDir, projectId: "project.swap", protection: hostProtection() });
    const a = await opened.store.putBytes({ content: Buffer.from("content alpha"), mediaType: "application/json", protect: true, createdAt: 1 });
    const b = await opened.store.putBytes({ content: Buffer.from("content beta"), mediaType: "application/json", protect: true, createdAt: 2 });
    await withDatabase(opened.pool, "project.swap", async (database) => {
      await database.run("update objects set content_address = ? where object_id = ?", [b.object.contentAddress, a.object.objectId]);
      await database.run("update objects set content_address = ? where object_id = ?", [a.object.contentAddress, b.object.objectId]);
    });
    const failure = await opened.store.readBytesByObjectId(a.object.objectId).then(() => null, (error: unknown) => error as Error);
    expect(failure?.message).toBe(`Automation Studio object ${a.object.objectId} does not match its content address.`);
    expect(failure?.message).not.toContain("alpha");
    await expect(opened.store.readBytesByObjectId(b.object.objectId)).rejects.toThrow(`Automation Studio object ${b.object.objectId} does not match its content address.`);
    // A put of the same content finds the swapped row by address, sees it does not hold the content, and stores a fresh copy.
    const again = await opened.store.putBytes({ content: Buffer.from("content beta"), mediaType: "application/json", protect: true, createdAt: 3 });
    expect(again.deduped).toBe(false);
    await expect(opened.store.readBytesByObjectId(again.object.objectId)).resolves.toMatchObject({ content: Buffer.from("content beta") });
    await opened.close();
  });

  it("reads a sealed object that has no address yet", async () => {
    const protection = hostProtection();
    const writer = await openStore({ rootDir: root.rootDir, projectId: "project.legacy", protection });
    const written = await writer.store.putBytes({ content: Buffer.from("legacy sealed"), mediaType: "application/json", protect: true, createdAt: 1 });
    await clearSealedAddresses(writer.pool, "project.legacy");
    await writer.close();
    const reader = await openStore({ rootDir: root.rootDir, projectId: "project.legacy", protection, backfill: { maxBatches: 0 } });
    expect((await objectRows(reader.pool, "project.legacy"))[0]).toMatchObject({ contentAddress: null, contentAddressKeyId: null });
    await expect(reader.store.readBytesByObjectId(written.object.objectId)).resolves.toMatchObject({ content: Buffer.from("legacy sealed") });
    await reader.close();
  });

  it("refuses to open with a protection whose key does not resolve, and creates no key", async () => {
    await expect(openStore({ rootDir: root.rootDir, projectId: "project.keyless", protection: keylessProtection() })).rejects.toThrow("Protected project content key is unavailable.");
    const project = await openTestProject(root.rootDir, "project.keyless");
    expect(await storedKeyRows(project.database)).toEqual([]);
    await project.close();
  });

  it("removes an object only when nothing references it, with its file", async () => {
    const opened = await openStore({ rootDir: root.rootDir, projectId: "project.remove", protection: hostProtection() });
    const kept = await opened.store.putBytes({ content: Buffer.from("kept"), mediaType: "application/json", protect: true, owner: owner("keeper"), createdAt: 1 });
    const loose = await opened.store.putBytes({ content: Buffer.from("loose"), mediaType: "application/json", protect: true, createdAt: 2 });
    await expect(opened.store.removeIfUnreferenced(kept.object.objectId)).resolves.toBe(false);
    await expect(readFile(kept.contentPath)).resolves.toBeInstanceOf(Buffer);
    await expect(opened.store.readBytesByObjectId(kept.object.objectId)).resolves.toMatchObject({ content: Buffer.from("kept") });

    await expect(opened.store.removeIfUnreferenced(loose.object.objectId)).resolves.toBe(true);
    await expect(access(loose.contentPath)).rejects.toThrow();
    expect((await objectRows(opened.pool, "project.remove")).map((row) => row.objectId)).toEqual([kept.object.objectId]);
    await expect(opened.store.removeIfUnreferenced(loose.object.objectId)).resolves.toBe(false);
    await opened.close();
  });
});
