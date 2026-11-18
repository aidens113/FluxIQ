import { describe, expect, it } from "vitest";
import { accountInput, createProvisioningHarness } from "./provisioning-fixture.ts";

// The deletion cascade through its one hook: clients, custody, billing,
// environments, then the workspace data, in that order and keyed by the
// receipt id. A step that must wait (a busy workspace, a provider outage)
// turns the deletion into a scheduled one due at once, which the sweep
// finishes; it never fails the deletion and never runs a step twice in a way
// that matters (the receipt id keys billing and the purge).

const ORG = "org-shared";

async function personWithPersonalAndShared() {
  const harness = await createProvisioningHarness({ organisation: true });
  await harness.services.store.putWorkspace({ workspaceId: ORG, kind: "organisation", ownerUserId: null, createdAtMs: 1 });
  const admin = await harness.services.provisioning.run("createAccount", accountInput({ requestId: "create-admin", email: "admin@example.test", policies: ["FluxIQAdministratorAccess"], workspace: ORG }), harness.inProcess);
  if (!admin.ok || admin.result.status !== "created") throw new Error("expected created");
  const created = await harness.services.provisioning.run("createAccount", accountInput(), harness.inProcess);
  if (!created.ok || created.result.status !== "created") throw new Error("expected created");
  const { userId, workspaceId: personal } = created.result;
  const added = await harness.services.provisioning.run("addMember", { requestId: "add", userId, workspaceId: ORG, policies: ["FluxIQUserAccess"] }, harness.inProcess);
  if (!added.ok) throw new Error("expected added");
  harness.steps.length = 0;
  harness.revokedClients.length = 0;
  return { harness, userId, personal, adminId: admin.result.userId };
}

