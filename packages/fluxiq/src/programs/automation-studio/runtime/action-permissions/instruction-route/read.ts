// The route a completed instruction read answered, as Core keeps it
// (`./reading.ts`). Only an explicit, well-formed `open` is open; a missing or
// malformed route, an unknown instruction, words Core cannot find, or words it
// finds more than once are `unavailable`, so a read that went wrong can never
// let a build skip a route the person named.
//
// A named route is grounded in one active instruction the read names: its
// whole words found there exactly once, and each waypoint's words found
// exactly once inside them -- which anchors "Friends" to the route's own
// "open Friends" rather than wherever that label first appears. Matching is on
// the comparison text the permission read uses (`../instruction-quote/`), and
// every span converts back to the person's original words through its map.
// No 300-character permission-quote bound applies to a route, and a route with
// more waypoints than the bound is unavailable rather than shortened.

import { createHash } from "node:crypto";
import { automationStudioComparableInstructionText, automationStudioMappedInstructionText } from "../instruction-quote/index.ts";
import { automationStudioInstructionDigest, type AutomationStudioInstructionText } from "../instructed.ts";
import type { AutomationStudioInstructionRouteReading, AutomationStudioInstructionRouteUnavailableReason, AutomationStudioInstructionRouteWaypoint } from "./reading.ts";
import { AUTOMATION_STUDIO_INSTRUCTION_ROUTE_MAX_WAYPOINTS } from "./schema.ts";
import { automationStudioInstructionSetDigest } from "./set-digest.ts";

export function readAutomationStudioInstructionRoute(input: {
  /** The read's completion; its `route` field is the answer. */
  result: unknown;
  /** The active instructions the read was given, which a named route must be grounded in. */
  instructions: readonly AutomationStudioInstructionText[];
}): AutomationStudioInstructionRouteReading {
  const route = isRecord(input.result) ? input.result.route : undefined;
  if (!isRecord(route)) return unavailable("malformed");
  if (route.kind === "unclear") return unavailable("ambiguous");
  if (route.kind === "open") return { state: "open", instructionSetDigest: automationStudioInstructionSetDigest(input.instructions) };
  if (route.kind !== "named") return unavailable("malformed");
  const { instructionId, quote, waypoints } = route;
  if (typeof instructionId !== "string" || typeof quote !== "string" || !Array.isArray(waypoints) || !waypoints.length
    || waypoints.length > AUTOMATION_STUDIO_INSTRUCTION_ROUTE_MAX_WAYPOINTS || waypoints.some((waypoint) => typeof waypoint !== "string")) return unavailable("malformed");
  const wanted = automationStudioComparableInstructionText(quote);
  const stops = (waypoints as string[]).map(automationStudioComparableInstructionText);
  if (!wanted || stops.some((stop) => !stop)) return unavailable("malformed");
  const instruction = input.instructions.find((candidate) => candidate.instructionId === instructionId);
  if (!instruction) return unavailable("ungrounded");
  const source = `${instruction.title}\n${instruction.body}`;
  const mapped = automationStudioMappedInstructionText(source);
  if (!mapped) return unavailable("ungrounded");
  const enclosing = occurrences(mapped.text, wanted, 0, mapped.text.length);
  if (enclosing.length !== 1) return unavailable(enclosing.length ? "ambiguous" : "ungrounded");
  const from = enclosing[0]!;
  const to = from + wanted.length;
  const located: number[] = [];
  for (const stop of stops) {
    const found = occurrences(mapped.text, stop, from, to);
    if (found.length !== 1) return unavailable(found.length ? "ambiguous" : "ungrounded");
    located.push(found[0]!);
  }
  const instructionDigest = automationStudioInstructionDigest(instruction);
  const spans = located.map((at, index) => mapped.span(at, at + stops[index]!.length));
  // One place listed twice is not two waypoints.
  if (new Set(spans.map((span) => `${span.start}:${span.end}`)).size !== spans.length) return unavailable("malformed");
  const routeSpan = mapped.span(from, to);
  const placed: AutomationStudioInstructionRouteWaypoint[] = spans.map((span, index) => ({
    id: `waypoint:${digest([instructionId, instructionDigest, span.start, span.end])}`,
    order: index + 1,
    instructionId,
    instructionDigest,
    quote: source.slice(span.start, span.end),
    sourceSpan: span
  }));
  return {
    state: "named",
    instructionSetDigest: automationStudioInstructionSetDigest(input.instructions),
    routeId: `route:${digest([instructionId, instructionDigest, routeSpan.start, routeSpan.end, ...placed.map((waypoint) => waypoint.id)])}`,
    instructionId,
    instructionDigest,
    quote: source.slice(routeSpan.start, routeSpan.end),
    sourceSpan: routeSpan,
    waypoints: placed
  };
}

function unavailable(reason: AutomationStudioInstructionRouteUnavailableReason): AutomationStudioInstructionRouteReading {
  return { state: "unavailable", reason };
}

/** Every index in `[from, to)` where `needle` starts and ends inside that range. */
function occurrences(text: string, needle: string, from: number, to: number): number[] {
  const found: number[] = [];
  for (let at = text.indexOf(needle, from); at !== -1 && at + needle.length <= to; at = text.indexOf(needle, at + 1)) found.push(at);
  return found;
}

function digest(parts: readonly (string | number)[]): string {
  return createHash("sha256").update(parts.join("\n"), "utf8").digest("hex").slice(0, 16);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
