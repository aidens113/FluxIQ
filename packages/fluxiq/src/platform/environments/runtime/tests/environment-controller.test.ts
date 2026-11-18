// @fluxiq-test-group real-sql
import { afterEach, expect, it } from "vitest";
import { EnvironmentRefusal } from "../../model/index.ts";
import { SQLiteEnvironmentStore } from "../../storage/index.ts";
import { FakeEnvironmentDriver } from "../index.ts";
import { command, dedicatedGrant, entitle, harness, ownerA, ownerB, removeHarnessRoots, subscription } from "./fixtures.ts";

afterEach(removeHarnessRoots);

function steps(driver: FakeEnvironmentDriver, step: string): number {
  return driver.calls.filter((call) => call.step === step).length;
}

it("creates a running environment, recorded durably under its operation id", async () => {
  const state = await harness();
  entitle(state, ownerA, ["env-a"]);
  const record = await state.controller.create(command(ownerA, "env-a", "op-create"));
  expect(record).toEqual({
    environmentId: "env-a", accountId: "account-a", workspaceId: "workspace-a",
    driver: "fake", desired: "running", observed: "running", operationId: "op-create"
  });
  expect(state.driver.observation("env-a")).toBe("running");
  const reopened = new SQLiteEnvironmentStore({ rootDir: state.rootDir });
  expect(await reopened.get("env-a")).toEqual(record);
  expect(await state.controller.get({ actor: ownerA, workspaceId: "workspace-a", environmentId: "env-a" })).toEqual(record);
});

it("replays a duplicate create without allocating again, and refuses the id's reuse or a second create", async () => {
  const state = await harness();
  entitle(state, ownerA, ["env-a"]);
  const first = await state.controller.create(command(ownerA, "env-a", "op-create"));
  const again = await state.controller.create(command(ownerA, "env-a", "op-create"));
  expect(again).toEqual(first);
  expect(steps(state.driver, "allocate")).toBe(1);
  expect(steps(state.driver, "start")).toBe(1);
  await expect(state.controller.stop(command(ownerA, "env-a", "op-create"))).rejects.toMatchObject({ code: "operation-reused" });
  await expect(state.controller.create(command(ownerA, "env-a", "op-other"))).rejects.toMatchObject({ code: "environment-exists" });
  expect(state.driver.observation("env-a")).toBe("running");
  // Two concurrent creates with one id allocate once.
  entitle(state, ownerA, ["env-b"]);
  const [left, right] = await Promise.all([
    state.controller.create(command(ownerA, "env-b", "op-b")),
    state.controller.create(command(ownerA, "env-b", "op-b"))
  ]);
  expect(left).toEqual(right);
  expect(state.driver.calls.filter((call) => call.step === "allocate" && call.environmentId === "env-b")).toHaveLength(1);
});

it("stops and starts again, admitting every start and never a stop", async () => {
  const state = await harness();
  entitle(state, ownerA, ["env-a"]);
  await state.controller.create(command(ownerA, "env-a", "op-1"));
  expect(state.admissions).toBe(1);
  expect(await state.controller.stop(command(ownerA, "env-a", "op-2"))).toMatchObject({ desired: "stopped", observed: "stopped", operationId: "op-2" });
  expect(state.admissions).toBe(1);
  expect(state.driver.observation("env-a")).toBe("stopped");
  expect(await state.controller.start(command(ownerA, "env-a", "op-3"))).toMatchObject({ desired: "running", observed: "running", operationId: "op-3" });
  expect(state.admissions).toBe(2);
  // Replaying the superseded stop answers what stands and stops nothing.
  expect(await state.controller.stop(command(ownerA, "env-a", "op-2"))).toMatchObject({ desired: "running", operationId: "op-3" });
  expect(state.driver.observation("env-a")).toBe("running");
  // A stop survives a lapsed subscription: releasing never needs a paid entitlement.
  state.subscriptions.splice(0);
  expect(await state.controller.stop(command(ownerA, "env-a", "op-4"))).toMatchObject({ observed: "stopped" });
  await expect(state.controller.start(command(ownerA, "env-a", "op-5"))).rejects.toMatchObject({ code: "admission-refused", admission: "subscription-required" });
});

