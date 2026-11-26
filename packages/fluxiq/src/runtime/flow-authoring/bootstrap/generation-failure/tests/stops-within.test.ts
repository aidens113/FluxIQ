// The round stops a build ending keeps: by size, never by a count of rounds (t1056). What the writer keeps the reader
// reads back, however many rounds the build ran (`../../unfinished-build/tests/budget-exhausted.test.ts`).
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STOPS_BYTES_MAX } from "../../../../loop-limits/index.ts";
import { automationStudioFlowBootstrapStopsWithin } from "../index.ts";

const encoded = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const stops = (count: number) => Array.from({ length: count }, (_, round) => ({ round, stopped: "repeat_without_progress" as const }));

describe("automationStudioFlowBootstrapStopsWithin", () => {
  it("keeps every stop of a build whose stops fit, past the six rounds a build once ran at most", () => {
    expect(automationStudioFlowBootstrapStopsWithin(stops(40))).toEqual(stops(40));
    expect(automationStudioFlowBootstrapStopsWithin([])).toEqual([]);
  });

  it("keeps the most recent stops that fit, in order, filling the bound without passing it", () => {
    const all = stops(1_000);
    const kept = automationStudioFlowBootstrapStopsWithin(all);

    expect(kept.length).toBeLessThan(all.length);
    expect(kept.at(-1)).toEqual(all.at(-1));
    expect(kept).toEqual(all.slice(all.length - kept.length));
    expect(encoded(kept)).toBeLessThanOrEqual(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STOPS_BYTES_MAX);
    expect(encoded(all.slice(all.length - kept.length - 1))).toBeGreaterThan(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STOPS_BYTES_MAX);
  });
});
