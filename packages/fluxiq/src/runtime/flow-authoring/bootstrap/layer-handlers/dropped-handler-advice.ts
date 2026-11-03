// The advice line a submission gives for the handlers left out of it
// (`./dropped-handler.ts`): generic words, naming the layer and the issue code.

import type { AutomationStudioDroppedLayerHandler } from "./dropped-handler.ts";

/** The most of a layer's name quoted. */
const NAME_CAP = 80;
/** The most handlers named in one line. */
const NAMED_CAP = 5;

/** One advice line naming each dropped handler (at most five), or none when nothing was dropped. */
export function automationStudioDroppedLayerHandlerAdvice(dropped: readonly AutomationStudioDroppedLayerHandler[]): string[] {
  if (!dropped.length) return [];
  const named = dropped.slice(0, NAMED_CAP).map((entry) => `${JSON.stringify(entry.layer.length > NAME_CAP ? `${entry.layer.slice(0, NAME_CAP - 1)}…` : entry.layer)} (${entry.code})`);
  const more = dropped.length > NAMED_CAP ? ` and ${dropped.length - NAMED_CAP} more` : "";
  return [`The Flow was submitted without the handler that closes ${dropped.length === 1 ? "a layer" : "layers"} the build met: ${named.join(", ")}${more}. The plan's check refused ${dropped.length === 1 ? "it" : "them"} for the issue code shown, so the Flow does not answer ${dropped.length === 1 ? "that layer" : "those layers"} if the site shows ${dropped.length === 1 ? "it" : "them"} again.`];
}
