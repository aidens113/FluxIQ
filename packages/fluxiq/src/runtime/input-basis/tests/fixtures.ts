import { isDeepStrictEqual } from "node:util";
import { vi } from "vitest";
import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioInputBasisOwnerPorts, AutomationStudioInputBasisStorage, AutomationStudioInputHead, AutomationStudioInputProducer, AutomationStudioInputProducerOwner, AutomationStudioInputScope, AutomationStudioInputSnapshotReference, AutomationStudioInputState } from "../index.ts";
import { AutomationStudioInputBasisOwner } from "../index.ts";

export function inputBasisFixture() {
  const scope: AutomationStudioInputScope = { projectId: "project.one", taskId: "task.one", principalId: "principal.one", producerId: "caller" };
  let state: AutomationStudioInputState | undefined;
  const snapshots = new Map<string, JsonObject>();
  const writeSnapshot = vi.fn(async (_scope: AutomationStudioInputScope, values: JsonObject): Promise<AutomationStudioInputSnapshotReference> => {
    const snapshotId = `snapshot.${snapshots.size + 1}`;
    snapshots.set(snapshotId, structuredClone(values));
    return { snapshotId, occurrenceId: "occurrence.one", count: 1 };
  });
  const read = vi.fn(async () => structuredClone(state));
  const readSnapshot = vi.fn(async (_scope: AutomationStudioInputScope, head: AutomationStudioInputHead) => structuredClone(snapshots.get(head.snapshot.snapshotId)));
  const compareAndSwap = vi.fn(async (_scope: AutomationStudioInputScope, expected: AutomationStudioInputState | undefined, next: AutomationStudioInputHead) => {
    if (!isDeepStrictEqual(state, expected)) return false;
    state = structuredClone({ ownerId: next.reference.ownerId, head: next });
    return true;
  });
  const storage: AutomationStudioInputBasisStorage = { durable: true, read, writeSnapshot, readSnapshot, compareAndSwap };
  const producer: AutomationStudioInputProducer = { role: "defaults", reference: { ownerId: "producer.owner", bindingId: "producer.binding", revision: 1 } };
  const producerState = { revision: 1 };
  const verifyProducer = vi.fn<AutomationStudioInputProducerOwner["verifyCurrent"]>(async (context, reference) => isDeepStrictEqual(context.scope, scope)
    && reference.ownerId === producer.reference.ownerId && reference.bindingId === producer.reference.bindingId && reference.revision === producerState.revision
    ? { status: "bound", value: true } : { status: "unknown", code: "stale" });
  const inspect = vi.fn<NonNullable<AutomationStudioInputBasisOwnerPorts["secrecy"]>["inspect"]>(async () => "nonsecret");
  const ports: AutomationStudioInputBasisOwnerPorts = {
    storage, secrecy: { inspect }, scopeAuthority: { authorize: async candidate => isDeepStrictEqual(candidate, scope) },
    producerOwners: new Map([[producer.reference.ownerId, { verifyCurrent: verifyProducer }]])
  };
  return { scope, ports, owner: new AutomationStudioInputBasisOwner(ports), producer, producerState, verifyProducer, inspect, read, writeSnapshot, readSnapshot, compareAndSwap, snapshots };
}
