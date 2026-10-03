import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions } from "../../../../nodes/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../flow-bootstrap/plan/tests/index.ts";
import { automationStudioInstructedActsChecklist } from "../../../flow-bootstrap/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioLlmEvidenceParseCompletionCheck } from "../../evidence-loop-decision.ts";
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
// check asks that, from the plan and the instruction text alone -- and since
// t195-w28a what it finds is information for the judge of the Flow's test,
// never a refusal: only the permission gates refuse.
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

  it("is accepted with no record producer for a requested table, what the check found carried as a note", async () => {
    const verdict = await checkAutomationStudioFlowBootstrapCompletion({
      result: { summary: "Read the price", plan: readsOneValue },
      projectId: "project.1", flowId: "flow.1", registry, resolution,
      instructionText: "Scrape every product the search returns as a table with columns name and price."
    });

    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.buildPlan.plan.subflows[0]?.nodes.map((node) => node.definitionId)).toEqual(["web.output.dom-extract"]);
    // The facts still travel on the record, with no refusal's issue code.
    expect(verdict.check.answerability).toEqual({ recordsRequested: true, recordProducerPresent: false, recordStorePresent: false });
    expect(verdict.notes).toEqual([{
      code: "bootstrap.cannot_answer_instruction",
      said: "The instruction asks for a set of records and no step of this Flow produces or saves one, so no run of it could answer.",
      columns: ["name", "price"]
    }]);
  });

  it("carries no note when the instruction asks for no records, and never reaches the check without one", async () => {
    for (const instructionText of ["Read the price of the item on this page and tell me what it is.", undefined]) {
      const verdict = await checkAutomationStudioFlowBootstrapCompletion({
        result: { summary: "Read the price", plan: readsOneValue },
        projectId: "project.1", flowId: "flow.1", registry, resolution,
        ...(instructionText === undefined ? {} : { instructionText })
      });

      expect(verdict.ok).toBe(true);
      if (verdict.ok) expect(verdict.notes).toBeUndefined();
    }
  });
});

