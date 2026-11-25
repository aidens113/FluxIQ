// t967: live run `run-mwohvt8n-a57cad8a`'s first attempt, its last decision (0021) and the judge that followed it (0022),
// as their step files recorded the requests sent. Under t965's rule the judge fell back to a request of its own (read
// 0 of the decider's cache): the decider's evidence held five of Core's own route-state entries, which are no call of the
// judge's trail. Here the same two requests make a continuation, its prefix byte for byte the decider's up to its last
// cache mark (`../continuation.ts`); which attempt a prefix belongs to is now said by its caller, not read from it.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { automationStudioAnthropicDeciderPrefix, automationStudioAnthropicJudgeContinuation } from "../index.ts";

type Block = { type: "text"; text: string; cache_control?: unknown };
type Wire = { system: Block[]; messages: { role: string; content: string | Block[] }[]; [key: string]: unknown };

const here = dirname(fileURLToPath(import.meta.url));
const read = (name: string) => JSON.parse(readFileSync(join(here, "fixtures", name), "utf8")) as Wire;
const decider = read("run-mwohvt8n-0021-decide.json");
const judged = read("run-mwohvt8n-0022-judge.json");
/** The judge's own instructions and message, as its request of its own carried them. */
const judgeSystem = judged.system.map((block) => block.text).join("");
const judgeUser = (judged.messages[0]!.content as Block[]).map((block) => block.text).join("");

const callIdOf = (block: Block): string | undefined => {
  const text = block.text.replace(/^,/u, "");
  if (!text.startsWith("{")) return undefined;
  return (JSON.parse(text) as { callId?: string }).callId;
};

describe("run-mwohvt8n-a57cad8a's judge 0022 as a continuation of decider 0021", () => {
  const prefix = automationStudioAnthropicDeciderPrefix(decider as unknown as Record<string, unknown>)!;
  const wire = automationStudioAnthropicJudgeContinuation(prefix, judgeSystem, judgeUser) as unknown as Wire;
  const deciderBlocks = decider.messages[0]!.content as Block[];
  const mark = deciderBlocks.map((block) => block.cache_control !== undefined).lastIndexOf(true);

  it("holds Core's own entries in the decider's prefix, which no trail holds: what made t965's rule fall back", () => {
    const trail = (JSON.parse(judgeUser) as { context: { resultSummary: { trail: { entries: { callId?: string }[] } } } }).context.resultSummary.trail.entries;
    const own = new Set(trail.map((entry) => entry.callId));
    expect(prefix.callIds.filter((callId) => !own.has(callId))).toEqual(["core.route_state.1", "core.route_state.2", "core.route_state.3", "core.route_state.4", "core.route_state.5"]);
  });

  it("is the decider's request byte for byte up to its last cache mark: model, settings, system, output format and user blocks", () => {
    expect(mark).toBeGreaterThan(0);
    for (const key of Object.keys(decider).filter((key) => key !== "messages")) expect(JSON.stringify(wire[key]), key).toBe(JSON.stringify(decider[key]));
    expect(Object.keys(wire)).toEqual(Object.keys(decider));
    const blocks = wire.messages[0]!.content as Block[];
    expect(JSON.stringify(blocks.slice(0, mark + 1))).toBe(JSON.stringify(deciderBlocks.slice(0, mark + 1)));
  });

  it("then appends the judge's message without the calls the decider's evidence shows, and its instructions as a system message, last", () => {
    const blocks = wire.messages[0]!.content as Block[];
    expect(blocks).toHaveLength(mark + 2);
    const appended = JSON.parse(blocks[mark + 1]!.text) as { expectedOutput: string; context: { resultSummary: { trail: { entries: { callId?: string }[]; shownAbove?: string } } } };
    expect(appended.expectedOutput).toBe("diagnosis");
    // Held means held whole (t1044): a call whose page or rows above are only a reference to the tail after the mark stays in the trail.
    const above = deciderBlocks.slice(1, mark + 1).map(callIdOf).filter((callId): callId is string => callId !== undefined);
    const held = new Set(prefix.callIds);
    expect(above.filter((callId) => !held.has(callId))).toEqual(["initial.core.run_node", "step3.type_search", "step4.open_hood_listing", "step5.open_seller_shop", "step7.extract_seller_items", "step10.extract_seller_items"]);
    const sent = appended.context.resultSummary.trail.entries.map((entry) => entry.callId);
    for (const callId of sent) expect(held.has(callId ?? ""), callId).toBe(false);
    expect(sent).toEqual(["initial.core.run_node", "step3.type_search", "step4.open_hood_listing", "step5.open_seller_shop", "step7.extract_seller_items", "step10.extract_seller_items"]);
    expect(appended.context.resultSummary.trail.shownAbove).toMatch(/^3 of the attempt's calls are in its evidence above/u);
    expect(wire.messages).toHaveLength(2);
    expect(wire.messages[1]).toMatchObject({ role: "system" });
    expect(wire.messages[1]!.content).toContain(judgeSystem);
  });
});
