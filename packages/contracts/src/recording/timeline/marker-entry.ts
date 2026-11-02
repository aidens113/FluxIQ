import type { TimelineBase } from "./timeline-base.js";

export type MarkerEntry = TimelineBase & {
  type: "marker";
  label: string;
};
