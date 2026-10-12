// What the run closed over the page while a step ran, for the trial feedback
// (t470).
//
// Lane D round 8 (`run-mv5jnc5m-a47c3e59`, t465 defect 2): a confirm in a loop
// met the site's request to slow down. The runtime waited it out, and the
// client closed the site's notice by its way out itself, so the trial feedback
// carried the pass, the wait and the pace, and nothing about the notice or the
// control that closed it. The script format asked for a step closing the
// notice anyway, and the only close-like handle the model had ever been shown
// was the chat's "Close chat"; the saved "slow-down notice" step closed the
// chat on its first pass.
//
// So each layer the client closed during a step's attempts is now said on the
// step: what kind of layer it was, that the run closed it, and -- only when the
// domain could name it (`clearedControlHandles`, from the `wayOut` the client
// reported for the control it pressed) -- the handle of that way out. The
// script format asks for a dismissing step only against a handle named here
// (`../../flow-bootstrap/plan/flow-script-format.ts`); with none named, the run
// closes the layer itself and the Flow answers only with its pace.
//
// Read from Core's own trace and the domain's answer only: the layer's closed
// kind and a handle. The dismiss words the client matched stay in the trace.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioClearedLayerKind, AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";

/** The most closed layers one step lists. */
const MAX_INTERRUPTIONS = 4;

/** What each kind of layer is called, as the model reads it. */
const LAYER_WORDS: Readonly<Record<AutomationStudioClearedLayerKind, string>> = Object.freeze({
  rate_limit: "the site's notice asking the run to slow down",
  consent: "a cookie or consent notice",
  promotion: "a promotion",
  assistant: "a chat or assistant panel",
  dialog: "a dialog"
});

/**
 * Each layer the client closed while `attempts` ran, in order, once per kind
 * and way out: its `kind`, the `wayOut` handle when `handles` names one for
 * the control pressed, and a sentence saying so.
 */
export function automationStudioTrialInterruptions(attempts: readonly AutomationStudioNodeAttemptTrace[], handles: Readonly<Record<string, string>> = {}): JsonObject[] {
  const said: JsonObject[] = [];
  const seen = new Set<string>();
  for (const layer of attempts.flatMap((attempt) => attempt.clearedLayers ?? [])) {
    const handle = layer.wayOut === undefined ? undefined : handles[layer.wayOut];
    const key = `${layer.kind}\0${handle ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (said.length >= MAX_INTERRUPTIONS) break;
    const words = LAYER_WORDS[layer.kind];
    said.push(handle === undefined
      ? { kind: layer.kind, said: `The page put ${words} in the way, and the run closed it by itself. No control of it is named, so no step of the Flow is needed to close it.` }
      : { kind: layer.kind, wayOut: handle, said: `The page put ${words} in the way, and the run closed it by pressing its way out, ${handle}.` });
  }
  return said;
}