// Answering is not running. `run-muht9lpw-a39aa056` built a Flow of one node --
// a list extraction with no navigation before it -- and replay failed on the
// blank tab a run starts on, `Cannot access contents of url "about:blank"`. An
// extraction on its own satisfies every check above, answerability included; it
// simply has nowhere to do it. The seventh check asks that, from the plan and
// the start location the build was given, and since t195-w28a its answer is a
// note for the judge rather than a refusal.
describe("a completed plan that could not reach where the Flow starts", () => {
  const START_LOCATION = "https://shop.test/collections/audio";

  it("is accepted, with where the Flow starts carried as a note", async () => {
    const verdict = await checkAutomationStudioFlowBootstrapCompletion({
      result: { summary: "Scrape the products", plan: planWith({ extractList }) },
      projectId: "project.1", flowId: "flow.1", registry, resolution,
      startLocation: START_LOCATION
    });

    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.check.answerability).toEqual({
      recordsRequested: false,
      recordProducerPresent: true,
      recordStorePresent: false
    });
    expect(verdict.notes).toEqual([{
      code: "bootstrap.cannot_reach_start_location",
      said: "This Flow acts on the target it was told to start at and no step of it goes there, so no run of it could take its first step.",
      starts: START_LOCATION
    }]);
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
    expect(verdict.notes).toBeUndefined();
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
    // And the record says the Flow judged has a step the model had taken out:
    // which one, and how it had been withdrawn. Content-free, so it can travel.
    expect(verdict.check.restoredStep).toEqual({ step: 1, withdrawnAs: "exploratory" });
  });

  it("says a restored step on a refusal too, and says nothing when nothing was restored", async () => {
    const step = (position: number, node: string, parameters: JsonObject, disposition: AutomationStudioFlowDraftStep["disposition"]): AutomationStudioFlowDraftStep => ({
      position, id: `d${position}`, iteration: position, actionId: node, toolId: "core.run_node",
      input: { node, parameters, consequences: [] }, effect: "mutate", effectApplied: true, disposition
    });
    // A navigation the model dropped, restored, and the result then refused for a step the writer cannot write down.
    const refused = await checkAutomationStudioFlowBootstrapCompletion({
      result: { summary: "Scrape the products" }, projectId: "project.1", flowId: "flow.1", registry, resolution,
      draftSteps: [step(1, "web.browser.navigate", { url: START_LOCATION }, "dropped"), step(2, "web.not.a_registered_node", {}, "kept")],
      startLocation: START_LOCATION
    });
    expect(refused.ok).toBe(false);
    expect(refused.check.restoredStep).toEqual({ step: 1, withdrawnAs: "dropped" });
    // A draft's refusal hands back the note in place of a script (t252, D8): a missing step may be run or written.
    if (refused.ok || refused.check.ok) throw new Error("expected a refusal");
    expect((refused.check.feedback as unknown as Feedback).previous).toContain("run or write the step it is missing");
    const plain = await checkAutomationStudioFlowBootstrapCompletion({
      result: { summary: "Scrape the products" }, projectId: "project.1", flowId: "flow.1", registry, resolution,
      draftSteps: [step(1, "web.browser.navigate", { url: START_LOCATION }, "kept")], startLocation: START_LOCATION
    });
    expect(plain.check.restoredStep).toBeUndefined();
  });

  // `run-muncqlr0-3348202b`: a draft built by the steps that ran was refused
  // outright because the model's one-line summary ran past 240 characters.
  it("bounds a draft's summary as a written plan's is bounded, rather than refusing the Flow for it", async () => {
    const draftSteps: AutomationStudioFlowDraftStep[] = [
      { position: 1, id: "d1", iteration: 1, actionId: "web.browser.navigate", toolId: "core.run_node", input: { node: "web.browser.navigate", parameters: { url: START_LOCATION }, consequences: [] }, effect: "mutate", effectApplied: true, disposition: "kept" },
      { position: 2, id: "d2", iteration: 2, actionId: "web.dom.extract_list", toolId: "core.run_node", input: { node: "web.dom.extract_list", parameters: { extractList }, consequences: [] }, effect: "observe", effectApplied: true, disposition: "kept", proposes: true }
    ];
    const long = "Open the store,   pick the Millbrook store for pickup, and read every towel on the page. ".repeat(4);
    const verdict = await checkAutomationStudioFlowBootstrapCompletion({ result: { summary: long }, projectId: "project.1", flowId: "flow.1", registry, resolution, draftSteps, startLocation: START_LOCATION });

    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.summary.length).toBe(240);
    expect(verdict.summary).not.toMatch(/\s{2}/u);
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
// input exists now runs on every attempt, and the refusal carries every one
// that refuses. The capability checks no longer refuse (t195-w28a): a plan
// refused for how it was written is refused for that alone.
describe("every check on every attempt", () => {
  const readsOneValue: JsonObject = {
    schemaVersion: "0.1",
    router: { name: "Read", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{ key: "primary", name: "Primary", role: "primary", nodes: [{ key: "read", definitionId: "web.output.dom-extract", definitionVersion: "1.0.0", outputActionId: "web.dom.extract", parameters: { selector: ".price" } }], edges: [] }]
  };

  it("refuses a plan that cannot be built for that alone, not for what it cannot answer or reach", async () => {
    const binding = { resolvePlanNodeParameters: () => ({ status: "refused" as const, issueCodes: ["web.handle.invented"] }) };
    const verdict = await checkAutomationStudioFlowBootstrapCompletion({
      result: { summary: "Read the price", plan: readsOneValue },
      projectId: "project.1", flowId: "flow.1", registry, resolution, binding,
      instructionText: "Scrape every product the search returns as a table with columns name and price.",
      startLocation: "https://shop.test/search"
    });

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.codes).toEqual(["flow_bootstrap.evidence_completion_parameters_unresolved"]);
    expect(verdict.code).toBe("flow_bootstrap.evidence_completion_parameters_unresolved");
    expect(verdict.check.issueCodes).toEqual(["web.handle.invented"]);
    const feedback = verdict.check.feedback as unknown as Feedback & { refusals?: string[]; cannotAnswer?: JsonObject; cannotReach?: JsonObject };
    expect(feedback.refusals).toBeUndefined();
    expect(feedback.cannotAnswer).toBeUndefined();
    expect(feedback.cannotReach).toBeUndefined();
    expect(feedback.instruction).toContain("Where an issue carries accepted");
    expect(feedback.instruction).not.toContain("keep it in the draft as the first step");
  });

  // A Subflow's node count is the Flow's size setting, which the structural
  // parse holds a plan to before this check runs; the limits only this check
  // names are the shape of one reply, such as how many Subflows it holds.
  it("names the limit a result is over, its maximum and the actual value", async () => {
    const subflows = Array.from({ length: 5 }, (_unused, index) => ({
      key: `part_${index}`, name: `Part ${index}`, role: index === 0 ? "primary" : "utility",
      nodes: [{ key: `n${index}`, definitionId: "builtin.control.end", definitionVersion: "1.0.0" }], edges: []
    }));
    const { verdict, feedback } = await refusal({ summary: "Candidate.", plan: { ...planWith({ extractList }), subflows } });

    expect(verdict.codes).toContain("flow_bootstrap.evidence_completion_profile_limit_exceeded");
    expect((feedback as unknown as { limitsExceeded: JsonObject[] }).limitsExceeded).toContainEqual({ limit: "maxSubflows", max: 4, actual: 5, path: "plan.subflows" });
    expect(feedback.instruction).toContain("limitsExceeded names each limit");
  });

  it("refuses a Subflow over the Flow's size setting, naming the setting and its value", async () => {
    const nodes = Array.from({ length: 101 }, (_unused, index) => ({ key: `n${index}`, definitionId: "builtin.control.end", definitionVersion: "1.0.0" }));
    const { verdict } = await refusal({ summary: "Candidate.", plan: { ...planWith({ extractList }), subflows: [{ key: "primary", name: "Primary", role: "primary", nodes, edges: [] }] } });

    expect(verdict.codes).toContain("flow_bootstrap.evidence_completion_plan_invalid");
    expect(verdict.issues.map((issue) => issue.message)).toContain("Subflow has 101 nodes; this Flow allows 100 (flowSizeSettings.maxNodesPerSubflow, Flow Settings > Maximum nodes per Subflow).");
  });
});

// `run-mum06sfc-f1d9403f`: told to put two kettles in the cart, move the phone
// case to Save for later and read the cart back, the build searched, went to
// the cart and read it, and `complete` was accepted because the Flow produced
// records. Completion then refused such a draft, naming each act it left
// undone -- and refused lane B's `choice_is_the_act_step` six times, lane D's
// run 36 24 times and the napkins named on the towels' Add (run 40), none of
// which ever reached the test that would have shown what the Flow did. Since
// t195 the test from the start and a judge of its results decide; the acts
// checklist is information beside them, and these completions are accepted.
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
  const complete = (draftSteps: AutomationStudioFlowDraftStep[], acts?: JsonObject[], instructionText = KETTLES) => checkAutomationStudioFlowBootstrapCompletion({
    result: { summary: "Reads the cart.", ...(acts ? { acts } : {}) },
    projectId: "project.1", flowId: "flow.1", registry, resolution, draftSteps, instructionText
  });
  // What the checklist says of the same draft: the information the model and the judge read instead of a refusal.
  const todo = (draftSteps: AutomationStudioFlowDraftStep[], instructionText = KETTLES) =>
    (automationStudioInstructedActsChecklist({ instructionText, draftSteps }) ?? []).flatMap((item) => [item, ...(item.choices ?? [])]).map((item) => [item.id, item.todo]);

  it("is accepted with no step named for any act, the checklist still saying each is to do", async () => {
    const verdict = await complete(searchedAndRead);

    expect(verdict.ok).toBe(true);
    expect(todo(searchedAndRead)).toEqual([["a1", "no_step_added"], ["a1.quantity", "no_step_added"], ["a1.colour", "no_step_added"], ["a2", "no_step_added"], ["a3", "no_step_added"]]);
  });

  it("is accepted with the read of the cart claimed as putting the kettles in it", async () => {
    const verdict = await complete(searchedAndRead, [{ action: "a1", step: "d5" }, { action: "a2", step: "d3" }, { action: "a3", step: "d4" }]);

    expect(verdict.ok).toBe(true);
  });

  it("is accepted once each act has a kept step of its own that changed something", async () => {
    const didTheJob = [
      ...searchedAndRead.slice(0, 3),
      ran(4, "web.dom.click", { selector: "#add-to-cart" }),
      ran(5, "web.browser.navigate", { url: "https://store.test/cart" }),
      ran(6, "web.dom.click", { selector: "#save-for-later" }),
      ran(7, "web.dom.extract_list", { extractList: { item: ".line", fields: { item: ".name", quantity: ".qty", price: ".price" } } }, "observe"),
      ran(8, "web.dom.click", { selector: "#colour-sage-green" }),
      ran(9, "web.dom.type", { selector: "#quantity", text: "2" })
    ];
    const verdict = await complete(didTheJob, [{ action: "put the kettles in my cart", step: "d4" }, { action: "move the phone case", step: "d6" }, { action: "give", step: "d5" }, { action: "choose the sage green colour", step: "d8" }, { action: "set the quantity", step: "d9" }]);

    expect(verdict.ok).toBe(true);
  });

  // Live run 36 (`run-muq3uozx-3153564b`): a1 named on the listing, with the
  // Confirm repeated over it. 24 completions were refused for the read. Since
  // round 4 a1 named on the Confirm as well is accepted by the check itself;
  // named only on the read, it was still refused until the check stopped refusing.
  it("accepts run 36's shapes: a1 named on the listing alone, or on the listing and the repeated Confirm", async () => {
    const CONFIRM = "Go through my friend requests and confirm everyone I have at least five mutual friends with, and leave every other request as it is.";
    const listing = { ...ran(2, "web.dom.extract_list", { extractList: { item: ".request", fields: { name: ".name", mutual: ".mutual" } } }, "observe"), acts: ["a1"] };
    const confirm = { ...ran(3, "web.dom.click", { selector: ".confirm" }), routing: { kind: "repeat" as const, over: "d2", through: "d3" } };
    const onTheRead = [ran(1, "web.browser.navigate", { url: "https://social.test/friends" }), listing, confirm];

    expect((await complete(onTheRead, [{ action: "a1", step: "2" }], CONFIRM)).ok).toBe(true);
    expect(todo(onTheRead, CONFIRM)).toEqual([["a1", "step_only_reads"]]);
    expect((await complete([onTheRead[0]!, listing, { ...confirm, acts: ["a1"] }], [{ action: "a1", step: "2" }], CONFIRM)).ok).toBe(true);
  });

  // Lane B: the size named on the Add press, refused six times `choice_is_the_act_step`.
  it("accepts lane B's shape: the size named on the press that adds, the checklist saying choice_is_the_act_step", async () => {
    const TOWELS = "Add the ValueRidge paper towels in the 12 Double Rolls size to my cart.";
    const draft = [
      ran(1, "web.browser.navigate", { url: "https://store.test/towels" }),
      { ...ran(2, "web.dom.click", { selector: "#add-to-cart" }), acts: ["a1", "a1.size"] }
    ];
    const verdict = await complete(draft, undefined, TOWELS);

    expect(verdict.ok).toBe(true);
    expect(todo(draft, TOWELS)).toEqual([["a1", undefined], ["a1.size", "choice_is_the_act_step"]]);
  });

  // Live run 40 (`run-muq6lqnw-fdfa7aac`): one search and one Add to cart, on
  // the towels, with the napkins' act named on that Add.
  it("accepts run 40's shape: the napkins named on the towels' Add to cart, the checklist saying which object it acted on", async () => {
    const BOTH = "Add one pack of the ValueRidge Essentials Select-A-Size Paper Towels and one pack of the ValueRidge Everyday Dinner Napkins to my cart.";
    const towelsPage = "https://store.test/ip/valueridge-essentials-select-a-size-paper-towels/418830127";
    const draft = [
      ran(1, "web.browser.navigate", { url: "https://store.test/" }),
      ran(2, "web.dom.type", { selector: "#search", text: "ValueRidge Essentials Select-A-Size Paper Towels" }),
      ran(3, "web.dom.click", { selector: "#go" }),
      { ...ran(4, "web.dom.click", { selector: "#add-to-cart" }), acts: ["a1", "a2"], replay: { from: { location: towelsPage } } }
    ];
    const verdict = await complete(draft, undefined, BOTH);

    expect(verdict.ok).toBe(true);
    expect(todo(draft, BOTH)).toEqual([["a1", undefined], ["a2", "step_acts_on_another_object"]]);
  });
});

