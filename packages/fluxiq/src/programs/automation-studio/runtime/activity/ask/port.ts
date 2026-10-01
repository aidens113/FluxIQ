import type { ClientGatewayActivityPhase } from "@fluxiq/contracts/client-gateway";
import type { AutomationStudioParkingPort } from "../../parking/index.ts";
import { emitAutomationStudioActivityWaitingOnAsk } from "./ask.ts";
import { automationStudioActivityAskResolution } from "./resolution.ts";
import { emitAutomationStudioActivityAskResolved } from "./resolved.ts";

/**
 * A parking port that says, in the activity stream, when the work waits on a
 * person and how the wait ended.
 *
 * Wrapped around the port by whoever hands one to work that waits in place --
 * a build's permission and person-needed asks, a repair's -- because
 * `../../parking/` is kept free of activity (a value import back from there
 * would close a module cycle). What is said follows what the port did, and
 * nothing else:
 *
 * - the wait is announced only when the work actually waits (`awaitAnswer`),
 *   after the ask was opened; a question opened and walked away from, or one
 *   that could not be put, is no wait;
 * - an answer settles it as `answered`, `allowed` or `declined`, and nothing
 *   back as `timed_out`;
 * - work cancelled while it waited, or a thread that could not be read, settles
 *   it as `cancelled`: the wait is over although nobody answered, and a card
 *   must never go on waiting after the work stopped.
 *
 * `phase` is the phase the work returns to once the wait is over.
 */
export function automationStudioActivityAskPort(port: AutomationStudioParkingPort, phase: ClientGatewayActivityPhase): AutomationStudioParkingPort {
  const awaitAnswer = port.awaitAnswer?.bind(port);
  return {
    open: (ask) => port.open(ask),
    ...(awaitAnswer ? {
      awaitAnswer: async (ask, wait) => {
        emitAutomationStudioActivityWaitingOnAsk(ask);
        let answer: Awaited<ReturnType<typeof awaitAnswer>>;
        try {
          answer = await awaitAnswer(ask, wait);
        } catch (error) {
          emitAutomationStudioActivityAskResolved(ask, "cancelled", phase);
          throw error;
        }
        emitAutomationStudioActivityAskResolved(ask, !answer && wait.signal?.aborted ? "cancelled" : automationStudioActivityAskResolution(ask, answer), phase);
        return answer;
      }
    } satisfies Pick<AutomationStudioParkingPort, "awaitAnswer"> : {})
  };
}
