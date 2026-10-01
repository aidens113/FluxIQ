import { AutomationStudioLlmRequestRefusedError } from "./request-refusal.ts";
import { createHash } from "node:crypto";
import type { JsonObject } from "../../../../../core/index.ts";
import { isJsonValue } from "./json-bounds.ts";
import type { AutomationStudioLlmRecentActionContext } from "./context-packet.ts";
import type { AutomationStudioLlmTaskKind } from "./task-kind.ts";

export type AutomationStudioLlmFailureEvidenceCaptureInput = {
  projectId: string;
  flowId: string;
  runId: string;
  failedAction: Pick<AutomationStudioLlmRecentActionContext, "attemptId" | "nodeId" | "definitionId" | "status" | "route">;
  /** No longer passed by Core: a failure capture is not bounded by size, and
   * the model is shown the whole page. Kept optional so a domain that still
   * declares it compiles; a domain must not trim a capture to it. */
  maxEvidenceBytes?: number;
  signal?: AbortSignal;
};

/**
 * Normalizes a key the way the evidence bound compares them, so a domain may
 * declare `innerHTML` or `inner_html` and mean the same key. Exported because
 * the reusable-context bound compares keys the same way and the two must not
 * drift.
 */
export function automationStudioEvidenceKey(key: string): string {
  return key.replace(/[_-]/g, "").toLowerCase();
}

/**
 * Screens the failure evidence a domain submits before any of it reaches a
 * provider.
 *
 * The model is shown the whole capture: there is no bound on its bytes, its
 * string lengths, its depth short of a recursion guard, or how many entries it
 * holds (2026-09-30, "the model sees the whole page"). What Core still refuses
 * is what it can justify without knowing what medium the evidence came from:
 * it must be acyclic JSON, and it must carry none of the keys the domain
 * declared as raw payload. Secret-shaped values are screened again by the
 * provider's own request check before anything is sent.
 *
 * `deniedKeys` is how that protection is kept without the nouns: the domain
 * that knows what raw payload looks like for its medium declares the keys, and
 * Core enforces the declaration. The evidence-runtime binding requires the
 * declaration, so it cannot be forgotten into nothing.
 */
export function sanitizeAutomationStudioLlmFailureEvidence(
  taskKind: AutomationStudioLlmTaskKind,
  evidence: JsonObject,
  deniedKeys: readonly string[] = []
): JsonObject {
  if (taskKind !== "runtime_diagnosis" && taskKind !== "runtime_patch") throw new AutomationStudioLlmRequestRefusedError("llm.request.failure_evidence_invalid", "Failure evidence is available only to runtime diagnosis and patch tasks.");
  if (typeof evidence.schemaVersion !== "string" || !/^[a-z0-9_.:-]{1,100}$/i.test(evidence.schemaVersion)) throw new AutomationStudioLlmRequestRefusedError("llm.request.failure_evidence_invalid", "Failure evidence requires a bounded schema version.");
  if (!screenedFailureEvidenceValue(evidence, new Set(deniedKeys.map(automationStudioEvidenceKey)))) throw new AutomationStudioLlmRequestRefusedError("llm.request.failure_evidence_invalid", "Failure evidence contains a denied key or a value that is not JSON.");
  let serialized: string;
  try { serialized = JSON.stringify(evidence); } catch { throw new AutomationStudioLlmRequestRefusedError("llm.request.failure_evidence_invalid", "Failure evidence must be serializable JSON."); }
  return JSON.parse(serialized) as JsonObject;
}

/**
 * Whether a value is acyclic JSON free of the domain's denied keys at every
 * depth. The only structural bound is the recursion guard every JSON walk in
 * the harness shares, which no real capture reaches.
 */
function screenedFailureEvidenceValue(root: unknown, deniedKeys: ReadonlySet<string>): boolean {
  if (!isJsonValue(root)) return false;
  const stack: unknown[] = [root];
  while (stack.length) {
    const value = stack.pop();
    if (!value || typeof value !== "object") continue;
    const children = Array.isArray(value) ? value.map((item) => ["", item] as const) : Object.entries(value);
    for (const [key, child] of children) {
      if (deniedKeys.has(automationStudioEvidenceKey(key))) return false;
      stack.push(child);
    }
  }
  return true;
}

export function failureEvidenceProvenance(evidence: JsonObject): JsonObject {
  const serialized = JSON.stringify(evidence);
  return {
    schemaVersion: evidence.schemaVersion as string,
    byteCount: Buffer.byteLength(serialized, "utf8"),
    truncated: evidence.truncated === true,
    digest: createHash("sha256").update(serialized).digest("hex")
  };
}
