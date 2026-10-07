import { createHash } from "node:crypto";
import type { AutomationStudioFlowBuildPlan } from "../plan/index.ts";
import type { AutomationStudioCandidateOriginalSources } from "./contracts.ts";

/** One fingerprint owner: byte-compatible legacy graph and source-bound v2. */
export const automationStudioCandidateFingerprint = Object.freeze({
  source(originalSources: AutomationStudioCandidateOriginalSources): string {
    return hash(canonical({ fingerprintVersion: "candidate.original_sources.v1", originalSources }));
  },
  candidate(input: { projectId: string; flowId: string; baseDependencyDigest: string; instructionText: string; buildPlan: AutomationStudioFlowBuildPlan; originalInstructionsDigest?: string }): string {
    return input.originalInstructionsDigest === undefined
      ? hash(legacyCanonical({ plan: input.buildPlan.plan, baseDependencyDigest: input.baseDependencyDigest, projectId: input.projectId, flowId: input.flowId, instructionText: input.instructionText }))
      : hash(canonical({ fingerprintVersion: "candidate.plan+original_sources.v2", projectId: input.projectId, flowId: input.flowId,
        baseDependencyDigest: input.baseDependencyDigest, instructionText: input.instructionText, originalInstructionsDigest: input.originalInstructionsDigest, buildPlan: input.buildPlan }));
  },
  snapshot<T>(value: T): T {
    const text = canonical(value);
    // Same supported observation envelope as ProgramJsonStore's owning file read.
    if (Buffer.byteLength(text, "utf8") > 4 * 1024 * 1024) throw new Error("candidate.source_oversized");
    return freeze(JSON.parse(text) as T);
  },
});

function hash(text: string): string { return createHash("sha256").update(text).digest("hex"); }
function canonical(value: unknown, ancestors = new Set<object>()): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (!value || typeof value !== "object" || ancestors.has(value)) throw new Error("candidate.source_non_json");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== (Array.isArray(value) ? Array.prototype : Object.prototype) && !(prototype === null && !Array.isArray(value))) throw new Error("candidate.source_non_plain");
  ancestors.add(value);
  try {
    const keys = Reflect.ownKeys(value), descriptors = Object.getOwnPropertyDescriptors(value);
    if (keys.some(key => typeof key !== "string" || !Object.hasOwn(descriptors[key]!, "value"))) throw new Error("candidate.source_accessor_or_symbol");
    if (Array.isArray(value)) {
      if (keys.length !== value.length + 1 || keys.some(key => key !== "length" && !/^(0|[1-9][0-9]*)$/.test(String(key)))) throw new Error("candidate.source_sparse_array");
      return `[${value.map((_, index) => canonical(descriptors[String(index)]!.value, ancestors)).join(",")}]`;
    }
    return `{${(keys as string[]).sort().map(key => `${JSON.stringify(key)}:${canonical(descriptors[key]!.value, ancestors)}`).join(",")}}`;
  } finally { ancestors.delete(value); }
}
function legacyCanonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(legacyCanonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${legacyCanonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value) as string;
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { for (const entry of Object.values(value)) freeze(entry); Object.freeze(value); }
  return value;
}
