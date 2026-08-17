import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { automationStudioObjectApiPath, automationStudioObjectContentRef, parseAutomationStudioObjectContentRef, AutomationStudioObjectStore } from "./object-store.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("AutomationStudioObjectStore", () => {
  it("writes immutable digest-addressed JSON and verifies it on read", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-object-store-"));
    roots.push(root);
    const store = new AutomationStudioObjectStore(root);
    const first = await store.putJson("project.1", { payload: "value" });
    const second = await store.putJson("project.1", { payload: "value" });

    expect(second).toEqual(first);
    expect(await store.readJson(first)).toEqual({ payload: "value" });
    const raw = await readFile(path.join(root, first.$fluxiqObject.relativePath), "utf8");
    expect(JSON.parse(raw)).toEqual({ payload: "value" });
  });

  it("rewrites an indexed object when its backing file is missing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-object-store-"));
    roots.push(root);
    const store = new AutomationStudioObjectStore(root);
    const first = await store.putJson("project.1", { payload: "value" });
    await rm(path.join(root, first.$fluxiqObject.relativePath), { force: true });

    const second = await store.putJson("project.1", { payload: "value" });

    expect(second).toEqual(first);
    await expect(store.readJson(second)).resolves.toEqual({ payload: "value" });
  });

  it("stores binary visual assets with project-scoped digest lookup", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-object-store-"));
    roots.push(root);
    const store = new AutomationStudioObjectStore(root);
    const reference = await store.putBytes("project.1", Buffer.from([0x89, 0x50, 0x4e, 0x47]), "image/png");
    const asset = await store.readProjectObject("project.1", reference.$fluxiqObject.sha256);

    expect(asset.mediaType).toBe("image/png");
    expect(asset.content).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(store.contentRef("project.1", reference)).toBe(automationStudioObjectContentRef("project.1", reference.$fluxiqObject.sha256));
    expect(parseAutomationStudioObjectContentRef(store.contentRef("project.1", reference))).toEqual({ projectId: "project.1", sha256: reference.$fluxiqObject.sha256 });
    expect(parseAutomationStudioObjectContentRef(automationStudioObjectApiPath("project.1", reference.$fluxiqObject.sha256))).toEqual({ projectId: "project.1", sha256: reference.$fluxiqObject.sha256 });
    await expect(store.readProjectObject("project.2", reference.$fluxiqObject.sha256)).rejects.toThrow("not found");
  });

  it("stores recording-owned visual assets under the recording session folder", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-object-store-"));
    roots.push(root);
    const store = new AutomationStudioObjectStore(root);
    const reference = await store.putBytes("project.1", Buffer.from("recording-image"), "image/png", { recordingId: "recording.1" });

    expect(reference.$fluxiqObject.relativePath).toBe(`projects/project.1/recordings/sessions/recording.1/objects/${reference.$fluxiqObject.sha256}.png`);
    expect(reference.$fluxiqObject.recordingId).toBe("recording.1");
    await expect(store.readProjectObject("project.1", reference.$fluxiqObject.sha256)).resolves.toMatchObject({ content: Buffer.from("recording-image") });
  });

  it("serializes concurrent project index updates", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-object-store-"));
    roots.push(root);
    const store = new AutomationStudioObjectStore(root);
    const references = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      store.putBytes("project.1", Buffer.from(`image-${index}`), "image/png", { recordingId: "recording.1" })
    ));

    await Promise.all(references.map((reference, index) =>
      expect(store.readProjectObject("project.1", reference.$fluxiqObject.sha256)).resolves.toMatchObject({ content: Buffer.from(`image-${index}`) })
    ));
    const index = JSON.parse(await readFile(path.join(root, "projects", "project.1", "objects", "index.json"), "utf8")) as { objects: Record<string, unknown> };
    expect(Object.keys(index.objects).sort()).toEqual(references.map((reference) => reference.$fluxiqObject.sha256).sort());
  });

  it("deletes selected project objects from the index and storage", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-object-store-"));
    roots.push(root);
    const store = new AutomationStudioObjectStore(root);
    const deleted = await store.putBytes("project.1", Buffer.from("delete-me"), "image/png");
    const kept = await store.putBytes("project.1", Buffer.from("keep-me"), "image/png");

    await expect(store.deleteProjectObjects("project.1", [deleted.$fluxiqObject.sha256])).resolves.toEqual({ deleted: [deleted.$fluxiqObject.sha256] });

    await expect(store.readProjectObject("project.1", deleted.$fluxiqObject.sha256)).rejects.toThrow("not found");
    await expect(store.readProjectObject("project.1", kept.$fluxiqObject.sha256)).resolves.toMatchObject({ content: Buffer.from("keep-me") });
  });

  it("deletes recording-owned objects without touching protected shared references", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-object-store-"));
    roots.push(root);
    const store = new AutomationStudioObjectStore(root);
    const deleted = await store.putBytes("project.1", Buffer.from("delete-me"), "image/png", { recordingId: "recording.1" });
    const protectedObject = await store.putBytes("project.1", Buffer.from("keep-me"), "image/png", { recordingId: "recording.1" });

    await expect(store.deleteRecordingObjects("project.1", "recording.1", [protectedObject.$fluxiqObject.sha256])).resolves.toEqual({ deleted: [deleted.$fluxiqObject.sha256] });

    await expect(store.readProjectObject("project.1", deleted.$fluxiqObject.sha256)).rejects.toThrow("not found");
    await expect(store.readProjectObject("project.1", protectedObject.$fluxiqObject.sha256)).resolves.toMatchObject({ content: Buffer.from("keep-me") });
  });
});
