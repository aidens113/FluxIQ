import type { JsonObject } from "../../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceLoopInput, type AutomationStudioLlmEvidenceTool } from "../../llm/evidence-loop.ts";
import { AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE, AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT, AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT, AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT } from "../plan/index.ts";
import type { AutomationStudioCandidateTrialPort, AutomationStudioFlowCandidate } from "./contracts.ts";
import { AutomationStudioFlowCandidateSubmissionController } from "./submission.ts";
import { automationStudioCandidateSubmissionRefusal } from "./submission-refusal.ts";
import { AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, AutomationStudioFlowCandidateTrialGate } from "./trial-gate.ts";

/**
 * Discovery, explicit complete submission, and a trial of the exact latest
 * submission (`./trial-gate.ts`). With a trial port the model completes only on
 * a yes for that revision and digest; without one it completes on the latest
 * valid submission as before. Either way the loop never promotes: the result
 * carries the standing verdict for its caller to act on.
 */
export async function runAutomationStudioFlowCandidateAuthoringLoop(input: {
  loop: Omit<AutomationStudioLlmEvidenceLoopInput, "draft" | "dryRun" | "checkCompletion" | "completionSchema" | "fullRunRequired" | "discoveryOnly">;
  submission: ConstructorParameters<typeof AutomationStudioFlowCandidateSubmissionController>[0];
  trial?: { candidateId: string; port: AutomationStudioCandidateTrialPort };
  /** Told each submission Core accepted, so a caller whose loop then fails still knows the latest one (t362: a refused resubmission clears `latest`). */
  accepted?: (candidate: Readonly<AutomationStudioFlowCandidate>) => void;
  /**
   * Wraps the loop's input before it runs, so every seam -- each decision and
   * every tool call, the candidate's own two among them -- is observed for the
   * chat (the activity observer, `../../activity/observer.ts`). Injected rather
   * than imported, so this module never reaches into the activity stream.
   */
  observe?: (loop: AutomationStudioLlmEvidenceLoopInput) => AutomationStudioLlmEvidenceLoopInput;
}) {
  const signals = [input.loop.signal, input.submission.signal].filter((value): value is AbortSignal => value !== undefined);
  const signal = signals.length ? AbortSignal.any(signals) : undefined;
  const controller = new AutomationStudioFlowCandidateSubmissionController({ ...input.submission, ...(signal ? { signal } : {}) });
  const gate = new AutomationStudioFlowCandidateTrialGate({ latest: () => controller.latest(), trial: input.trial, signal });
  const submitId = "core.submit_candidate", testId = AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID;
  const tool: AutomationStudioLlmEvidenceTool = {
    toolId: submitId, effect: "observe",
    description: `Submit a complete Flow, written as a Flow script under "flow" (its description gives the format and examples), or an existing canonical JSON plan under "plan". Discovery calls are evidence only and never enter the Flow. Static validity returns a draft revision/digest, never semantic acceptance. Correct all diagnostics and resubmit the entire candidate. Then test that exact revision with ${testId}, and complete with the latest revision and digest only after its trial answers yes.`,
    // The format rides on the input schema, as the legacy completion schema carries it: a tool description is bounded at 2,000 characters.
    inputSchema: { type: "object", properties: { flow: { type: "string", description: `The whole Flow as a script. ${AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT}\n${AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE}\n${AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT}\n${AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT}` }, plan: { type: "object" }, summary: { type: "string" } }, additionalProperties: false }
  };
  const checkCompletion: NonNullable<AutomationStudioLlmEvidenceLoopInput["checkCompletion"]> = async (result) => {
    const candidate = controller.latest();
    if (!(candidate && typeof result.revision === "number" && typeof result.digest === "string" && controller.matches({ revision: result.revision, digest: result.digest, baseDependencyDigest: candidate.baseDependencyDigest }) && Object.keys(result).every((key) => key === "revision" || key === "digest"))) {
      return { ok: false, issueCodes: ["candidate.latest_submission_required"], feedback: { code: "candidate.latest_submission_required", instruction: "Submit a valid complete candidate and complete with its latest revision and digest." } };
    }
    return gate.completion({ revision: candidate.revision, digest: candidate.digest });
  };
  const discovery: AutomationStudioLlmEvidenceLoopInput = {
    ...input.loop, ...(signal ? { signal } : {}), draft: false, dryRun: false, discoveryOnly: true,
    tools: [...input.loop.tools.filter((item) => item.toolId !== "core.run_flow" && item.toolId !== submitId && item.toolId !== testId), tool, gate.tool],
    completionSchema: { type: "object", properties: { revision: { type: "integer" }, digest: { type: "string" } }, required: ["revision", "digest"], additionalProperties: false },
    executeTool: async (call) => {
      if (call.toolId === testId) return gate.test(call.value, call.signal);
      if (call.toolId !== submitId) return input.loop.executeTool(call);
      const submitted = await controller.submit(call.value);
      // A refused submission names its way out and counts in the loop's run of refusals of one kind (`./submission-refusal.ts`).
      if (!submitted.ok) return { kind: "llm_evidence_tool_execution", effectApplied: false, targetsUnchanged: true, ...automationStudioCandidateSubmissionRefusal(submitted) };
      input.accepted?.(structuredClone(submitted.candidate));
      const evidence: JsonObject = { ok: true, status: "draft", revision: submitted.candidate.revision, digest: submitted.candidate.digest, changedPaths: submitted.candidate.changedPaths, verification: "not_performed", promotionAllowed: false,
        // Which view each target was resolved from, so a step aimed at a control of another page than the one it runs on can be seen (t358).
        ...(submitted.handleViews.length ? { handleViews: submitted.handleViews.map((view) => ({ node: view.node, handle: view.handle, view: view.view, location: view.location })) } : {}),
        next: gate.available ? `Test this revision with ${testId} before completing.` : "No trial runner is available here; completing leaves an unverified draft." };
      return { kind: "llm_evidence_tool_execution", evidence, effectApplied: false, targetsUnchanged: true };
    }
  };
  // Observed here, around the two candidate tools, and not by the caller around
  // `input.loop`: there, saving and testing the Flow had no rows, so the chat
  // showed no card for either (t366, t373). The completion check stays outside
  // it: completing is allowed only after a passed test, which that test's card
  // already says, and the observer's completion note is the legacy round's
  // ("it still has to run cleanly").
  const loop = await runAutomationStudioLlmEvidenceLoop({ ...(input.observe ? input.observe(discovery) : discovery), checkCompletion });
  const candidate = controller.latest();
  return { loop, candidate, trial: gate.standing(candidate), promotionAllowed: false as const };
}
