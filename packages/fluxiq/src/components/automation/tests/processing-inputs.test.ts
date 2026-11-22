import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../core/index.ts";
import { automationStudioProcessingInputs } from "../index.ts";

const schema: JsonObject = { schemaVersion: "0.1", fields: [{ id: "date", label: "Date", valueType: "string" }] };
const process: JsonObject = { where: [{ field: "date", atLeast: "2030-01-02", atMost: { $state: { path: "latest", fallback: "2030-01-02" } }, as: "date" }], declaration: { version: 1, source: "a".repeat(64), revision: 1, bindings: { date: "date" } } };

describe("current processing inputs", () => {
  it("uses the current exact caller key, preserving constants and canonical field provenance", () => {
    const before = structuredClone(process);
    expect(automationStudioProcessingInputs({ process, schema, inputs: { latest: "2030-01-03" } })).toEqual({ ok: true, process: { ...process, where: [{ field: "date", atLeast: "2030-01-02", atMost: "2030-01-03", as: "date" }] } });
    expect(process).toEqual(before);
  });
  it.each([undefined, {}, { latest: null }, { latest: false }, { latest: "not a date" }])("does not execute a test example for missing/unparseable current input %j", (inputs) => {
    const result = automationStudioProcessingInputs({ process, schema, inputs });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missingPaths.length).toBeGreaterThan(0);
  });
  it("requires own caller inputs and refuses grammar, row, step or merged state bindings", () => {
    const inherited = Object.create({ latest: "2030-01-03" }) as Record<string, string>;
    expect(automationStudioProcessingInputs({ process, schema, inputs: inherited }).ok).toBe(false);
    for (const bad of [{ columns: [{ $state: { path: "latest", fallback: "date" } }] }, { limit: { $state: { path: "item.limit", fallback: 1 } } }, { limit: { $state: { path: "$node.read.value", fallback: 1 } } }]) {
      expect(automationStudioProcessingInputs({ process: bad, inputs: { latest: "date", item: { limit: 1 } } }).ok).toBe(false);
    }
  });
  it("requires canonical full schema even when no input is bound", () => {
    expect(automationStudioProcessingInputs({ process, inputs: { latest: "2030-01-03" } })).toMatchObject({ ok: false, missingPaths: ["recordOutput.schema"] });
    expect(automationStudioProcessingInputs({ process: { declaration: process.declaration }, inputs: {} })).toMatchObject({ ok: false, missingPaths: ["recordOutput.schema"] });
  });
  it.each([{ $state: { path: "other", fallback: "2030-01-03" } }, { $step: "read.date" }, [{ $state: { path: "other" } }]])("never reinterprets binding-shaped caller data as configuration: %j", (latest) => {
    expect(automationStudioProcessingInputs({ process, schema, inputs: { latest, other: "2030-01-09" } })).toMatchObject({ ok: false, missingPaths: ["latest"] });
  });
});
