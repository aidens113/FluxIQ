import type { ClientGatewayActivityResolution } from "@fluxiq/contracts/client-gateway";
import { AUTOMATION_STUDIO_PERSON_NEEDED_STOP_OPTION, type AutomationStudioAsk, type AutomationStudioAskAnswer } from "../../parking/index.ts";
import { automationStudioActivityAskIsPersonNeeded } from "./person-needed.ts";

/**
 * How an ask was settled, from the answer that settled it; no answer is
 * nobody having answered in time. A permission granted is `allowed`, a refusal
 * or a robot check's Stop is `declined`, and every other answer is `answered`.
 *
 * `waited_out` is never read from an answer: it is a check that cleared by
 * itself, which no person answered.
 */
export function automationStudioActivityAskResolution(
  ask: Pick<AutomationStudioAsk, "kind" | "control">,
  answer: Pick<AutomationStudioAskAnswer, "kind" | "value"> | undefined
): ClientGatewayActivityResolution {
  if (!answer) return "timed_out";
  if (answer.kind === "deny") return "declined";
  if (answer.kind === "grant") return ask.kind === "permission" ? "allowed" : "answered";
  if (answer.kind === "choice" && automationStudioActivityAskIsPersonNeeded(ask) && answer.value === AUTOMATION_STUDIO_PERSON_NEEDED_STOP_OPTION) return "declined";
  return "answered";
}