// The one instructed-act rule a completion is still refused for (withdraw
// audit R2, run 3 `run-munnyvbr-11c28a0f`): an act whose verb names a class a
// person is asked about needs a step declaring it, or nobody is asked.
describe("a completed draft whose act a person must be asked about is not declared", () => {
  const WITHDRAW = "On Guildline, withdraw the connection request I sent to Dana Whitfield.";
  const press = (consequences: string[], overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep => ({
    position: 3, id: "d3", iteration: 3, actionId: "web.dom.click", toolId: "core.run_node",
    input: { node: "web.dom.click", parameters: { selector: ".withdraw" }, consequences }, effect: "mutate", effectApplied: true, disposition: "kept",
    acts: ["a1"], ...overrides
  });
  const before: AutomationStudioFlowDraftStep[] = [
    { position: 1, id: "d1", iteration: 1, actionId: "web.browser.navigate", toolId: "core.run_node", input: { node: "web.browser.navigate", parameters: { url: "https://guildline.test/" }, consequences: [] }, effect: "mutate", effectApplied: true, disposition: "kept" },
    { position: 2, id: "d2", iteration: 2, actionId: "web.dom.click", toolId: "core.run_node", input: { node: "web.dom.click", parameters: { selector: "#sent" }, consequences: [] }, effect: "mutate", effectApplied: true, disposition: "kept" }
  ];
  const complete = (withdraw: AutomationStudioFlowDraftStep) => checkAutomationStudioFlowBootstrapCompletion({
    result: { summary: "Withdraws the request." }, projectId: "project.1", flowId: "flow.1", registry, resolution, draftSteps: [...before, withdraw], instructionText: WITHDRAW,
    // A domain that permits what is declared: what is refused here is only a step that declares nothing to permit.
    binding: { resolvePlanNodeParameters: async () => ({ status: "unchanged" }) },
    permissionFor: () => async () => ({ permitted: true })
  });
  const undeclared = { acts: [{ id: "a1", kind: "submit", verb: "withdraw", quote: expect.stringContaining("withdraw the connection request"), consequence: "delete", reason: "act_consequence_undeclared", step: "3" }] };

  it("is refused act_consequence_undeclared when the withdraw press declares only modify_existing", async () => {
    const verdict = await complete(press(["modify_existing"]));

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.codes).toEqual(["flow_bootstrap.evidence_completion_cannot_answer"]);
    expect(verdict.check.issueCodes).toEqual(["bootstrap.instructed_act_missing"]);
    const feedback = verdict.check.feedback as unknown as Feedback & { missingActs: JsonObject };
    // The permission account alone: nothing of what the checklist says about whether the act is done.
    expect(feedback.missingActs).toEqual(undeclared);
    expect(feedback.instruction).toContain("A reason of act_consequence_undeclared");
  });

  it("is still refused for the declaration when the press is marked optional", async () => {
    const verdict = await complete(press(["modify_existing"], { routing: { kind: "optional" } }));

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect((verdict.check.feedback as unknown as { missingActs: JsonObject }).missingActs).toEqual(undeclared);
  });

  it("is accepted once the press declares delete, optional or not", async () => {
    expect((await complete(press(["delete"]))).ok).toBe(true);
    expect((await complete(press(["delete"], { routing: { kind: "optional" } }))).ok).toBe(true);
  });
});

