// A handler for a layer the build closed that the plan's check refused, and so
// was left out of the submitted Flow (t799). Named, never silent: the
// submission says it in one advice line (`./dropped-handler-advice.ts`), so the
// build learns the Flow does not answer that layer rather than finding out on a
// fresh account.

/** One handler left out of a submission, and why. */
export type AutomationStudioDroppedLayerHandler = {
  /** The layer, as the build names it: the layer's name, or for an explored press the node it ran. */
  layer: string;
  /** The code of the first issue the plan's check gave the handler. */
  code: string;
};
