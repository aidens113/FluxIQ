import type { AutomationStudioCandidateTrialRequest, AutomationStudioCandidateTrialResult } from "../../flow-bootstrap/candidate/index.ts";
import type { CandidateTrialReceiver } from "../contracts/index.ts";
import { candidateTrialInvocations } from "./invocations.ts";
import { candidateTrialAuthority } from "./of.ts";

export async function invokeCandidateTrial(receiver: CandidateTrialReceiver, request: AutomationStudioCandidateTrialRequest): Promise<AutomationStudioCandidateTrialResult> {
  const bound = candidateTrialInvocations.get(request);
  const authority = bound ? candidateTrialAuthority(bound.modeOwner.port) : undefined;
  return bound && authority ? await authority.invokeTrial(bound.checkout, receiver, request) : await receiver.port(request);
}
