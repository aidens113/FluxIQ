// Whether one of Core's raw activity events is the model's words rather than
// what FluxIQ is doing.
//
// Core says each step of the model's thinking as a `thought` row whose `text`
// is the model's own: its reason for the next step ("Store chooser is open;
// I'll press …"), a refused edit to the draft with the model's summary as the
// thing not done ("That step has no such value to make vary; … so this was not
// done: adding the pape…"), or a recovery choice. The chat tells those as
// messages (`panel/chat/stream/`). The status -- the overlay and the chat's
// live line -- says the phase and the current action only (D6 of the
// run-musp4h2f-72e8ed99 UI review), so the pacer never makes such a row its
// detail and does not count it as a change (`background/activity/pacer.ts`).
//
// Core's own deciding rows (`runtime/activity/observer.ts`) are thoughts too,
// but they are the action, so they are status and are drawn: "Deciding the
// next step", with no text while the decision is made, and "Asking the AI
// model again" (failed, with Core's own sentence) when the model provider did
// not answer or its answer could not be used (t378 W4). An older Core said the
// latter under the deciding title, which stays status too.
//
// Pure: no browser API.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";

/** The titles of Core's own deciding rows: the decision being made, and one asked for again. */
const CORE_DECIDING_TITLES: ReadonlySet<string> = new Set(["Deciding the next step", "Asking the AI model again"]);

/** True when `event` carries the model's words -- a reason, a refusal, a recovery choice -- and not an action. */
export function isModelThought(event: ClientGatewayActivity): boolean {
  const detail = event.detail;
  if (detail?.kind !== "thought" || CORE_DECIDING_TITLES.has(detail.title.trim())) return false;
  return typeof detail.text === "string" && detail.text.trim() !== "";
}
