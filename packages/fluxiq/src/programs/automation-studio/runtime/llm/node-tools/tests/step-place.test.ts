// A rerun's put-back does again the steps that built on the same page before
// it (`../step-place.ts`).
//
// t193 lane B, `run-muqiojz4-04a7a8fc` (bigbox cart): draft step 9 pressed "+"
// on the towel page (quantity 2) and step 10 pressed Add to cart there. The
// rerun of step 10 reset the target to the towel page's address, which brought
// the page back at quantity 1, so the rerun added one towel; the model then
// "fixed" the quantity by rerunning step 10 as "+", and the Flow lost its Add
// to cart. The site below is that towel page: an address, a swatch, a quantity
// and a cart, where a reset to the address puts back none of the in-page state.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../evidence-loop.ts";
import { automationStudioNodeRerunFromItsPlace } from "../index.ts";

const HOME = "https://bigbox.test/";
const TOWELS = "https://bigbox.test/p/towels";
const CART = "https://bigbox.test/cart";

type SiteStep = {
  node: string;
  /** Where the step found the target; absent, it recorded nothing. */
  from?: string;
  consequences?: string[];
  /** Not proposed: a look the model took, which is not in the Flow. */
  taken?: true;
  routing?: AutomationStudioFlowDraftStep["routing"];
};

const draft = (site: SiteStep[]): AutomationStudioFlowDraftStep[] => site.map((each, index) => {
  const consequences = each.consequences ?? [];
  return {
    position: index + 1,
    id: `d${index + 1}`,
    iteration: index + 1,
    actionId: each.node,
    toolId: "core.run_node",
    input: { node: each.node, parameters: {}, consequences },
    ranWith: { node: each.node, parameters: {}, consequences },
    effect: each.taken ? "observe" : "mutate",
    effectApplied: true,
    disposition: each.taken ? "taken" : "kept",
    proposes: !each.taken,
    stateBefore: `state-before-${index + 1}`,
    ...(each.routing ? { routing: each.routing } : {}),
    ...(each.from === undefined ? {} : { replay: { from: { location: each.from } } })
  };
});

const answer = (code: string, effectApplied = false, evidence: JsonObject = { said: code }): AutomationStudioLlmEvidenceToolExecutionResult =>
  ({ kind: "llm_evidence_tool_execution", evidence, effectApplied, resultCode: code });

/**
 * The towel page. A reset goes to an address and nothing more: blue swatch
 * unchosen, quantity 1. `missing` names presses whose control is not there.
 */
function towels(options: { missing?: string[] } = {}) {
  const page = { at: CART, swatch: "", quantity: 1, cart: 0 };
  const calls: { callId: string; value: JsonObject }[] = [];
  const press = (node: string): void => {
    if (node === "node.go_towels") page.at = TOWELS;
    if (node === "node.blue") page.swatch = "blue";
    if (node === "node.plus") page.quantity += 1;
    if (node === "node.add_to_cart") page.cart += page.quantity;
  };
  const executeTool = async ({ callId, value }: { callId: string; toolId: string; value: JsonObject }): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
    calls.push({ callId, value });
    if (value.replay === "reset") {
      page.at = String((value.from as JsonObject).location);
      page.swatch = "";
      page.quantity = 1;
      return answer("core.replay.replayed", true);
    }
    const node = String(value.node);
    if (options.missing?.includes(node)) return answer(value.replay ? "core.replay.failed" : "web.action.failed", false, { ok: false, missing: node });
    if (value.replay === "verify") return answer("core.replay.verified");
    press(node);
    return answer(value.replay === "step" ? "core.replay.replayed" : "web.action.succeeded", true);
  };
  return { page, calls, executeTool };
}

const STEPS: SiteStep[] = [
  { node: "node.go_towels", from: HOME },
  { node: "node.blue", from: TOWELS },
  { node: "node.read_price", from: TOWELS, taken: true },
  { node: "node.plus", from: TOWELS },
  { node: "node.add_to_cart", from: TOWELS, consequences: ["create_new"] },
  { node: "node.go_cart", from: TOWELS }
];

const rerunOf = async (site: SiteStep[], position: number, host: ReturnType<typeof towels>, now = "state-on-the-cart-page") => {
  const steps = draft(site);
  const place = await automationStudioNodeRerunFromItsPlace({ step: steps[position - 1]!, steps, now, callId: `rerun.${position}`, executeTool: host.executeTool });
  // The loop runs the rerun's own call only when the place was reached.
  if (place.kind !== "unreachable") await host.executeTool({ callId: `rerun.${position}`, toolId: "core.run_node", value: { node: site[position - 1]!.node, parameters: {} } });
  return place;
};

