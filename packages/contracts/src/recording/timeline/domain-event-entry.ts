import type { TimelineBase } from "./timeline-base.js";
import type { JsonObject } from "../../core.js";

export type DomainEventEntry = TimelineBase & {
  type: "domain_event";
  eventType: string;
  payload?: JsonObject;
};
