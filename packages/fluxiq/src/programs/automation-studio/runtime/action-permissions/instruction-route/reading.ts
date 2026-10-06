// The route the person's instruction names, as Core holds it after the build's
// one instruction read (D phase 1; `../../service/instruction-authority.ts`).
//
// The user's rule: a route the person names must be followed; a Flow may start
// where the work begins unless the person names the route. Four states, so
// nothing that failed can pass for "no route":
//
// - `unread`: no read has settled. Nothing was asked yet, or the one read is
//   still on its way.
// - `named`: the read named a route and Core found its words, and each
//   waypoint's words inside them, exactly once in one active instruction.
//   Core makes the ids and the spans; the model supplies neither. The order is
//   the read's interpretation of the person's words: Core grounds what was
//   copied, not that the order is right, that the route is complete, or that
//   any step went anywhere. Nothing here is proof a waypoint was visited.
// - `open`: the read explicitly answered that the person names no route. Still
//   an interpretation, not proof; the whole-Flow judge remains the authority.
// - `unavailable`: anything else, with a closed reason and never the provider's
//   message or the model's prose. It is not open.
//
// Named and open are bound to the instruction set they were read from
// (`./set-digest.ts`); `./current.ts` makes either `stale` once that set
// changes.

import type { AutomationStudioInstructionTextSpan } from "../instruction-quote/index.ts";

/** Why no route can be relied on. */
export type AutomationStudioInstructionRouteUnavailableReason =
  /** The read itself failed: nothing came back. */
  | "transport"
  /** An answer came back that was not a completed read. */
  | "non_complete"
  /** The answer gave no route, or one of the wrong shape. */
  | "malformed"
  /** The route's words, or a waypoint's inside them, are not the person's words in the named active instruction. */
  | "ungrounded"
  /** The read could not tell, or the words occur more than once where they must occur once. */
  | "ambiguous"
  /** The instructions changed after the read. */
  | "stale";

/** One place on a named route, in the order the read gave. */
export type AutomationStudioInstructionRouteWaypoint = {
  /** Core's id for these words at this place in this instruction text. */
  id: string;
  /** 1 for the first place to visit. */
  order: number;
  instructionId: string;
  instructionDigest: string;
  /** The person's own words, as the instruction has them at `sourceSpan`. */
  quote: string;
  /** Where in `title + "\n" + body`: UTF-16 code units, half-open. */
  sourceSpan: AutomationStudioInstructionTextSpan;
};

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
