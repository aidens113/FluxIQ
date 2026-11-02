import type { TimelineBase } from "./timeline-base.js";
import type { StateDelta } from "../../state/contracts/index.js";

export type StateDeltaEntry = TimelineBase & {
  type: "state_delta";
  deltas: StateDelta[];
};
