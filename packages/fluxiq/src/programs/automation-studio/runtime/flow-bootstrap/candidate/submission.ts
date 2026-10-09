import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { checkAutomationStudioFlowBootstrapCompletion } from "../../llm/harness-options/index.ts";
import { automationStudioFlowBootstrapIssuePlace, automationStudioFlowBootstrapWrittenPlanBindingIssues, type AutomationStudioFlowBootstrapIssueLocator } from "../authoring/index.ts";
import type { AutomationStudioFlowBootstrapIssue } from "../plan/index.ts";
import type { AutomationStudioFlowCandidate, AutomationStudioFlowCandidateSubmission, AutomationStudioCandidateOriginalSourceBinding } from "./contracts.ts";
import { automationStudioCandidateFingerprint as fingerprint } from "./digest.ts";

/** Session-local candidates, separate from discovery and the accepted Flow store. */
export class AutomationStudioFlowCandidateSubmissionController {
  private revision = 0;
  private current: AutomationStudioFlowCandidate | undefined;
  private previous: AutomationStudioFlowCandidate | undefined;
  private readonly originalSource: AutomationStudioCandidateOriginalSourceBinding | undefined;
  constructor(private readonly input: Omit<Parameters<typeof checkAutomationStudioFlowBootstrapCompletion>[0], "result" | "draftSteps" | "routeSignaturesOf"> & { baseDependencyDigest: string; signal?: AbortSignal; originalSource?: AutomationStudioCandidateOriginalSourceBinding }) {
    const descriptor = Object.getOwnPropertyDescriptor(input, "originalSource");
    if (!descriptor) return;
    if (!Object.hasOwn(descriptor, "value") || descriptor.value === undefined) throw new Error("candidate.original_binding_invalid");
    const binding = fingerprint.snapshot(descriptor.value as AutomationStudioCandidateOriginalSourceBinding);
    const source = binding.originalSources;
    if (Object.keys(binding).length !== 2 || !source || source.schemaVersion !== "candidate.original_sources.v1" || source.projectId !== input.projectId || source.flowId !== input.flowId
      || binding.originalInstructionsDigest !== fingerprint.source(source) || source.effectiveInstructionIds.map(id => {
        const item = source.instructions.find(instruction => instruction.instructionId === id); if (!item) throw new Error("candidate.original_binding_invalid");
        return `${item.title}\n${item.body}`;
      }).join("\n") !== (input.instructionText ?? "")) throw new Error("candidate.original_binding_mismatch");
    this.originalSource = binding;
    this.input = Object.freeze({ ...input, originalSource: binding, resolution: fingerprint.snapshot(input.resolution) });
  }

  latest(): AutomationStudioFlowCandidate | undefined { return !this.input.signal?.aborted && this.current ? structuredClone(this.current) : undefined; }

  matches(receipt: { revision: number; digest: string; baseDependencyDigest: string }): boolean {
    return !this.input.signal?.aborted && this.current?.revision === receipt.revision && this.current.digest === receipt.digest && this.current.baseDependencyDigest === receipt.baseDependencyDigest;
  }

  async submit(result: JsonObject): Promise<AutomationStudioFlowCandidateSubmission> {
    // Even a refused revision invalidates any earlier candidate and receipt.
    const revision = ++this.revision;
    this.current = undefined;
    this.input.signal?.throwIfAborted();
    // A candidate is written after exploration, so it may name a control from
    // any view exploration took, not only the page it last saw (t358).
    const verdict = await checkAutomationStudioFlowBootstrapCompletion({ ...this.input, result, handleReach: "view_history" });
    this.input.signal?.throwIfAborted();
    if (!verdict.ok) return { ok: false, revision, check: verdict.check };
    if (revision !== this.revision) return { ok: false, revision, check: { ok: false, issueCodes: ["candidate.superseded_submission"], feedback: { code: "candidate.superseded_submission" } } };
    // No draft stands behind a candidate, so the checks a drafted plan meets
    // statement by statement are asked of the submitted graph (t346).
    const bindings = automationStudioFlowBootstrapWrittenPlanBindingIssues({ plan: verdict.buildPlan.plan, registry: this.input.registry, resolution: this.input.resolution })
      .filter((issue) => issue.severity === "error");
    if (bindings.length) return { ok: false, revision, check: bindingRefusal(bindings, verdict.locator) };
    const plan = structuredClone(verdict.buildPlan);
    const candidate: AutomationStudioFlowCandidate = {
      revision, digest: fingerprint.candidate({ buildPlan: plan, baseDependencyDigest: this.input.baseDependencyDigest, projectId: this.input.projectId, flowId: this.input.flowId, instructionText: this.input.instructionText ?? "",
        ...(this.originalSource ? { originalInstructionsDigest: this.originalSource.originalInstructionsDigest } : {}) }), baseDependencyDigest: this.input.baseDependencyDigest,
      status: "draft", summary: verdict.summary, buildPlan: plan,
      changedPaths: changedPaths(this.previous?.buildPlan.plan as unknown as JsonValue, plan.plan as unknown as JsonValue),
      ...(this.originalSource ? { fingerprintVersion: "candidate.plan+original_sources.v2" as const, originalInstructionsDigest: this.originalSource.originalInstructionsDigest } : {})
    };
    this.current = structuredClone(candidate);
    this.previous = structuredClone(candidate);
    const handleViews = (verdict.handleViews ?? []).map((view) => ({ node: view.node, handle: view.handle, view: view.view, location: view.location }));
    return { ok: true, candidate, handleViews };
  }
}

/**
 * A candidate refused for its loops or bindings. Every sentence is Core's own
 * (`../authoring/`) and quotes only node keys, labels, field names and output
 * ids the model wrote, so each travels whole with its code and path, and with
 * the step it is about as the model wrote it (t378): a node key such as "s11"
 * is Core's, and names no step the model can find in its script.
 */
function bindingRefusal(issues: readonly AutomationStudioFlowBootstrapIssue[], locator: AutomationStudioFlowBootstrapIssueLocator | undefined): Extract<AutomationStudioFlowCandidateSubmission, { ok: false }>["check"] {
  return {
    ok: false,
    issueCodes: [...new Set(issues.map((issue) => issue.code))],
    feedback: {
      ok: false,
      code: "candidate.loop_or_binding_refused",
      issues: issues.map((issue) => {
        const place = automationStudioFlowBootstrapIssuePlace(locator, issue.path);
        return {
          code: issue.code,
          ...(issue.path ? { path: issue.path } : {}),
          message: issue.message,
          ...(place ? { step: place.step, ...(place.label === undefined ? {} : { label: place.label }), ...(place.line === undefined ? {} : { line: place.line }) } : {})
        };
      }),
      instruction: "Each issue names the step it is about, by its line where the script has one. Correct every one and resubmit the entire candidate."
    }
  };
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