// The completion passes the instruction's own words to the plan's assembly, so a
// list read whose author declared no columns stores the ones the instruction
// names (`flow-bootstrap/authoring/instruction-record-columns.ts`). Live run 12
// stored two filter-only columns beside the four it was asked for.
describe("a completed list read with no declared columns", () => {
  const read = { item: "li.product", fields: { name: ".name", price: ".price", plus: ".plus" }, where: [{ field: "plus", is: "present" }] };

  it("stores the columns the instruction names, by the reply's plan and by the draft", async () => {
    const instructionText = "Scrape every Plus product the search returns as a table with columns name and price.";
    const draftSteps: AutomationStudioFlowDraftStep[] = [{ position: 1, id: "d1", iteration: 1, actionId: "web.dom.extract_list", toolId: "core.run_node", input: { node: "web.dom.extract_list", parameters: { extractList: read }, consequences: [] }, effect: "observe", effectApplied: true, disposition: "kept", proposes: true }];
    for (const input of [
      { result: { summary: "Scrape", plan: planWith({ extractList: read }) } },
      { result: { summary: "Scrape" }, draftSteps }
    ]) {
      const verdict = await checkAutomationStudioFlowBootstrapCompletion({ ...input, projectId: "project.1", flowId: "flow.1", registry, resolution, instructionText });
      expect(verdict.ok, JSON.stringify(verdict.ok ? {} : verdict.check)).toBe(true);
      if (!verdict.ok) return;
      const node = verdict.buildPlan.subflows[0]?.nodes.find((entry) => entry.definitionId === "web.output.dom-extract_list");
      const recordOutput = node?.parameters?.recordOutput as { schema?: { fields?: Array<{ id: string }> } } | undefined;
      expect(recordOutput?.schema?.fields?.map((column) => column.id)).toEqual(["name", "price"]);
    }
  });

  // The warning used to be dropped on the way to an accepted verdict, so nobody
  // saw that the instruction's "rating" was never read. It is kept beside the
  // check, not in it: the loop reads a check by its exact keys, and an accepted
  // check with one more would end the build as an invalid decision.
  it("keeps the warning about a named column no field reads on the accepted verdict, and accepts it", async () => {
    const draftSteps: AutomationStudioFlowDraftStep[] = [{ position: 1, id: "d1", iteration: 1, actionId: "web.dom.extract_list", toolId: "core.run_node", input: { node: "web.dom.extract_list", parameters: { extractList: read }, consequences: [] }, effect: "observe", effectApplied: true, disposition: "kept", proposes: true }];
    const ask = (instructionText: string) => checkAutomationStudioFlowBootstrapCompletion({ result: { summary: "Scrape" }, draftSteps, projectId: "project.1", flowId: "flow.1", registry, resolution, instructionText });

    const missed = await ask("Scrape every Plus product the search returns as a table with columns name, price and rating.");
    expect(missed.ok).toBe(true);
    if (!missed.ok) return;
    expect(missed.warnings).toEqual([expect.objectContaining({ severity: "warning", code: "record_output.named_column_unmatched", message: expect.stringContaining("\"rating\"") })]);
    expect(Object.keys(missed.check).sort()).toEqual(["answerability", "ok"]);
    expect(automationStudioLlmEvidenceParseCompletionCheck(missed.check)).toMatchObject({ ok: true });

    for (const instructionText of ["Scrape every Plus product the search returns as a table with columns name and price.", "Scrape every Plus product the search returns."]) {
      const verdict = await ask(instructionText);
      expect(verdict.ok).toBe(true);
      if (verdict.ok) expect(verdict.warnings).toBeUndefined();
    }
  });
});

