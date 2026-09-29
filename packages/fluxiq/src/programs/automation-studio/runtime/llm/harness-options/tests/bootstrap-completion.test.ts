import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions } from "../../../../nodes/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../flow-bootstrap/plan/tests/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { checkAutomationStudioFlowBootstrapCompletion } from "../bootstrap-completion.ts";
import { automationStudioPlanNodeHandleSites } from "../plan-node-handles.ts";

// What a model is told when the plan it completed is refused, and what is no
// longer refused at all. Live Flow creations were refused three times in a row
// for a record output whose keys the model had never been shown, and for
// handles whose placement the domain named by position without the feedback
// saying how to read one. A key that is a spelling of one the contract names is
// now read rather than refused (`flow-bootstrap/plan/authoring/`), so what is
// left here is what cannot be derived: a dataset with no columns anywhere to
// save in it, and a result that says nothing at all.

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, ...webDomainNodeDefinitionsFixture()]);
const extractList = { item: "li.product", fields: { name: ".name" } };
const NEWLINE = String.fromCharCode(10);

function planWith(parameters: JsonObject): JsonObject {
  return {
    schemaVersion: "0.1",
    router: { name: "Scrape", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{
      key: "primary",
      name: "Primary",
      role: "primary",
      nodes: [{ key: "scrape", definitionId: "web.output.dom-extract_list", definitionVersion: "1.0.0", outputActionId: "web.dom.extract_list", parameters }],
      edges: []
    }]
  };
}

type Feedback = { refusal: string; issues: JsonObject[]; instruction: string; previous?: string };

async function refusal(result: JsonObject, binding?: Parameters<typeof checkAutomationStudioFlowBootstrapCompletion>[0]["binding"]) {
  const verdict = await checkAutomationStudioFlowBootstrapCompletion({ result, projectId: "project.1", flowId: "flow.1", registry, resolution, binding });
  if (verdict.ok) throw new Error("expected a refusal");
  return { verdict, feedback: verdict.check.feedback as unknown as Feedback };
}

