import type { JsonValue } from "../../../../core/index.ts";

/**
 * A person's answer to one ask.
 *
 * `askId` is the whole of the addressing: it is the key the ask was opened
 * under and the key the run is parked under, so an answer either names the ask
 * the run is waiting on or is refused. An ask is answered once; a second answer
 * is refused rather than replaying the run.
 */
export type AutomationStudioAskAnswer = {
  askId: string;
  answeredAtMs: number;
  kind: "grant" | "deny" | "choice" | "text";
  /** The chosen option's `value` for a choice, the person's words for text. */
  value?: JsonValue;
};