// t243: a draft step's route signatures reach the plan the completion builds,
// and a plan the model wrote itself carries none: they are Core-derived only.
describe("the route signatures a completed build carries", () => {
  const signed = { before: { at: "/collections/audio" }, after: { at: "/collections/audio" } };

  it("puts the build's signatures for each draft step on the plan node it became", async () => {
    const draftSteps: AutomationStudioFlowDraftStep[] = [{
      position: 1, id: "d1", iteration: 1, actionId: "web.dom.extract_list", toolId: "core.run_node",
      input: { node: "web.dom.extract_list", parameters: { extractList }, consequences: [] },
      effect: "observe", effectApplied: true, disposition: "kept", proposes: true, stateBefore: "D0", stateAfter: "D0"
    }];
    const asked: Array<{ stateBefore?: string; stateAfter?: string }> = [];
    const verdict = await checkAutomationStudioFlowBootstrapCompletion({
      result: { summary: "Scrape the products" }, projectId: "project.1", flowId: "flow.1", registry, resolution, draftSteps,
      routeSignaturesOf: (step) => (asked.push({ ...(step.stateBefore ? { stateBefore: step.stateBefore } : {}), ...(step.stateAfter ? { stateAfter: step.stateAfter } : {}) }), signed)
    });
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(asked).toEqual([{ stateBefore: "D0", stateAfter: "D0" }]);
    expect(verdict.buildPlan.plan.subflows[0]?.nodes[0]?.routeSignatures).toEqual(signed);
    expect(verdict.buildPlan.subflows[0]?.nodes[0]?.routeSignatures).toEqual(signed);
  });

  it("drops any the model wrote into its own plan before reading it", async () => {
    const plan = planWith({ extractList });
    ((plan.subflows as JsonObject[])[0]!.nodes as JsonObject[])[0]!.routeSignatures = signed;
    const verdict = await checkAutomationStudioFlowBootstrapCompletion({ result: { summary: "Scrape the products", plan }, projectId: "project.1", flowId: "flow.1", registry, resolution });
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.buildPlan.plan.subflows[0]?.nodes.some((node) => "routeSignatures" in node)).toBe(false);
  });
});
