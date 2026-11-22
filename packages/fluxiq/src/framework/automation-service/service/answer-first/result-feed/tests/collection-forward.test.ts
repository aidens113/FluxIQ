import { expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../../runtime/llm/index.ts";
import { runAutomationStudioFlowDraftPart } from "../../../../../../runtime/llm/node-tools/run/flow-part.ts";
import { automaticFeed, SCHEMA } from "./automatic-support.ts";

it("only an actual fresh forward read plus observed paginator end replaces unavailable originals", async () => {
  const p = automaticFeed({ columns: ["title"] });
  const read = p.read("original", [{ id: "a", title: "Before" }]);
  read.ranWith = read.input;
  read.replay = { from: { location: "fixture://records" } };
  read.routing = { kind: "repeat", through: "pager", while: "pager" };
  const pager: AutomationStudioFlowDraftStep = { id: "pager", callId: "pager", position: 2, disposition: "kept", proposes: true, effect: "mutate", toolId: "core.run_node", actionId: "fixture.next", input: { node: "fixture.next", parameters: {} }, ranWith: { node: "fixture.next", parameters: {} }, replay: { from: { location: "fixture://records" } } };
  p.steps.push(pager);
  p.feed.draft(p.steps);
  p.feed.sourceUnavailable("Original source metadata is unavailable.", { pages: [], coverage: [], working: [], looks: [] });
  let ending = false;
  const starts: number[] = [];
  const actualCalls: string[][] = [];
  const forward = async () => {
    const calls: string[] = []; actualCalls.push(calls);
    return runAutomationStudioFlowDraftPart({ steps: p.steps, value: { from: 1, to: 2 }, callId: "same-forward-id", forward: {
      rowDone: () => false, stepDone: () => false,
      started: () => { const seq = p.feed.port.ledger().seq; starts.push(seq); return seq; },
      passed: (step, _row, answer) => p.feed.passed(step, p.steps, answer),
      completed: (receipt) => p.feed.collectionReplaced({ ...receipt, steps: p.steps })
    }, executeTool: async ({ callId, toolId, value }) => {
      calls.push(callId);
      if (value.node === "fixture.read") {
        const rows = [{ id: "a", title: ending ? "After" : "Partial" }];
        const answer: AutomationStudioLlmEvidenceToolExecutionResult = { kind: "llm_evidence_tool_execution", effectApplied: false, resultCode: "core.replay.replayed", evidence: { read: { extracted: rows, listKey: "fixture.records", place: "page=1" } }, outputs: { records: rows } };
        p.feed.called({ callId, toolId, value }, answer, { datasetId: `read.${callId}`, schema: { ...SCHEMA, fields: SCHEMA.fields.filter((field) => field.handling !== "exclude") }, rows, invalidCount: 0, truncated: false });
        return answer;
      }
      const answer: AutomationStudioLlmEvidenceToolExecutionResult = { kind: "llm_evidence_tool_execution", effectApplied: false, resultCode: ending ? "core.replay.ended" : "core.replay.failed", evidence: ending ? { route: "ended", said: "The actual paginator has no further page." } : { route: "failed" } };
      p.feed.called({ callId, toolId, value }, answer, undefined);
      return answer;
    } });
  };
  const partial = await forward();
  expect(partial.evidence).not.toHaveProperty("sourceReplacement");
  expect(p.feed.readiness().state).toBe("missing-evidence");
  ending = true;
  const complete = await forward();
  expect(actualCalls[1]).toEqual(actualCalls[0]); // The real walker deliberately reused ids; occurrence sequence proves freshness.
  expect(starts[1]).toBeGreaterThan(starts[0]!);
  expect(complete.evidence).toMatchObject({ sourceReplacement: { replaced: true, kind: "fresh_collection", readSince: starts[1], sources: [actualCalls[1]![0]] } });
  expect(p.feed.readiness()).toEqual({ state: "ready" });
  expect(p.feed.rows().rows).toEqual([{ id: "a", title: "After" }]);
  expect(p.feed.evidence().coverage[0]).toMatchObject({ first: "read", last: { paging: { verdict: "ended" } } });
  expect(p.feed.evidence().pages[0]?.carried).not.toBe(true);
});