describe("the feedback on a completed plan that was refused", () => {
  it("reads a record output written with the contract's keys spelled another way", async () => {
    const verdict = await checkAutomationStudioFlowBootstrapCompletion({
      result: { summary: "Scrape the products", plan: planWith({ extractList, recordOutput: { name: "Product Catalogue", columns: ["name"] } }) },
      projectId: "project.1", flowId: "flow.1", registry, resolution
    });

    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.check).toEqual({
      ok: true,
      answerability: { recordsRequested: false, recordProducerPresent: true, recordStorePresent: true }
    });
    expect(verdict.buildPlan.plan.subflows[0]?.nodes[0]?.parameters?.recordOutput).toMatchObject({
      datasetId: "Product-Catalogue",
      writeMode: "append",
      schema: { schemaVersion: "0.1", fields: [{ id: "name", label: "Name", valueType: "string" }] }
    });
  });

  it("gives the record output shape a refused parameter takes", async () => {
    const { verdict, feedback } = await refusal({ summary: "Scrape the products", plan: planWith({ extractList: { item: "li.product" }, recordOutput: { datasetId: "products" } }) });

    expect(verdict.code).toBe("flow_bootstrap.evidence_completion_plan_invalid");
    expect(verdict.check.issueCodes).toEqual(["record_schema.not_derivable"]);
    expect(feedback.issues[0]).toMatchObject({
      path: "plan.subflows.0.nodes.0.parameters.recordOutput",
      accepted: { parameter: "recordOutput", keys: expect.arrayContaining(["datasetId", "schema", "writeMode"]), example: expect.any(Object) }
    });
    expect(feedback.issues.filter((issue) => issue.accepted !== undefined)).toHaveLength(1);
    expect(feedback.instruction).toContain("carries accepted");
  });

  it("says how to read a positioned code, and gives the shape of the parameter a domain's refusal names", async () => {
    const binding = { resolvePlanNodeParameters: () => ({ status: "refused" as const, issueCodes: ["web.handle.misplaced", "web.handle.misplaced:extractList.fields.0"] }) };

    const { verdict, feedback } = await refusal({ summary: "Scrape the products", plan: planWith({ extractList }) }, binding);

    expect(verdict.code).toBe("flow_bootstrap.evidence_completion_parameters_unresolved");
    expect(feedback.issues).toEqual([
      { code: "web.handle.misplaced", path: "plan.subflows.0.nodes.0.parameters" },
      { code: "web.handle.misplaced:extractList.fields.0", path: "plan.subflows.0.nodes.0.parameters", accepted: expect.objectContaining({ parameter: "extractList" }) }
    ]);
    expect(feedback.instruction).toContain("A code written <code>:<path> names where inside that node's parameters the issue is");
    expect(feedback.instruction).toContain("a parameter's own description names any further keys it takes beside the handle.");
  });

  // Every decision is a fresh request with no conversation history, so a model
  // asked to complete again could not see the script it had just sent. It wrote
  // a new one from memory, and a live build "completed again with those steps
  // deleted and the wrong answer in their place". The refusal now hands the
  // script back on every path that can refuse a script -- including the
  // parameter check, which is where an invented handle is caught and so the
  // exact refusal that failure came from.
  it("hands the model back the script it just sent, on every refusal a script can reach", async () => {
    const script = ["flow: Scrape the products", "step: read the product list", "  node: web.dom.extract_list", "  extractList.item: li.product", "  extractList.fields.name: .name"].join(NEWLINE);
    const binding = { resolvePlanNodeParameters: () => ({ status: "refused" as const, issueCodes: ["web.handle.invented"] }) };

    const unresolved = await refusal({ flow: script }, binding);
    expect(unresolved.verdict.code).toBe("flow_bootstrap.evidence_completion_parameters_unresolved");
    expect(unresolved.feedback.previous).toBe(script);
    expect(unresolved.feedback.instruction).toContain("Where previous is given, it is the script you just sent.");

    const unreadable = await refusal({ flow: "step: do the thing nobody named" });
    expect(unreadable.verdict.code).toBe("flow_bootstrap.evidence_completion_plan_invalid");
    expect(unreadable.feedback.previous).toBe("step: do the thing nobody named");
  });

  it("has nothing to hand back when the model sent no script", async () => {
    const { feedback } = await refusal({ summary: "Scrape the products", plan: planWith({}) });
    expect(feedback.previous).toBeUndefined();
  });

  it("still answers a plan that does not parse, or a result that is not wrapped, by code alone", async () => {
    const unparsed = await refusal({ summary: "Scrape the products", plan: { schemaVersion: "9", subflows: "none" } });
    expect(unparsed.verdict.code).toBe("flow_bootstrap.evidence_completion_plan_invalid");
    expect(unparsed.feedback.issues.length).toBeGreaterThan(0);
    expect(unparsed.feedback.issues.every((issue) => issue.accepted === undefined)).toBe(true);

    const unwrapped = await refusal({});
    expect(unwrapped.feedback.issues).toEqual([{ code: "bootstrap.completion_wrapper_invalid", path: "result" }]);
  });

  it("builds the same Flow from the line format the completion schema now asks for", async () => {
    const verdict = await checkAutomationStudioFlowBootstrapCompletion({
      result: { flow: ["flow: Scrape the products", "step: read the product list", "  node: web.dom.extract_list", "  extractList.item: li.product", "  extractList.fields.name: .name"].join(NEWLINE) },
      projectId: "project.1", flowId: "flow.1", registry, resolution
    });

    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.summary).toBe("Scrape the products");
    expect(verdict.buildPlan.plan.subflows[0]?.nodes[0]).toMatchObject({
      definitionId: "web.output.dom-extract_list",
      definitionVersion: "1.0.0",
      outputActionId: "web.dom.extract_list",
      parameters: { extractList: { item: "li.product", fields: { name: ".name" } }, timeoutMs: 10_000, recordOutput: null }
    });
  });

  it("accepts a plan that passes every check", async () => {
    const verdict = await checkAutomationStudioFlowBootstrapCompletion({ result: { summary: "Scrape the products", plan: planWith({ extractList }) }, projectId: "project.1", flowId: "flow.1", registry, resolution });

    expect(verdict).toMatchObject({ ok: true, summary: "Scrape the products" });
  });
});

