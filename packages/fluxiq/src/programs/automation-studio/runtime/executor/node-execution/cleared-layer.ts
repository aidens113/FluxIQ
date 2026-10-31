// What Core keeps of a layer the client closed over the page while a step ran:
// its closed kind, the dismiss words, and (t516) the layer's and the pressed
// control's own names. Read from a dispatch by `./cleared-layers.ts`, carried
// on the attempt trace (`../contracts.ts`), and read by the trial feedback
// (`../../service/candidate-trial/interruptions.ts`). Kept apart from the
// executor's contracts, which re-export it, so that file stays in its budget.
//
// **Generic kinds (P6, CC7, t799).** Core names a layer by what it does to the
// run, never by what a client's page calls it: `overlay` covers the page until
// answered, `notice` tells something and can be closed, `rate_limit` asks the
// run to slow down, `assistant` is a chat or helper panel, and `other` is any
// layer no classifier named. A client still sending the old words is read in
// these (`consent` as `overlay`, `promotion` as `notice`, `dialog` as `other`;
// `../node-execution/cleared-layers.ts`).

import type { JsonObject } from "../../../../../core/index.ts";

/**
 * What a layer over the page was, in Core's generic words (header). A closed
 * vocabulary; a robot check is never closed.
 */
export type AutomationStudioClearedLayerKind = "overlay" | "notice" | "rate_limit" | "assistant" | "other";

/**
 * One layer the client closed: its kind, and `control`, the words of the
 * dismiss control it pressed ("Not now"), whitespace-collapsed, with
 * token-shaped runs hidden and held to 40 characters. `control` stays in the
 * trace; the chat never shows it.
 */
export type AutomationStudioClearedLayer = {
  kind: AutomationStudioClearedLayerKind;
  control: string;
  /**
   * The layer's own identity as the client gives it (CC7 `id`, t799): a short
   * opaque token, stable for the same layer across views and runs, which Core
   * compares and never reads inside. A learned handler is keyed by it, and a
   * layer that carries one is waited for by the `obstruction` fact. Absent
   * from a client that does not say it: the layer is then keyed by its name
   * and waited for by the `dialog` fact, as before.
   */
  id?: string;
  /**
   * The layer's own name as the client's page view labels it (t516), bounded
   * as `control` is but to 120 characters: what a handler learned from this
   * close waits for the layer by. Absent when the page gave the layer none.
   */
  name?: string;
  /** The pressed control's own name (t516), bounded as `name` is: what that handler presses. */
  controlName?: string;
  /** The domain's opaque reference to the control it pressed (t470), handed back for that control's handle (`../../service/candidate-trial/interruptions.ts`). */
  wayOut?: string;
  /**
   * The node definition a step pressing that way out runs, as the domain names
   * it (t516): Core names no domain's steps, and a handler learned from this
   * close presses the way out by it. Only beside `wayOut` or `controlRef`.
   */
  wayOutDefinitionId?: string;
  /**
   * The client's durable, opaque target for the pressed way out (CC7, t799),
   * the parameters `wayOutDefinitionId`'s node runs with, as the domain resolved them:
   * what a handler built from a trial's close presses
   * (`../../flow-bootstrap/layer-handlers/`). Core never reads inside it. Only
   * beside `wayOutDefinitionId`.
   */
  controlRef?: JsonObject;
};
