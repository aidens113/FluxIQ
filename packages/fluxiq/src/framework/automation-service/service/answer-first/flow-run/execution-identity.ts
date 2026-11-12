// Exact stamped-plan correspondence around the engine's configuration reads and run. No input-frame or whole-run proof.
import { isDeepStrictEqual } from "node:util";
import type { AutomationStudioFlowBuildPlan } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import type { AutomationStudioCandidateDraftReference } from "../../candidate-drafts/index.ts";
import type { AutomationStudioAnswerFirstSourceAuthority, AutomationStudioAnswerFirstSourceRead, AutomationStudioAnswerFirstSourceUnknownCode } from "./source-authority.ts";

export type AutomationStudioAnswerFirstExecutableSource =
  | { status: "bound"; reference: AutomationStudioCandidateDraftReference }
  | { status: "unknown"; code: AutomationStudioAnswerFirstSourceUnknownCode | "executable_changed" };

/** The single pre-assembly source snapshot, closed against the same reference after execution. */
export async function automationStudioAnswerFirstExecutionIdentity(input: {
  projectId: string; flowId: string; candidateId?: string | undefined;
  authority?: AutomationStudioAnswerFirstSourceAuthority | undefined;
  basis: AutomationStudioAnswerFirstSourceRead;
  buildPlan: AutomationStudioFlowBuildPlan;
  currentBaseDigest(): Promise<string>;
}): Promise<{ finish(baseDependencyDigest: string): Promise<AutomationStudioAnswerFirstExecutableSource> }> {
  const held = (value: AutomationStudioAnswerFirstExecutableSource) => ({ finish: async () => value });
  if (!input.candidateId) return held(unknown("candidate_missing"));
  try {
    const before = structuredClone(input.basis);
    // A later available source cannot replace an initially unknown basis.
    if (before.status !== "bound") return held(closedUnknown(before));
    if (!input.authority) return held(unknown("authority_missing"));
    const executable = structuredClone(input.buildPlan);
    const authority = input.authority, candidateId = input.candidateId;
    const reference = structuredClone(before.reference);
    if (!owns(before, input)) return held(unknown("source_stale"));
    if (!isDeepStrictEqual(executable, before.record.candidate.buildPlan) || !isDeepStrictEqual(executable, input.buildPlan)) return held(unknown("executable_changed"));
    return { finish: async baseDependencyDigest => {
      try {
        if (reference.baseDependencyDigest !== baseDependencyDigest) return unknown("binding_changed");
        const after = await authority.read(candidateId, structuredClone(reference));
        if (after.status !== "bound") return closedUnknown(after);
        if (!owns(after, input) || !isDeepStrictEqual(reference, after.reference)) return unknown("source_stale");
        if (!isDeepStrictEqual(executable, after.record.candidate.buildPlan) || !isDeepStrictEqual(executable, input.buildPlan)) return unknown("executable_changed");
        if (await input.currentBaseDigest() !== baseDependencyDigest) return unknown("binding_changed");
        if (!isDeepStrictEqual(executable, input.buildPlan)) return unknown("executable_changed");
        // Only the existing closed reference leaves this check; executable/source bytes remain local.
        return { status: "bound", reference: structuredClone(reference) };
      } catch { return unknown("unavailable"); }
    } };
  } catch { return held(unknown("unavailable")); }
}

function owns(read: Extract<AutomationStudioAnswerFirstSourceRead, { status: "bound" }>, input: { projectId: string; flowId: string; candidateId?: string | undefined }): boolean {
  const { reference: ref, record } = read;
  return Object.keys(ref).length === 8 && ref.projectId === input.projectId && ref.flowId === input.flowId && ref.candidateId === input.candidateId
    && Number.isSafeInteger(ref.revision) && ref.revision >= 1 && Number.isSafeInteger(ref.baseSettingsRevision) && ref.baseSettingsRevision >= 0
    && typeof ref.digest === "string" && /^[a-f0-9]{64}$/.test(ref.digest) && typeof ref.originalInstructionsDigest === "string" && /^[a-f0-9]{64}$/.test(ref.originalInstructionsDigest)
    && typeof ref.baseDependencyDigest === "string" && ref.baseDependencyDigest.length > 0 && record.schemaVersion === 2
    && isDeepStrictEqual(ref, { projectId: record.projectId, flowId: record.flowId, candidateId: record.candidateId, revision: record.candidate.revision,
      digest: record.candidate.digest, baseDependencyDigest: record.candidate.baseDependencyDigest, baseSettingsRevision: record.baseSettingsRevision, originalInstructionsDigest: record.originalInstructionsDigest });
}

function closedUnknown(value: AutomationStudioAnswerFirstSourceRead): AutomationStudioAnswerFirstExecutableSource {
  if (value.status !== "unknown") return unknown("unavailable");
  switch (value.code) {
    case "authority_missing": case "candidate_missing": case "source_unbound": case "source_stale": case "binding_changed": case "unavailable": return unknown(value.code);
    default: return unknown("unavailable");
  }
}

function unknown(code: Extract<AutomationStudioAnswerFirstExecutableSource, { status: "unknown" }>["code"]): AutomationStudioAnswerFirstExecutableSource { return { status: "unknown", code }; }
