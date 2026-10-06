// The build's one read of the person's instruction, as it is asked and as its
// answer is used (t174-w107; run `run-musp8nz1-dbd3905a` Cause 5).
//
// That run's instruction asks for two lasting acts: putting three hubs in the
// cart, and collecting the store's coupon. Its read (step 0031) was posed as a
// page decision -- its summary read "Reading the Farbazaar page to find the ...
// listing" -- asked which *classes* the instruction asks for, and answered
// `create_new` for the cart alone. The coupon had no answer, so the build's
// test treated "Get coupons" as repeatable, and only the site's own memory kept
// it from being collected again. It ran inside the Add to cart press (0030).
//
// Wired as the service wires it (`../../service.ts`): the authority's `derive`
// is the gate's reader, and the gate's `instructedLastingActs` answers the
// tests. The stand-in provider is scripted; nothing here calls a model.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioActionDeclaration } from "../../action-permissions/index.ts";
import { automationStudioFlowBootstrapActionPermissions, automationStudioInstructedActs } from "../../flow-bootstrap/index.ts";
import { automationStudioLlmBuildPurseHoldCall } from "../../llm/build-purse/index.ts";
import { automationStudioFlowBootstrapCreationPurse } from "../flow-bootstrap-commands/index.ts";
import { automationStudioFlowBootstrapInstructionAuthority } from "../instruction-authority.ts";

const INSTRUCTION = {
  instructionId: "instruction.goal",
  title: "Evidence-guided generation goal",
  body: "On Farbazaar, put three of the Voltbay USB-C hub sold by Voltbay Official Store in my cart: Space Grey, the 7-in-1 version, shipped from Spain. Collect that store's coupon while you are on the item. Do not buy anything."
};
/** The text the service reads acts from (`../../service.ts`, `bootstrapInstructionText`). */
const TEXT = `${INSTRUCTION.title}\n${INSTRUCTION.body}`;
const CART = "put three of the Voltbay USB-C hub sold by Voltbay Official Store in my cart";
const COUPON = "Collect that store's coupon while you are on the item";

type Sent = { evidenceLoop: { decisionSchema: JsonObject; completionSchema: JsonObject }; metadata?: JsonObject };

/** The authority over a provider that answers the read with `result`, and every request it was sent. */
function authority(result: JsonObject | undefined, log: string[] = []) {
  const sent: Sent[] = [];
  const reader = automationStudioFlowBootstrapInstructionAuthority({
    run: (async (request: Sent) => {
      sent.push(request);
      log.push("read");
      return result === undefined
        ? { ok: false, request: { estimatedInputTokens: 10 } }
        : { ok: true, request: { estimatedInputTokens: 10 }, response: { kind: "evidence_tool_decision", summary: "Read.", decision: { kind: "complete", result } }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.0001 } };
    }) as never,
    projectId: "project.demo",
    flowId: "flow.demo",
    instructions: { instructions: [], instructionIds: [], diagnostics: [], tokenBudget: 1000, estimatedTokens: 0 } as never,
    active: [INSTRUCTION],
    provider: { provider: {} as never }
  });
  return { reader, sent };
}

/** The build's gate reading through that authority, over a stand-in domain that asks the gate about each call's declaration. */
function gate(result: JsonObject | undefined, said: string[] = [], log: string[] = []) {
  const { reader, sent } = authority(result, log);
  const permissions = automationStudioFlowBootstrapActionPermissions({
    permittedConsequences: [],
    instructionIds: [INSTRUCTION.instructionId],
    deriveInstructed: reader.derive,
    say: async (text) => { said.push(text); },
    executeTool: async (call) => {
      log.push(`domain ${call.callId}`);
      const consequences = Array.isArray(call.value.consequences) ? call.value.consequences as string[] : [];
      const declaration: AutomationStudioActionDeclaration = { consequences: consequences as never, control: { name: String(call.value.control ?? "control"), kind: "button" }, verb: "press" };
      const verdict = await call.permission!(declaration);
      log.push(`pressed ${call.callId}`);
      return { kind: "llm_evidence_tool_execution", evidence: { pressed: verdict.permitted }, effectApplied: verdict.permitted };
    }
  });
  return { permissions, sent, reader };
}

