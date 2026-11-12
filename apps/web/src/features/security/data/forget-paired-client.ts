import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import { answerIsDenied } from "./answer-is-denied";
import type { ChangeResult } from "./types";

/**
 * Stops trusting a paired browser (automation-studio `revoke-client-trust`). The route
 * `/api/client-gateway/forget-pairing` takes only the browser's own credential, so a
 * signed-in person forgets a browser through this program endpoint instead.
 */
export async function forgetPairedClient(studio: ProgramCommandTransport, trustedClientId: string): Promise<ChangeResult> {
  const answer = await studio.post("revoke-client-trust", { trustedClientId, reason: "forgotten from the Security screen" });
  if (answerIsDenied(answer)) return "denied";
  return answer.ok ? "done" : "failed";
}
