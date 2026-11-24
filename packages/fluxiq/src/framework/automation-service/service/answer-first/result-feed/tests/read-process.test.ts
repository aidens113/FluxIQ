// A read's own `recordOutput.process` holds under a declared task (t994): the data stage evaluates it with the task's
// declaration over it, key by key, as the legacy path does (`../merged-processing.ts`), never the declaration alone.
import { expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automaticFeed } from "./automatic-support.ts";

const ROWS: JsonObject[] = [
  { id: "a", title: "Anvil", price: "$3", promoted: false },
  { id: "b", title: "Bucket", price: "$1", promoted: false },
  { id: "c", title: "Chisel", price: "$2", promoted: false },
  { id: "d", title: "Drill", price: "$1", promoted: true }
];
const titles = (rows: readonly JsonObject[]) => rows.map((row) => row.title);

it("keeps a read's own where, sort and limit under a declared task", () => {
  const p = automaticFeed({});
  p.read("one", ROWS, undefined, undefined, { where: [{ field: "promoted", equals: "false" }], sort: [{ field: "price", order: "desc" }], limit: 2 });
  expect(p.feed.readiness()).toEqual({ state: "ready" });
  expect(titles(p.feed.rows().rows)).toEqual(["Anvil", "Chisel"]);
  expect(p.feed.rows().totalRows).toBe(2);
  expect(p.feed.boundProcessing()).toMatchObject({ where: [{ field: "promoted" }], sort: [{ field: "price", order: "desc", as: "number" }], limit: 2 });
  expect(p.feed.evidence().processing).toMatchObject({ collected: 4, leftOut: 1, cut: 1, kept: 2 });
});

it("applies the declaration's own condition on top of the read's process, its keys over the read's", () => {
  // The task's where narrows; its sort replaces the read's; the read's limit still holds.
  const p = automaticFeed({ where: [{ field: "Price", atMost: 2 }], sort: [{ field: "Title", order: "desc" }] });
  p.read("one", ROWS, undefined, undefined, { sort: [{ field: "title", order: "asc" }], limit: 2 });
  expect(p.feed.readiness()).toEqual({ state: "ready" });
  expect(titles(p.feed.rows().rows)).toEqual(["Drill", "Chisel"]);
  expect(p.feed.boundProcessing()).toMatchObject({ where: [{ field: "price", atMost: 2 }], sort: [{ field: "title", order: "desc" }], limit: 2 });
});

it("a read's process the contract does not accept shapes nothing, while the declaration's own failure is still reported", () => {
  const p = automaticFeed({});
  p.read("one", ROWS, undefined, undefined, { sort: [{ field: "no_such_column", order: "desc" }] });
  expect(p.feed.readiness()).toEqual({ state: "ready" });
  expect(titles(p.feed.rows().rows)).toEqual(titles(ROWS));
  const task = automaticFeed({ where: [{ field: "no_such_column", equals: "x" }] });
  task.read("one", ROWS, undefined, undefined, { sort: [{ field: "title", order: "desc" }] });
  expect(task.feed.readiness()).toMatchObject({ state: "missing-evidence", code: "answer_first.processing_binding_missing" });
  expect(task.feed.rows().rows).toEqual([]);
});

it("never answers a read's new process from the result bound for its earlier one", () => {
  const p = automaticFeed({});
  const step = p.read("one", ROWS, undefined, undefined, { sort: [{ field: "title", order: "asc" }] });
  expect(titles(p.feed.rows().rows)).toEqual(["Anvil", "Bucket", "Chisel", "Drill"]);
  const parameters = step.input.parameters as JsonObject;
  p.steps[0] = { ...step, input: { ...step.input, parameters: { ...parameters, recordOutput: { datasetId: "records", process: { sort: [{ field: "title", order: "desc" }] } } } } };
  p.feed.draft(p.steps);
  expect(titles(p.feed.rows().rows)).toEqual(["Drill", "Chisel", "Bucket", "Anvil"]);
});

it("reads the merge the framework saved into the step again under the same declaration, and not once it is amended", () => {
  const p = automaticFeed({ where: [{ field: "Promoted", equals: "false" }] });
  p.read("one", ROWS, undefined, undefined, { sort: [{ field: "title", order: "desc" }] });
  // What `automationStudioAnswerFirstStepsWithResultProcessing` writes into the saved step's record output.
  const saved = p.feed.storedProcessing()!;
  expect(saved).toMatchObject({ sort: [{ field: "title", order: "desc" }], declaration: { revision: 1 } });
  const later = automaticFeed({ where: [{ field: "Promoted", equals: "false" }] });
  later.read("one", ROWS, undefined, undefined, saved);
  expect(later.feed.readiness()).toEqual({ state: "ready" });
  expect(titles(later.feed.rows().rows)).toEqual(["Chisel", "Bucket", "Anvil"]);
  // The amendment drops the condition; the saved merge of revision 1 must not bring it back.
  expect(later.feed.amendProcessing({}, "The person asked for promoted listings too.")).toEqual({ ok: true, changed: true });
  expect(later.feed.processingDeclaration()?.revision).toBe(2);
  expect(later.feed.readiness()).toEqual({ state: "ready" });
  expect(titles(later.feed.rows().rows)).toEqual(titles(ROWS));
});
