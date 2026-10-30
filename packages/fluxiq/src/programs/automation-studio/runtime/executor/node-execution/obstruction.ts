// A layer that stood over the page when a step's attempt was covered or
// failed, as the client reports it (P6, client contract CC7, t799), read from
// the top of the dispatch payload (`outputs.result.obstruction`) beside
// `clearedLayers`, by `./obstruction-of.ts`, and carried on the attempt trace
// (`../contracts.ts`). The `clear_interference` rung presses one of its
// non-committing ways out and attempts again (`../ladder-run.ts`).
//
// Every field is the client's and optional but `kind` and `dismiss`: Core
// compares the tokens and never reads inside `controlRef`, which it hands back
// unchanged as the parameters of the press it runs. A client that reports none
// leaves the attempt without the field, and the rung is not offered (today).

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioClearedLayerKind } from "./cleared-layer.ts";

/** What a way out of an obstruction does (CC7): closes it, accepts what it asks, or neither. Core presses only `dismiss`, then `neutral`, never `accept`. */
export type AutomationStudioObstructionIntent = "dismiss" | "accept" | "neutral";

/** One way out of an obstruction (CC7). */
export type AutomationStudioObstructionWayOut = {
  intent: AutomationStudioObstructionIntent;
  /** The client's opaque target for the control, the parameters the press runs with, passed back unchanged. Absent for `action: "back"`. */
  controlRef?: JsonObject;
  /** The node definition that presses it (or goes back), as the domain names it. Without one, Core cannot run it. */
  definitionId?: string;
  /** `back`: the way out is the browser's or app's own back, not a control. */
  action?: "back";
};

/** The obstruction an attempt met (header). */
export type AutomationStudioObstruction = {
  /** The layer's opaque identity, as `AutomationStudioClearedLayer.id`. */
  id?: string;
  /** The layer's own name, bounded to 120 characters. */
  name?: string;
  kind: AutomationStudioClearedLayerKind;
  /** The client's opaque reference to the target it covered, at most 80 characters. */
  covers?: string;
  /** For a `rate_limit` only, and only when the page stated it: how long until the site lets one more act through, in milliseconds. */
  retryAfterMs?: number;
  /** Its ways out, in the client's order; at most six are kept. */
  dismiss: AutomationStudioObstructionWayOut[];
};
