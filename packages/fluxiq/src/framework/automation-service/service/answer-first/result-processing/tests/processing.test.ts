// The result processing in a live attempt (t970, phase 2): set by `core.set_result_processing`, it shapes the answer
// the completion check judges, and a filter that drops a right row is in front of the judge with the condition that
// dropped it -- its own proof, over rows a live run read, once caught a plausible filter dropping three right rows.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_SET_RESULT_PROCESSING_TOOL_ID } from "../../../../../../runtime/llm/index.ts";
import { automationStudioFlowLessJudgedSummary, type AutomationStudioFlowLessSummary, type AutomationStudioResultTrailStep } from "../../../../../../runtime/result-verification/index.ts";
import { automationStudioAnswerFirstCompletionCheck } from "../../completion/index.ts";
import { resultPipeline } from "../../result-feed/tests/pipeline.ts";
import type { AutomationStudioFlowDraftResultProcessing } from "../../../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioAnswerFirstResultProcessingCall, automationStudioAnswerFirstResultProcessingExecutor, automationStudioAnswerFirstResultProcessingTools, automationStudioAnswerFirstStepsWithResultProcessing } from "../processing.ts";

const purse: Parameters<typeof automationStudioAnswerFirstCompletionCheck>[0]["purse"] = { keepBackForJudging: () => undefined };
const FIELDS = { title: ".name", price: ".price", badge: ".badge" };
/** A list where one pair's title goes on to name a case it ships with: a right row a careless filter drops. */
const PAGE: JsonObject[] = [
  { title: "Garden chair", price: "$40", badge: null },
  { title: "Garden chair cover", price: "$12", badge: null },
  { title: "Garden table with storage cover", price: "$90", badge: null },
  { title: "Patio heater", price: "$120", badge: "Featured" }
];

async function attempt() {
  const p = resultPipeline("List every piece of garden furniture, leaving out covers and anything featured, with columns title and price.");
  const value = p.input([], FIELDS);
  await p.read({ source: "s1", value, place: "page=1", rows: PAGE });
  const run: { result: typeof p.feed; trail: AutomationStudioResultTrailStep[]; resultProcessing?: AutomationStudioFlowDraftResultProcessing | undefined } = { result: p.feed, trail: [] };
  return { p, run, value };
}

