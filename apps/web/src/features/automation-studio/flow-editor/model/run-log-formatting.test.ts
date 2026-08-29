import { describe, expect, it } from "vitest";
import { flattenRunLogs, formatDbCell, parseJsonObject } from "./run-log-formatting";

describe("Flow editor run formatting", () => {
  it("flattens execution entries without changing their order", () => {
    expect(flattenRunLogs([{
      targetId: "flow-1",
      loopsTotal: 2,
      status: "running",
      executions: [
        { atMs: 10, loop: 1, ok: true, result: { value: 1 } },
        { atMs: 20, loop: 2, ok: false, error: "failed" }
      ]
    }])).toEqual([
      { atMs: 10, target: "flow-1", loop: "1/2", status: "success", message: '{"value":1}', type: "run" },
      { atMs: 20, target: "flow-1", loop: "2/2", status: "failed", message: "failed", type: "run" }
    ]);
  });

  it("keeps JSON parsing and cell formatting independent from graph conversion", () => {
    expect(parseJsonObject('{"enabled":true}')).toEqual({ ok: true, value: { enabled: true } });
    expect(parseJsonObject("[]")).toEqual({ ok: false, error: "JSON must be an object" });
    expect(formatDbCell({ enabled: true })).toBe('{"enabled":true}');
  });
});