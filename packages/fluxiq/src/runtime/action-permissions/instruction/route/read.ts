import type { AutomationStudioInstructionText, AutomationStudioInstructionRouteReading, AutomationStudioInstructionRouteWaypoint } from "../../../../flows/executable/permissions/index.ts";
import { isRecord } from "./is-record.ts";
import { unavailable } from "./unavailable.ts";
import { automationStudioInstructionSetDigest } from "./set-digest.ts";
import { AUTOMATION_STUDIO_INSTRUCTION_ROUTE_MAX_WAYPOINTS } from "./limit.ts";
import { automationStudioComparableInstructionText } from "../quote/index.ts";
import { automationStudioMappedInstructionText } from "../quote/index.ts";
import { occurrences } from "./occurrences.ts";
import { automationStudioInstructionDigest } from "../digest.ts";
import { digest } from "./digest.ts";

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
