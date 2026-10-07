import { expect, it, vi } from "vitest";
import { canonicalFixture } from "./fixture.ts";
import { AutomationStudioProjectAuthorityGuardStore as Guard } from "../../project/authority-guard/index.ts";
import { AutomationStudioProjectDatabasePool as Pool } from "../../project/index.ts";

it("deferred own-operation effect leaves both claims pending and global capture refuses", async () => {
  await canonicalFixture(async ({ create, owners, coordinator }) => {
    const original = await create(); await coordinator.perform(original, original.document, false);
    expect(await owners.reconcile(original.record.request.operationKey)).toMatchObject({ phase: "effect_applied", projectReceipt: null });
    await expect(coordinator.beginCapture("original-project", "capture-after-nested", 1)).rejects.toThrow("unresolved");
    await expect(coordinator.perform(original, original.document)).rejects.toThrow("project_pending");
  });
});
it("holds unresolved global claim after effect failure and never allows capture", async () => {
  await canonicalFixture(async ({ create, owners, coordinator }) => {
    const original = await create(); vi.spyOn(owners, "effect").mockRejectedValueOnce(new Error("isolated effect failure"));
    await expect(coordinator.perform(original, original.document)).rejects.toThrow("isolated effect failure");
    expect(await owners.reconcile(original.record.request.operationKey)).toMatchObject({ phase: "project_claimed", effect: null, projectReceipt: null });
    await expect(coordinator.beginCapture("original-project", "capture-after-failure", 0)).rejects.toThrow("unresolved");
  });
});
it("global-only finalization failure remains unresolved despite actual project completion", async () => {
  await canonicalFixture(async ({ create, owners, coordinator }) => {
    const original = await create(); vi.spyOn(owners, "finalize").mockRejectedValueOnce(new Error("lost global completion"));
    await expect(coordinator.perform(original, original.document)).rejects.toThrow("lost global completion");
    expect(await coordinator.reconcile(original.record.request.operationKey)).toMatchObject({ phase: "effect_applied", projectReceipt: null, projectParticipant: "completed", actualProjectReceipt: { projectId: "original-project" } });
    await expect(coordinator.beginCapture("original-project", "capture-after-project-complete", 1)).rejects.toThrow("unresolved");
  });
});
it("installs global fence then exact project fence after completed operation", async () => {
  await canonicalFixture(async ({ create, owners, coordinator }) => {
    const original = await create(); await coordinator.perform(original, original.document);
    expect(await coordinator.beginCapture("original-project", "coordinated-capture", 1)).toMatchObject({ globalCaptureDigest: expect.stringMatching(/^sha256:/), projectCaptureDigest: expect.stringMatching(/^sha256:/) });
    await expect(owners.reserve("automation.flows", original.document.flowId, "delete", null)).rejects.toThrow("capturing");
  });
});
it("reconciles a lost acknowledgement only from both actual committed receipts", async () => {
  await canonicalFixture(async ({ create, owners, coordinator }) => {
    const original = await create(), actualFinalize = owners.finalize.bind(owners);
    vi.spyOn(owners, "finalize").mockImplementationOnce(async (...args) => { await actualFinalize(...args); throw new Error("lost finalization acknowledgement"); });
    await expect(coordinator.perform(original, original.document)).rejects.toThrow("lost finalization acknowledgement");
    expect(await coordinator.reconcile(original.record.request.operationKey)).toMatchObject({ phase: "completed", projectParticipant: "completed", projectReceipt: { projectId: "original-project" }, actualProjectReceipt: { projectId: "original-project" } });
    expect(await coordinator.beginCapture("original-project", "after-reconciled-receipts", 1)).toHaveProperty("projectCaptureDigest");
  });
});
it("closes the owned pool when guard opening fails while retaining global reservation", async () => {
  await canonicalFixture(async ({ create, owners, coordinator }) => {
    const original = await create(), closePool = vi.spyOn(Pool.prototype, "closeAll"), opening = vi.spyOn(Guard, "open").mockRejectedValueOnce(new Error("guard open failed"));
    try {
      await expect(coordinator.perform(original, original.document)).rejects.toThrow("guard open failed");
      expect(closePool).toHaveBeenCalled(); expect(await owners.reconcile(original.record.request.operationKey)).toMatchObject({ phase: "reserved" });
    } finally { opening.mockRestore(); closePool.mockRestore(); }
  });
});
it("attempts both closes and preserves original effect error with cleanup failure", async () => {
  await canonicalFixture(async ({ create, owners, coordinator }) => {
    const original = await create(), actualClose = Guard.prototype.close;
    const closeGuard = vi.spyOn(Guard.prototype, "close").mockImplementationOnce(async function (this: Guard) { await actualClose.call(this); throw new Error("guard close failed"); });
    const closePool = vi.spyOn(Pool.prototype, "closeAll"), effect = vi.spyOn(owners, "effect").mockRejectedValueOnce(new Error("original effect failed"));
    try {
      let failure: unknown; try { await coordinator.perform(original, original.document); } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(AggregateError); expect((failure as AggregateError).errors.map(error => error.message)).toEqual(["original effect failed", "guard close failed"]); expect(closePool).toHaveBeenCalled();
      expect(await owners.reconcile(original.record.request.operationKey)).toMatchObject({ phase: "project_claimed" });
    } finally { closeGuard.mockRestore(); closePool.mockRestore(); effect.mockRestore(); }
  });
});
