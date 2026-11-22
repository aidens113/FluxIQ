import { expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioAnswerFirstRestoreResult, automationStudioAnswerFirstResultFeed, type AutomationStudioAnswerFirstResultFeed } from "../index.ts";
import { automaticFeed, REFERENCE, SCHEMA } from "./automatic-support.ts";

function replace(feed: AutomationStudioAnswerFirstResultFeed, step: AutomationStudioFlowDraftStep, source: string, place: string, rows: JsonObject[]) {
  feed.expect({ kind: "rerun", step });
  feed.called({ callId: source, toolId: "core.run_node", value: step.input }, { kind: "llm_evidence_tool_execution", effectApplied: false, evidence: { read: { extracted: rows, listKey: "fixture.records", place } } }, { rows, schema: { ...SCHEMA, fields: SCHEMA.fields.filter((field) => field.handling !== "exclude") }, datasetId: `read.${source}`, invalidCount: 0, truncated: false });
}

it("cannot clear a missing multi-page source with an unrelated/new single-page read or expose an old bound stamp", () => {
  const p = automaticFeed({ columns: ["title"] });
  p.read("one", [{ id: "a", title: "A" }], SCHEMA, "page=1");
  p.read("two", [{ id: "b", title: "B" }], SCHEMA, "page=2");
  expect(p.feed.boundProcessing()).toBeDefined();
  p.feed.sourceUnavailable("The second contributing original cannot be restored.");
  expect(p.feed.boundProcessing()).toBeUndefined();
  p.read("unrelated", [{ title: "Another list" }], { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string" }] });
  expect(p.feed.readiness()).toMatchObject({ state: "missing-evidence" });
  expect(p.feed.rows().datasetId).toBeUndefined();
  expect(p.feed.boundProcessing()).toBeUndefined();
});

it("retains valid pages and unresolved originals across a partial refresh, checkpoint and reopen", () => {
  const p = automaticFeed({ columns: ["title"] });
  const first = p.read("one", [{ id: "a", title: "A" }], SCHEMA, "page=1");
  p.read("two", [{ id: "b", title: "B" }], SCHEMA, "page=2");
  const original = p.feed.evidence();
  const restored = automationStudioAnswerFirstRestoreResult({ evidence: original, steps: p.steps, batches: [], source: (id) => p.sources.get(id) });
  if (!restored.ok) throw new Error(restored.reason);
  const feed = automationStudioAnswerFirstResultFeed({ instructionText: "List the matching records.", readRowsKey: "read.extracted", processing: p.processing, processingReferenceTimeMs: REFERENCE });
  feed.restored(restored.entries.slice(0, 1));
  feed.sourceUnavailable("Missing page two.", original);
  const fresh = [{ id: "a", title: "Fresh A" }];
  replace(feed, first, "fresh-one", "page=1", fresh);
  expect(feed.readiness().state).toBe("missing-evidence");
  const checkpoint = JSON.parse(JSON.stringify(feed.evidence()));
  expect(checkpoint.pages).toHaveLength(2);
  expect(checkpoint.pages.flatMap((page: { rows: JsonObject[] }) => page.rows)).toEqual([...fresh, { id: "b", title: "B" }]);
  const source = { schema: { ...SCHEMA, fields: SCHEMA.fields.filter((field) => field.handling !== "exclude") }, rows: fresh };
  const partial = automationStudioAnswerFirstRestoreResult({ evidence: checkpoint, steps: p.steps, batches: [], source: (id) => id === "read.fresh-one" ? source : undefined });
  expect(partial).toMatchObject({ ok: false, entries: [{ read: { source: "fresh-one" } }] });
  if (partial.ok) throw new Error("Page two must still be missing");
  const again = automationStudioAnswerFirstResultFeed({ instructionText: "List the matching records.", readRowsKey: "read.extracted", processing: p.processing, processingReferenceTimeMs: REFERENCE });
  again.restored(partial.entries);
  again.sourceUnavailable(partial.reason, checkpoint);
  expect(again.evidence().pages).toHaveLength(2);
  expect(again.readiness().state).toBe("missing-evidence");
  replace(again, first, "fresh-two", "page=2", [{ id: "b", title: "Fresh B" }]);
  expect(again.readiness()).toEqual({ state: "ready" });
  expect(again.rows().rows).toEqual([...fresh, { id: "b", title: "Fresh B" }]);
});

it("does not let one place-less refresh stand in for several missing original pages", () => {
  const p = automaticFeed({ columns: ["title"] });
  const first = p.read("one", [{ id: "a", title: "A" }], SCHEMA, "page=1");
  p.read("two", [{ id: "b", title: "B" }], SCHEMA, "page=2");
  const evidence = p.feed.evidence();
  const unknown = { ...evidence, pages: evidence.pages.map(({ place: _place, ...page }) => page) };
  const feed = automationStudioAnswerFirstResultFeed({ instructionText: "List the matching records.", readRowsKey: "read.extracted", processing: p.processing, processingReferenceTimeMs: REFERENCE });
  feed.sourceUnavailable("Original page identity is unavailable.", unknown);
  replace(feed, first, "fresh", "page=1", [{ id: "a", title: "Only one page" }]);
  expect(feed.readiness().state).toBe("missing-evidence");
  expect(feed.rows().rows).toEqual([]);
});
