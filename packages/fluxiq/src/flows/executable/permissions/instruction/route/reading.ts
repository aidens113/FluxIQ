import type { AutomationStudioInstructionTextSpan } from "../quote/index.ts";
import type { AutomationStudioInstructionRouteWaypoint } from "./waypoint.ts";
import type { AutomationStudioInstructionRouteUnavailableReason } from "./unavailable-reason.ts";

export type AutomationStudioInstructionRouteReading =
  | { state: "unread" }
  | { state: "open"; instructionSetDigest: string }
  | {
    state: "named";
    instructionSetDigest: string;
    /** Core's id for this route: its instruction text, its span, and its waypoints in order. */
    routeId: string;
    instructionId: string;
    instructionDigest: string;
    /** The person's own words for the whole route. */
    quote: string;
    sourceSpan: AutomationStudioInstructionTextSpan;
    waypoints: AutomationStudioInstructionRouteWaypoint[];
  }
  | { state: "unavailable"; reason: AutomationStudioInstructionRouteUnavailableReason; instructionSetDigest?: string };
