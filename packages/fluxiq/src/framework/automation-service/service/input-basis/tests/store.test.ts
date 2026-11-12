// @fluxiq-test-group real-sql
import { readFile, writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { ProgramJsonStore } from "../../../../persistence/program-state/storage.ts";
import { AutomationStudioInputBasisOwner, type AutomationStudioInputProducer, type AutomationStudioInputProducerOwner } from "../../../../../runtime/input-basis/index.ts";
import { AutomationStudioRunDatasets } from "../../datasets/index.ts";
import { AutomationStudioProjectPaths } from "../../paths/index.ts";
import { AutomationStudioInputBasisStore } from "../index.ts";
import { withInputBasisStore } from "./fixtures.ts";

vi.setConfig({ testTimeout: 60_000 });

describe.each([false, true])("durable input binding (SQLite head=%s)", sqlite => {
  it("reopens actual private data from a fresh owner/store/pool and keeps values out of head metadata", async () => withInputBasisStore(async first => {
    const bound = await first.owner.observe(first.scope, { nested: { privateText: "synthetic-private-input" }, value: 0 });
    if (bound.status !== "bound") throw new Error("Missing durable receipt");
    const reference = structuredClone(bound.value.reference);
    const next = await first.restart();
    const reopened = await next.owner.reopen(next.scope, reference);
    expect(reopened.status === "bound" && reopened.value.reference).toEqual(reference);
    expect(reopened.status === "bound" && reopened.value.executionCopy()).toEqual({ nested: { privateText: "synthetic-private-input" }, value: 0 });
    expect(JSON.stringify(await next.store.read(next.scope))).not.toContain("synthetic-private-input");
    expect(JSON.stringify(reopened)).not.toContain("synthetic-private-input");
  }, sqlite));

  it("isolates project, task, principal and logical producer scopes", async () => withInputBasisStore(async fixture => {
    const original = await fixture.owner.observe(fixture.scope, { value: "one" });
    if (original.status !== "bound") throw new Error("Missing original scope receipt");
    for (const changed of [{ projectId: "project.two" }, { taskId: "task.two" }, { principalId: "principal.two" }, { producerId: "defaults" }]) {
      const scope = { ...fixture.scope, ...changed };
      const separate = await fixture.owner.observe(scope, { value: "one" });
      expect(separate.status).toBe("bound");
      if (separate.status === "bound") expect(separate.value.reference.bindingId).not.toBe(original.value.reference.bindingId);
      expect((await fixture.owner.reopen(scope, original.value.reference)).status).toBe("unknown");
    }
    expect(await original.value.verifyCurrent()).toEqual({ status: "bound", value: true });
  }, sqlite));

  it("serializes competing writers without returning either unpublished CAS proposal", async () => withInputBasisStore(async fixture => {
    const other = new AutomationStudioInputBasisStore(fixture.paths, fixture.projects, fixture.snapshots);
    const another = new AutomationStudioInputBasisOwner({ ...fixture.ports, storage: other });
    const swapA = fixture.store.compareAndSwap.bind(fixture.store), swapB = other.compareAndSwap.bind(other);
    let arrivals = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const wait = async () => {
      arrivals += 1;
      if (arrivals === 2) release();
      await gate;
    };
    vi.spyOn(fixture.store, "compareAndSwap").mockImplementation(async (...args) => {
      await wait();
      return await swapA(...args);
    });
    vi.spyOn(other, "compareAndSwap").mockImplementation(async (...args) => {
      await wait();
      return await swapB(...args);
    });
    const [a, b] = await Promise.all([fixture.owner.observe(fixture.scope, { value: "A" }), another.observe(fixture.scope, { value: "B" })]);
    if (a.status !== "bound" || b.status !== "bound") throw new Error("Missing committed concurrent receipts");
    expect([a.value.reference.revision, b.value.reference.revision].sort()).toEqual([1, 2]);
    expect(a.value.reference.ownerId).toBe(b.value.reference.ownerId);
    expect(a.value.reference.bindingId).toBe(b.value.reference.bindingId);
    expect(a.value.executionCopy()).toEqual({ value: "A" });
    expect(b.value.executionCopy()).toEqual({ value: "B" });
    const state = await fixture.store.read(fixture.scope);
    expect(state?.head?.reference.revision).toBe(2);
    const latest = await fixture.owner.reopen(fixture.scope, state!.head!.reference);
    expect(latest.status).toBe("bound");
  }, sqlite));

  it("reuses a concurrent winner when both writers captured the same values", async () => withInputBasisStore(async fixture => {
    const other = new AutomationStudioInputBasisOwner({ ...fixture.ports, storage: new AutomationStudioInputBasisStore(fixture.paths, fixture.projects, fixture.snapshots) });
    const [a, b] = await Promise.all([fixture.owner.observe(fixture.scope, { value: "same" }), other.observe(fixture.scope, { value: "same" })]);
    expect(a.status === "bound" && a.value.reference).toEqual(b.status === "bound" && b.value.reference);
    expect(a.status === "bound" && a.value.reference.revision).toBe(1);
  }, sqlite));

  it("does not repair a missing snapshot by capturing a replacement", async () => withInputBasisStore(async fixture => {
    const bound = await fixture.owner.observe(fixture.scope, { value: "held" });
    if (bound.status !== "bound") throw new Error("Missing held receipt");
    const missing = await fixture.snapshots.readImmutableSnapshotPage({ projectId: fixture.scope.projectId, snapshotId: "missing.snapshot" });
    vi.spyOn(fixture.snapshots, "readImmutableSnapshotPage").mockResolvedValue(missing);
    const write = vi.spyOn(fixture.snapshots, "createImmutableSnapshot");
    expect(await fixture.owner.reopen(fixture.scope, bound.value.reference)).toEqual({ status: "unknown", code: "snapshot_unavailable" });
    expect(await fixture.owner.observe(fixture.scope, { value: "new" })).toEqual({ status: "unknown", code: "snapshot_unavailable" });
    expect(write).not.toHaveBeenCalled();
  }, sqlite));

  it("preserves the original snapshot failure and prior current head", async () => withInputBasisStore(async fixture => {
    const bound = await fixture.owner.observe(fixture.scope, { value: "held" });
    if (bound.status !== "bound") throw new Error("Missing held receipt");
    const before = await fixture.store.read(fixture.scope), failure = new Error("snapshot original failure");
    vi.spyOn(fixture.snapshots, "createImmutableSnapshot").mockRejectedValueOnce(failure);
    await expect(fixture.owner.observe(fixture.scope, { value: "changed" })).rejects.toBe(failure);
    expect(await fixture.store.read(fixture.scope)).toEqual(before);
    expect(await bound.value.verifyCurrent()).toEqual({ status: "bound", value: true });
  }, sqlite));

  it("refuses count/occurrence/scope substitution in the private snapshot", async () => withInputBasisStore(async fixture => {
    const bound = await fixture.owner.observe(fixture.scope, { value: "held" });
    if (bound.status !== "bound") throw new Error("Missing held receipt");
    const state = await fixture.store.read(fixture.scope);
    if (!state?.head) throw new Error("Missing head");
    const foreign = await fixture.store.writeSnapshot({ ...fixture.scope, taskId: "task.foreign" }, { value: "foreign" }, []);
    expect(await fixture.store.readSnapshot(fixture.scope, { ...state.head, snapshot: foreign })).toBeUndefined();
    expect(await fixture.store.readSnapshot(fixture.scope, { ...state.head, snapshot: { ...state.head.snapshot, occurrenceId: "wrong.occurrence" } })).toBeUndefined();
    const page = await fixture.snapshots.readImmutableSnapshotPage({ projectId: fixture.scope.projectId, snapshotId: state.head.snapshot.snapshotId });
    if (!page) throw new Error("Missing actual page");
    vi.spyOn(fixture.snapshots, "readImmutableSnapshotPage").mockResolvedValue({ ...page, count: 2 });
    expect(await fixture.owner.reopen(fixture.scope, bound.value.reference)).toEqual({ status: "unknown", code: "snapshot_unavailable" });
  }, sqlite));

  it("re-authenticates stored producers after reopening through a fresh store", async () => withInputBasisStore(async fixture => {
    const producer: AutomationStudioInputProducer = { role: "defaults", reference: { ownerId: "defaults.owner", bindingId: "defaults.binding", revision: 1 } };
    let current = true;
    const authority: AutomationStudioInputProducerOwner = { verifyCurrent: async () => current ? { status: "bound", value: true } : { status: "unknown", code: "stale" } };
    const owners = new Map([[producer.reference.ownerId, authority]]);
    const owner = new AutomationStudioInputBasisOwner({ ...fixture.ports, producerOwners: owners });
    const first = await owner.observe(fixture.scope, { value: "same" }, [producer]);
    if (first.status !== "bound") throw new Error("Missing composite receipt");
    const next = await fixture.restart();
    const reopened = new AutomationStudioInputBasisOwner({ ...next.ports, producerOwners: owners });
    current = false;
    expect(await reopened.verifyCurrent(next.scope, first.value.reference)).toEqual({ status: "unknown", code: "producer_unverified" });
    expect(await reopened.reopen(next.scope, first.value.reference)).toEqual({ status: "unknown", code: "producer_unverified" });
  }, sqlite));
});

it("a project root without owning snapshot storage cannot confer durability", async () => withInputBasisStore(async fixture => {
  const unavailable = new AutomationStudioRunDatasets(fixture.projects, undefined);
  const storage = new AutomationStudioInputBasisStore(fixture.paths, fixture.projects, unavailable);
  const owner = new AutomationStudioInputBasisOwner({ ...fixture.ports, storage });
  const write = vi.spyOn(unavailable, "createImmutableSnapshot"), paths = vi.spyOn(fixture.paths, "projectFile");
  expect(unavailable.available).toBe(false);
  expect(storage.durable).toBe(false);
  expect(await owner.observe(fixture.scope, { value: "normal" })).toEqual({ status: "unknown", code: "storage_unavailable" });
  expect(write).not.toHaveBeenCalled();
  expect(paths).not.toHaveBeenCalled();
  const noRoot = new AutomationStudioInputBasisStore(new AutomationStudioProjectPaths(undefined), fixture.projects, fixture.snapshots);
  expect(noRoot.durable).toBe(false);
}));

it("does not replace corrupt JSON authority and validates scope before deriving a path", async () => withInputBasisStore(async fixture => {
  await fixture.owner.observe(fixture.scope, { value: "held" });
  const file = fixture.paths.projectFile(fixture.scope.projectId, "input-basis", "owner.json");
  await writeFile(file, "{corrupt owner");
  await expect(fixture.owner.observe(fixture.scope, { value: "new" })).rejects.toThrow();
  expect(await readFile(file, "utf8")).toBe("{corrupt owner");
  const paths = vi.spyOn(fixture.paths, "projectFile");
  await expect(fixture.store.read({ ...fixture.scope, projectId: "../escape" })).rejects.toThrow("input_basis.scope_invalid");
  expect(paths).not.toHaveBeenCalled();
}));

it("head commit failure preserves its original error and publishes no orphan snapshot receipt", async () => withInputBasisStore(async fixture => {
  const bound = await fixture.owner.observe(fixture.scope, { value: "held" });
  if (bound.status !== "bound") throw new Error("Missing held receipt");
  const before = await fixture.store.read(fixture.scope), failure = new Error("head original failure");
  const write = vi.spyOn(ProgramJsonStore.prototype, "write").mockRejectedValueOnce(failure);
  await expect(fixture.owner.observe(fixture.scope, { value: "changed" })).rejects.toBe(failure);
  write.mockRestore();
  expect(await fixture.store.read(fixture.scope)).toEqual(before);
  expect(await bound.value.verifyCurrent()).toEqual({ status: "bound", value: true });
}));
