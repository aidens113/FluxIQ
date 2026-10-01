import type { AutomationStudioAsk } from "../../parking/index.ts";
import { emitAutomationStudioActivity } from "../emit.ts";
import { automationStudioActivityAskIsPersonNeeded } from "./person-needed.ts";
import { automationStudioActivityAskTitle } from "./title.ts";

/**
 * Says the work is waiting on a person, for as long as a parking ask is open.
 *
 * One emitter for a build, a repair and a run alike, so all three say it the
 * same way. The row's `ref` is the ask id, which the row that settles the wait
 * (`./resolved.ts`) carries too, so a client draws one card for both.
 *
 * A person-needed ask (`../../parking/person-needed-ask.ts`) is shown in its
 * own words -- "FluxIQ needs you: complete the check on this page, then press
 * Continue." -- because that sentence is the instruction, and a surface that
 * showed "waiting for an answer" instead would leave the person looking for a
 * question when what they have to do is go to the browser. Every other ask
 * keeps the generic label: its text is a question the thread already shows.
 */
export function emitAutomationStudioActivityWaitingOnAsk(ask: Pick<AutomationStudioAsk, "askId" | "kind" | "text" | "control">): void {
  emitAutomationStudioActivity({
    phase: "waiting_permission",
    label: automationStudioActivityAskIsPersonNeeded(ask) ? ask.text : "Waiting for an answer before going on",
    detail: { kind: "ask", title: automationStudioActivityAskTitle(ask), status: "started", ref: ask.askId }
  });
}