describe("completeAccountDeletion", () => {
  it("runs the cascade in order, keyed by the receipt id, and leaves the shared workspace's other people alone", async () => {
    const { harness, userId, personal, adminId } = await personWithPersonalAndShared();
    const answer = await harness.services.provisioning.run("deleteAccount", { requestId: "del-1", userId, mode: "immediate" }, harness.http);
    if (!answer.ok) throw new Error("expected deleted");
    expect(answer.result.status).toBe("deleted");
    const receiptId = answer.result.receipt.receiptId;
    const custody = harness.steps.filter((step) => step.startsWith("dropWorkspaceCustody:")).sort();
    expect(custody).toEqual([`dropWorkspaceCustody:${ORG}`, `dropWorkspaceCustody:${personal}`].sort());
    expect(harness.steps.filter((step) => !step.startsWith("dropWorkspaceCustody:"))).toEqual([
      "revokeConnectedClients:account_deleted",
      `closeBilling:${userId}`,
      `purgeEnvironments:${userId}`,
      `deleteWorkspaceData:${personal}`
    ]);
    expect(harness.steps.indexOf("revokeConnectedClients:account_deleted")).toBe(0);
    expect(harness.steps.indexOf(`closeBilling:${userId}`)).toBe(3);
    expect(harness.billingClosed).toEqual([{ accountId: userId, operationId: receiptId }]);
    expect(harness.purgedEnvironments).toEqual([{ accountId: userId, workspaceIds: [personal], operationId: receiptId }]);
    expect(harness.deletedWorkspaces).toEqual([personal]);
    expect(await harness.services.store.getAccount(userId)).toBeNull();
    expect(await harness.services.store.getWorkspace(ORG)).not.toBeNull();
    expect(await harness.services.store.getMembership(ORG, adminId)).toMatchObject({ status: "active", policies: ["FluxIQAdministratorAccess"] });
  });

  it("answers scheduled for a busy personal workspace, and the sweep finishes it once the work has ended", async () => {
    const { harness, userId, personal } = await personWithPersonalAndShared();
    harness.busyWorkspaces.add(personal);
    const answer = await harness.services.provisioning.run("deleteAccount", { requestId: "del-1", userId, mode: "immediate" }, harness.http);
    if (!answer.ok) throw new Error("expected an answer");
    expect(answer.result).toEqual({
      status: "scheduled",
      receipt: { receiptId: expect.any(String), userId, mode: "immediate", requestedAt: harness.clock.nowMs, scheduledFor: harness.clock.nowMs, completedAt: null, workspaceIds: [personal] }
    });
    const receiptId = answer.result.receipt.receiptId;
    // Everything up to the workspace is done: the person cannot sign in or reach anything, and nothing more is billed.
    expect(harness.identity.users.has(userId)).toBe(false);
    expect(harness.revokedClients).toEqual([{ userId, reason: "account_deleted" }]);
    expect(harness.billingClosed).toEqual([{ accountId: userId, operationId: receiptId }]);
    expect(await harness.services.store.getAccount(userId)).toMatchObject({ status: "deleted", deletion: { receiptId, scheduledForMs: harness.clock.nowMs } });
    expect(await harness.services.store.getWorkspace(personal)).not.toBeNull();

    // The run is still going: the sweep leaves it scheduled, without failing.
    expect(await harness.services.provisioning.runDueDeletions(harness.clock.nowMs)).toBe(0);
    harness.busyWorkspaces.delete(personal);
    expect(await harness.services.provisioning.runDueDeletions(harness.clock.nowMs)).toBe(1);
    expect(await harness.services.store.getAccount(userId)).toBeNull();
    expect(await harness.services.store.getWorkspace(personal)).toBeNull();
    expect(harness.deletedWorkspaces).toEqual([personal]);
    // Every attempt used the same receipt id, so the provider sees one operation.
    expect(new Set(harness.billingClosed.map((call) => call.operationId))).toEqual(new Set([receiptId]));
    expect(new Set(harness.purgedEnvironments.map((call) => call.operationId))).toEqual(new Set([receiptId]));
  });

  it("answers scheduled when the payment provider does not answer, and the retry completes it under the same receipt", async () => {
    const { harness, userId, personal } = await personWithPersonalAndShared();
    harness.billing.unavailable = true;
    const answer = await harness.services.provisioning.run("deleteAccount", { requestId: "del-1", userId, mode: "immediate" }, harness.http);
    if (!answer.ok) throw new Error("expected an answer");
    expect(answer.result.status).toBe("scheduled");
    expect(harness.purgedEnvironments).toEqual([]);
    expect(harness.deletedWorkspaces).toEqual([]);
    harness.billing.unavailable = false;
    expect(await harness.services.provisioning.runDueDeletions(harness.clock.nowMs)).toBe(1);
    expect(harness.billingClosed).toEqual([{ accountId: userId, operationId: answer.result.receipt.receiptId }]);
    expect(harness.deletedWorkspaces).toEqual([personal]);
  });

  it("brings a scheduled deletion forward: a step that must wait makes it due at once, under its own receipt", async () => {
    const { harness, userId, personal } = await personWithPersonalAndShared();
    const scheduled = await harness.services.provisioning.run("deleteAccount", { requestId: "del-s", userId, mode: "scheduled" }, harness.http);
    if (!scheduled.ok) throw new Error("expected scheduled");
    harness.clock.advance(1000);
    harness.busyWorkspaces.add(personal);
    const now = await harness.services.provisioning.run("deleteAccount", { requestId: "del-i", userId, mode: "immediate" }, harness.http);
    if (!now.ok) throw new Error("expected an answer");
    expect(now.result).toMatchObject({ status: "scheduled", receipt: { receiptId: scheduled.result.receipt.receiptId, requestedAt: scheduled.result.receipt.requestedAt, scheduledFor: harness.clock.nowMs } });
    harness.busyWorkspaces.delete(personal);
    expect(await harness.services.provisioning.runDueDeletions(harness.clock.nowMs)).toBe(1);
    expect(harness.billingClosed.map((call) => call.operationId)).toEqual([scheduled.result.receipt.receiptId, scheduled.result.receipt.receiptId]);
  });

  it("surfaces an error that is not a wait, and keeps the deletion scheduled for the sweep", async () => {
    const { harness, userId } = await personWithPersonalAndShared();
    const original = harness.services.store.deleteWorkspace.bind(harness.services.store);
    let failing = true;
    harness.services.store.deleteWorkspace = async (workspaceId) => {
      if (failing) throw new Error("synthetic store failure");
      return original(workspaceId);
    };
    await expect(harness.services.provisioning.run("deleteAccount", { requestId: "del-1", userId, mode: "immediate" }, harness.http)).rejects.toThrow("synthetic store failure");
    const stored = await harness.services.store.getAccount(userId);
    expect(stored).toMatchObject({ status: "deleted", deletion: { scheduledForMs: harness.clock.nowMs } });
    await expect(harness.services.provisioning.runDueDeletions(harness.clock.nowMs)).rejects.toThrow(AggregateError);
    failing = false;
    expect(await harness.services.provisioning.runDueDeletions(harness.clock.nowMs)).toBe(1);
    expect(await harness.services.store.getAccount(userId)).toBeNull();
    expect(new Set(harness.billingClosed.map((call) => call.operationId))).toEqual(new Set([stored?.deletion?.receiptId]));
  });
});
