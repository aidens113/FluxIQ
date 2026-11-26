// The most recent round stops that fit a build ending's record (`tried.stops`), by size, never by a count of rounds
// (`../../../loop-limits/flow-bootstrap-stops-bytes.ts`, t1056). The writer keeps what this returns
// (`../unfinished-build/tried.ts`) and the reader refuses a list this would shorten (`./build-ending.ts`), so a record
// Core writes always reads back. The bound comes from its own leaf module, never `../../../loop-limits/index.ts`, whose
// barrel reaches `../llm/` and back into this directory: an import cycle.
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STOPS_BYTES_MAX } from "../../../loop-limits/flow-bootstrap-stops-bytes.ts";

const encoder = new TextEncoder();

/** The last of `stops`, in order, whose JSON fits `AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STOPS_BYTES_MAX` (header). */
export function automationStudioFlowBootstrapStopsWithin<T>(stops: readonly T[]): T[] {
  // The list's brackets, then each item and the comma before every item but the first.
  let bytes = 2;
  let first = stops.length;
  for (let index = stops.length - 1; index >= 0; index -= 1) {
    const size = encoder.encode(JSON.stringify(stops[index])).byteLength + (first < stops.length ? 1 : 0);
    if (bytes + size > AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STOPS_BYTES_MAX) break;
    bytes += size;
    first = index;
  }
  return stops.slice(first);
}