// Plan authoring writes a handle reference and this directory reads one, and
// the key has to be the same word. Reading the constant back out of here would
// close a module cycle, so the two are held together by what a build actually
// produces: a bare name written where an object belongs must arrive as a
// reference the resolver sees.
describe("the handle a built plan carries", () => {
  it("is the reference shape the resolver reads", async () => {
    const asked: JsonObject[] = [];
    const verdict = await checkAutomationStudioFlowBootstrapCompletion({
      result: { flow: ["step: click the row", "  node: web.dom.click", "  target: control.7"].join(NEWLINE) },
      projectId: "project.1", flowId: "flow.1", registry, resolution,
      binding: { resolvePlanNodeParameters: (request) => { asked.push(request.parameters); return { status: "resolved" as const, parameters: { selector: "li" } }; } }
    });

    expect(verdict.ok).toBe(true);
    expect(asked).toHaveLength(1);
    expect(automationStudioPlanNodeHandleSites(asked[0]!)).toMatchObject({ malformed: false, sites: [{ path: ["target"], handle: "control.7" }] });
  });
});

// Every check above holds a completed plan to the node library. None of them
// asked whether the Flow does what the person's sentence asked for, and four
// live builds against one instruction proposed four different Flows as finished
// -- one of which navigated twice, typed three times and read nothing. The last
// check asks that, from the plan and the instruction text alone.
describe("a completed plan that could not answer the instruction", () => {
  const readsOneValue: JsonObject = {
    schemaVersion: "0.1",
    router: { name: "Read", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{
      key: "primary",
      name: "Primary",
      role: "primary",
      nodes: [{ key: "read", definitionId: "web.output.dom-extract", definitionVersion: "1.0.0", outputActionId: "web.dom.extract", parameters: { selector: ".price" } }],
      edges: []
    }]
  };

  it("is refused under its own code, with what the instruction asks for beside the issue", async () => {
    const verdict = await checkAutomationStudioFlowBootstrapCompletion({
      result: { summary: "Read the price", plan: readsOneValue },
      projectId: "project.1", flowId: "flow.1", registry, resolution,
      instructionText: "Scrape every product the search returns as a table with columns name and price."
    });

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.code).toBe("flow_bootstrap.evidence_completion_cannot_answer");
    expect(verdict.check.issueCodes).toEqual(["bootstrap.cannot_answer_instruction"]);
    expect(verdict.check.answerability).toEqual({
      recordsRequested: true,
      recordProducerPresent: false,
      recordStorePresent: false,
      issueCode: "bootstrap.cannot_answer_instruction"
    });
    const feedback = verdict.check.feedback as unknown as Feedback & { cannotAnswer: JsonObject };
    expect(feedback.issues[0]).toEqual({
      code: "bootstrap.cannot_answer_instruction",
      path: "plan.subflows",
      message: "The instruction asks for a set of records and no step of this Flow produces or saves one, so no run of it could answer."
    });
    expect(feedback.cannotAnswer).toMatchObject({
      asks: "a set of records: rows with named fields",
      quote: "Scrape every product the search returns as a table with columns name and price",
      columns: ["name", "price"],
      steps: ["web.output.dom-extract"]
    });
    expect(feedback.instruction).toContain("keep it in the draft, and finish again");
    expect(feedback.instruction).not.toContain("Where an issue carries accepted");
  });

  it("is not refused when the instruction asks for no records, and never reaches the check without one", async () => {
    for (const instructionText of ["Read the price of the item on this page and tell me what it is.", undefined]) {
      const verdict = await checkAutomationStudioFlowBootstrapCompletion({
        result: { summary: "Read the price", plan: readsOneValue },
        projectId: "project.1", flowId: "flow.1", registry, resolution,
        ...(instructionText === undefined ? {} : { instructionText })
      });

      expect(verdict.ok).toBe(true);
    }
  });
});

