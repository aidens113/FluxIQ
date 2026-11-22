import { expect, it } from "vitest";
import { automationStudioAnswerFirstResultFeed } from "../index.ts";
import type { AutomationStudioResultEvidenceSourceRef } from "../../../../../../runtime/result-verification/index.ts";
import { automaticFeed, REFERENCE, SCHEMA } from "./automatic-support.ts";
import { reread } from "./source-validation-support.ts";

const source = (name: string, step = "old") => ({ source: name, step, version: 1, datasetId: `read.${name}` });
const row = { id: "a", title: "Actual", promoted: false };

it("mints an exact ready-to-ready page receipt from the actual kept read, retaining full rows and its account", () => {
  const p = automaticFeed({ columns: ["title"] });
  const step = p.read("old", [row]);
  expect(p.feed.readiness()).toEqual({ state: "ready" });
  expect(p.feed.sourceRefs("old")).toEqual([source("old")]);
  const changed = { ...row, title: "Corrected" };
  reread(p.feed, step, "fresh", [changed], SCHEMA, "page=1");
  expect(p.feed.readiness()).toEqual({ state: "ready" });
  expect(p.feed.evidence().sourceReplacements).toEqual({ version: 1, receipts: [{ kind: "page", from: [source("old")], to: [source("fresh")] }] });
  expect(p.feed.sourceProof()).toEqual({ pages: p.feed.evidence().pages, sourceReplacements: p.feed.evidence().sourceReplacements });
  expect(p.feed.evidence().pages[0]?.rows).toEqual([changed]);
  expect(p.feed.evidence().processing).toMatchObject({ collected: 1, kept: 1 });
  expect(p.feed.rows().rows).toEqual([changed]);
  expect(p.feed.sourceRefs("old")).toEqual([]);
  const refs = p.feed.sourceRefs("fresh");
  refs[0]!.source = "changed outside the feed";
  expect(p.feed.sourceRefs("fresh")).toEqual([source("fresh")]);
});

it("mints the same authority when an exact reread repairs a rejected original source", () => {
  const p = automaticFeed({ columns: ["title"] });
  const step = p.read("old", [{ id: "a" }]);
  expect(p.feed.readiness().state).toBe("missing-evidence");
  reread(p.feed, step, "fresh", [row], SCHEMA, "page=1");
  expect(p.feed.readiness()).toEqual({ state: "ready" });
  expect(p.feed.evidence().sourceReplacements).toEqual({ version: 1, receipts: [{ kind: "page", from: [source("old")], to: [source("fresh")] }] });
});

it("reads only current source proof without evaluating rows or substituting held historical pages", () => {
  const p = automaticFeed({ columns: ["title"] });
  const step = p.read("old", [row]);
  const historical = p.feed.evidence();
  reread(p.feed, step, "fresh", [row], SCHEMA, "page=1");
  let reads = 0;
  const original = p.feed.port.outputGroup()[0]!.pages[0]!.kept[0]!;
  Object.defineProperty(original, "title", { configurable: true, enumerable: true, get: () => { reads += 1; return row.title; } });
  expect(p.feed.sourceProof().pages[0]?.source).toBe("fresh");
  expect(reads).toBe(0);
  Object.defineProperty(original, "title", { configurable: true, enumerable: true, value: row.title });
  p.feed.sourceUnavailable("Historical evidence still requires recovery.", historical);
  expect(p.feed.evidence().pages[0]?.source).toBe("old");
  expect(p.feed.sourceProof().pages[0]?.source).toBe("fresh");
  expect(p.feed.sourceProof().sourceReplacements?.receipts).toHaveLength(1);
});

it("does not grant page authority to an unrelated place or an indistinguishable reused source tuple", () => {
  const p = automaticFeed({ columns: ["title"] });
  const step = p.read("old", [row]);
  reread(p.feed, step, "unrelated", [{ ...row, id: "b" }], SCHEMA, "page=2");
  expect(p.feed.evidence().sourceReplacements).toBeUndefined();
  reread(p.feed, step, "old", [{ ...row, title: "Changed under a reused tuple" }], SCHEMA, "page=1");
  expect(p.feed.evidence().sourceReplacements).toBeUndefined();
});

it("cannot use a previously observed target tuple to repair held evidence or reinterpret its later contents", () => {
  const p = automaticFeed({ columns: ["title"] });
  const step = p.read("old", [row]);
  reread(p.feed, step, "shared", [{ ...row, id: "b" }], SCHEMA, "page=2");
  p.feed.sourceUnavailable("Repair both exact source pages.", p.feed.evidence());
  reread(p.feed, step, "shared", [{ ...row, title: "A different occurrence under the same tuple" }], SCHEMA, "page=1");
  expect(p.feed.evidence().sourceReplacements).toBeUndefined();
});

it("never mints a later replacement from a tuple whose contents were indistinguishably reused", () => {
  const p = automaticFeed({ columns: ["title"] });
  const step = p.read("old", [row]);
  reread(p.feed, step, "shared", [row], SCHEMA, "page=1");
  const first = p.feed.evidence().sourceReplacements;
  expect(first?.receipts).toHaveLength(1);
  reread(p.feed, step, "shared", [{ ...row, title: "Changed with no new identity" }], SCHEMA, "page=1");
  reread(p.feed, step, "latest", [row], SCHEMA, "page=1");
  expect(p.feed.evidence().sourceReplacements).toEqual(first);
  expect(p.feed.evidence().sourceReplacements?.receipts.some((entry) => entry.from.some((ref) => ref.source === "shared"))).toBe(false);
});

