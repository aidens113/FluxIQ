// A saved candidate's current original sources, through their existing owners. This grants no execution.
import { isDeepStrictEqual } from "node:util";
import { AutomationStudioCandidateSource, type AutomationStudioCandidateDraftReference, type AutomationStudioFlowCandidateDraftStore, type AutomationStudioFlowCandidateDraftRecord } from "../../candidate-drafts/index.ts";
import { AutomationStudioBootstrapInstructionInventory } from "../../flow-bootstrap-commands/index.ts";

type Inventory = ConstructorParameters<typeof AutomationStudioBootstrapInstructionInventory>[0];
type Binding = { executionDigest: string; settingsRevision: number };
type RecordV2 = Extract<AutomationStudioFlowCandidateDraftRecord, { schemaVersion: 2 }>;

export type AutomationStudioAnswerFirstSourceOwner = {
  getLlmExecutionBinding(projectId: string, flowId: string): Promise<Binding>;
  listFlowInstructionSummaries: Inventory["list"];
  getFlowInstruction: Inventory["get"];
};

export type AutomationStudioAnswerFirstSourceUnknownCode = "authority_missing" | "candidate_missing" | "source_unbound" | "source_stale" | "binding_changed" | "unavailable";
export type AutomationStudioAnswerFirstSourceRead =
  | { status: "bound"; reference: AutomationStudioCandidateDraftReference; record: RecordV2 }
  | { status: "unknown"; code: AutomationStudioAnswerFirstSourceUnknownCode };
export type AutomationStudioAnswerFirstSourceAuthority = {
  read(candidateId: string, expected?: AutomationStudioCandidateDraftReference): Promise<AutomationStudioAnswerFirstSourceRead>;
};

/** Optional capabilities keep legacy owners executable; unavailable authority stays unknown. */
export function automationStudioAnswerFirstSourceAuthority(input: {
  projectId: string; flowId: string;
  owner: Partial<AutomationStudioAnswerFirstSourceOwner>;
  drafts: Partial<Pick<AutomationStudioFlowCandidateDraftStore, "getAuthoritative" | "getVerificationSource">>;
}): AutomationStudioAnswerFirstSourceAuthority {
  const { projectId, flowId, owner, drafts } = input;
  return { read: async (candidateId, expected) => {
    try {
      const pinned = expected === undefined ? undefined : structuredClone(expected);
      if (typeof candidateId !== "string" || !candidateId) return unknown("candidate_missing");
      const { getLlmExecutionBinding: binding, listFlowInstructionSummaries: list, getFlowInstruction: get } = owner;
      const { getAuthoritative: authoritative, getVerificationSource: verify } = drafts;
      if (typeof binding !== "function" || typeof list !== "function" || typeof get !== "function" || typeof authoritative !== "function" || typeof verify !== "function") return unknown("authority_missing");
      const before = bindingOf(await binding.call(owner, projectId, flowId));
      if (!before) return unknown("binding_changed");
      const inventory = await new AutomationStudioBootstrapInstructionInventory({ list: request => list.call(owner, request), get: (project, id) => get.call(owner, project, id) }).read(projectId, flowId, true);
      const current = AutomationStudioCandidateSource.capture({ projectId, flowId, inventoryInstructionIds: inventory.instructionIds, instructions: inventory.instructions });
      const record = await authoritative.call(drafts, projectId, flowId);
      if (!record || record.schemaVersion !== 2) return unknown("source_unbound");
      // This store holds the latest draft. A different id is never a replacement for the saved one.
      if (record.candidateId !== candidateId || record.projectId !== projectId || record.flowId !== flowId) return unknown("source_stale");
      const reference = referenceOf(record);
      if (pinned !== undefined && !isDeepStrictEqual(pinned, reference)) return unknown("source_stale");
      const verified = await verify.call(drafts, { reference, currentOriginalSources: current.originalSources });
      const after = bindingOf(await binding.call(owner, projectId, flowId));
      if (!after || !isDeepStrictEqual(before, after) || before.executionDigest !== reference.baseDependencyDigest || before.settingsRevision !== reference.baseSettingsRevision) return unknown("binding_changed");
      if (verified.status !== "bound" || !isDeepStrictEqual(referenceOf(verified.record), reference)) return unknown("source_stale");
      return { status: "bound", reference: Object.freeze(reference), record: verified.record };
    } catch { return unknown("unavailable"); }
  } };
}

function referenceOf(record: RecordV2): AutomationStudioCandidateDraftReference {
  return { projectId: record.projectId, flowId: record.flowId, candidateId: record.candidateId, revision: record.candidate.revision,
    digest: record.candidate.digest, baseDependencyDigest: record.candidate.baseDependencyDigest,
    baseSettingsRevision: record.baseSettingsRevision, originalInstructionsDigest: record.originalInstructionsDigest };
}

function bindingOf(value: Binding): Binding | undefined {
  return value && typeof value.executionDigest === "string" && value.executionDigest.length > 0 && Number.isSafeInteger(value.settingsRevision) && value.settingsRevision >= 0
    ? { executionDigest: value.executionDigest, settingsRevision: value.settingsRevision } : undefined;
}

function unknown(code: AutomationStudioAnswerFirstSourceUnknownCode): Extract<AutomationStudioAnswerFirstSourceRead, { status: "unknown" }> { return { status: "unknown", code }; }