// Answering is not running. `run-muht9lpw-a39aa056` built a Flow of one node --
// a list extraction with no navigation before it -- and replay failed on the
// blank tab a run starts on, `Cannot access contents of url "about:blank"`. An
// extraction on its own satisfies every check above, answerability included; it
// simply has nowhere to do it. The seventh check asks that, from the plan and
// the start location the build was given.
describe("a completed plan that could not reach where the Flow starts", () => {
  const START_LOCATION = "https://shop.test/collections/audio";

  it("is refused under its own code, with where the Flow starts beside the issue", async () => {
    const verdict = await checkAutomationStudioFlowBootstrapCompletion({
      result: { summary: "Scrape the products", plan: planWith({ extractList }) },
      projectId: "project.1", flowId: "flow.1", registry, resolution,
      startLocation: START_LOCATION
    });

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.code).toBe("flow_bootstrap.evidence_completion_cannot_reach_start");
    expect(verdict.check.issueCodes).toEqual(["bootstrap.cannot_reach_start_location"]);
    expect(verdict.check.answerability).toEqual({
      recordsRequested: false,
      recordProducerPresent: true,
      recordStorePresent: false
    });
    const feedback = verdict.check.feedback as unknown as Feedback & { cannotReach: JsonObject };
    expect(feedback.issues[0]).toEqual({
      code: "bootstrap.cannot_reach_start_location",
      path: "plan.subflows",
      message: "This Flow acts on the target it was told to start at and no step of it goes there, so no run of it could take its first step."
    });
    expect(feedback.cannotReach).toEqual({
      starts: START_LOCATION,
      lacks: "no step of this Flow goes to where it starts",
      steps: ["web.output.dom-extract_list"]
    });
    expect(feedback.instruction).toContain("keep it in the draft as the first step, and finish again");
    expect(feedback.instruction).not.toContain("Where an issue carries accepted");
  });

  it("accepts the same reading once the Flow goes there first", async () => {
    const verdict = await checkAutomationStudioFlowBootstrapCompletion({
      result: {
        flow: [
          "flow: Scrape the products",
          "step: open the collection",
          "  node: web.browser.navigate",
          `  url: ${START_LOCATION}`,
          "step: read the product list",
          "  node: web.dom.extract_list",
          "  extractList.item: li.product",
          "  extractList.fields.name: .name"
        ].join(NEWLINE)
      },
      projectId: "project.1", flowId: "flow.1", registry, resolution,
      startLocation: START_LOCATION
    });

    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.buildPlan.plan.subflows[0]?.nodes.map((node) => node.definitionId))
      .toEqual(["web.output.browser-navigate", "web.output.dom-extract_list"]);
  });

  // Both bigbox builds (`run-mulx76vv-a882551e`, `run-mum0ke7z-940cbd27`) ran
  // the navigation first, as the domain requires, then withdrew it with an
  // amendment, and spent a turn being refused for it at the end of the budget.
  it("builds a draft whose navigation was withdrawn with that navigation as its first step", async () => {
    const step = (position: number, node: string, parameters: JsonObject, disposition: AutomationStudioFlowDraftStep["disposition"], effect: "observe" | "mutate"): AutomationStudioFlowDraftStep => ({
      position, id: `d${position}`, iteration: position, actionId: node, toolId: "core.run_node",
      input: { node, parameters, consequences: [] }, effect, effectApplied: true, disposition,
      ...(effect === "observe" ? { proposes: true } : {})
    });
    const draftSteps = [
      step(1, "web.browser.navigate", { url: START_LOCATION }, "exploratory", "mutate"),
      step(2, "web.dom.extract_list", { extractList }, "kept", "observe")
    ];

    const verdict = await checkAutomationStudioFlowBootstrapCompletion({
      result: { summary: "Scrape the products" },
      projectId: "project.1", flowId: "flow.1", registry, resolution, draftSteps,
      startLocation: START_LOCATION
    });

    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.buildPlan.plan.subflows[0]?.nodes.map((node) => node.definitionId))
      .toEqual(["web.output.browser-navigate", "web.output.dom-extract_list"]);
    // The loop's own draft still says what the model said about the step.
    expect(draftSteps[0]?.disposition).toBe("exploratory");
  });

  it("never reaches the check for a build that was given no start location", async () => {
    const verdict = await checkAutomationStudioFlowBootstrapCompletion({
      result: { summary: "Scrape the products", plan: planWith({ extractList }) },
      projectId: "project.1", flowId: "flow.1", registry, resolution
    });

    expect(verdict.ok).toBe(true);
  });
});

