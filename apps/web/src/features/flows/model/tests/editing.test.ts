import { describe, expect, it } from "vitest";
import type { FlowOutline, OutlineStep } from "../../wire";
import { conflictWords, dataStepFromForm, rebaseEdit, runInputs, stepValues } from "..";

const step = (number: string, node: string, extra: Partial<OutlineStep> = {}): OutlineStep => ({ number, nodeIds: [node], kind: "act", words: `Step ${number}`, lasting: [], children: [], arms: [], ...extra });
const outlineOf = (steps: OutlineStep[]): FlowOutline => ({ interface: { needs: [], gives: [] }, steps, issues: [] });

describe("rebaseEdit", () => {
  const before = outlineOf([step("1", "open"), step("2", "search"), step("3", "loop", { children: [step("3.1", "keep")] })]);
  const after = outlineOf([step("1", "banner"), step("2", "open"), step("3", "search"), step("4", "loop", { children: [step("4.1", "keep")] })]);

  it("finds the step the person meant by its node, wherever it is numbered now", () => {
    expect(rebaseEdit({ kind: "set-words", step: "2", words: "Search for it" }, before, after)).toEqual({ ok: true, edit: { kind: "set-words", step: "3", words: "Search for it" } });
    expect(rebaseEdit({ kind: "delete", step: "3.1" }, before, after)).toEqual({ ok: true, edit: { kind: "delete", step: "4.1" } });
    expect(rebaseEdit({ kind: "add-data", after: "1", data: { kind: "limit", count: 3 } }, before, after)).toEqual({ ok: true, edit: { kind: "add-data", after: "2", data: { kind: "limit", count: 3 } } });
    expect(rebaseEdit({ kind: "add-call", flow: { flowId: "f", name: "F" } }, before, after)).toEqual({ ok: true, edit: { kind: "add-call", flow: { flowId: "f", name: "F" } } });
  });

  it("says so when the step is gone", () => {
    const gone = outlineOf([step("1", "open")]);
    expect(rebaseEdit({ kind: "move", step: "2", direction: "up" }, before, gone)).toEqual({ ok: false, reason: "Step 2 is no longer in this Flow, so your change cannot be made again." });
  });
});

describe("conflictWords", () => {
  it("names who changed which steps", () => {
    expect(conflictWords({ baseRevision: 2, currentRevision: 3, steps: ["5"], changedBy: [{ revisionNumber: 3, madeByLabel: "FluxIQ repair", message: "", createdAt: 1 }] }))
      .toBe("This Flow changed while you were editing (FluxIQ repair changed step 5). Your change was not saved.");
    expect(conflictWords({ baseRevision: 2, currentRevision: 4, steps: ["2", "3", "6"], changedBy: [{ revisionNumber: 4, madeByLabel: "A person", message: "", createdAt: 1 }, { revisionNumber: 3, madeByLabel: "The assistant", message: "", createdAt: 1 }] }))
      .toBe("This Flow changed while you were editing (A person and The assistant changed steps 2, 3 and 6). Your change was not saved.");
    expect(conflictWords({ baseRevision: 2, currentRevision: 3, steps: [], changedBy: [] }))
      .toBe("This Flow changed while you were editing (Someone changed it). Your change was not saved.");
  });
});

