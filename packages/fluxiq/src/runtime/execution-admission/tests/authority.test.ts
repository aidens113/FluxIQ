import { describe, expect, it } from "vitest";
import { createExecutionAdmissionAuthority, type ExecutionEntry, type ExecutionEntryGrant, type ExecutionScope } from "../index.ts";
import { admissionFixture } from "./fixture.ts";
import { AdmissionTestPersistence } from "./persistence.ts";
import { AdmissionTestScopeOwner } from "./scope-owner.ts";
import { AdmissionTestSource } from "./source.ts";

describe("execution admission private authority", () => {
  it("preserves scope, persistence and source method receivers and freezes forwarded records", async () => {
    const f = await admissionFixture();
    const reserved = await f.assembly.consumer.reserve(f.scope, f.grant);
    const snapshot = f.assembly.entryBridge.read(reserved.root);
    expect(snapshot.sourceOwner).toBe(f.source.owner);
    expect(snapshot.origin).toBe(f.origin);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.row)).toBe(true);
    expect(Object.isFrozen(snapshot.row.origin)).toBe(true);
    expect(Object.isFrozen(snapshot.row.resourceKeys)).toBe(true);
    expect(Object.isFrozen(f.origin)).toBe(true);
    expect(f.scopes.calls).toHaveLength(1);
    expect(f.source.calls).toEqual(["admission", "origin"]);
    await f.ports.producer.finish(reserved.root, f.source.complete(f.origin));
    await f.assembly.consumer.release(reserved.reservation);
    expect(f.store.events).toEqual(["open", "reserve", "finish", "release"]);
    expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("clear");
  });

  it("accepts only original scope, grant and entry handles, never DTO or JSON copies", async () => {
    const f = await admissionFixture();
    const copiedScope = JSON.parse(JSON.stringify(f.scope)) as ExecutionScope;
    await expect(f.assembly.consumer.inspect(copiedScope)).rejects.toThrow("foreign_scope");
    for (const copy of [{ ...f.grant }, Object.create(f.grant), JSON.parse(JSON.stringify(f.grant))] as ExecutionEntryGrant[]) {
      await expect(f.assembly.consumer.reserve(f.scope, copy)).rejects.toThrow("grant_spent_or_foreign");
    }
    const reserved = await f.assembly.consumer.reserve(f.scope, f.grant);
    const snapshot = f.assembly.entryBridge.read(reserved.root);
    for (const copy of [{ ...reserved.root }, Object.create(reserved.root), JSON.parse(JSON.stringify(reserved.root)), snapshot]) {
      expect(() => f.assembly.entryBridge.read(copy as ExecutionEntry)).toThrow("foreign_entry");
    }
    expect(() => f.ports.issuer.fromOrdinaryAdmission({ retryAllowed: true, effect: "unacted", origin: {}, callKey: "forged" })).toThrow("invalid_ordinary_admission");
    expect(f.store.events).toEqual(["open", "reserve"]);
  });

  it("consumes original admission proof and grant synchronously once", async () => {
    const f = await admissionFixture();
    expect(() => f.ports.issuer.fromOrdinaryAdmission(f.proof)).toThrow("admission_proof_spent");
    expect(() => f.ports.issuer.fromOrdinaryAdmission(f.source.admit(f.origin))).toThrow("origin_spent");
    const pause = f.store.pauseNext("reserve");
    const first = f.assembly.consumer.reserve(f.scope, f.grant);
    await expect(f.assembly.consumer.reserve(f.scope, f.grant)).rejects.toThrow("grant_spent_or_foreign");
    await pause.entered;
    pause.release();
    await first;
    expect(f.store.requests.filter(value => value.operation === "reserve")).toHaveLength(1);
  });

  it("rejects another authority's handles and closes registration at first attempted reservation", async () => {
    const f = await admissionFixture();
    const other = await admissionFixture();
    await expect(f.assembly.consumer.reserve(f.scope, other.grant)).rejects.toThrow("grant_spent_or_foreign");
    expect(() => f.assembly.registerSource(new AdmissionTestSource(other.scope, "foreign"))).toThrow("foreign_scope");
    const controller = new AbortController();
    controller.abort();
    await expect(f.assembly.consumer.reserve(f.scope, f.grant, controller.signal)).rejects.toThrow("aborted");
    expect(() => f.assembly.registerSource(new AdmissionTestSource(f.scope, "late"))).toThrow("registration_closed");
    await expect(f.assembly.consumer.reserve(f.scope, f.grant)).rejects.toThrow("grant_spent_or_foreign");
    expect(f.store.events).toEqual(["open"]);
  });

  it("binds one factory to one configured scope without freezing the original owner", async () => {
    const f = await admissionFixture();
    expect(await f.assembly.openScope(f.scopes.issue())).toBe(f.scope);
    await expect(f.assembly.openScope(f.scopes.issue("different.flow"))).rejects.toThrow("configured_scope_changed");
    expect(Object.isFrozen(f.source)).toBe(false);
    expect(Object.isFrozen(f.store)).toBe(false);
    expect(Object.isFrozen(f.scopes)).toBe(false);
  });

  it("allows explicitly delegated different sources and keeps evidence bound to its original source", async () => {
    const store = new AdmissionTestPersistence();
    const scopes = new AdmissionTestScopeOwner();
    const assembly = createExecutionAdmissionAuthority({ persistence: store, scopes });
    const scope = await assembly.openScope(scopes.issue());
    const rootSource = new AdmissionTestSource(scope, "trial");
    const childSource = new AdmissionTestSource(scope, "engine");
    rootSource.delegatesTo.push(childSource.owner);
    const rootPorts = assembly.registerSource(rootSource);
    const childPorts = assembly.registerSource(childSource);
    const origin = rootSource.origin();
    const root = await assembly.consumer.reserve(scope, rootPorts.issuer.fromOrdinaryAdmission(rootSource.admit(origin)));
    const childOrigin = childSource.origin();
    const child = await childPorts.producer.enter({ reservation: root.reservation, parent: root.root }, childOrigin);
    await expect(rootPorts.producer.finish(child, childSource.complete(childOrigin))).rejects.toThrow("entry_source_mismatch");
    await childPorts.producer.finish(child, childSource.complete(childOrigin));
    await rootPorts.producer.finish(root.root, rootSource.complete(origin));
    const rootId = assembly.entryBridge.read(root.root).row.entryId;
    expect(store.rows.get(rootId)?.frontier).toEqual([assembly.entryBridge.read(child).row.entryId]);
  });

  it("rejects undelegated children and foreign reservations before persistence", async () => {
    const f = await admissionFixture();
    const childSource = new AdmissionTestSource(f.scope, "undelegated");
    const childPorts = f.assembly.registerSource(childSource);
    f.source.delegatesTo.push(childSource.owner);
    const reserved = await f.assembly.consumer.reserve(f.scope, f.grant);
    await expect(childPorts.producer.enter({ reservation: reserved.reservation, parent: reserved.root }, childSource.origin())).rejects.toThrow("delegation_refused");
    const other = await admissionFixture();
    const foreign = await other.assembly.consumer.reserve(other.scope, other.grant);
    await expect(f.ports.producer.enter({ reservation: foreign.reservation, parent: reserved.root }, f.source.origin())).rejects.toThrow("foreign_reservation");
    expect(f.store.requests.some(value => value.operation === "enter")).toBe(false);
  });

  it("does not reuse an original child origin or accept a caller-selected completion frontier", async () => {
    const f = await admissionFixture();
    const reserved = await f.assembly.consumer.reserve(f.scope, f.grant);
    const origin = f.source.origin();
    const child = await f.ports.producer.enter({ reservation: reserved.reservation, parent: reserved.root }, origin);
    await expect(f.ports.producer.enter({ reservation: reserved.reservation, parent: reserved.root }, origin)).rejects.toThrow("origin_spent");
    const malformed = { kind: "coverage_complete" as const, disposition: "settled" as const, completionDigest: "actual", assessmentDigest: "actual", childFrontierDigest: "caller.chosen" };
    await expect(f.ports.producer.finish(child, f.source.prove(origin, malformed))).rejects.toThrow("invalid_evidence");
    expect(f.store.events.includes("finish")).toBe(false);
    await f.ports.producer.finish(child, f.source.complete(origin));
    await f.ports.producer.finish(reserved.root, f.source.complete(f.origin));
  });
});

it("authenticates original entry/reservation association without granting copied or foreign handles", async () => {
  const first = await admissionFixture();
  const second = await admissionFixture();
  const own = await first.assembly.consumer.reserve(first.scope, first.grant);
  const foreign = await second.assembly.consumer.reserve(second.scope, second.grant);
  const bridge = first.assembly.entryBridge;
  expect(bridge.matchesReservation(own.root, own.reservation)).toBe(true);
  expect(bridge.matchesReservation(own.root, foreign.reservation)).toBe(false);
  expect(bridge.matchesReservation(foreign.root, own.reservation)).toBe(false);
  expect(bridge.matchesReservation(foreign.root, foreign.reservation)).toBe(false);
  expect(bridge.matchesReservation(Object.create(own.root), own.reservation)).toBe(false);
  expect(bridge.matchesReservation(own.root, Object.create(own.reservation))).toBe(false);
  expect(bridge.matchesReservation(JSON.parse(JSON.stringify(own.root)), JSON.parse(JSON.stringify(own.reservation)))).toBe(false);
});