const ACTS = automationStudioInstructedActs(TEXT);
/**
 * The same acts without their kinds. The cart (`add_to`) and the coupon
 * (`claim`) last by their kind whatever the read says (lane B, F1), so what
 * the read's own answers decide is shown on these.
 */
const UNKINDED = ACTS.map((act) => ({ id: act.id, quote: act.quote }));

describe("the read asks about the instruction's acts, one answer per act", () => {
  it("reads the two acts the run's instruction asks for", () => {
    expect(ACTS.map((act) => [act.id, act.quote])).toEqual([["a1", expect.stringContaining(CART)], ["a2", COUPON]]);
  });

  it("asks one answer for each act, by id, each described by the person's own words", async () => {
    const { reader, sent } = authority({ acts: { a1: ["create_new"], a2: ["create_new"] }, instructed: [] });
    await reader.derive();

    const completion = sent[0]!.evidenceLoop.completionSchema as { required?: string[]; properties?: Record<string, { required?: string[]; properties?: Record<string, { description?: string }> }> };
    expect(completion.required).toContain("acts");
    expect(completion.properties?.acts?.required).toEqual(["a1", "a2"]);
    expect(completion.properties?.acts?.properties?.a1?.description).toContain(CART);
    expect(completion.properties?.acts?.properties?.a2?.description).toContain(COUPON);
  });

  it("is posed as a read of the instruction, not a step on a page", async () => {
    const { reader, sent } = authority({ acts: { a1: ["create_new"], a2: ["create_new"] }, instructed: [] });
    await reader.derive();

    const decision = sent[0]!.evidenceLoop.decisionSchema as { description?: string };
    expect(decision.description).toMatch(/reads the person's instructions alone/iu);
    expect(decision.description).toMatch(/no page/iu);
    expect(decision.description).toMatch(/summary/iu);
    expect(sent[0]!.metadata).toEqual({ source: "instructionAuthority" });
  });

  it("keeps a lasting consequence for every act, though two acts ask for the same class", async () => {
    const { reader } = authority({ acts: { a1: ["create_new"], a2: ["create_new"] }, instructed: [{ consequence: "create_new", quote: CART }] });
    const read = await reader.derive();

    expect(read.map((entry) => [entry.consequence, entry.quote])).toEqual([["create_new", CART], ["create_new", COUPON]]);
  });
});

describe("an act the read gave no answer for is not repeated by the build's test", () => {
  it("names both of the run's acts lasting by their kind, whatever the read answered", async () => {
    expect(ACTS.map((act) => act.kind)).toEqual(["add_to", "claim"]);
    const { permissions } = gate({ acts: { a1: ["none"], a2: ["none"] }, instructed: [] });

    expect([...await permissions.instructedLastingActs(ACTS)].sort()).toEqual(["a1", "a2"]);
  });

  it("names the coupon lasting when the read answered the cart alone, and says so in the thread", async () => {
    const said: string[] = [];
    const { permissions } = gate({ acts: { [CART_ACT().id]: ["create_new"] }, instructed: [{ consequence: "create_new", quote: CART }] }, said);

    expect([...await permissions.instructedLastingActs(UNKINDED)].sort()).toEqual(["a1", "a2"]);
    expect(said).toHaveLength(1);
    expect(said[0]).toContain(COUPON);
  });

  it("names the coupon lasting when the read's answer carries no per-act answer at all (that run's own reply)", async () => {
    const { permissions } = gate({ instructed: [{ consequence: "create_new", quote: CART }] });

    expect([...await permissions.instructedLastingActs(UNKINDED)].sort()).toEqual(["a1", "a2"]);
  });

  it("names every act lasting when the read itself failed", async () => {
    const { permissions } = gate(undefined);

    expect([...await permissions.instructedLastingActs(UNKINDED)].sort()).toEqual(["a1", "a2"]);
  });

  it("leaves out an act the read answered asks for nothing lasting, and says nothing", async () => {
    const said: string[] = [];
    const { permissions } = gate({ acts: { a1: ["create_new"], a2: ["none"] }, instructed: [] }, said);

    expect([...await permissions.instructedLastingActs(UNKINDED)]).toEqual(["a1"]);
    expect(said).toEqual([]);
  });
});

describe("the read is made at a defined point, never inside a press", () => {
  it("is made before a call declaring something lasting reaches the domain, once", async () => {
    const log: string[] = [];
    const { permissions, sent } = gate({ acts: { a1: ["create_new"], a2: ["create_new"] }, instructed: [] }, [], log);

    await permissions.executeTool({ callId: "add.to.cart", toolId: "core.run_node", value: { control: "Add to cart", consequences: ["create_new"] } });
    await permissions.executeTool({ callId: "get.coupon", toolId: "core.run_node", value: { control: "Get coupons", consequences: ["create_new"] } });
    await permissions.instructedLastingActs(ACTS);
    await permissions.crossCheck();

    expect(log).toEqual(["read", "domain add.to.cart", "pressed add.to.cart", "domain get.coupon", "pressed get.coupon"]);
    expect(sent).toHaveLength(1);
  });

  it("is not made for a call that declares nothing lasting", async () => {
    const log: string[] = [];
    const { permissions, sent } = gate({ acts: { a1: ["create_new"], a2: ["create_new"] }, instructed: [] }, [], log);

    await permissions.executeTool({ callId: "choose.colour", toolId: "core.run_node", value: { control: "Space Grey", consequences: [] } });

    expect(log).toEqual(["domain choose.colour", "pressed choose.colour"]);
    expect(sent).toHaveLength(0);
  });
});

// D phase 1: the same one read also answers the route the person names, and
// its consequence and route answers share it (`d-shared-reader-preflight.md`).
// The user's rule: a named route must be followed; a Flow may start where the
// work begins unless the person names the route. So a read that failed, or a
// route Core cannot ground, is "unavailable" -- never "open".
const ROUTED = {
  instructionId: "instruction.route",
  title: "Flash deal hubs",
  body: "On Farbazaar, go to the home page, open Offers, then Flash deals, and put two Voltbay USB-C hubs in my cart."
};
const ACCEPT = "put two Voltbay USB-C hubs in my cart";
const NAMED = { kind: "named", instructionId: ROUTED.instructionId, quote: "go to the home page, open Offers, then Flash deals", waypoints: ["the home page", "Offers", "Flash deals"] };
const ROUTED_ACTS = automationStudioInstructedActs(`${ROUTED.title}
${ROUTED.body}`);
const CART_ACT = () => ROUTED_ACTS.find((act) => act.quote.includes(ACCEPT))!;
const answered = (result: JsonObject) => ({ ok: true, request: { estimatedInputTokens: 10 }, response: { kind: "evidence_tool_decision", summary: "Read.", decision: { kind: "complete", result } }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.0001 } });
type Run = (request: Sent) => Promise<unknown>;

