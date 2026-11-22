import { describe, expect, it } from "vitest";
import type { AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import { AutomationStudioAttemptActRecord } from "../../../../../../runtime/answer-first/act-record/index.ts";
import { automationStudioAnswerFirstResultFeed } from "../../result-feed/index.ts";
import { automationStudioAnswerFirstTrailsOf } from "../../trail/index.ts";
import { automationStudioAnswerFirstCallChain } from "../call-chain.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../../runtime/flow-authoring/draft/index.ts";

const ROWS = [{ title: "Original", amount: 2 }];
const SCHEMA: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string" }, { id: "amount", label: "Amount", valueType: "number" }] };
const VALUE = { node: "fixture.read", parameters: { read: { fields: { title: ".title", amount: ".amount" } } } };

function fixture() {
  const journal = automationStudioAnswerFirstTrailsOf({});
  const trail = journal.of("attempt", { carriedOn: false, askedAgain: false });
  const feed = automationStudioAnswerFirstResultFeed({ instructionText: "List records", readRowsKey: "read.extracted", sourceRecorded: (refs, call) => journal.sourceRecorded(trail, refs, call) });
  const execute = automationStudioAnswerFirstCallChain({ domain: async () => ({ kind: "llm_evidence_tool_execution", evidence: { read: { extracted: ROWS, listKey: "records", place: "page=1" } }, effectApplied: false, draft: { effect: "observe" } }), record: new AutomationStudioAttemptActRecord(), result: feed, sink: { fromCall: async () => ({ rows: ROWS, schema: SCHEMA, datasetId: "actual.dataset", invalidCount: 0, truncated: false }) }, witnesses: { beforeFirstLastingAct: async () => ({ kind: "unread", note: { side: "before", code: "answer_first.witness_unread" } }) }, readRowsKey: "read.extracted", describe: undefined, stepped: () => undefined, answered: () => undefined, judgeEvidence: { judgeEvidenceVersion: 1, deniedEvidenceKeys: [] }, trailed: (step) => { trail.push(step); } });
  const step: AutomationStudioFlowDraftStep = { id: "kept.read", callId: "same.id", position: 1, iteration: 1, disposition: "kept", proposes: true, effect: "observe", input: VALUE, toolId: "core.run_node", actionId: "fixture.read" };
  return { journal, trail, feed, execute, step };
}

describe("actual result producer occurrence origins", () => {
  it("stamps the authoritative source tuple before the call's checkpoint", async () => {
    const f = fixture();
    f.feed.expect({ kind: "add", position: 1, intermediate: false });
    await f.execute({ callId: "same.id", toolId: "core.run_node", value: VALUE });
    expect(f.trail[0]?.judgeSources).toEqual(f.feed.sourceRefs("same.id"));
    expect(f.trail[0]?.judgeSources).toHaveLength(1);
    const checkpoint = f.journal.checkpoint(f.trail, {}, { judgeEvidenceVersion: 1, deniedEvidenceKeys: [] })!;
    expect(checkpoint.trail[0]?.judgeSources).toEqual(f.feed.sourceRefs("same.id"));
  });

  it("keeps the exact forward call object until passed assigns its canonical page", async () => {
    const f = fixture();
    await f.execute({ callId: "same.id", toolId: "core.run_node", value: { ...VALUE, replay: "verify" } });
    expect(f.trail[0]?.judgeSources).toBeUndefined();
    f.feed.passed(f.step, [f.step], { effectApplied: false, evidence: {} });
    expect(f.trail[0]?.judgeSources).toEqual(f.feed.sourceRefs("same.id"));
    expect(f.trail[0]?.judgeSources).toHaveLength(1);
  });

  it("never gives an older unstamped occurrence a later reused call id's authority", async () => {
    const f = fixture();
    await f.execute({ callId: "same.id", toolId: "core.run_node", value: { ...VALUE, replay: "verify" } });
    expect(f.trail[0]?.judgeSources).toBeUndefined();
    f.feed.expect({ kind: "add", position: 1, intermediate: false });
    await f.execute({ callId: "same.id", toolId: "core.run_node", value: VALUE });
    expect(f.trail[0]?.judgeSources).toBeUndefined();
    expect(f.trail[1]?.judgeSources).toHaveLength(1);
    const checkpoint = f.journal.checkpoint(f.trail, {}, { judgeEvidenceVersion: 1, deniedEvidenceKeys: [] })!;
    const reopened = automationStudioAnswerFirstTrailsOf({}).of("attempt", { carriedOn: true, askedAgain: false, judgeEvidence: JSON.parse(JSON.stringify(checkpoint)) });
    expect(reopened[0]?.judgeSources).toBeUndefined();
    expect(reopened[1]?.judgeSources).toEqual(f.trail[1]?.judgeSources);
  });
});
