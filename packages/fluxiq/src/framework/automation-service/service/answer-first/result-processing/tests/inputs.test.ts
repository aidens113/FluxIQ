import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioAnswerFirstProcessingInputs, automationStudioAnswerFirstStepsWithResultProcessing } from "../index.ts";
import { automaticFeed, REFERENCE } from "../../result-feed/tests/automatic-support.ts";

const process: JsonObject = { where: [{ field: "Date", atLeast: "2030-01-02", atMost: { $input: "latest", test: "2030-01-02" }, as: "date" }], columns: ["title"] };
const originals = [{ id: "one", title: "Earlier", date: "2030-01-01" }, { id: "two", title: "First", date: "2030-01-02" }, { id: "three", title: "Later", date: "2030-01-03" }];

describe("processing binds only explicit current caller values", () => {
  it("changes the effective upper bound without lifting an equal constant or mutating the declaration", () => {
    const first = automaticFeed(process, REFERENCE, undefined, { latest: "2030-01-02" });
    first.read("source", originals);
    expect(first.feed.rows().rows.map((row) => row.title)).toEqual(["First"]);
    const saved = automationStudioAnswerFirstStepsWithResultProcessing({ result: first.feed, steps: first.steps });
    const written = (saved[0]!.input.parameters as JsonObject).recordOutput as JsonObject;
    expect(written.process).toMatchObject({ where: [{ field: "date", atLeast: "2030-01-02", atMost: { $state: { path: "latest", fallback: "2030-01-02" } } }], declaration: { source: first.processing.source, revision: 1, bindings: { Date: "date", title: "title" } } });
    expect(first.feed.processingDeclaration()?.task).toEqual({ process });
    const second = automaticFeed(first.feed.processingDeclaration()!.task!.process, REFERENCE, undefined, { latest: "2030-01-03" });
    second.read("source", originals);
    expect(second.feed.rows().rows.map((row) => row.title)).toEqual(["First", "Later"]);
    expect(second.feed.boundProcessing()?.where?.[0]).toMatchObject({ atLeast: "2030-01-02", atMost: "2030-01-03" });
    expect(second.feed.boundProcessing()?.declaration).toEqual(first.feed.boundProcessing()?.declaration);
  });

  it.each([undefined, {}, { latest: null }, { latest: false }, { latest: {} }])("withholds on missing or invalid current values: %j", (inputs) => {
    const fixture = automaticFeed(process, REFERENCE, undefined, inputs);
    fixture.read("source", originals);
    expect(fixture.feed.readiness().state).toBe("missing-evidence");
    expect(fixture.feed.rows().datasetId).toBeUndefined();
    expect(fixture.feed.boundProcessing()).toBeUndefined();
    expect(fixture.feed.storedProcessing()).toBeUndefined();
  });

  it("refuses bindings in grammar/field positions, unknown inputs and raw state", () => {
    for (const raw of [{ where: [{ field: { $input: "latest", test: "date" }, is: "present" }] }, { columns: [{ $input: "latest", test: "date" }] }, { limit: { $input: "unknown", test: 1 } }, { where: [{ field: "date", atMost: { $state: { path: "latest", fallback: "2030-01-02" } } }] }]) {
      expect(automationStudioAnswerFirstProcessingInputs(raw, { latest: "2030-01-03" }).ok).toBe(false);
    }
  });

  it("records an explicit binding amendment even when its first value equals the old literal", () => {
    const fixture = automaticFeed({ where: [{ field: "date", atMost: "2030-01-02", as: "date" }] }, REFERENCE, undefined, { latest: "2030-01-02" });
    fixture.read("source", originals);
    expect(fixture.feed.amendProcessing(process, "The caller's latest input is the requested upper date bound.")).toEqual({ ok: true, changed: true });
    expect(fixture.feed.processingDeclaration()?.revision).toBe(2);
  });
});
