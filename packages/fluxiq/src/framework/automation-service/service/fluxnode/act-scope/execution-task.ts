import type { JsonObject } from "../../../../../core/index.ts";
import { programJsonDocumentTransaction } from "../../../../persistence/program-state/document-transaction/index.ts";
import { fluxNodeCallerKey } from "../caller-key.ts";
import { canonicalJson } from "@fluxiq/contracts/fluxnode";

type Identity = { projectId: string; name: string; specHash: string; scope: string; targets?: Record<string, string> | undefined };
type Binding = { taskKey: string; targets?: Record<string, string> | undefined };
const volatile = new WeakMap<object, Map<string, JsonObject>>();

/** Bind an execution once, while its caller holds execution ownership. Task memory continues to own all act records. */
export async function fluxNodeExecutionTask(input: { file?: string | undefined; owner?: object | undefined; identity: Identity; choose: () => Promise<string> }): Promise<Binding | { problem: Error }> {
  try {
    const file = input.file;
    const memory = file === undefined ? memoryOf(input.owner) : undefined;
    const slot = JSON.stringify([input.identity.projectId, input.identity.scope]);
    const previous = file === undefined ? memory!.get(slot) : await programJsonDocumentTransaction(file, async (document) => {
      const stored = await document.read();
      return stored;
    });
    if (previous !== undefined) return readBinding(previous, input.identity);
    // Pin/task selection can read other documents, so it must run outside the owner document's transaction.
    const taskKey = await input.choose();
    if (!allowed(input.identity).has(taskKey)) throw new Error("Invalid execution task identity.");
    const { projectId, name, specHash, scope, targets } = input.identity;
    const bound: Binding = { taskKey, ...(targets === undefined ? {} : { targets: structuredClone(targets) }) };
    const next: JsonObject = { kind: "fluxnode_execution_task", schemaVersion: 1, projectId, name, specHash, scope, taskKey };
    if (targets !== undefined) next["targets"] = structuredClone(targets);
    if (file === undefined) {
      const held = memory!.get(slot);
      if (held !== undefined) return readBinding(held, input.identity);
      memory!.set(slot, next);
      return bound;
    }
    return await programJsonDocumentTransaction(file, async (document) => {
      const stored = await document.read();
      if (stored !== undefined) return readBinding(stored, input.identity);
      await document.write(next);
      return bound;
    });
  } catch (cause) {
    return { problem: new Error("Core cannot read this execution's original task or resolved target identity. Repair its execution binding before retrying, or start a new execution.", { cause }) };
  }
}

function memoryOf(owner: object | undefined): Map<string, JsonObject> {
  if (!owner) throw new Error("A rootless execution needs its service owner.");
  const current = volatile.get(owner);
  if (current) return current;
  const created = new Map<string, JsonObject>();
  volatile.set(owner, created);
  return created;
}

function readBinding(stored: JsonObject, identity: Identity): Binding {
  if (stored["kind"] !== "fluxnode_execution_task" || stored["schemaVersion"] !== 1 || stored["projectId"] !== identity.projectId || stored["name"] !== identity.name || stored["specHash"] !== identity.specHash || stored["scope"] !== identity.scope || typeof stored["taskKey"] !== "string" || !allowed(identity).has(stored["taskKey"])) throw new Error("Unreadable or conflicting execution binding.");
  const targets = identity.targets;
  if (targets === undefined ? stored["targets"] !== undefined : stored["targets"] === undefined || canonicalJson(stored["targets"]) !== canonicalJson(targets)) throw new Error("The resolved target manifest changed or is missing.");
  return { taskKey: stored["taskKey"], ...(targets === undefined ? {} : { targets: structuredClone(targets) }) };
}

function allowed(identity: Identity): Set<string> {
  return new Set([fluxNodeCallerKey(identity), fluxNodeCallerKey({ ...identity, pinned: true }), fluxNodeCallerKey({ ...identity, explore: identity.scope })]);
}