// `run-mulxsbyy-d4d4c7a1` was refused three times by three different checks,
// one per attempt, the last on its forced final decision. Every check whose
// input exists now runs on every attempt, and the refusal carries them all.
describe("every check on every attempt", () => {
  const readsOneValue: JsonObject = {
    schemaVersion: "0.1",
    router: { name: "Read", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{ key: "primary", name: "Primary", role: "primary", nodes: [{ key: "read", definitionId: "web.output.dom-extract", definitionVersion: "1.0.0", outputActionId: "web.dom.extract", parameters: { selector: ".price" } }], edges: [] }]
  };

  it("returns a refused parameter, an unanswerable plan and an unreachable start together", async () => {
    const binding = { resolvePlanNodeParameters: () => ({ status: "refused" as const, issueCodes: ["web.handle.invented"] }) };
    const verdict = await checkAutomationStudioFlowBootstrapCompletion({
      result: { summary: "Read the price", plan: readsOneValue },
      projectId: "project.1", flowId: "flow.1", registry, resolution, binding,
      instructionText: "Scrape every product the search returns as a table with columns name and price.",
      startLocation: "https://shop.test/search"
    });

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.codes).toEqual([
      "flow_bootstrap.evidence_completion_parameters_unresolved",
      "flow_bootstrap.evidence_completion_cannot_answer",
      "flow_bootstrap.evidence_completion_cannot_reach_start"
    ]);
    expect(verdict.code).toBe("flow_bootstrap.evidence_completion_parameters_unresolved");
    expect(verdict.check.issueCodes).toEqual(["web.handle.invented", "bootstrap.cannot_answer_instruction", "bootstrap.cannot_reach_start_location"]);
    const feedback = verdict.check.feedback as unknown as Feedback & { refusals: string[]; cannotAnswer: JsonObject; cannotReach: JsonObject };
    expect(feedback.refusals).toEqual(verdict.codes);
    expect(feedback.cannotAnswer).toBeDefined();
    expect(feedback.cannotReach).toBeDefined();
    expect(feedback.instruction).toContain("correct all of them before completing again");
    expect(feedback.instruction).toContain("Where an issue carries accepted");
    expect(feedback.instruction).toContain("keep it in the draft as the first step");
  });

  it("names the limit a result is over, its maximum and the actual value", async () => {
    const nodes = Array.from({ length: 17 }, (_unused, index) => ({ key: `n${index}`, definitionId: "builtin.control.end", definitionVersion: "1.0.0" }));
    const { verdict, feedback } = await refusal({ summary: "Candidate.", plan: { ...planWith({ extractList }), subflows: [{ key: "primary", name: "Primary", role: "primary", nodes, edges: [] }] } });

    expect(verdict.codes).toContain("flow_bootstrap.evidence_completion_profile_limit_exceeded");
    expect((feedback as unknown as { limitsExceeded: JsonObject[] }).limitsExceeded).toContainEqual({ limit: "maxNodesPerSubflow", max: 16, actual: 17, path: "plan.subflows.0.nodes" });
    expect(feedback.instruction).toContain("limitsExceeded names each limit");
  });
});

