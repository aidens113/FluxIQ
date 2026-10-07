import type { JsonObject } from "../../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceLoopInput, type AutomationStudioLlmEvidenceTool } from "../../llm/evidence-loop.ts";
import { AutomationStudioFlowCandidateSubmissionController } from "./submission.ts";

/** Discovery plus explicit complete submission; static validity always stays draft. */
export async function runAutomationStudioFlowCandidateAuthoringLoop(input: {
  loop: Omit<AutomationStudioLlmEvidenceLoopInput, "draft" | "dryRun" | "checkCompletion" | "completionSchema" | "fullRunRequired" | "discoveryOnly">;
  submission: ConstructorParameters<typeof AutomationStudioFlowCandidateSubmissionController>[0];
}) {
  const signals = [input.loop.signal, input.submission.signal].filter((value): value is AbortSignal => value !== undefined);
  const signal = signals.length ? AbortSignal.any(signals) : undefined;
  const controller = new AutomationStudioFlowCandidateSubmissionController({ ...input.submission, ...(signal ? { signal } : {}) });
  const submitId = "core.submit_candidate";
  const tool: AutomationStudioLlmEvidenceTool = {
    toolId: submitId, effect: "observe",
    description: "Submit a complete Flow script or existing canonical JSON plan. Discovery calls are evidence only and never enter the Flow. Static validity returns a draft revision/digest, never semantic acceptance. Correct all diagnostics and resubmit the entire candidate. Complete using only the latest revision and digest; the exact candidate still needs independent execution and verification.",
    inputSchema: { type: "object", properties: { flow: { type: "string" }, plan: { type: "object" }, summary: { type: "string" } }, additionalProperties: false }
  };
  const loop = await runAutomationStudioLlmEvidenceLoop({
    ...input.loop, ...(signal ? { signal } : {}), draft: false, dryRun: false, discoveryOnly: true,
    tools: [...input.loop.tools.filter((item) => item.toolId !== "core.run_flow" && item.toolId !== submitId), tool],
    completionSchema: { type: "object", properties: { revision: { type: "integer" }, digest: { type: "string" } }, required: ["revision", "digest"], additionalProperties: false },
    checkCompletion: async (result) => {
      const candidate = controller.latest();
      return candidate && typeof result.revision === "number" && typeof result.digest === "string" && controller.matches({ revision: result.revision, digest: result.digest, baseDependencyDigest: candidate.baseDependencyDigest }) && Object.keys(result).every((key) => key === "revision" || key === "digest")
        ? { ok: true }
        : { ok: false, issueCodes: ["candidate.latest_submission_required"], feedback: { code: "candidate.latest_submission_required", instruction: "Submit a valid complete candidate and complete with its latest revision and digest." } };
    },
    executeTool: async (call) => {
      if (call.toolId !== submitId) return input.loop.executeTool(call);
      const submitted = await controller.submit(call.value);
      const evidence: JsonObject = submitted.ok
        ? { ok: true, status: "draft", revision: submitted.candidate.revision, digest: submitted.candidate.digest, changedPaths: submitted.candidate.changedPaths, verification: "not_performed", promotionAllowed: false }
        : { ok: false, revision: submitted.revision, diagnostics: submitted.check.feedback ?? {}, issueCodes: [...submitted.check.issueCodes] };
      return { kind: "llm_evidence_tool_execution", evidence, effectApplied: false, targetsUnchanged: true };
    }
  });
  return { loop, candidate: controller.latest(), promotionAllowed: false as const };
}
