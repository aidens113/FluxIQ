import { createHash } from "node:crypto";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmRecentActionContext } from "./context-packet.ts";
import type { AutomationStudioLlmTaskKind } from "./task-kind.ts";

export const AUTOMATION_STUDIO_LLM_MAX_FAILURE_EVIDENCE_BYTES = 3_000;

export type AutomationStudioLlmFailureEvidenceCaptureInput = {
  projectId: string;
  flowId: string;
  runId: string;
  failedAction: Pick<AutomationStudioLlmRecentActionContext, "attemptId" | "nodeId" | "definitionId" | "status" | "route">;
  maxEvidenceBytes: number;
  signal?: AbortSignal;
};

export function sanitizeAutomationStudioLlmFailureEvidence(taskKind: AutomationStudioLlmTaskKind, evidence: JsonObject): JsonObject {
  if (taskKind !== "runtime_diagnosis" && taskKind !== "runtime_patch") throw new Error("Failure evidence is available only to runtime diagnosis and patch tasks.");
  if (typeof evidence.schemaVersion !== "string" || !/^[a-z0-9_.:-]{1,100}$/i.test(evidence.schemaVersion)) throw new Error("Failure evidence requires a bounded schema version.");
  if (!boundedFailureEvidenceValue(evidence)) throw new Error("Failure evidence contains an unsafe or unbounded value.");
  let serialized: string;
  try { serialized = JSON.stringify(evidence); } catch { throw new Error("Failure evidence must be serializable JSON."); }
  if (Buffer.byteLength(serialized, "utf8") > AUTOMATION_STUDIO_LLM_MAX_FAILURE_EVIDENCE_BYTES) throw new Error("Failure evidence exceeds the byte limit.");
  return JSON.parse(serialized) as JsonObject;
}

function boundedFailureEvidenceValue(root: unknown): boolean {
  const forbiddenKeys = new Set(["html", "innerhtml", "outerhtml", "pagesource", "snapshot", "cookies", "headers"]);
  const stack: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
  let entries = 0;
  while (stack.length) {
    const { value, depth } = stack.pop()!;
    if (value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) continue;
    if (typeof value === "string") { if (value.length > 2_000) return false; continue; }
    if (!value || typeof value !== "object" || depth > 12) return false;
    const children = Array.isArray(value) ? value.map((item) => ["", item] as const) : Object.entries(value);
    entries += children.length;
    if (children.length > 128 || entries > 512) return false;
    for (const [key, child] of children) {
      if (key.length > 100 || forbiddenKeys.has(key.replace(/[_-]/g, "").toLowerCase())) return false;
      stack.push({ value: child, depth: depth + 1 });
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
