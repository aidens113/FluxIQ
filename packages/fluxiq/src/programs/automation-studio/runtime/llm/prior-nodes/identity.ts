import { createHash } from "node:crypto";
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioLlmEvidenceCanonicalJson } from "../evidence-loop-decision.ts";
import type { AutomationStudioLlmRerunRecord, AutomationStudioLlmRerunScope } from "../rerun-provenance/index.ts";

/** Stable host identities are compared by reference, never by inspecting their fields. */
export function automationStudioLlmPriorNodesIdentity() {
  const identities = new WeakMap<object, number>();
  let next = 0;
  const token = (value: object): number => {
    let found = identities.get(value);
    if (found === undefined) {
      found = ++next;
      identities.set(value, found);
    }
    return found;
  };
  const hash = (value: JsonObject): string => createHash("sha256").update(automationStudioLlmEvidenceCanonicalJson(value)).digest("hex");
  const scopeKey = (scope: AutomationStudioLlmRerunScope): string => hash({ loop: token(scope.loop), binding: token(scope.binding), generation: token(scope.generation), registry: token(scope.registry), authority: token(scope.authority) });
  return {
    hash,
    scope: scopeKey,
    original(record: AutomationStudioLlmRerunRecord, scope: AutomationStudioLlmRerunScope): string {
      return hash({ scope: scopeKey(scope), subject: token(record.subject), referenceNow: record.referenceNow });
    }
  };
}
