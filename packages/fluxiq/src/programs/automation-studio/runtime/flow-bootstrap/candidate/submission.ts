import { createHash } from "node:crypto";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { checkAutomationStudioFlowBootstrapCompletion } from "../../llm/harness-options/index.ts";
import type { AutomationStudioFlowCandidate, AutomationStudioFlowCandidateSubmission } from "./contracts.ts";

/** Session-local candidates, separate from discovery and the accepted Flow store. */
export class AutomationStudioFlowCandidateSubmissionController {
  private revision = 0;
  private current: AutomationStudioFlowCandidate | undefined;
  private previous: AutomationStudioFlowCandidate | undefined;
  constructor(private readonly input: Omit<Parameters<typeof checkAutomationStudioFlowBootstrapCompletion>[0], "result" | "draftSteps" | "routeSignaturesOf"> & { baseDependencyDigest: string; signal?: AbortSignal }) {}

  latest(): AutomationStudioFlowCandidate | undefined { return !this.input.signal?.aborted && this.current ? structuredClone(this.current) : undefined; }

  matches(receipt: { revision: number; digest: string; baseDependencyDigest: string }): boolean {
    return !this.input.signal?.aborted && this.current?.revision === receipt.revision && this.current.digest === receipt.digest && this.current.baseDependencyDigest === receipt.baseDependencyDigest;
  }

  async submit(result: JsonObject): Promise<AutomationStudioFlowCandidateSubmission> {
    // Even a refused revision invalidates any earlier candidate and receipt.
    const revision = ++this.revision;
    this.current = undefined;
    this.input.signal?.throwIfAborted();
    const verdict = await checkAutomationStudioFlowBootstrapCompletion({ ...this.input, result });
    this.input.signal?.throwIfAborted();
    if (!verdict.ok) return { ok: false, revision, check: verdict.check };
    if (revision !== this.revision) return { ok: false, revision, check: { ok: false, issueCodes: ["candidate.superseded_submission"], feedback: { code: "candidate.superseded_submission" } } };
    const plan = structuredClone(verdict.buildPlan);
    const fingerprint = canonical({ plan: plan.plan as unknown as JsonValue, baseDependencyDigest: this.input.baseDependencyDigest, projectId: this.input.projectId, flowId: this.input.flowId, instructionText: this.input.instructionText ?? "" });
    const candidate: AutomationStudioFlowCandidate = {
      revision, digest: createHash("sha256").update(fingerprint).digest("hex"), baseDependencyDigest: this.input.baseDependencyDigest,
      status: "draft", summary: verdict.summary, buildPlan: plan,
      changedPaths: changedPaths(this.previous?.buildPlan.plan as unknown as JsonValue, plan.plan as unknown as JsonValue)
    };
    this.current = structuredClone(candidate);
    this.previous = structuredClone(candidate);
    return { ok: true, candidate };
  }
}

function changedPaths(before: JsonValue | undefined, after: JsonValue, path = "plan"): string[] {
  if (before === undefined) return [path];
  if (canonical(before) === canonical(after)) return [];
  if (before && after && typeof before === "object" && typeof after === "object") {
    const old = before as Record<string, JsonValue>, next = after as Record<string, JsonValue>;
    return [...new Set([...Object.keys(old), ...Object.keys(next)])].sort().flatMap((key) => next[key] === undefined ? [`${path}.${key}`] : changedPaths(old[key], next[key]!, `${path}.${key}`));
  }
  return [path];
}

/** JSON object key order never changes the submitted graph identity. */
function canonical(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key]!)}`).join(",")}}`;
  return JSON.stringify(value);
}