describe("dataStepFromForm", () => {
  it("builds each data step in its declared shape", () => {
    expect(dataStepFromForm({ kind: "keep-where", field: "price", test: "at-most", value: "20" })).toEqual({ ok: true, data: { kind: "filter", where: { op: "lte", args: [{ field: "price" }, { value: 20 }] } } });
    expect(dataStepFromForm({ kind: "keep-where", field: "Ships to", test: "contains", value: "10" })).toEqual({ ok: true, data: { kind: "filter", where: { op: "contains", args: [{ field: ["Ships to"] }, { value: "10" }] } } });
    expect(dataStepFromForm({ kind: "sort", field: "price", order: "lowest" })).toEqual({ ok: true, data: { kind: "sort", by: [{ field: "price", order: "asc" }] } });
    expect(dataStepFromForm({ kind: "keep-first", count: "10" })).toEqual({ ok: true, data: { kind: "limit", count: 10 } });
    expect(dataStepFromForm({ kind: "remove-duplicates", field: "seller.name" })).toEqual({ ok: true, data: { kind: "dedupe", key: ["seller.name"], keep: "first" } });
    expect(dataStepFromForm({ kind: "save-dataset", name: " Listings " })).toEqual({ ok: true, data: { kind: "sink", to: { kind: "dataset", name: "Listings" } } });
    expect(dataStepFromForm({ kind: "export", format: "csv", path: "exports/rows.csv" })).toEqual({ ok: true, data: { kind: "sink", to: { kind: "file", format: "csv", path: "exports/rows.csv" } } });
  });

  it("says what is missing in plain words", () => {
    expect(dataStepFromForm({ kind: "keep-where", field: "", test: "is", value: "x" })).toEqual({ ok: false, reason: "Say which field to check." });
    expect(dataStepFromForm({ kind: "keep-where", field: "price", test: "at-least", value: "lots" })).toEqual({ ok: false, reason: "“At most” and “at least” compare with a number." });
    expect(dataStepFromForm({ kind: "keep-first", count: "2.5" }).ok).toBe(false);
    expect(dataStepFromForm({ kind: "export", format: "json", path: "../outside.json" }).ok).toBe(false);
    expect(dataStepFromForm({ kind: "export", format: "json", path: "/abs.json" }).ok).toBe(false);
  });
});

describe("stepValues", () => {
  it("offers a recorded step's typed values and input bindings, never what it acts on", () => {
    const values = stepValues({
      definitionId: "builtin.policy.action",
      parameterValues: {
        outputId: "type-text",
        parameters: {
          text: "lamp",
          pressEnter: true,
          delayMs: 200,
          query: { $state: { path: "query", fallback: "lamp" } },
          fromEarlier: { $state: { path: "$node.search.result" } },
          target: { text: "Search", role: "textbox" },
          options: { mode: "fast", nodeId: "x" }
        }
      }
    });
    expect(values).toEqual([
      { path: ["text"], label: "Text", text: "lamp", kind: "text" },
      { path: ["pressEnter"], label: "Press enter", text: "yes", kind: "yes-no" },
      { path: ["delayMs"], label: "Delay ms", text: "200", kind: "number" },
      { path: ["query"], label: "Query", text: "", kind: "text", input: "query" },
      { path: ["options", "mode"], label: "Options: mode", text: "fast", kind: "text" }
    ]);
  });

  it("reads another step's own parameters, and nothing from a step whose values all come from elsewhere", () => {
    expect(stepValues({ definitionId: "builtin.data.limit", parameterValues: { count: 5 } })).toEqual([{ path: ["count"], label: "Count", text: "5", kind: "number" }]);
    expect(stepValues({ definitionId: "builtin.policy.action", parameterValues: { parameters: { $state: { path: "query" } } } })).toEqual([]);
  });
});

describe("runInputs", () => {
  const needs = [
    { id: "query", name: "Query", type: "text", required: true },
    { id: "count", name: "Count", type: "number", required: false },
    { id: "fresh", name: "Only new", type: "yes or no", required: false }
  ];

  it("types what the person entered", () => {
    expect(runInputs(needs, { query: " lamp ", count: "3", fresh: "yes" })).toEqual({ ok: true, inputs: { query: "lamp", count: 3, fresh: true } });
    expect(runInputs(needs, { query: "lamp" })).toEqual({ ok: true, inputs: { query: "lamp" } });
  });

  it("asks for a required input and a number", () => {
    expect(runInputs(needs, {})).toEqual({ ok: false, reason: "Fill in “Query” to run this Flow." });
    expect(runInputs(needs, { query: "x", count: "many" })).toEqual({ ok: false, reason: "“Count” needs a number." });
  });
});
