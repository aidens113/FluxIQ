import type { ClientGatewayActivityPhase } from "@fluxiq/contracts/client-gateway";
import { emitAutomationStudioActivity } from "../emit.ts";
import { automationStudioActivityClearedText } from "./cleared-text.ts";

/** The card's title, the same on both rows. "check" is what a client reads it as a robot check by. */
const TITLE = "Waited for a check to clear";
/** The longest wait believed: a day. A caller's figure past it is not a wait, it is a fault. */
const MAX_WAITED_MS = 24 * 60 * 60 * 1000;

/**
 * The whole milliseconds a `clearedWait` reports, read defensively: it comes
 * from a caller (a tool result, an output dispatch), so anything that is not
 * an object whose `waitedMs` is a whole number from zero to a day is read as
 * no wait at all.
 */
function waitedMsOf(clearedWait: unknown): number | undefined {
  if (!clearedWait || typeof clearedWait !== "object" || Array.isArray(clearedWait)) return undefined;
  const waitedMs = (clearedWait as { waitedMs?: unknown }).waitedMs;
  return typeof waitedMs === "number" && Number.isSafeInteger(waitedMs) && waitedMs >= 0 && waitedMs <= MAX_WAITED_MS ? waitedMs : undefined;
}

/**
 * Says that a wait on the page -- a robot check -- stood and cleared by itself:
 * a wait nobody was asked about, and so nobody answered, which the person still
 * sees happened.
 *
 * Two rows, the pair every other wait on a person is told in: the ask row that
 * opens the wait (`waiting_permission`, `started`), then the row that settles
 * it, `succeeded` with the resolution `waited_out` and how long it took, in
 * `phase`, the phase of the work that met it. Both carry `ref` and the same
 * title, so a client draws one card for them. A `clearedWait` that is absent or
 * cannot be read emits nothing.
 *
 * The tool-call observer says it through `./waited-out.ts`; a Flow run says it
 * from the output dispatch result of a node attempt (`executor/node-execution.ts`).
 */
export function emitAutomationStudioActivityClearedWait(ref: string, clearedWait: unknown, phase: ClientGatewayActivityPhase): void {
  const waitedMs = waitedMsOf(clearedWait);
  if (waitedMs === undefined) return;
  const said = automationStudioActivityClearedText(waitedMs);
  emitAutomationStudioActivity({
    phase: "waiting_permission",
    label: "Waiting for a check on the page to clear",
    detail: { kind: "ask", title: TITLE, status: "started", ref }
  });
  emitAutomationStudioActivity({
    phase,
    label: said,
    detail: { kind: "ask", title: TITLE, text: said, status: "succeeded", ref, resolution: "waited_out" }
  });
}
