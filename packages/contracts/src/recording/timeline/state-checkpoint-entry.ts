import type { TimelineBase } from "./timeline-base.js";
import type { StateSnapshot } from "../../state/contracts/index.js";

export type StateCheckpointEntry = TimelineBase & {
  type: "state_checkpoint";
  state: StateSnapshot;
};
