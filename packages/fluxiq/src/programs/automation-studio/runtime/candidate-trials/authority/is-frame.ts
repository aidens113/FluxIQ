import { candidateTrialFramePorts } from "./frame-ports.ts";

export function isCandidateTrialFrame(callback: object, automation: boolean): boolean {
  const frame = candidateTrialFramePorts.get(callback);
  return frame !== undefined && (!frame.automation || automation);
}
