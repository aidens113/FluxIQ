// What Core keeps of a layer the client closed over the page while a step ran:
// its closed kind, the dismiss words, and (t516) the layer's and the pressed
// control's own names. Read from a dispatch by `./cleared-layers.ts`, carried
// on the attempt trace (`../contracts.ts`), and read by the trial feedback
// (`../../service/candidate-trial/interruptions.ts`). Kept apart from the
// executor's contracts, which re-export it, so that file stays in its budget.

/**
 * What a layer the client closed was: a consent notice, a rate-limit notice,
 * a promotion, an assistant or chat widget, or `dialog` for a layer no
 * classifier named. A closed vocabulary; a robot check is never closed.
 */
export type AutomationStudioClearedLayerKind = "consent" | "rate_limit" | "promotion" | "assistant" | "dialog";

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
   * close presses the way out by it. Only beside `wayOut`.
   */
  wayOutDefinitionId?: string;
};
