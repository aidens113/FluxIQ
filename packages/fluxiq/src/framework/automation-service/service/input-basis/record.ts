import type { JsonObject } from "../../../../core/index.ts";
import { AutomationStudioInputBasisEncoding as Encoding } from "../../../../runtime/input-basis/index.ts";
import type { AutomationStudioInputBasisDocument } from "./document.ts";

/** The owner document contains references/scope only, never the private normal input values. */
export class AutomationStudioInputBasisRecord {
  static read(value: JsonObject | undefined, projectId: string): AutomationStudioInputBasisDocument | undefined {
    if (value === undefined) return undefined;
    const checked = Encoding.values(value);
    if (checked.status !== "valid") throw new Error("input_basis.owner_unreadable");
    const row = checked.value;
    if (!exact(row, ["kind", "schemaVersion", "projectId", "ownerId", "bindings"]) || row.kind !== "normal_input_basis_owner" || row.schemaVersion !== 1 || row.projectId !== projectId
      || typeof row.ownerId !== "string" || !Encoding.reference({ ownerId: row.ownerId, bindingId: "validation", revision: 1 }) || !Array.isArray(row.bindings)) throw new Error("input_basis.owner_unreadable");
    const bindings: AutomationStudioInputBasisDocument["bindings"] = [];
    const scopes = new Set<string>(), ids = new Set<string>();
    for (const entry of row.bindings) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry) || !exact(entry, ["scope", "head"])) throw new Error("input_basis.owner_unreadable");
      const scope = Encoding.scope(entry.scope), head = Encoding.head(entry.head);
      if (!scope || scope.projectId !== projectId || !head || head.reference.ownerId !== row.ownerId) throw new Error("input_basis.owner_unreadable");
      const key = JSON.stringify([scope.taskId, scope.principalId, scope.producerId]);
      if (scopes.has(key) || ids.has(head.reference.bindingId)) throw new Error("input_basis.owner_unreadable");
      scopes.add(key);
      ids.add(head.reference.bindingId);
      bindings.push({ scope, head });
    }
    return { kind: "normal_input_basis_owner", schemaVersion: 1, projectId, ownerId: row.ownerId, bindings };
  }
}

function exact(value: JsonObject, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