it("deletes by releasing every resource, keeps the deleted record, and can create the id again", async () => {
  const state = await harness();
  entitle(state, ownerA, ["env-a"]);
  await state.controller.create(command(ownerA, "env-a", "op-1"));
  const deleted = await state.controller.delete(command(ownerA, "env-a", "op-2"));
  expect(deleted).toMatchObject({ desired: "deleted", observed: "deleted", operationId: "op-2" });
  expect(state.driver.observation("env-a")).toBe("absent");
  expect(await state.controller.delete(command(ownerA, "env-a", "op-2"))).toEqual(deleted);
  expect(await state.controller.delete(command(ownerA, "env-a", "op-3"))).toMatchObject({ observed: "deleted" });
  expect(steps(state.driver, "release")).toBe(1);
  await expect(state.controller.start(command(ownerA, "env-a", "op-4"))).rejects.toMatchObject({ code: "environment-deleted" });
  await expect(state.controller.stop(command(ownerA, "env-a", "op-5"))).rejects.toMatchObject({ code: "environment-deleted" });
  expect(await state.controller.create(command(ownerA, "env-a", "op-6"))).toMatchObject({ desired: "running", observed: "running" });
});

it("restarts a crashed environment on reconcile, including after an engine restart", async () => {
  const state = await harness();
  entitle(state, ownerA, ["env-a", "env-b"]);
  await state.controller.create(command(ownerA, "env-a", "op-a"));
  await state.controller.create(command(ownerA, "env-b", "op-b"));
  await state.controller.stop(command(ownerA, "env-b", "op-b2"));
  state.driver.crash("env-a");
  expect(await state.controller.reconcile("env-a")).toMatchObject({ desired: "running", observed: "running", operationId: "op-a" });
  expect(state.driver.observation("env-a")).toBe("running");
  state.driver.crash("env-a");
  const restarted = await harness({ rootDir: state.rootDir, driver: state.driver });
  const records = await restarted.controller.reconcileAll();
  expect(records.map((record) => [record.environmentId, record.observed])).toEqual([["env-a", "running"], ["env-b", "stopped"]]);
  expect(restarted.admissions).toBe(0);
});

it("never allocates on reconcile: resources lost while running wait for an admitted start", async () => {
  const state = await harness();
  entitle(state, ownerA, ["env-a"]);
  await state.controller.create(command(ownerA, "env-a", "op-1"));
  await state.driver.release({ environmentId: "env-a", accountId: "account-a", workspaceId: "workspace-a" });
  expect(await state.controller.reconcile("env-a")).toMatchObject({ desired: "running", observed: "absent" });
  expect(steps(state.driver, "allocate")).toBe(1);
  expect(await state.controller.start(command(ownerA, "env-a", "op-2"))).toMatchObject({ observed: "running" });
  expect(steps(state.driver, "allocate")).toBe(2);
});

it("cleans up a failed allocation, and a retry with the same id allocates", async () => {
  const state = await harness();
  entitle(state, ownerA, ["env-a"]);
  const failure = new Error("image pull failed");
  state.driver.failNext("allocate", failure, { leavePartial: true });
  await expect(state.controller.create(command(ownerA, "env-a", "op-1"))).rejects.toBe(failure);
  expect(state.driver.observation("env-a")).toBe("absent");
  expect(await state.store.get("env-a")).toMatchObject({ desired: "running", observed: "absent", operationId: "op-1" });
  expect(await state.controller.create(command(ownerA, "env-a", "op-1"))).toMatchObject({ observed: "running" });
});

it("records partial resources when cleanup also fails, and reconcile releases them", async () => {
  const state = await harness();
  entitle(state, ownerA, ["env-a"]);
  state.driver.failNext("allocate", new Error("network create failed"), { leavePartial: true });
  state.driver.failNext("release", new Error("daemon unavailable"));
  const failed = await state.controller.create(command(ownerA, "env-a", "op-1")).then(() => null, (error: unknown) => error);
  expect(failed).toBeInstanceOf(AggregateError);
  expect(await state.store.get("env-a")).toMatchObject({ observed: "partial" });
  expect(await state.controller.reconcile("env-a")).toMatchObject({ desired: "running", observed: "absent" });
  expect(state.driver.observation("env-a")).toBe("absent");
});

