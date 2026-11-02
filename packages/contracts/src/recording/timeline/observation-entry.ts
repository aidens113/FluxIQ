import type { TimelineBase } from "./timeline-base.js";
import type { StateValue } from "../../state/contracts/index.js";
import type { JsonObject } from "../../core.js";

export type ObservationEntry = TimelineBase & {
  type: "observation";
  observationType: string;
  signals?: Record<string, StateValue>;
  payload?: JsonObject;
};
