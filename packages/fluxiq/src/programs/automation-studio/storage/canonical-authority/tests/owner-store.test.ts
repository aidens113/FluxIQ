import { expect, it } from "vitest";
import { rm } from "node:fs/promises";
import path from "node:path";
import { canonicalFixture } from "./fixture.ts";

it("commits reservation without duplicating raw documents and blocks same-project race", async () => {
  await canonicalFixture(async ({ create, owners, coordinator }) => {
    const original = await create(); expect(await owners.reconcile(original.record.request.operationKey)).toMatchObject({ phase: "reserved", effect: null });
    await expect(owners.reserve("automation.flows", original.document.flowId, "put", original.document)).rejects.toThrow("unresolved");
    expect(JSON.stringify(await owners.reconcile(original.record.request.operationKey))).not.toContain('"name"');
    await coordinator.perform(original, original.document);
    expect(await coordinator.reconcile(original.record.request.operationKey)).toMatchObject({ phase: "completed", projectReceipt: { projectId: "original-project" } });
  });
});
it("rejects foreign replacements, preserves original owner and permanent tombstone", async () => {
  await canonicalFixture(async ({ root, create, owners, coordinator }) => {
    const original = await create(); await coordinator.perform(original, original.document);
    await expect(owners.reserve("automation.flows", original.document.flowId, "put", { ...original.document, projectId: "foreign-project" })).rejects.toThrow("foreign_owner");
    await coordinator.mutate("automation.flows", original.document.flowId, "delete", null);
    expect(await owners.readOwner("automation.flows", original.document.flowId)).toMatchObject({ originalProjectId: "original-project", tombstoned: true, ownerRevision: 2 });
    await expect(owners.reserve("automation.flows", original.document.flowId, "put", original.document)).rejects.toThrow("tombstoned");
    await rm(path.join(root, "projects", "original-project"), { recursive: true });
    expect(await owners.readOwner("automation.flows", original.document.flowId)).toMatchObject({ originalProjectId: "original-project", tombstoned: true });
    await expect(owners.reserve("automation.flows", original.document.flowId, "put", original.document)).rejects.toThrow("tombstoned");
  });
});
it("does not issue capability for an absent project or accept fake capability", async () => {
  await canonicalFixture(async ({ create, owners }) => {
    await expect(create("missing-project")).rejects.toThrow("missing");
    await expect(owners.effect({} as never, null)).rejects.toThrow("capability");
  });
});

it("publication creation resolves stored original Flow owner and refuses foreign replacement", async () => {
  await canonicalFixture(async ({ create, owners, coordinator }) => {
    const original = await create(); await coordinator.perform(original, original.document);
    const creator = owners as unknown as { createPublication(flowId: string, contents: Record<string, unknown>): Promise<Awaited<ReturnType<typeof create>>> };
    await expect(creator.createPublication(original.document.flowId, { version: "1.0.0", projectId: "foreign-project", snapshot: { scope: { kind: "global" } } })).rejects.toThrow("publication_owner");
    const publication = await creator.createPublication(original.document.flowId, { version: "1.0.0", snapshot: { scope: { kind: "global" } } });
    await coordinator.perform(publication, publication.document);
    expect(await owners.readOwner("automation.flow_publications", `${original.document.flowId}@1.0.0`)).toMatchObject({ originalProjectId: "original-project", ownerRevision: 1 });
    await expect(owners.reserve("automation.flow_publications", `${original.document.flowId}@1.0.0`, "put", { ...publication.document, flowId: "foreign-flow" })).rejects.toThrow("publication_identity");
  });
});
it("rejects reassigning a publication to another valid Flow in the SAME original project", async () => {
  await canonicalFixture(async ({ create, owners, coordinator }) => {
    const first = await create(); await coordinator.perform(first, first.document);
    const second = await create(); await coordinator.perform(second, second.document);
    const creator = owners as unknown as { createPublication(flowId: string, contents: Record<string, unknown>): Promise<Awaited<ReturnType<typeof create>>> };
    const publication = await creator.createPublication(first.document.flowId, { version: "1.0.0", snapshot: { scope: { kind: "global" } } }); await coordinator.perform(publication, publication.document);
    await expect(owners.reserve("automation.flow_publications", `${first.document.flowId}@1.0.0`, "put", { ...publication.document, flowId: second.document.flowId })).rejects.toThrow("publication_identity");
    await expect(owners.reserve("automation.flow_publications", `${first.document.flowId}@1.0.0`, "put", { ...publication.document, version: "2.0.0" })).rejects.toThrow("publication_identity");
    await expect(owners.reserve("automation.flow_publications", `${first.document.flowId}@1.0.0`, "put", { ...publication.document, publicationId: "different-id" })).rejects.toThrow("publication_identity");
  });
});
