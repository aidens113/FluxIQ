import type { AutomationStudioLlmRerunCaptureSnapshot, AutomationStudioLlmRerunDispatchAttempt, AutomationStudioLlmRerunUnavailable } from "./types.ts";

/** A trusted producer's actual attempts; capture requires success, execution retains failures. */
export function automationStudioLlmRerunReadDispatch(value: unknown, successOnly: boolean):
  | Readonly<{ kind: "valid"; value: AutomationStudioLlmRerunCaptureSnapshot["dispatch"] }>
  | AutomationStudioLlmRerunUnavailable {
  try {
    if (!value || typeof value !== "object") return unavailable();
    const fields = Object.getOwnPropertyDescriptors(value);
    const attempts = fields.attempts?.value as unknown;
    const selected = fields.selected?.value as unknown;
    if (!Array.isArray(attempts) || !attempts.length || !identity(selected)) return unavailable();
    const seen = new Set<object>();
    const receipts = new Set<object>();
    const copied: AutomationStudioLlmRerunDispatchAttempt[] = [];
    for (let index = 0; index < attempts.length; index++) {
      const attempt = Object.getOwnPropertyDescriptor(attempts, String(index))?.value as unknown;
      if (!attempt || typeof attempt !== "object") return unavailable();
      const members = Object.getOwnPropertyDescriptors(attempt);
      const attemptIdentity = members.identity?.value as unknown;
      const receipt = members.receipt?.value as unknown;
      const outcome = members.outcome?.value as unknown;
      if (!identity(attemptIdentity) || seen.has(attemptIdentity) || (receipt !== undefined && !identity(receipt))) return unavailable();
      if (receipt !== undefined && receipts.has(receipt)) return unavailable();
      if (outcome !== "succeeded" && outcome !== "failed_unacted" && outcome !== "uncertain" && outcome !== "unknown") return unavailable();
      if (successOnly && outcome !== "succeeded" && outcome !== "failed_unacted") return unavailable();
      seen.add(attemptIdentity);
      if (receipt !== undefined) receipts.add(receipt);
      copied.push(receipt === undefined ? Object.freeze({ identity: attemptIdentity, outcome }) : Object.freeze({ identity: attemptIdentity, receipt, outcome }));
    }
    const last = copied[copied.length - 1];
    if (!last || last.identity !== selected || !last.receipt || (successOnly && last.outcome !== "succeeded")) return unavailable();
    return Object.freeze({ kind: "valid", value: Object.freeze({ attempts: Object.freeze(copied), selected }) });
  } catch {
    return unavailable();
  }
}

function identity(value: unknown): value is object {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function unavailable(): AutomationStudioLlmRerunUnavailable {
  return Object.freeze({ kind: "unavailable", reason: "dispatch_unproven" });
}
