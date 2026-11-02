import { describe, expect, it } from "vitest";
import type { TrialNotRun, TrialNotRunHistory } from "../index.ts";
import { readTrialNotRun } from "../index.ts";

const entry = { nodeId: "step.reserve", reason: "unreached", passes: [1] };

describe("historical notRun diagnostic data", () => {
  it.each([
    ["missing", undefined],
    ["null", null],
    ["a non-array", { 0: entry, length: 1 }],
    ["an absent node", [{ reason: "guarded", passes: [1] }]],
    ["an empty node", [{ ...entry, nodeId: "" }]],
    ["a numeric node", [{ ...entry, nodeId: 1 }]],
    ["an unknown reason", [{ ...entry, reason: "skipped" }]],
    ["a missing passes field", [{ nodeId: "step.reserve", reason: "guarded" }]],
    ["no passes", [{ ...entry, passes: [] }]],
    ["a zero pass", [{ ...entry, passes: [0] }]],
    ["a negative pass", [{ ...entry, passes: [-1] }]],
    ["a fractional pass", [{ ...entry, passes: [1.5] }]],
    ["a string pass", [{ ...entry, passes: ["1"] }]],
    ["a null pass", [{ ...entry, passes: [null] }]],
    ["a different passes word", [{ ...entry, passes: "all" }]],
    ["a null label", [{ ...entry, label: null }]],
    ["a non-string after", [{ ...entry, after: 1 }]],
    ["a fractional total", [{ ...entry, of: 1.5 }]],
    ["a non-finite total", [{ ...entry, of: Infinity }]],
    ["a string total", [{ ...entry, of: "3" }]],
    ["a null entry", [null]],
    ["a mixed list", [entry, { ...entry, passes: [0] }]],
    ["a sparse outer list", new Array(1)]
  ])("does not read %s", (_name, value) => {
    expect(readTrialNotRun(value)).toBeUndefined();
  });

  it("distinguishes an explicit empty list from missing or malformed data", () => {
    const source: unknown[] = [];
    const result = readTrialNotRun(source);
    expect(result).toEqual([]);
    expect(result).not.toBe(source);
  });

  it("preserves historical optional labels, every, any integer total and pass order", () => {
    const historical: unknown[] = [
      { nodeId: "step.reserve", reason: "unreached", passes: "every" },
      { nodeId: " ", label: "", reason: "guarded", after: "", passes: [3, 1, 3], of: 0 },
      { nodeId: "step.reserve", reason: "guarded", passes: [1], of: -2 },
      { nodeId: "step.reserve", label: undefined, reason: "guarded", after: undefined, passes: [1], of: undefined }
    ];
    expect(readTrialNotRun(historical)).toEqual(historical);
    expect(readTrialNotRun(historical)?.every((item, index) => item === historical[index])).toBe(true);
  });

  it("retains the original sparse-pass acceptance without accepting sparse outer lists", () => {
    const passes = new Array<number>(1);
    const value = [{ ...entry, passes }];
    expect(readTrialNotRun(value)?.[0]?.passes).toBe(passes);
    expect(readTrialNotRun(new Array(1))).toBeUndefined();
  });

  it("does not tighten the old structural property reading", () => {
    const inherited: unknown = Object.create(entry);
    expect(readTrialNotRun([inherited])?.[0]).toBe(inherited);
  });

  it("keeps literal packet bytes and entry identities without interpreting extra JSON as authority", () => {
    const wire = '[{"nodeId":"step.reserve","reason":"guarded","passes":[2,1,2],"of":-1,"label":"Reserve","after":"Open","permission":"allowed","unconfirmedInspection":{"requiresFreshRead":false}}]';
    const decoded: unknown = JSON.parse(wire);
    const result = readTrialNotRun(decoded);
    expect(JSON.stringify(decoded)).toBe(wire);
    expect(JSON.stringify(result)).toBe(wire);
    expect(result?.[0]).toBe((decoded as unknown[])[0]);
    expect(Object.keys(result?.[0] ?? {})).toEqual(["nodeId", "reason", "passes", "of", "label", "after", "permission", "unconfirmedInspection"]);
  });

  it("reads the strict producer view without changing its object or filling historical fields", () => {
    const produced: TrialNotRun = { nodeId: "step.reserve", label: "Reserve", reason: "guarded", passes: [1] };
    const history: TrialNotRunHistory = produced;
    expect(readTrialNotRun([history])?.[0]).toBe(produced);
    expect(Object.keys(produced)).toEqual(["nodeId", "label", "reason", "passes"]);
  });
});
