import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioVersionedFlowDocument } from "../contracts.ts";
import { automationStudioFlowGraphVersion } from "../flow-graph-version.ts";
import { automationStudioFlowInstructionDigest } from "../instruction-digest.ts";
import { automationStudioRunFlowVersions } from "../run-flow-versions.ts";
import type { AutomationStudioFlowJudgedBuildTrial } from "./contracts.ts";

/** What apply hands over of the adaptation it is applying: its id, its audit trail and the graphs it saves. */
export type AutomationStudioAppliedJudgedBuildTrialAdaptation = {
  adaptationId: string;
  auditEvents?: readonly { eventType: string; detail: JsonObject }[] | undefined;
  topology: { subflows: readonly { subflow: { subflowId: string }; graphFlow: { flowId: string } }[] };
};

/**
 * The judged trial apply records on the parent Flow (`./contracts.ts`), or
 * nothing where the adaptation's build judged no trial yes.
 *
 * **The trial.** A candidate build's and a project build's whole-Flow
 * promotion both propose through one path, which names the trial whose yes
 * earned the proposal on the proposal's `created` audit event
 * (`candidateTrial.trial`: its run id, its verdict, its judge calls and, from
 * t677, whether its yes was first-ask confirmed;
 * `../../service/candidate-trial/promotion.ts`). An adaptation without one --
 * an evidence-guided build, a repair's re-author -- records nothing.
 *
 * **The versions.** Read after apply has saved every Subflow graph, each read
 * back as a run reads it, so the revision recorded is the one a run of the
 * saved Flow will name; the parent as apply read it, since apply writes only
 * its metadata, which starts no revision.
 *
 * **The digest.** Of the Flow's instructions as the run's result check reads
 * them, read at apply. Apply refuses unless the Flow's dependency digest, which
 * covers every instruction's text, is still the one the candidate was built and
 * tried on (`FLOW_BOOTSTRAP_STALE`), so this is the request the trial was
 * judged against.
 */
export async function automationStudioAppliedJudgedBuildTrial(input: {
  adaptation: AutomationStudioAppliedJudgedBuildTrialAdaptation;
  parent: AutomationStudioVersionedFlowDocument;
  readGraph(graphFlowId: string): Promise<AutomationStudioVersionedFlowDocument>;
  instructions(): Promise<readonly { title?: string; body?: string }[]>;
}): Promise<AutomationStudioFlowJudgedBuildTrial | undefined> {
  const trial = judgedYes(input.adaptation);
  if (!trial) return undefined;
  const versions = automationStudioRunFlowVersions([
    automationStudioFlowGraphVersion({ flow: input.parent }),
    ...await Promise.all(input.adaptation.topology.subflows.map(async (entry) => automationStudioFlowGraphVersion({ flow: await input.readGraph(entry.graphFlow.flowId), subflowId: entry.subflow.subflowId })))
  ]);
  if (!versions.some((version) => version.revision !== null)) return undefined;
  const instructionDigest = automationStudioFlowInstructionDigest(await input.instructions());
  if (!instructionDigest) return undefined;
  return { ...trial, instructionDigest, adaptationId: input.adaptation.adaptationId, versions };
}

/** The yes trial the proposal's `created` event names, where it names one whole. */
function judgedYes(adaptation: AutomationStudioAppliedJudgedBuildTrialAdaptation): Pick<AutomationStudioFlowJudgedBuildTrial, "trialRunId" | "verdict" | "calls" | "firstAskConfirmed"> | undefined {
  const created = adaptation.auditEvents?.find((event) => event.eventType === "created");
  const candidateTrial = created?.detail.candidateTrial;
  if (!candidateTrial || typeof candidateTrial !== "object" || Array.isArray(candidateTrial)) return undefined;
  const trial = candidateTrial.trial;
  if (!trial || typeof trial !== "object" || Array.isArray(trial)) return undefined;
  const { runId, verdict, calls, firstAskConfirmed } = trial;
  if (typeof runId !== "string" || !runId.trim() || verdict !== "yes") return undefined;
  if (typeof calls !== "number" || !Number.isSafeInteger(calls) || calls < 1) return undefined;
  // The yes's first-ask fact where the proposal says it (t677); a proposal made before it, or a value that is no flag, says nothing.
  return { trialRunId: runId, verdict, calls, ...(typeof firstAskConfirmed === "boolean" ? { firstAskConfirmed } : {}) };
}
