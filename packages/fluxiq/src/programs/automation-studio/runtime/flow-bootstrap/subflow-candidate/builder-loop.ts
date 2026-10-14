// A subflow builder: the candidate authoring loop's discovery mode, scoped to
// one brief (automation-project-agents-plan.md, `Role Model`, `Tool scopes`).
//
// The builder explores with the tools its role keeps (`./role-tools.ts`),
// submits its own subflow with `core.submit_subflow` (`./scoped-submission.ts`)
// and tries it with `core.test_subflow` (`./subflow-trial-gate.ts`). It never
// sees the whole candidate's tools, nor the supervisor's `project.*` ones, and
// its completion names its subflow, revision and digest: a proposal for the
// supervisor to assemble, never a Flow to promote.
//
// The dispatcher may give the opening call a scope (`callScope`, the brief's
// id) so two builders of one Flow running at once never share the domain's
// per-build memory of it. It passes one only when the host runs more than one
// builder at a time: without one the opening id is `initial.<toolId>` exactly,
// which is what a domain matching that id expects.
//
// The loop's wrap-up keeps this loop's own finishing tools running and names
// them (`finishingTools`), not the whole candidate's.
import type { JsonObject } from "../../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceLoopInput, type AutomationStudioLlmEvidenceTool } from "../../llm/evidence-loop.ts";
import { AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE, AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT, AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT, AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT } from "../plan/index.ts";
import { automationStudioCandidateSubmissionRefusal } from "../candidate/index.ts";
import type { AutomationStudioSubflowProposal, AutomationStudioSubflowScope, AutomationStudioSubflowTrialPort } from "./contracts.ts";
import { automationStudioSubflowBuilderTools } from "./role-tools.ts";
import { AutomationStudioSubflowScopedSubmissionController } from "./scoped-submission.ts";
import { AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, AutomationStudioSubflowTrialGate } from "./subflow-trial-gate.ts";

/** The builder's submit tool. */
export const AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID = "core.submit_subflow";

/** The code a completion is refused under when it does not name the latest proposal, or there is none. */
const LATEST_REQUIRED = "subflow.latest_proposal_required";

type ScopedInput = ConstructorParameters<typeof AutomationStudioSubflowScopedSubmissionController>[0];

/** What a builder's run ends with: the loop's result, its latest proposal and that proposal's partial verdict. Never promotion. */
export type AutomationStudioSubflowBuilderOutcome = {
  loop: Awaited<ReturnType<typeof runAutomationStudioLlmEvidenceLoop>>;
  proposal: AutomationStudioSubflowProposal | undefined;
  trial: ReturnType<AutomationStudioSubflowTrialGate["standing"]>;
  promotionAllowed: false;
};

/**
 * What the submit tool says of the subflow's success check (t569). A scope
 * with one: it is the plan's, as before, byte for byte. A scope with none --
 * the plan the project supervisor writes gives none -- proposing one is the
 * builder's, in the script's own `done when:` terms
 * (`../plan/flow-script-format.ts`): where the line goes for this kind of
 * subflow, and that it becomes the subflow's check, which its trial is judged
 * against (`./scoped-submission.ts`, `../../service/subflow-trial/run.ts`).
 */
function successCheckRule(scope: AutomationStudioSubflowScope): string {
  if (scope.successCheck !== undefined) return "Its inputs, outputs and success check are the plan's; leave them out or write exactly those.";
  const where = scope.interface ? `inside its own \`part ${scope.subflowKey}:\` block, before its first step` : "outside every block, after its last step";
  return "Its inputs and outputs are the plan's; leave them out or write exactly those. "
    + `The plan gives it no success check, so propose one with it: a \`done when: <fact>\` line ${where}, saying what the page shows once it worked, for example \`done when: text t11 contains "Booked"\`. `
    + "It becomes this subflow's success check, and its trial is judged against it.";
}

