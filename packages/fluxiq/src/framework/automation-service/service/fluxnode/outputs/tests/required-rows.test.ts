import type { JsonTypeSchema } from "@fluxiq/contracts/fluxnode";
import { describe, expect, it } from "vitest";
import { fluxNodeOutputRequiresRows, fluxNodeShapedOutputs } from "../index.ts";

describe("row requirements use the actual output mapper", () => {
  it.each([
    ["array, including empty", { type: "array", items: { type: "object" } }, {}, true],
    ["scalar cell", { type: "string" }, {}, true],
    ["mixed object", { type: "object", properties: { request: { type: "string" }, rows: { type: "array" } } }, { request: "A" }, true],
    ["input-only object", { type: "object", properties: { request: { type: "string" } } }, { request: "A" }, false],
    ["row named property", { type: "object", properties: { title: { type: "string" } } }, {}, true],
    ["undeclared", undefined, {}, false]
  ] as const)("%s", (_name, type, inputs, expected) => {
    const schema = type as JsonTypeSchema | undefined;
    expect(fluxNodeOutputRequiresRows(schema, inputs)).toBe(expected);
    for (const rows of [[], [{ title: "A" }]]) {
      let observed = false;
      const sources = { runId: "run", flowId: "flow", inputs, acts: [], rows: { datasetId: "rows", columns: [{ id: "title", label: "Title" }], rows } };
      const baseline = fluxNodeShapedOutputs(schema, sources);
      const watched = fluxNodeShapedOutputs(schema, sources, () => { observed = true; });
      expect(watched).toEqual(baseline);
      // Undeclared nonempty rows are opportunistic; they do not impose a spec requirement.
      if (schema !== undefined) expect(observed).toBe(expected);
    }
  });
});