it("refuses without a grant naming the environment, before any record or driver call", async () => {
  const state = await harness();
  state.ownership.set("env-a", { accountId: "account-a", workspaceId: "workspace-a" });
  await expect(state.controller.create(command(ownerA, "env-a", "op-1"))).rejects.toMatchObject({ code: "admission-refused", admission: "subscription-required" });
  state.subscriptions.push(subscription("account-a", [dedicatedGrant(["env-other"])]));
  const refused = await state.controller.create(command(ownerA, "env-a", "op-1")).then(() => null, (error: unknown) => error);
  expect(refused).toBeInstanceOf(EnvironmentRefusal);
  expect(refused).toMatchObject({ code: "admission-refused", admission: "entitlement-required" });
  // A shared target is never a dedicated environment, even when a shared grant admits it.
  state.ownership.set("env-shared", { accountId: "account-a", workspaceId: "workspace-a", allocation: "shared" });
  state.subscriptions.push(subscription("account-a", [{ ...dedicatedGrant([]), key: "cloud.shared", allocation: "shared" }]));
  await expect(state.controller.create(command(ownerA, "env-shared", "op-2"))).rejects.toMatchObject({ code: "not-dedicated" });
  expect(state.driver.calls).toEqual([]);
  expect(await state.store.listAll()).toEqual([]);
});

it("keeps tenants apart: another account cannot read, stop or delete an environment", async () => {
  const state = await harness();
  entitle(state, ownerA, ["env-a"]);
  await state.controller.create(command(ownerA, "env-a", "op-1"));
  const intruder = { ...ownerB, workspaceIds: ["workspace-a"] };
  await expect(state.controller.stop(command(intruder, "env-a", "op-x"))).rejects.toMatchObject({ code: "not-authorized" });
  await expect(state.controller.delete({ ...command(ownerB, "env-a", "op-y"), workspaceId: "workspace-a" })).rejects.toMatchObject({ code: "not-authorized" });
  await expect(state.controller.get({ actor: ownerB, workspaceId: "workspace-b", environmentId: "env-a" })).rejects.toMatchObject({ code: "not-authorized" });
  await expect(state.controller.stop(command(ownerA, "../env-a", "op-z"))).rejects.toMatchObject({ code: "invalid-request" });
  expect(state.driver.observation("env-a")).toBe("running");
});

it("cascades an account deletion: releases and erases its environments, leaving other accounts alone", async () => {
  const state = await harness();
  entitle(state, ownerA, ["env-a1", "env-a2", "env-a3"]);
  entitle(state, ownerB, ["env-b"]);
  await state.controller.create(command(ownerA, "env-a1", "op-1"));
  await state.controller.create(command(ownerA, "env-a2", "op-2"));
  await state.controller.stop(command(ownerA, "env-a2", "op-3"));
  await state.controller.create(command(ownerA, "env-a3", "op-4"));
  await state.controller.delete(command(ownerA, "env-a3", "op-5"));
  await state.controller.create(command(ownerB, "env-b", "op-1"));
  state.driver.failNext("release", new Error("daemon unavailable"));
  await expect(state.controller.purgeAccount("account-a", "purge-1")).rejects.toBeInstanceOf(AggregateError);
  expect((await state.store.listByAccount("account-a")).map((record) => [record.environmentId, record.desired])).toEqual([["env-a1", "deleted"]]);
  expect(await state.controller.purgeAccount("account-a", "purge-1")).toEqual(["env-a1"]);
  expect(await state.store.listByAccount("account-a")).toEqual([]);
  expect(await state.store.listByWorkspace("workspace-a")).toEqual([]);
  expect(["env-a1", "env-a2", "env-a3"].map((id) => state.driver.observation(id))).toEqual(["absent", "absent", "absent"]);
  expect(await state.store.get("env-b")).toMatchObject({ observed: "running" });
  expect(state.driver.observation("env-b")).toBe("running");
  expect(await state.controller.purgeWorkspace("workspace-b", "purge-2")).toEqual(["env-b"]);
  expect(await state.store.listAll()).toEqual([]);
});
