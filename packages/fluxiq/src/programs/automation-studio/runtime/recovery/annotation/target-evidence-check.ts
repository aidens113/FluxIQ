// How a target override is judged against the evidence the patch request
// showed the model: the failure packet, and the packets the exploration
// returned. A domain numbers its handles per packet, so a handle is only
// meaningful with its packet, and the check asks the domain about exactly one.
// Both appliers use it: the one that tries a patch after the run
// (`./patches.ts`) and the one that overlays it on a run held at its failing
// step (`../../service/runtime-session/in-run-repair.ts`).

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmContextPacket, AutomationStudioRuntimeTargetOverrideTarget } from "../../llm/index.ts";
import type { AutomationStudioRuntimeTargetOverrideEvidenceValidation, AutomationStudioRuntimeTargetOverrideFailedAction } from "../../live-patch.ts";
import { isJsonRecord } from "../../service/index.ts";
import { automationStudioExploredEvidenceHandle } from "./exploration.ts";
import type { AutomationStudioRuntimeRecoveryPorts } from "./ports.ts";

export type AutomationStudioRecoveryTargetEvidenceSource = "failure_evidence" | "exploration_evidence";
type TargetEvidenceJudgement = { validation: AutomationStudioRuntimeTargetOverrideEvidenceValidation; source?: AutomationStudioRecoveryTargetEvidenceSource };
type TargetEvidenceCheck = (target: AutomationStudioRuntimeTargetOverrideTarget, failedAction: AutomationStudioRuntimeTargetOverrideFailedAction) => TargetEvidenceJudgement;

/**
 * The target check a patch is judged by, or none when there is nothing to judge
 * it with -- no domain check bound, or no packet at all -- which the live patch
 * refuses as `domain_check_unavailable`.
 *
 * Without an exploration slot this is the check it always was: every handle,
 * as written, against the failure packet. With one, the handles say which
 * packet they came from. A target naming one explored packet is judged against
 * that packet alone, with Core's qualifier removed; one naming none is judged
 * against the failure packet. A target that mixes packets, or names an explored
 * packet the request did not carry, was not shown to the model as one thing
 * and is refused without asking the domain -- so a handle that no packet
 * issued is refused exactly as it was before explored packets existed.
 */
export function automationStudioRecoveryTargetEvidenceCheck(input: {
  ports: Pick<AutomationStudioRuntimeRecoveryPorts, "llmEvidenceRuntime">;
  failureEvidence?: JsonObject | undefined;
  explorationEvidence?: AutomationStudioLlmContextPacket["explorationEvidence"] | undefined;
}): TargetEvidenceCheck | undefined {
  const binding = input.ports.llmEvidenceRuntime;
  const validate = binding?.validateTargetOverrideEvidence;
  if (!binding || !validate) return undefined;
  // One question to the domain about one packet. A throw is read as `absent`,
  // as it always was: the domain could not vouch for the target.
  const askDomain = (evidence: JsonObject, target: AutomationStudioRuntimeTargetOverrideTarget, failedAction: AutomationStudioRuntimeTargetOverrideFailedAction): AutomationStudioRuntimeTargetOverrideEvidenceValidation => {
    try {
      return validate.call(binding, evidence, target, failedAction);
    } catch {
      return { status: "absent" };
    }
  };
  const failureEvidence = input.failureEvidence;
  const exploration = input.explorationEvidence;
  if (!exploration) {
    if (!failureEvidence) return undefined;
    return (target, failedAction) => ({ validation: askDomain(failureEvidence, target, failedAction), source: "failure_evidence" });
  }
  const carried = new Map(exploration.packets.map((entry) => [entry.evidenceId, entry.packet] as const));
  return (target, failedAction) => {
    const route = handleRoute(target);
    if (route.kind === "mixed") return { validation: { status: "absent", reason: "handle_not_issued" } };
    if (route.kind === "unqualified") {
      if (!failureEvidence) return { validation: { status: "absent", reason: "domain_check_unavailable" } };
      return { validation: askDomain(failureEvidence, target, failedAction), source: "failure_evidence" };
    }
    const packet = carried.get(route.evidenceId);
    if (!packet) return { validation: { status: "absent", reason: "handle_not_issued" } };
    const validation = askDomain(packet, route.target, failedAction);
    // `matched` means the target stands as the domain was shown it, which is
    // without Core's qualifier: that is the target to carry, with whatever the
    // domain said it names.
    return { validation: validation.status === "matched" ? { status: "resolved", target: route.target, ...(validation.control ? { control: validation.control } : {}) } : validation, source: "exploration_evidence" };
  };
}

/** Which packet every handle of a target came from, and the target as that packet issued it. */
function handleRoute(target: AutomationStudioRuntimeTargetOverrideTarget):
  | { kind: "unqualified" }
  | { kind: "mixed" }
  | { kind: "qualified"; evidenceId: string; target: AutomationStudioRuntimeTargetOverrideTarget } {
  // A target that is not a handle map is the domain's to refuse, as it always was.
  if (!isJsonRecord(target.handles)) return { kind: "unqualified" };
  const read = Object.entries(target.handles).map(([parameter, handle]) => [parameter, typeof handle === "string" ? automationStudioExploredEvidenceHandle(handle) : undefined] as const);
  const qualified = new Set(read.flatMap(([, handle]) => handle?.kind === "qualified" ? [handle.evidenceId] : []));
  if (qualified.size === 0) return { kind: "unqualified" };
  if (qualified.size > 1 || read.some(([, handle]) => handle?.kind !== "qualified")) return { kind: "mixed" };
  const handles = Object.fromEntries(read.map(([parameter, handle]) => [parameter, handle!.handle]));
  return { kind: "qualified", evidenceId: [...qualified][0]!, target: { ...target, handles } };
}