it.each([undefined, 1])("cannot mint authority without a known zero original rejection count: %s", (invalidCount) => {
  const p = automaticFeed({ columns: ["title"] });
  const step = p.read("old", [row]);
  if (invalidCount === undefined) {
    // Older copied pages genuinely allow an unknown count; a modern sink result always supplies its required number.
    const prior = p.feed.evidence().pages[0]!;
    p.feed.restored([{ step, read: { source: "fresh", version: { conditions: prior.conditions, fields: prior.fields, ...(prior.listKey === undefined ? {} : { listKey: prior.listKey }) }, kept: [row], place: "page=1" }, schema: SCHEMA, version: prior.version, datasetId: "read.fresh" }]);
  } else {
    p.feed.expect({ kind: "rerun", step });
    p.feed.called({ callId: "fresh", toolId: "core.run_node", value: step.input }, { kind: "llm_evidence_tool_execution", effectApplied: false, evidence: { read: { extracted: [row], listKey: "fixture.records", place: "page=1" } } }, { rows: [row], schema: SCHEMA, datasetId: "read.fresh", truncated: false, invalidCount });
  }
  expect(p.feed.evidence().sourceReplacements).toBeUndefined();
  expect(p.feed.readiness().state).toBe("missing-evidence");
});

it("requires the actual retained schema before a successful-looking reread can replace authority", () => {
  const p = automaticFeed({ columns: ["title"] });
  const step = p.read("old", [row]);
  p.feed.expect({ kind: "rerun", step });
  p.feed.called({ callId: "fresh", toolId: "core.run_node", value: step.input }, { kind: "llm_evidence_tool_execution", effectApplied: false, evidence: { read: { extracted: [row], listKey: "fixture.records", place: "page=1" } } }, { rows: [row], datasetId: "read.fresh", invalidCount: 0, truncated: false });
  expect(p.feed.evidence().sourceReplacements).toBeUndefined();
  expect(p.feed.readiness().state).toBe("missing-evidence");
});

it("requires complete fresh coverage before replacing a ready collection with a different exact producer", () => {
  const p = automaticFeed({ columns: ["title"] });
  p.read("old", [row]);
  p.steps.splice(0);
  p.feed.draft(p.steps);
  const readSince = p.feed.port.ledger().seq;
  const step = p.read("fresh", [row]);
  const receipt = { from: 1, to: 1, readSince, callIds: ["fresh"], steps: p.steps };
  expect(p.feed.collectionReplaced(receipt)).toMatchObject({ replaced: false });
  expect(p.feed.evidence().sourceReplacements).toBeUndefined();
  p.feed.port.record([{ kind: "paging", stepId: p.feed.idOf(step), paging: { verdict: "ended", reason: "The actual list has no later page." } }]);
  expect(p.feed.collectionReplaced(receipt)).toMatchObject({ replaced: true, kind: "fresh_collection" });
  expect(p.feed.evidence().sourceReplacements).toEqual({ version: 1, receipts: [{ kind: "collection", from: [source("old")], to: [source("fresh", "fresh")] }] });
  expect(p.feed.readiness()).toEqual({ state: "ready" });
});

it("emits producer tuples only when their real pages have been recorded, including forward passes and restoration", () => {
  const p = automaticFeed();
  const step = p.read("old", [row]);
  const recorded: (readonly AutomationStudioResultEvidenceSourceRef[])[] = [];
  const calls: unknown[] = [];
  const feed = automationStudioAnswerFirstResultFeed({ instructionText: "List matching records.", readRowsKey: "read.extracted", processing: p.processing, processingReferenceTimeMs: REFERENCE, sourceRecorded: (refs, call) => { recorded.push(refs); calls.push(call); } });
  const answer = { kind: "llm_evidence_tool_execution" as const, effectApplied: false, evidence: { read: { extracted: [row], listKey: "fixture.records", place: "page=1" } } };
  const call = { callId: "forward", toolId: "core.run_node", value: { ...step.input, replay: "forward" } };
  feed.called(call, answer, { rows: [row], schema: SCHEMA, datasetId: "read.forward", invalidCount: 0, truncated: false });
  expect(recorded).toEqual([]);
  feed.passed(step, [step], answer);
  expect(recorded).toEqual([[source("forward")]]);
  expect(calls[0]).toBe(call);
  expect(feed.sourceRefs("forward")).toEqual([source("forward")]);
  feed.restored([{ step, read: { source: "restored", version: { conditions: [], fields: Object.fromEntries(SCHEMA.fields.filter((field) => field.handling !== "exclude").map((field) => [field.id, `.${field.id}`])), listKey: "fixture.records" }, kept: [row], place: "page=1", invalidCount: 0 }, schema: SCHEMA, version: 3, datasetId: "read.restored" }]);
  expect(recorded.at(-1)).toEqual([{ ...source("restored"), version: 3 }]);
  expect(calls.at(-1)).toBeUndefined();
});
