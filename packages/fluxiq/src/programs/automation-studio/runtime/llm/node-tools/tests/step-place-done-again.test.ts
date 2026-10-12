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
import { automationStudioFlowDraftSeedFromFlow, automationStudioNodeRerunFromItsPlace, automationStudioNodeRerunPlaceNoted, automationStudioNodeRerunPlaceOfStep } from "../index.ts";

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
  /** The host saw this press answer a layer that was gone after it. */
  interruption?: true;
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
    ...(each.interruption ? { interruption: true as const } : {}),
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

  // Live run `run-murwdp4f-35f976d2`, step 0029: the put-back stopped at a
  // failed press the host marked as answering an interruption, so the rerun
  // ran nothing, although the Flow is written with that step optional.
  it("passes over a failed step the host says answered an interruption, as the test from the start does", async () => {
    const site: SiteStep[] = [
      { node: "node.go_towels", from: HOME },
      { node: "node.close_offer", from: TOWELS, interruption: true },
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
    expect(place).toEqual({ kind: "put_back", callId: "rerun.2.place", startPage: "step", doneAgain: [] });
  });

  it("runs in place, with nothing reset or done again, for a step that recorded no page", async () => {
    const site: SiteStep[] = [{ node: "node.blue" }, { node: "node.plus" }, { node: "node.add_to_cart" }];
    const host = towels();
    const place = await rerunOf(site, 3, host);

    expect(place).toEqual({ kind: "in_place", why: "start_page_unknown" });
    expect(host.calls.map((call) => call.callId)).toEqual(["rerun.3"]);
  });

  it("runs in place when the target is still in the state the step found it in", async () => {
    const host = towels();
    const place = await rerunOf(STEPS, 5, host, "state-before-5");

    expect(place).toEqual({ kind: "in_place", why: "already_there" });
    expect(host.calls.map((call) => call.callId)).toEqual(["rerun.5"]);
  });
});