describe("a rerun's put-back", () => {
  it("does again, in order, the proposed steps before it that started on the same page, then runs the rerun on the page they built", async () => {
    const host = towels();
    const place = await rerunOf(STEPS, 5, host);

    expect(host.calls.map((call) => [call.callId, call.value.replay ?? null, call.value.node ?? null])).toEqual([
      ["rerun.5.place", "reset", null],
      ["rerun.5.place.2", "step", "node.blue"],
      ["rerun.5.place.4", "step", "node.plus"],
      ["rerun.5", null, "node.add_to_cart"]
    ]);
    // Two towels, blue: what the Flow's own steps 2 and 4 make before step 5.
    expect(host.page).toMatchObject({ at: TOWELS, swatch: "blue", quantity: 2, cart: 2 });
    expect(place).toMatchObject({
      kind: "put_back",
      callId: "rerun.5.place",
      doneAgain: [
        { step: 2, actionId: "node.blue", callId: "rerun.5.place.2", outcome: "replayed" },
        { step: 4, actionId: "node.plus", callId: "rerun.5.place.4", outcome: "replayed" }
      ]
    });
  });

  it("checks a step whose effect lasts rather than repeating it, and still does the steps after it", async () => {
    const site: SiteStep[] = [
      { node: "node.go_towels", from: HOME },
      { node: "node.blue", from: TOWELS },
      { node: "node.gift_wrap", from: TOWELS, consequences: ["create_new"] },
      { node: "node.plus", from: TOWELS },
      { node: "node.add_to_cart", from: TOWELS }
    ];
    const host = towels();
    const place = await rerunOf(site, 5, host);

    expect(host.calls.map((call) => [call.callId, call.value.replay ?? null])).toEqual([
      ["rerun.5.place", "reset"],
      ["rerun.5.place.2", "step"],
      ["rerun.5.place.3", "verify"],
      ["rerun.5.place.4", "step"],
      ["rerun.5", null]
    ]);
    expect(place).toMatchObject({ kind: "put_back", doneAgain: [{ step: 2 }, { step: 3, outcome: "verified" }, { step: 4 }] });
    expect(host.page.quantity).toBe(2);
  });

  it("runs nothing when a step before it cannot be done again, and answers with that step's failure", async () => {
    const host = towels({ missing: ["node.plus"] });
    const place = await rerunOf(STEPS, 5, host);

    expect(host.calls.map((call) => call.callId)).toEqual(["rerun.5.place", "rerun.5.place.2", "rerun.5.place.4"]);
    expect(host.page.cart).toBe(0);
    expect(place).toMatchObject({
      kind: "unreachable",
      result: {
        effectApplied: false,
        resultCode: "llm_evidence_loop.rerun_place_unreachable",
        evidence: {
          ok: false,
          code: "rerun_place_unreachable",
          doneAgain: [{ step: 2, outcome: "replayed" }, { step: 4, outcome: "failed" }],
          failedStep: { step: 4, actionId: "node.plus", evidence: { ok: false, missing: "node.plus" } }
        }
      }
    });
  });

  it("passes over a step the Flow would not always run whose target is not there, as the test from the start does", async () => {
    const site: SiteStep[] = [
      { node: "node.go_towels", from: HOME },
      { node: "node.close_offer", from: TOWELS, routing: { kind: "optional" } },
      { node: "node.plus", from: TOWELS },
      { node: "node.add_to_cart", from: TOWELS }
    ];
    const host = towels({ missing: ["node.close_offer"] });
    const place = await rerunOf(site, 4, host);

    expect(host.calls.map((call) => call.callId)).toEqual(["rerun.4.place", "rerun.4.place.2", "rerun.4.place.3", "rerun.4"]);
    expect(place).toMatchObject({ kind: "put_back", doneAgain: [{ step: 2, outcome: "failed" }, { step: 3, outcome: "replayed" }] });
    expect(host.page.cart).toBe(2);
  });

  it("does nothing again when no step before it started on its page", async () => {
    const host = towels();
    const place = await rerunOf(STEPS, 2, host);

    expect(host.calls.map((call) => call.callId)).toEqual(["rerun.2.place", "rerun.2"]);
    expect(place).toEqual({ kind: "put_back", callId: "rerun.2.place", doneAgain: [] });
  });

  it("runs in place, with nothing reset or done again, for a step that recorded no page", async () => {
    const site: SiteStep[] = [{ node: "node.blue" }, { node: "node.plus" }, { node: "node.add_to_cart" }];
    const host = towels();
    const place = await rerunOf(site, 3, host);

    expect(place).toEqual({ kind: "in_place" });
    expect(host.calls.map((call) => call.callId)).toEqual(["rerun.3"]);
  });

  it("runs in place when the target is still in the state the step found it in", async () => {
    const host = towels();
    const place = await rerunOf(STEPS, 5, host, "state-before-5");

    expect(place).toEqual({ kind: "in_place" });
    expect(host.calls.map((call) => call.callId)).toEqual(["rerun.5"]);
  });
});
