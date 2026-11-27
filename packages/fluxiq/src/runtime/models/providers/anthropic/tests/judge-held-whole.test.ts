import { describe, expect, it } from "vitest";
import { automationStudioAnthropicDeciderPrefix, automationStudioAnthropicJudgeContinuation } from "../index.ts";

// t1044: live run `run-mwvgjb8c-5a1f2ae3`'s judge (0042) continued its decider (0041). The decider's evidence showed each
// call's page and read rows as `{"core.view_reference": {callId, group}}`, whole only in the `core.current_view` tail
// after the last cache mark, which the prefix never carries. The judge was still told all 15 calls were "in its evidence
// above", so the trail it was sent held none of them: it saw 3 of a 15-row read's rows and no page, and passed an item
// that a row it was never shown undercut. The shape below is that request's, with made-up values.
//
// t1065: the continuation now carries the decider's whole user turn, the tail after the last mark included, so the
// latest view of each group is in what the judge is sent (run-mwy3btww-31d32e0d, 0129/0130: the recalled rows were only
// in that tail). A reference resolves where that tail holds its group whole; an earlier call whose group the tail has
// since replaced with a later call's view still does not.

type Block = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };
const entry = (value: object, mark = false): Block => ({ type: "text", text: `,${JSON.stringify(value)}`, ...(mark ? { cache_control: { type: "ephemeral" as const } } : {}) });
const ref = (callId: string, group: string) => ({ "core.view_reference": { callId, group } });

/** A read of a list's first page: its first rows inline, the rest only by reference to the read holder. */
const readFirst = { callId: "read_first", toolId: "core.run_node", value: { page: ref("read_first", "top"), read: { firstRows: [{ name: "Item A", price: "$8.00" }], restOfRows: "extracted holds all 3 kept rows.", extracted: ref("read_first", "holder:read") } } };
/** Core's own note on where the run stands, whole: no call of the trail. */
const routeState = { callId: "core.route_state.1", toolId: "core.route_state", value: { seen: "after a call", updates: {} } };
/** A press whose answer is whole above. */
const press = { callId: "press_add", toolId: "core.run_node", value: { ok: true, status: "succeeded", pageChanged: true } };
/** The latest read, as the decider's last marked block held it. */
const readCart = { callId: "read_cart", toolId: "core.run_node", value: { page: ref("read_cart", "top"), read: { extracted: ref("read_cart", "holder:read") } } };
/** The tail after the mark: the latest whole view of each group, which here is the cart's and never the first page's. */
const currentView = { callId: "core.current_view", toolId: "core.current_view", value: { groups: [{ group: "top", callId: "read_cart", value: { page: "PAGE cart" } }, { group: "holder:read", callId: "read_cart", holder: "read", value: { extracted: [] } }] } };

const decider = {
  model: "claude-sonnet-5-5",
  messages: [{ role: "user", content: [{ type: "text", text: "{\"taskKind\":\"evidence_tool_decision\"" }, entry(readFirst), entry(routeState), entry(press), entry(readCart, true), entry(currentView)] }]
};
const trail = [
  { n: 1, callId: "read_first", did: "Extract List", found: { read: { observedRows: 3 } } },
  { n: 2, callId: "press_add", did: "Click", found: { action: { changed: true } } },
  { n: 3, callId: "read_cart", did: "Extract List", found: { read: { observedRows: 1 } } }
];
const judgeUser = JSON.stringify({ context: { resultSummary: { trail: { note: "n", entries: trail } } } });
const sentTrail = (wire: Record<string, unknown>) => {
  const content = (wire.messages as { content: { text: string }[] }[])[0]!.content;
  return (JSON.parse(content.at(-1)!.text) as { context: { resultSummary: { trail: { entries: { callId: string }[]; shownAbove?: string } } } }).context.resultSummary.trail;
};

describe("a judge continuation counts a call as shown above only where its evidence above is whole", () => {
  const prefix = automationStudioAnthropicDeciderPrefix(decider)!;

  it("carries the tail after the last mark, and counts a call as held only where the tail holds the view it references", () => {
    expect(prefix.blocks).toHaveLength(6);
    // read_cart's page and rows are the tail's current view; read_first's group now holds the cart's view, not its own.
    expect(prefix.callIds).toEqual(["core.route_state.1", "press_add", "read_cart", "core.current_view"]);
  });

  it("keeps those calls' trail entries in the judge's message, and says only of the rest that they are above", () => {
    const sent = sentTrail(automationStudioAnthropicJudgeContinuation(prefix, "judge", judgeUser));
    expect(sent.entries.map((each) => each.callId)).toEqual(["read_first"]);
    expect(sent.shownAbove).toBe("2 of the attempt's calls are in its evidence above, each by the callId this trail gives, and are not repeated here.");
  });

  it("counts a referencing call as held where the prefix itself holds the group it names whole", () => {
    const held = { ...decider, messages: [{ role: "user", content: [...decider.messages[0]!.content.slice(0, 4), entry(currentView), entry(readCart, true)] }] };
    expect(automationStudioAnthropicDeciderPrefix(held)!.callIds).toEqual(["core.route_state.1", "press_add", "core.current_view", "read_cart"]);
  });

  it("counts a reference that names no call or group as unresolved", () => {
    const odd = { ...decider, messages: [{ role: "user", content: [decider.messages[0]!.content[0]!, entry({ callId: "odd", toolId: "core.run_node", value: { page: { "core.view_reference": "top" } } }, true)] }] };
    expect(automationStudioAnthropicDeciderPrefix(odd)!.callIds).toEqual([]);
  });
});