export async function runAutomationStudioSubflowBuilderLoop(input: {
  loop: Omit<AutomationStudioLlmEvidenceLoopInput, "draft" | "dryRun" | "checkCompletion" | "completionSchema" | "fullRunRequired" | "discoveryOnly" | "callScope" | "finishingTools">;
  scope: AutomationStudioSubflowScope;
  siblings: ScopedInput["siblings"];
  submission: ScopedInput["submission"];
  trial?: { port: AutomationStudioSubflowTrialPort } | undefined;
  /** Suffixes the opening call's id; passed only when builders of one Flow may run at once (header). */
  callScope?: string | undefined;
  /** Told each proposal Core accepted, so a caller whose loop then fails still knows the latest one. */
  accepted?: ((proposal: Readonly<AutomationStudioSubflowProposal>) => void) | undefined;
  /** Wraps the loop's input before it runs, as the candidate loop's `observe` does. */
  observe?: ((loop: AutomationStudioLlmEvidenceLoopInput) => AutomationStudioLlmEvidenceLoopInput) | undefined;
}): Promise<AutomationStudioSubflowBuilderOutcome> {
  const signals = [input.loop.signal, input.submission.signal].filter((value): value is AbortSignal => value !== undefined);
  const signal = signals.length ? AbortSignal.any(signals) : undefined;
  const submission: ScopedInput["submission"] = signal ? { ...input.submission, signal } : input.submission;
  const controller = new AutomationStudioSubflowScopedSubmissionController({ scope: input.scope, siblings: input.siblings, submission });
  const gate = new AutomationStudioSubflowTrialGate({ scope: input.scope, latest: () => controller.latest(), port: input.trial?.port, signal });
  const subflowKey = input.scope.subflowKey;
  const submitTool: AutomationStudioLlmEvidenceTool = {
    toolId: AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, effect: "observe",
    description: `Submit your subflow "${subflowKey}", written as a Flow script under "flow" (its description gives the format and examples), or a JSON plan under "plan". Write its steps outside every block, and any helper it needs as a part those steps call. Write no \`when:\` line and no other subflow: which situation runs which subflow is the structure plan's. ${successCheckRule(input.scope)} Static validity returns a draft revision and digest, never acceptance. Correct every diagnostic and resubmit the whole subflow. Then test that exact revision with ${AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID}, and complete with the subflowKey, revision and digest only after its trial answers yes.`,
    inputSchema: { type: "object", properties: { flow: { type: "string", description: `This subflow as a script. ${AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT}\n${AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE}\n${AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT}\n${AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT}` }, plan: { type: "object" }, summary: { type: "string" } }, additionalProperties: false }
  };
  const checkCompletion: NonNullable<AutomationStudioLlmEvidenceLoopInput["checkCompletion"]> = async (result) => {
    const proposal = controller.latest();
    if (!proposal) return { ok: false, issueCodes: [LATEST_REQUIRED], feedback: { code: LATEST_REQUIRED, submitted: false, instruction: `No proposal of this subflow stands, so there is no revision or digest to complete with: never invent them. Submit the subflow with ${AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID}${gate.available ? `, test it with ${AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID}` : ""}, then complete with the subflowKey, revision and digest it returned.` } };
    const named = result.subflowKey === subflowKey && typeof result.revision === "number" && typeof result.digest === "string" && Object.keys(result).every((key) => key === "subflowKey" || key === "revision" || key === "digest");
    if (!named || !controller.matches({ revision: result.revision as number, digest: result.digest as string })) {
      return { ok: false, issueCodes: [LATEST_REQUIRED], feedback: { code: LATEST_REQUIRED, submitted: true, subflowKey, revision: proposal.revision, digest: proposal.digest,
        instruction: `This is not the latest proposal of this subflow. Complete with exactly {"subflowKey": ${JSON.stringify(subflowKey)}, "revision": ${proposal.revision}, "digest": "${proposal.digest}"} and nothing else${gate.available ? `, after ${AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID} has answered yes for that revision` : ""}.` } };
    }
    return gate.completion({ revision: proposal.revision, digest: proposal.digest });
  };
  const discovery: AutomationStudioLlmEvidenceLoopInput = {
    ...input.loop, draft: false, dryRun: false, discoveryOnly: true,
    finishingTools: { submit: AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, test: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID },
    tools: [...automationStudioSubflowBuilderTools(input.loop.tools), submitTool, gate.tool],
    completionSchema: { type: "object", properties: { subflowKey: { type: "string", const: subflowKey }, revision: { type: "integer" }, digest: { type: "string" } }, required: ["subflowKey", "revision", "digest"], additionalProperties: false },
    executeTool: async (call) => {
      if (call.toolId === AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID) return gate.test(call.value, call.signal);
      if (call.toolId !== AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID) return input.loop.executeTool(call);
      const submitted = await controller.submit(call.value, { trialOf: (proposal) => gate.standing(proposal), refuted: (digest) => gate.refuted(digest) });
      if (!submitted.ok) {
        const refusal = automationStudioCandidateSubmissionRefusal(submitted);
        return { kind: "llm_evidence_tool_execution", effectApplied: false, targetsUnchanged: true, ...refusal };
      }
      input.accepted?.(structuredClone(submitted.proposal));
      const evidence: JsonObject = {
        ok: true, status: "draft", partial: true, subflowKey, revision: submitted.proposal.revision, digest: submitted.proposal.digest,
        changedPaths: [...submitted.proposal.changedPaths], verification: "not_performed", promotionAllowed: false,
        ...acceptedScript(call.value, submitted.proposal),
        next: gate.available
          ? `Test next with ${AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID} using exactly {"revision": ${submitted.proposal.revision}, "digest": "${submitted.proposal.digest}"}. Do not complete until that exact revision's trial answers yes. Submitting again makes a new revision that needs its own trial.`
          : "No subflow trial runner is available here; completing leaves an untried proposal."
      };
      return { kind: "llm_evidence_tool_execution", evidence, effectApplied: false, targetsUnchanged: true };
    }
  };
  if (signal) discovery.signal = signal;
  if (input.callScope !== undefined) discovery.callScope = input.callScope;
  const loop = await runAutomationStudioLlmEvidenceLoop({ ...(input.observe ? input.observe(discovery) : discovery), checkCompletion });
  const proposal = controller.latest();
  return { loop, proposal, trial: gate.standing(proposal), promotionAllowed: false };
}

/** The subflow an accepted proposal is, as the model sent it, labelled by its revision and digest, in words that stay true (t498, t503). */
function acceptedScript(sent: JsonObject, proposal: Readonly<AutomationStudioSubflowProposal>): JsonObject {
  const said = `Revision ${proposal.revision} (digest ${proposal.digest}) of this subflow, as Core accepted it`;
  if (typeof sent.flow === "string") return { script: sent.flow, scriptIs: `${said}: script is its whole text.` };
  if (sent.plan !== undefined) return { plan: sent.plan, scriptIs: `${said}: plan is its whole JSON plan.` };
  return {};
}