// t443, live run `run-mv4dgmki-2b13db91` (R4b): the repair's rerun of a saved
// Flow's lasting last step put the item page back to its defaults and pressed
// it with none of the choices before it done again (`startPage: seeded_run`, no
// `doneAgain`), because seeded steps have no `replay.from`. Here on a workshop
// page: steps 3-5 choose a session, a room and a seat count; step 2 saves a
// voucher, which lasts; step 6 reserves, which lasts and has not been done.
describe("a rerun of a step seeded from a saved Flow", () => {
  const WORKSHOP = "https://workshop.test/sessions/pottery";
  const node = (id: string, definitionId: string, consequences: string[], parameterValues: JsonObject = {}) => ({ id, definitionId, parameterValues, metadata: { declaredConsequences: consequences } });
  const FLOW = {
    nodes: [
      node("n1", "node.go_workshop", []),
      node("n2", "node.save_voucher", ["create_new"]),
      node("n3", "node.choose", [], { option: "Evening" }),
      node("n4", "node.choose", [], { option: "Room B" }),
      node("n5", "node.seats", [], { seats: "3" }),
      node("n6", "node.reserve", ["create_new"])
    ],
    edges: [["n1", "n2"], ["n2", "n3"], ["n3", "n4"], ["n4", "n5"], ["n5", "n6"]].map(([source, target], index) => ({ id: `e${index}`, sourceNodeId: source!, targetNodeId: target! }))
  };
  /** Where each node started in the run being repaired: the voucher and the choices on the session page, as the reserve. */
  const STARTED: Record<string, JsonObject> = { n1: { location: HOME }, n2: { location: WORKSHOP }, n3: { location: WORKSHOP }, n4: { location: WORKSHOP }, n5: { location: WORKSHOP }, n6: { location: WORKSHOP } };

  /** The session page: a reset goes to an address and puts back none of the choices. */
  function workshop(options: { missing?: string[] } = {}) {
    const page = { at: HOME, choices: [] as string[], seats: "1", reserved: [] as string[], vouchers: 0 };
    const calls: { callId: string; value: JsonObject }[] = [];
    const executeTool = async ({ callId, value }: { callId: string; toolId: string; value: JsonObject }): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
      calls.push({ callId, value });
      if (value.replay === "reset") {
        Object.assign(page, { at: String((value.from as JsonObject).location), choices: [], seats: "1" });
        return answer("core.replay.replayed", true);
      }
      if (value.replay === "verify") return answer("core.replay.verified");
      const parameters = (value.parameters ?? {}) as JsonObject;
      if (options.missing?.includes(String(parameters.option))) return answer(value.replay ? "core.replay.failed" : "web.action.failed", false, { ok: false, missing: parameters.option! });
      if (value.node === "node.go_workshop") page.at = WORKSHOP;
      if (value.node === "node.choose") page.choices.push(String(parameters.option));
      if (value.node === "node.seats") page.seats = String(parameters.seats);
      if (value.node === "node.save_voucher") page.vouchers += 1;
      if (value.node === "node.reserve") page.reserved.push(`${page.choices.join(" / ") || "defaults"} x${page.seats}`);
      return answer(value.replay === "step" ? "core.replay.replayed" : "web.action.succeeded", true);
    };
    return { page, calls, executeTool };
  }

  /** Every node runs one fixed action, as a saved Flow's nodes do: a seeded step is done again as its Flow runs it. */
  const nodeOf = () => ({ inputs: [], outputs: [], outputAction: { required: true as const, fixed: "succeeded" } });
  const seeded = (started: Record<string, JsonObject>) => automationStudioFlowDraftSeedFromFlow({ ...FLOW, startPages: started });
  const rerunReserve = async (started: Record<string, JsonObject>, host: ReturnType<typeof workshop>) => {
    const seed = seeded(started);
    const place = await automationStudioNodeRerunFromItsPlace({ step: seed.steps[5]!, seedStartedOn: seed.startedOnByStepId, steps: seed.steps, now: "after-the-failed-run", callId: "rerun.6", executeTool: host.executeTool, nodeOf });
    if (place.kind !== "unreachable") await host.executeTool({ callId: "rerun.6", toolId: "core.run_node", value: { node: "node.reserve", parameters: {} } });
    return place;
  };

  it("does every step before it again, in order, from where the Flow starts, checks the voucher without saving it again, and reserves what they chose", async () => {
    const host = workshop();
    const place = await rerunReserve(STARTED, host);

    expect(host.calls.map((call) => [call.callId, call.value.replay ?? null, call.value.node ?? null])).toEqual([
      ["rerun.6.place", "reset", null],
      ["rerun.6.place.1", "step", "node.go_workshop"],
      ["rerun.6.place.2", "verify", "node.save_voucher"],
      ["rerun.6.place.3", "step", "node.choose"],
      ["rerun.6.place.4", "step", "node.choose"],
      ["rerun.6.place.5", "step", "node.seats"],
      ["rerun.6", null, "node.reserve"]
    ]);
    expect(host.calls[0]!.value.from).toEqual({ location: HOME });
    expect(host.page).toMatchObject({ reserved: ["Evening / Room B x3"], vouchers: 0 });
    expect(place).toMatchObject({
      kind: "put_back",
      startPage: "flow_start",
      doneAgain: [{ step: 1, stepId: "f1" }, { step: 2, stepId: "f2", outcome: "verified" }, { step: 3, stepId: "f3", outcome: "replayed" }, { step: 4, stepId: "f4", outcome: "replayed" }, { step: 5, stepId: "f5", outcome: "replayed" }]
    });
    // The step the rerun leaves keeps where it ran, for the judge of the build's test.
    expect(automationStudioNodeRerunPlaceOfStep(place)).toEqual({ kind: "put_back", redone: ["f1", "f2", "f3", "f4", "f5"] });
  });

  it("before the fix the same rerun reserved the defaults; now a lasting act is not pressed when nothing says where the Flow starts", async () => {
    for (const started of [{ n6: { location: WORKSHOP } }, {}]) {
      const host = workshop();
      const place = await rerunReserve(started, host);

      expect(host.calls).toEqual([]);
      expect(host.page.reserved).toEqual([]);
      expect(place).toMatchObject({ kind: "unreachable", result: { effectApplied: false, resultCode: "llm_evidence_loop.rerun_place_unreachable", evidence: { ok: false, lastingAct: true, unknownBefore: 1 } } });
      expect(JSON.stringify(place)).toMatch(/done once, and only after every step before it/u);
    }
  });

  // Supervisor review of t443: a page comparison must never decide a lasting press. The repaired run spelled the
  // session page without a trailing slash; this build's own rerun of the reserve recorded it with one. The walk back
  // would read two pages, do nothing again and press after the reset alone -- the defaults, R4b again.
  it("never presses a lasting act on a comparison of page tokens spelled apart: only after every step before it was done again", async () => {
    const reserveOf = (seed: ReturnType<typeof seeded>): AutomationStudioFlowDraftStep => ({
      ...structuredClone(seed.steps[5]!), id: "d1", standsFor: "f6", iteration: 2, callId: "reserve.1", effectApplied: false, resultCode: "web.target.not_found",
      replay: { from: { location: `${WORKSHOP}/` } }
    });
    const rerun = async (host: ReturnType<typeof workshop>) => {
      const seed = seeded(STARTED);
      const steps = [...seed.steps, reserveOf(seed)];
      const place = await automationStudioNodeRerunFromItsPlace({ step: steps[6]!, seedStartedOn: seed.startedOnByStepId, steps, now: undefined, callId: "rerun.6", executeTool: host.executeTool, nodeOf });
      if (place.kind !== "unreachable") await host.executeTool({ callId: "rerun.6", toolId: "core.run_node", value: { node: "node.reserve", parameters: {} } });
      return place;
    };

    // One earlier step cannot be done again: nothing is pressed, whatever the tokens say.
    const blocked = workshop({ missing: ["Room B"] });
    const refused = await rerun(blocked);
    expect(blocked.page.reserved).toEqual([]);
    expect(blocked.calls.map((call) => call.callId)).not.toContain("rerun.6");
    expect(blocked.calls.filter((call) => call.value.replay === "reset").map((call) => call.value.from)).toEqual([{ location: HOME }]);
    expect(refused).toMatchObject({ kind: "unreachable", result: { evidence: { lastingAct: true, failedStep: { step: 4, outcome: "failed" } } } });

    // Every step before it done again: pressed once, with what they chose -- never after the reset to its own token alone.
    const open = workshop();
    expect(await rerun(open)).toMatchObject({ kind: "put_back", startPage: "flow_start" });
    expect(open.page.reserved).toEqual(["Evening / Room B x3"]);
    expect(open.calls.filter((call) => call.value.replay === "reset").map((call) => call.value.from)).toEqual([{ location: HOME }]);
  });

  it("still reruns a step that does not last, says which step before it was not done again, and keeps that on the step", async () => {
    const host = workshop();
    const seed = seeded({ n5: { location: WORKSHOP } });
    const place = await automationStudioNodeRerunFromItsPlace({ step: seed.steps[4]!, seedStartedOn: seed.startedOnByStepId, steps: seed.steps, now: undefined, callId: "rerun.5", executeTool: host.executeTool, nodeOf });

    expect(place).toEqual({ kind: "put_back", callId: "rerun.5.place", startPage: "seeded_run", doneAgain: [], unknownBefore: 4 });
    expect(automationStudioNodeRerunPlaceNoted(place, { ok: true })).toMatchObject({ rerunPlace: { place: "put_back", notDoneAgain: expect.stringMatching(/step 4 started on/u) } });
    expect(automationStudioNodeRerunPlaceOfStep(place)).toEqual({ kind: "put_back", redone: [], unknownBefore: 4 });
  });
});
