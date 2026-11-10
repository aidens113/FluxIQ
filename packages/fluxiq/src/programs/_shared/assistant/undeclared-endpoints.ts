import { assistantToolName } from "./tool-name.ts";
import type { AssistantEndpointSummary } from "./types.ts";

/**
 * Every endpoint with neither an `assistant` tool declaration nor a `hidden`
 * reason, as tool names (`<programId>__<endpoint>`), sorted. The parity test
 * fails the build while this is not empty.
 */
export function undeclaredAssistantEndpoints(endpoints: readonly AssistantEndpointSummary[]): string[] {
  return endpoints
    .filter((endpoint) => endpoint.assistant === undefined)
    .map((endpoint) => assistantToolName(endpoint.programId, endpoint.endpoint))
    .sort();
}