// `run-mum06sfc-f1d9403f`: told to put two kettles in the cart, move the phone
// case to Save for later and read the cart back, the build searched, went to
// the cart and read it, and `complete` was accepted because the Flow produced
// records. Its consequence cross-check said `undeclared` and refused nothing.
// Completion now refuses it, naming each act it left undone.
describe("a completed draft that does not do what the instruction asks", () => {
  const KETTLES = "Kettle to cart" + NEWLINE + "Put two Tidewell electric kettles in sage green, 1.7 litre, sold by Brightaisle itself, in my cart, and move the phone case that is already in my cart to Save for later. Then give me what is in my cart, leaving out the saved items, as a table with columns item, quantity and price, where quantity is a plain number and price is the price of one.";
  const ran = (position: number, node: string, parameters: JsonObject, effect: "observe" | "mutate" = "mutate"): AutomationStudioFlowDraftStep => ({
    position, id: `d${position}`, iteration: position, actionId: node, toolId: "core.run_node",
    input: { node, parameters, consequences: [] }, effect, effectApplied: true, disposition: "kept",
    ...(effect === "observe" ? { proposes: true } : {})
  });
  // Search, press Go, go to the cart, read it: what the run built, less its merge.
  const searchedAndRead = [
    ran(1, "web.browser.navigate", { url: "https://store.test/" }),
    ran(2, "web.dom.type", { selector: "#search", text: "kettle" }),
    ran(3, "web.dom.click", { selector: "#go" }),
    ran(4, "web.browser.navigate", { url: "https://store.test/cart" }),
    ran(5, "web.dom.extract_list", { extractList: { item: ".line", fields: { item: ".name", quantity: ".qty", price: ".price" } } }, "observe")
  ];
  const complete = (draftSteps: AutomationStudioFlowDraftStep[], acts?: JsonObject[]) => checkAutomationStudioFlowBootstrapCompletion({
    result: { summary: "Reads the cart.", ...(acts ? { acts } : {}) },
    projectId: "project.1", flowId: "flow.1", registry, resolution, draftSteps, instructionText: KETTLES
  });

  it("is refused, naming every act the instruction asks for that no step is named as doing", async () => {
    const verdict = await complete(searchedAndRead);

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.codes).toEqual(["flow_bootstrap.evidence_completion_cannot_answer"]);
    expect(verdict.check.issueCodes).toEqual(["bootstrap.instructed_act_missing"]);
    const feedback = verdict.check.feedback as unknown as Feedback & { missingActs: { acts: JsonObject[]; keptSteps: string[] } };
    expect(feedback.missingActs.acts.map((act) => [act.id, act.kind, act.verb, act.reason])).toEqual([
      ["a1", "add_to", "put", "no_step_named"],
      ["a2", "move", "move", "no_step_named"],
      ["a3", "open", "give", "no_step_named"]
    ]);
    expect(feedback.missingActs.acts[0]?.quote).toContain("Put two Tidewell electric kettles");
    expect(feedback.issues).toContainEqual(expect.objectContaining({ code: "bootstrap.instructed_act_missing" }));
    expect(feedback.instruction).toContain("missingActs.acts are things the person's instruction asks to be done");
  });

  it("still names the two acts left undone once the model names the cart for the one it did", async () => {
    const verdict = await complete(searchedAndRead, [{ action: "give me what is in my cart", step: "d4" }]);

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    const feedback = verdict.check.feedback as unknown as { missingActs: { acts: JsonObject[] } };
    expect(feedback.missingActs.acts.map((act) => act.id)).toEqual(["a1", "a2"]);
  });

  it("refuses the read of the cart claimed as putting the kettles in it", async () => {
    const verdict = await complete(searchedAndRead, [{ action: "a1", step: "d5" }, { action: "a2", step: "d3" }, { action: "a3", step: "d4" }]);

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    const feedback = verdict.check.feedback as unknown as { missingActs: { acts: JsonObject[] } };
    expect(feedback.missingActs.acts.map((act) => [act.id, act.reason])).toEqual([["a1", "step_changed_nothing"]]);
  });

  it("is accepted once each act has a kept step of its own that changed something", async () => {
    const didTheJob = [
      ...searchedAndRead.slice(0, 3),
      ran(4, "web.dom.click", { selector: "#add-to-cart" }),
      ran(5, "web.browser.navigate", { url: "https://store.test/cart" }),
      ran(6, "web.dom.click", { selector: "#save-for-later" }),
      ran(7, "web.dom.extract_list", { extractList: { item: ".line", fields: { item: ".name", quantity: ".qty", price: ".price" } } }, "observe")
    ];
    const verdict = await complete(didTheJob, [{ action: "put the kettles in my cart", step: "d4" }, { action: "move the phone case", step: "d6" }, { action: "give", step: "d5" }]);

    expect(verdict.ok).toBe(true);
  });
});
