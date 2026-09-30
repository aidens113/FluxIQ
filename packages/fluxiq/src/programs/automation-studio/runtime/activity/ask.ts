import { AUTOMATION_STUDIO_PERSON_NEEDED_CONTROL_KIND, type AutomationStudioAsk } from "../parking/index.ts";
import { emitAutomationStudioActivity } from "./emit.ts";

/**
 * Says the work is waiting on a person, for as long as a parking ask is open.
 *
 * One emitter for a build and a run alike, so the two say it the same way. A
 * person-needed ask (`../parking/person-needed-ask.ts`) is shown in its own
 * words -- "FluxIQ needs you: complete the check on this page, then press
 * Continue." -- because that sentence is the instruction, and a surface that
 * showed "waiting for an answer" instead would leave the person looking for a
 * question when what they have to do is go to the browser. Every other ask
 * keeps the generic label: its text is a question the thread already shows.
 */
export function emitAutomationStudioActivityWaitingOnAsk(ask: Pick<AutomationStudioAsk, "kind" | "text" | "control">, ref?: string): void {
  const personNeeded = ask.control?.kind === AUTOMATION_STUDIO_PERSON_NEEDED_CONTROL_KIND;
  emitAutomationStudioActivity({
    phase: "waiting_permission",
    label: personNeeded ? ask.text : "Waiting for an answer before going on",
    detail: {
      kind: "ask",
      title: personNeeded ? "Asked the person to complete a check" : `Asked a question (${ask.kind})`,
      status: "started",
      ...(ref === undefined ? {} : { ref })
    }
  });
}