describe("core.set_result_processing in an attempt", () => {
  it("is offered once beside the round's tools, answered here, and never sent to the domain", async () => {
    const { run } = await attempt();
    expect(automationStudioAnswerFirstResultProcessingTools([]).map((tool) => tool.toolId)).toEqual([AUTOMATION_STUDIO_LLM_SET_RESULT_PROCESSING_TOOL_ID]);
    expect(automationStudioAnswerFirstResultProcessingTools(automationStudioAnswerFirstResultProcessingTools([]))).toHaveLength(1);
    const sent: string[] = [];
    const execute = automationStudioAnswerFirstResultProcessingExecutor(run, async (call) => {
      sent.push(call.toolId);
      return { ok: true };
    });
    await execute({ callId: "c1", toolId: AUTOMATION_STUDIO_LLM_SET_RESULT_PROCESSING_TOOL_ID, value: { process: { where: [{ field: "badge", is: "absent" }] } } });
    await execute({ callId: "c2", toolId: "core.run_node", value: {} });
    expect(sent).toEqual(["core.run_node"]);
  });

  it("shapes the answer, hiding a mark it filters by and showing the person's columns", async () => {
    const { p, run } = await attempt();
    const answer = automationStudioAnswerFirstResultProcessingCall(run, { callId: "c1", toolId: AUTOMATION_STUDIO_LLM_SET_RESULT_PROCESSING_TOOL_ID, value: { process: { where: [{ field: "badge", is: "absent" }] } } });
    expect(answer.evidence).toMatchObject({ ok: true, kept: 3, set: { columns: ["title", "price"] } });
    expect(p.feed.rows().rows).toEqual([{ title: "Garden chair", price: "$40" }, { title: "Garden chair cover", price: "$12" }, { title: "Garden table with storage cover", price: "$90" }]);
    expect(run.trail.map((step) => step.did)).toEqual([AUTOMATION_STUDIO_LLM_SET_RESULT_PROCESSING_TOOL_ID]);
  });

  it("puts a filter that drops a right row in front of the judge, with the condition that dropped it", async () => {
    const { p, run } = await attempt();
    // Plausible, and wrong: "cover" also drops the table that comes with one.
    automationStudioAnswerFirstResultProcessingCall(run, { callId: "c1", toolId: AUTOMATION_STUDIO_LLM_SET_RESULT_PROCESSING_TOOL_ID, value: { process: { where: [{ field: "badge", is: "absent" }, { field: "title", contains: "cover", not: true }] } } });
    expect(p.feed.rows().rows).toEqual([{ title: "Garden chair", price: "$40" }]);
    const judged: AutomationStudioFlowLessSummary[] = [];
    const check = automationStudioAnswerFirstCompletionCheck({
      instructions: "List every piece of garden furniture, leaving out covers and anything featured, with columns title and price.",
      rows: async () => p.feed.rows(),
      acts: () => [],
      readsRan: () => true,
      endView: async () => undefined,
      witnesses: () => ({}),
      readPages: () => p.feed.readPages(),
      resultEvidence: () => p.feed.evidence(),
      trail: () => run.trail,
      judge: async (summary) => {
        judged.push(summary);
        return { verdict: "no", reason: "A table was left out.", checkedWhat: "the furniture" };
      },
      purse,
      say: () => undefined
    });
    await check.check({ summary: "Done." });
    const processing = judged[0]?.resultEvidence?.processing;
    expect(processing).toMatchObject({ collected: 4, leftOut: 3, kept: 1 });
    expect(processing?.filters).toContainEqual({ condition: "title not contains \"cover\"", leftOut: 2, leftOutOnlyByThis: ["Garden chair cover", "Garden table with storage cover"] });
    // As the judge's model is sent it: the row, and the words of the condition that dropped it, with the question that says how to read them.
    const sent = JSON.stringify(automationStudioFlowLessJudgedSummary(judged[0]!, []).sent);
    expect(sent).toContain("Garden table with storage cover");
    expect(sent).toContain("title not contains \\\"cover\\\"");
    expect(sent).toContain("resultEvidence.processing");
    // And the call itself is on the trail the judge reads.
    expect(sent).toContain(AUTOMATION_STUDIO_LLM_SET_RESULT_PROCESSING_TOOL_ID);
  });

  it("refuses a declaration over a column the rows do not hold, and the answer stays as it was", async () => {
    const { p, run } = await attempt();
    const answer = automationStudioAnswerFirstResultProcessingCall(run, { callId: "c1", toolId: AUTOMATION_STUDIO_LLM_SET_RESULT_PROCESSING_TOOL_ID, value: { process: { where: [{ field: "colour", is: "present" }] } } });
    expect(answer.evidence).toMatchObject({ ok: false, code: "result_processing.invalid" });
    expect(run.resultProcessing).toBeUndefined();
    expect(p.feed.rows().totalRows).toBe(4);
    expect(p.feed.evidence()).not.toHaveProperty("processing");
  });

  it("writes the declaration into the answer's step, so the Flow its steps assemble to applies it", async () => {
    const { p, run, value } = await attempt();
    automationStudioAnswerFirstResultProcessingCall(run, { callId: "c1", toolId: AUTOMATION_STUDIO_LLM_SET_RESULT_PROCESSING_TOOL_ID, value: { process: { where: [{ field: "badge", is: "absent" }] } } });
    const steps = [p.step("s1", value), p.step("s9", p.input([], { title: ".other" }), 2)];
    const written = automationStudioAnswerFirstStepsWithResultProcessing({ ...run, steps });
    expect((written[0]!.input.parameters as JsonObject).recordOutput).toEqual({ process: { where: [{ field: "badge", is: "absent" }], columns: ["title", "price"] } });
    expect(written[1]).toBe(steps[1]);
    // The step's own declaration then shapes the answer as before, with no tool call held.
    const fresh = resultPipeline("List every piece of garden furniture, leaving out covers and anything featured, with columns title and price.");
    await fresh.read({ source: "s1", value: written[0]!.input, rows: PAGE });
    expect(fresh.feed.rows().totalRows).toBe(3);
  });
});