/** The authority over a provider whose every answer `answer` gives, the gate reading through it, and every request sent. */
function routed(answer: () => Promise<unknown>, wrap: (inner: Run) => Run = (inner) => inner) {
  const sent: Sent[] = [];
  const reader = automationStudioFlowBootstrapInstructionAuthority({
    run: wrap(async (request) => { sent.push(request); return await answer(); }) as never,
    projectId: "project.demo",
    flowId: "flow.demo",
    instructions: { instructions: [], instructionIds: [], diagnostics: [], tokenBudget: 1000, estimatedTokens: 0 } as never,
    active: [ROUTED],
    provider: { provider: {} as never }
  });
  const permissions = automationStudioFlowBootstrapActionPermissions({ permittedConsequences: [], instructionIds: [ROUTED.instructionId], deriveInstructed: reader.derive, executeTool: (async () => ({ kind: "llm_evidence_tool_execution", evidence: {} })) as never });
  return { reader, sent, permissions };
}

describe("the read also answers the route the person names", () => {
  it("asks for the route in the same question as the consequences, required", async () => {
    const { reader, sent } = routed(async () => answered({ acts: { [CART_ACT().id]: ["create_new"] }, instructed: [], route: NAMED }));
    await reader.derive();

    expect(CART_ACT()).toBeDefined();
    const completion = sent[0]!.evidenceLoop.completionSchema as { required?: string[]; properties?: Record<string, unknown> };
    expect(completion.required).toEqual(["acts", "instructed", "route"]);
    expect(completion.properties?.route).toBeDefined();
    const decision = sent[0]!.evidenceLoop.decisionSchema as { description?: string };
    expect(decision.description).toMatch(/route/iu);
  });

  it("is not read for a route nobody asked about", () => {
    const { reader, sent } = routed(async () => answered({ instructed: [], route: NAMED }));

    expect(reader.route.peek()).toEqual({ state: "unread" });
    expect(sent).toHaveLength(0);
  });

  it("answers the route and the gate's consequences from one call, asked at once, and counts it once", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const { reader, sent, permissions } = routed(async () => { await held; return answered({ acts: { [CART_ACT().id]: ["create_new"] }, instructed: [{ consequence: "create_new", quote: ACCEPT }], route: NAMED }); });

    const route = reader.route.read();
    const lasting = permissions.instructedLastingActs([CART_ACT()]);
    const derived = reader.derive();
    const again = reader.route.read();
    expect(reader.route.peek()).toEqual({ state: "unread" });
    release();

    expect((await route).state).toBe("named");
    expect(await again).toBe(await route);
    expect([...await lasting]).toEqual([CART_ACT().id]);
    expect((await derived).map((entry) => entry.consequence)).toEqual(["create_new"]);
    expect(permissions.instructed()?.map((entry) => entry.consequence)).toEqual(["create_new"]);
    expect(reader.route.peek()).toBe(await route);
    expect(sent).toHaveLength(1);
    expect(reader.usage).toMatchObject({ calls: 1, inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.0001 });
  });

  it("answers an explicit open route as open", async () => {
    const { reader } = routed(async () => answered({ acts: { [CART_ACT().id]: ["create_new"] }, instructed: [], route: { kind: "open" } }));

    expect(await reader.route.read()).toMatchObject({ state: "open" });
  });

  it("keeps the consequences the person's words give when the route cannot be grounded, and never calls that route open", async () => {
    const { reader, permissions } = routed(async () => answered({ acts: { [CART_ACT().id]: ["create_new"] }, instructed: [{ consequence: "create_new", quote: ACCEPT }], route: { ...NAMED, quote: "go straight to Friend requests" } }));

    expect(await reader.route.read()).toEqual({ state: "unavailable", reason: "ungrounded" });
    await permissions.instructedLastingActs([CART_ACT()]);
    expect(permissions.instructed()?.map((entry) => [entry.consequence, entry.quote])).toEqual([["create_new", ACCEPT]]);
  });

  it("keeps the consequences and calls the route unavailable when the answer has no route", async () => {
    const { reader } = routed(async () => answered({ acts: { [CART_ACT().id]: ["create_new"] }, instructed: [{ consequence: "create_new", quote: ACCEPT }] }));

    expect(await reader.route.read()).toEqual({ state: "unavailable", reason: "malformed" });
    expect((await reader.derive()).map((entry) => entry.consequence)).toEqual(["create_new"]);
  });

  it("calls the route unavailable, not open, when the answer did not complete, and does not ask again", async () => {
    const { reader, sent } = routed(async () => ({ ok: false, request: { estimatedInputTokens: 10 } }));

    expect(await reader.route.read()).toEqual({ state: "unavailable", reason: "non_complete" });
    // The consequences read as a failed read always has: every act unanswered.
    const read = await reader.derive();
    expect([...read]).toEqual([]);
    expect(read.acts?.map((act) => act.consequences)).toEqual(ROUTED_ACTS.map(() => null));
    expect(await reader.route.read()).toEqual({ state: "unavailable", reason: "non_complete" });
    expect(sent).toHaveLength(1);
    expect(reader.usage.calls).toBe(1);
  });

  it("calls the route unavailable when the answer was a step rather than a completion", async () => {
    const { reader } = routed(async () => ({ ok: true, request: { estimatedInputTokens: 10 }, response: { kind: "evidence_tool_decision", summary: "Look.", decision: { kind: "tool_call", callId: "c1", toolId: "t", input: {} } } }));

    expect(await reader.route.read()).toEqual({ state: "unavailable", reason: "non_complete" });
  });

  it("calls the route unavailable when the call itself failed, leaves the gate's answer unknown, and does not call again", async () => {
    const { reader, sent, permissions } = routed(async () => { throw new Error("socket hang up: private detail"); });

    const route = await reader.route.read();
    expect(route).toEqual({ state: "unavailable", reason: "transport" });
    expect(JSON.stringify(route)).not.toContain("socket");
    await expect(reader.derive()).rejects.toThrow("socket hang up");
    // The gate remembers the failure as a failure: nothing is held as though nothing were asked for, and the cart still lasts.
    expect([...await permissions.instructedLastingActs([CART_ACT()])]).toEqual([CART_ACT().id]);
    expect(permissions.instructed()).toBeUndefined();
    expect(reader.route.peek()).toEqual({ state: "unavailable", reason: "transport" });
    expect(sent).toHaveLength(1);
    // Nothing came back, so nothing was counted -- which is not a measured zero.
    expect(reader.usage.calls).toBe(0);
  });

  it("shares the read through the build purse's own reading wrapper, which is called once", async () => {
    const creation = await automationStudioFlowBootstrapCreationPurse({ store: { get: async () => undefined, save: async () => undefined, delete: async () => undefined } as never, projectId: "project.demo", flowId: "flow.demo", repair: true, ceilingUsd: 1 });
    let wrapped = 0;
    const { reader, sent } = routed(async () => answered({ acts: { [CART_ACT().id]: ["create_new"] }, instructed: [], route: NAMED }), (inner) => {
      const reading = creation.reading(inner as never);
      return async (request) => { wrapped += 1; return await reading(request as never); };
    });

    await Promise.all([reader.derive(), reader.route.read(), reader.derive()]);
    expect(wrapped).toBe(1);
    expect(sent).toHaveLength(1);
    expect(creation.readingRefused).toBeUndefined();
  });

  // Run `run-mux6nxst-c9bca37c` (lane D round 3): the build sent 48 calls, its whole test allowance (41
  // decisions, 7 judgements), and its judge said yes. Nothing had asked for the instruction's consequences
  // until the cross-check after the build, so the read came last and the purse refused it unsent. The read
  // still counted itself, the proposal said 49 calls, and the Lab failed a judged Flow on a call never made.
  it("counts no call, and no tokens, for a read the build's purse refused unsent", async () => {
    const creation = await automationStudioFlowBootstrapCreationPurse({ store: { get: async () => undefined, save: async () => undefined, delete: async () => undefined } as never, projectId: "project.demo", flowId: "flow.demo", repair: true, ceilingUsd: 1, maxCalls: 1 });
    const provider = { estimateCostUsd: () => 0.0001 };
    // The harness's own hold (`../../llm/harness/run.ts`): a call the purse refuses returns unsent.
    const { reader, sent } = routed(async () => {
      const held = automationStudioLlmBuildPurseHoldCall({ provider, estimatedInputTokens: 10, maxOutputTokens: 10 });
      if (held && !held.ok) return { ok: false, request: { estimatedInputTokens: 10 }, providerInvocation: "not_attempted", diagnostics: [held.diagnostic] };
      held?.hold.settle({ inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.0001 } as never);
      return answered({ acts: { [CART_ACT().id]: ["create_new"] }, instructed: [], route: NAMED });
    }, (inner) => creation.reading(inner as never) as never);

    await creation.run(async () => {
      // The build's last allowed call, sent and settled.
      const last = automationStudioLlmBuildPurseHoldCall({ provider, estimatedInputTokens: 10, maxOutputTokens: 10 });
      if (!last?.ok) throw new Error("the build's own call should be admitted");
      last.hold.settle({ inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.0001 } as never);
      expect(await reader.route.read()).toEqual({ state: "unavailable", reason: "non_complete" });
    });

    expect(creation.readingRefused?.code).toBe("llm_budget.run_call_limit");
    expect(sent).toHaveLength(1);
    expect(creation.purse.spentCalls()).toBe(1);
    expect(reader.usage).toEqual({ calls: 0, estimatedInputTokens: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 });
  });
});
