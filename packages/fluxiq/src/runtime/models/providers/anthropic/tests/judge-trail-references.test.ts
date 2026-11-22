import { describe, expect, it } from "vitest";
import { automationStudioAnthropicDeciderPrefix, automationStudioAnthropicJudgeContinuation } from "../index.ts";

// t978: the judge's trail shows a repeated page view once and refers to its first holder by `{ sameAs }`. A continuation
// leaves out the entries whose calls the decider's evidence holds, and that evidence does not carry the trail's page views
// (run-mwoxglkg-e37fd49b: none of 31), so a reference to a left-out entry must not be left pointing at nothing.

const PAGE = `URL https://shop.example/list?page=2\n${"row ".repeat(80)}`;
const decider = {
  model: "claude-haiku-5-5",
  messages: [{ role: "user", content: [{ type: "text", text: "head" }, { type: "text", text: JSON.stringify({ callId: "c1" }), cache_control: { type: "ephemeral" } }] }]
};
const judgeUser = (entries: unknown[]) => JSON.stringify({ context: { resultSummary: { trail: { note: "n", entries } } } });
const entriesOf = (wire: Record<string, unknown>) => {
  const content = (wire.messages as { content: { text: string }[] }[])[0]!.content;
  return (JSON.parse(content.at(-1)!.text) as { context: { resultSummary: { trail: { entries: { callId: string; found: Record<string, unknown> }[] } } } }).context.resultSummary.trail.entries;
};

describe("a judge continuation and the trail's references to a page view", () => {
  const prefix = automationStudioAnthropicDeciderPrefix(decider)!;

  it("gives the first entry that refers to a left-out holder the value whole, and points later references at it", () => {
    const entries = entriesOf(automationStudioAnthropicJudgeContinuation(prefix, "judge", judgeUser([
      { n: 1, callId: "c1", found: { page: PAGE } },
      { n: 2, callId: "c2", found: { page: { sameAs: "c1" }, rows: 3 } },
      { n: 3, callId: "c3", found: { page: { sameAs: "c1" } } },
      { n: 4, callId: "c4", found: { page: { sameAs: "c2" } } }
    ])));
    expect(entries.map((entry) => entry.callId)).toEqual(["c2", "c3", "c4"]);
    expect(entries[0]!.found).toEqual({ page: PAGE, rows: 3 });
    expect(entries[1]!.found).toEqual({ page: { sameAs: "c2" } });
    expect(entries[2]!.found).toEqual({ page: { sameAs: "c2" } });
  });

  it("leaves a reference to an entry it keeps as it is", () => {
    const entries = entriesOf(automationStudioAnthropicJudgeContinuation(prefix, "judge", judgeUser([
      { n: 1, callId: "c5", found: { page: PAGE } },
      { n: 2, callId: "c6", found: { page: { sameAs: "c5" } } }
    ])));
    expect(entries.map((entry) => entry.found)).toEqual([{ page: PAGE }, { page: { sameAs: "c5" } }]);
  });
});
