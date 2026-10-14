// A project build whose builder leaves a lasting act, through the actual
// service (t551): a scripted model plays the supervisor, the builder and the
// reset agent; a stub domain is a recipe site where "Save" puts a recipe in
// the person's box and "Unsave" takes it out, every lasting press put to the
// permission check first with the item its control sits in. The box held one
// recipe before the build.
//
// The supervisor's whole trial is refused while the builder's save is still
// on the site; a reset brief then undoes exactly that act -- never the recipe
// that was there before -- and comes back done; only then does the whole trial
// run, and the Flow is proposed. The act is in the build record.
//
// The second case is the shape a reset could not undo before builders' acts
// were placed: a shop's "Add to cart", a control in no item, adds a line to the
// cart drawer on the product page. The builder's press is read around in place,
// so the line it created is the act's own; the reset removes that line, and the
// line the cart held before the build is kept. The reset agent's first
// request already names that act as its task, how it was done and the page it
// was made on, in place of the person's build instruction (t585).
//
// In both, the builder makes its act after its own subflow trial passed: a
// builder's trial now undoes the build's acts first (t578), so an act made
// before it would be undone there, not left for the supervisor's whole trial.

import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { ProgramJsonStore } from "../../../../../_shared/storage.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { AutomationStudioActionConsequence, AutomationStudioActionDeclaration, AutomationStudioActionPermissionCheck } from "../../../action-permissions/index.ts";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { automationStudioActivityHub } from "../../../activity/index.ts";
import { parseAutomationStudioFlowBootstrapGenerationError } from "../../../flow-bootstrap/index.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS, AutomationStudioSiteResetLedger } from "../../../flow-bootstrap/site-reset/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../../llm/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AutomationStudioService, type AutomationStudioServiceOptions } from "../../../service.ts";
import { blankFixture, caller, judgeReply, mockProvider } from "../../../tests/service-bootstrap/tests/fixtures.ts";

vi.setConfig({ testTimeout: 60_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

/** The fixture instruction's words (`blankFixture`). */
const TASK = "Create a deterministic Start to End Flow.";
const START_END = {
  nodes: [{ key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" }, { key: "end", definitionId: "builtin.control.end", definitionVersion: "1.0.0" }],
  edges: [{ key: "start_end", source: { nodeKey: "start", portId: "next" }, target: { nodeKey: "end", portId: "in" } }]
};
const ROUTER = { name: "Main", rules: [], fallback: { kind: "subflow", targetSubflowKey: "main" } };

type Entry = { callId: string; toolId: string; value: unknown };
const lastOf = (evidence: readonly Entry[], toolId: string) => [...evidence].reverse().find((entry) => entry.toolId === toolId)?.value as JsonObject | undefined;
const decision = (decided: JsonObject) => ({ response: { kind: "evidence_tool_decision", summary: "Scripted", decision: decided }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.0001 } });

const PLAN = {
  taskSpec: { parts: [{ id: "p1", quote: { sourceId: "instruction.build", text: TASK }, goalFacts: ["The Flow runs from its start to its end"], lastingActs: ["create_new"] }], notAsked: [] },
  subflows: [{ key: "main", name: "Main", parts: ["p1"] }]
};
const BUILD_BRIEF = { kind: "build", subflowKey: "main", parts: ["p1"], entry: { caseId: "observed-current", predecessors: [] }, allowanceUsd: 0.01, maxIterations: 12, permittedActs: ["create_new"] };
const RESET_BRIEF = { kind: "reset", subflowKey: "main", parts: [], entry: { caseId: "observed-current", predecessors: [] }, allowanceUsd: 0.005, maxIterations: 4 };
const SUBMISSION = { summary: "Build the main subflow", plan: { schemaVersion: "0.1", router: ROUTER, subflows: [{ key: "main", name: "Main", role: "primary", ...START_END }] } };

/** The build record's main file, read off disk as a restarted Core would find it. */
async function storedRecord(dataDir: string): Promise<JsonObject> {
  const files = (await readdir(dataDir, { recursive: true })).map((file) => file.toString()).filter((file) => file.split(path.sep).includes("project-builds") && path.basename(file) === "build.json");
  expect(files).toHaveLength(1);
  return await new ProgramJsonStore<JsonObject>(path.join(dataDir, files[0]!), () => ({})).read();
}

/** What the supervisor ends with when its reset could not undo the save (t590). */
const ENDED_REASON = "The saved recipe could not be taken out of the box again.";

/**
 * The supervisor's script, the same in both cases: plan, build, assemble, test
 * (refused), reset, test, complete. With `ends`: plan, build, a reset that
 * undoes nothing, then an honest ending.
 */
function supervisorDecision(step: number, evidence: readonly Entry[], ends = false): JsonObject {
  const assembled = lastOf(evidence, "project.assemble")?.complete as JsonObject | undefined;
  if (ends) {
    if (step === 1) return { kind: "tool_call", callId: "plan", toolId: "project.write_plan", input: PLAN };
    if (step === 2) return { kind: "tool_call", callId: "dispatch", toolId: "project.dispatch", input: { reason: "Build the one subflow.", briefs: [BUILD_BRIEF] } };
    if (step === 3) return { kind: "tool_call", callId: "reset", toolId: "project.dispatch", input: { reason: "Put the site back before ending.", briefs: [RESET_BRIEF] } };
    return { kind: "complete", result: { ended: "blocked", reason: ENDED_REASON } };
  }
  switch (step) {
    case 1: return { kind: "tool_call", callId: "plan", toolId: "project.write_plan", input: PLAN };
    case 2: return { kind: "tool_call", callId: "dispatch", toolId: "project.dispatch", input: { reason: "Build the one subflow.", briefs: [BUILD_BRIEF] } };
    case 3: return { kind: "tool_call", callId: "assemble", toolId: "project.assemble", input: {} };
    case 4: return { kind: "tool_call", callId: "test.1", toolId: "core.test_candidate", input: assembled ?? {} };
    case 5: return { kind: "tool_call", callId: "reset", toolId: "project.dispatch", input: { reason: "Put the site back before the whole test.", briefs: [RESET_BRIEF] } };
    case 6: return { kind: "tool_call", callId: "test.2", toolId: "core.test_candidate", input: assembled ?? {} };
    default: return { kind: "complete", result: assembled ?? {} };
  }
}

async function recipeBuild(options: { ends?: boolean } = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-project-build-reset-"));
  /** The person's recipe box: one recipe was there before the build. */
  const box = new Set(["recipe:lentil-soup"]);
  const pressed: string[] = [];
  const boxWhenWholeJudged: string[][] = [];
  const supervisorSaw: Record<number, readonly Entry[]> = {};
  let supervisorDecisions = 0;
  const provider = mockProvider(async (request) => {
    const loop = request.context.evidenceLoop;
    if (request.taskKind === "loop_verification") {
      const scoped = JSON.stringify(request.context).includes("This trial ran only the subflow");
      if (!scoped) boxWhenWholeJudged.push([...box]);
      return judgeReply("yes");
    }
    const evidence = (loop?.evidence ?? []) as Entry[];
    const tools = (loop?.tools ?? []).map((tool) => tool.toolId);
    // The instruction's own read: no answer, so nothing it asks for is read as lasting or not.
    if (!tools.length) return decision({ kind: "tool_call", callId: "read", toolId: "none", input: {} });
    if (tools.includes("project.write_plan")) {
      supervisorDecisions += 1;
      supervisorSaw[supervisorDecisions] = evidence.map((entry) => ({ ...entry }));
      return decision(supervisorDecision(supervisorDecisions, evidence, options.ends));
    }
    const properties = (loop!.completionSchema.properties ?? {}) as JsonObject;
    if (properties.summary !== undefined && properties.subflowKey === undefined) {
      // The reset agent: undo the build's own save, named by its act, then complete; where the build ends instead, it finds no way to.
      if (options.ends) return decision({ kind: "tool_call", callId: `look.${evidence.length}`, toolId: "inspect", input: { at: evidence.length } });
      if (!lastOf(evidence, "press")) return decision({ kind: "tool_call", callId: "undo.save", toolId: "press", input: { control: "Unsave", item: "recipe:herb-bread", undoes: "act-1" } });
      return decision({ kind: "complete", result: { summary: "The recipe this build saved is out of the box again." } });
    }
    const subflowKey = (properties.subflowKey as JsonObject | undefined)?.const as string;
    const submitted = lastOf(evidence, "core.submit_subflow");
    const tested = lastOf(evidence, "core.test_subflow");
    if (submitted?.ok !== true) return decision({ kind: "tool_call", callId: "submit", toolId: "core.submit_subflow", input: SUBMISSION });
    if (tested?.verdict !== "yes") return decision({ kind: "tool_call", callId: "test", toolId: "core.test_subflow", input: { revision: submitted.revision as number, digest: submitted.digest as string } });
    // The save comes after the builder's own passing trial, which would otherwise have it undone first (t578), so it is still on the site for the whole trial.
    if (!lastOf(evidence, "press")) return decision({ kind: "tool_call", callId: "save", toolId: "press", input: { control: "Save", item: "recipe:herb-bread" } });
    return decision({ kind: "complete", result: { subflowKey, revision: submitted.revision as number, digest: submitted.digest as string } });
  });
  const serviceOptions: AutomationStudioServiceOptions = {
    dataDir, llmProviderResolver: () => ({ provider, maxCallsPerRun: 80, maxEstimatedCostUsd: 0.1 }),
    llmEvidenceRuntime: {
      domainId: "isolated", deniedEvidenceKeys: [],
      tools: [
        { toolId: "inspect", description: "Inspect", inputSchema: { type: "object" }, effect: "observe" },
        { toolId: "press", description: "Press a control on one recipe", inputSchema: { type: "object", properties: { control: { type: "string" }, item: { type: "string" } } }, effect: "mutate" }
      ],
      executeTool: async (call: { toolId: string; value: JsonObject; permission?: AutomationStudioActionPermissionCheck }) => {
        if (call.toolId !== "press") return { kind: "llm_evidence_tool_execution", evidence: { box: [...box] }, effectApplied: false, targetsUnchanged: true };
        const control = String(call.value.control);
        const item = String(call.value.item);
        // As a real domain does, the lasting press is put to the gate first, with the item its control sits in.
        const declaration: AutomationStudioActionDeclaration = { consequences: control === "Save" ? ["create_new"] : ["modify_existing"], control: { name: control, kind: "button", item }, verb: "press", effect: "mutate" };
        const verdict = await call.permission!(declaration);
        if (!verdict.permitted) return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "permission_required" }, effectApplied: false, targetsUnchanged: true };
        pressed.push(`${control} ${item}`);
        if (control === "Save") box.add(item);
        else box.delete(item);
        return { kind: "llm_evidence_tool_execution", evidence: { ok: true, box: [...box] }, effectApplied: true, targetsUnchanged: false };
      }
    } as unknown as NonNullable<AutomationStudioServiceOptions["llmEvidenceRuntime"]>
  };
  const service = new AutomationStudioService(serviceOptions);
  cleanups.push(async () => {
    await service.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const { project, flow } = await blankFixture(service);
  const record = () => storedRecord(dataDir);
  return {
    box, pressed, boxWhenWholeJudged, supervisorSaw, record,
    build: () => service.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, caller: caller(), evidenceGuided: true, authoringMode: "project" })
  };
}

describe("a project build whose builder leaves a lasting act", () => {
  it("refuses the whole trial until a reset brief undoes exactly the build's act, then runs it and proposes the Flow", async () => {
    const run = await recipeBuild();
    const result = await run.build();
    if (result.status !== "proposed") throw new Error(`expected a proposal, got ${JSON.stringify(result)}`);

    // The first whole trial was refused, naming the builder's act still on the site.
    expect(lastOf(run.supervisorSaw[5]!, "core.test_candidate")).toMatchObject({ ok: false, code: "project.trial_reset_required", actsInPlace: [{ act: "act-1" }] });
    // The reset brief came back done, and nothing of the build was left in place.
    expect(lastOf(run.supervisorSaw[6]!, "project.dispatch")).toMatchObject({ ok: true, returns: [{ outcome: "done" }], lastingActsInPlace: 0 });
    // It pressed only the build's own recipe: the one saved before the build is still in the box.
    expect(run.pressed).toEqual(["Save recipe:herb-bread", "Unsave recipe:herb-bread"]);
    expect([...run.box]).toEqual(["recipe:lentil-soup"]);
    // The whole trial ran once, after the reset, on the site as the build found it: a first answer and its confirmation.
    expect(run.boxWhenWholeJudged).toEqual([["recipe:lentil-soup"], ["recipe:lentil-soup"]]);
    expect(lastOf(run.supervisorSaw[7]!, "core.test_candidate")).toMatchObject({ verdict: "yes" });

    // The builder's act is in the build record, with the class it declared (the control's name withheld, as the model was never shown it).
    const stored = await run.record();
    expect(stored.lastingActs).toEqual([{ recordedAt: expect.any(Number), act: "act-1", owner: { role: "builder", briefId: expect.any(String) }, consequences: ["create_new"], description: "act-1: press button", undoable: true }]);
  });

  // A failed build's chat said nothing of what the supervisor's ending names still on the target (t586, t590).
  it("tells the person, when it ends with the save still in the box, what is still on the target in Core's words, its failure code its own", async () => {
    const run = await recipeBuild({ ends: true });
    const seen: ClientGatewayActivity[] = [];
    const unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
    const failure = await run.build().then(() => undefined, (error: unknown) => error).finally(unsubscribe);
    const diagnostic = parseAutomationStudioFlowBootstrapGenerationError(failure);
    const reason = ((await run.record()).ending as JsonObject).reason as string;
    expect(reason.startsWith(`${ENDED_REASON} Still on the target from this build: `)).toBe(true);
    const note = reason.slice(ENDED_REASON.length + 1);
    expect(diagnostic).toMatchObject({ code: "flow_bootstrap.post_provider_validation_failed", issueCodes: ["project.build_blocked"] });
    const told = seen.find((event) => event.detail?.title === "The supervisor ended the build: it could not finish the Flow.");
    expect(told?.detail).toMatchObject({ kind: "note", status: "failed", text: note });
    // The model's own words reach the record, never the person.
    expect(JSON.stringify(seen)).not.toContain(ENDED_REASON);
    expect([...run.box]).toEqual(["recipe:lentil-soup", "recipe:herb-bread"]);
  });

  it("undoes a cart line a builder's press on an item-less control added, and keeps the line that was there before", async () => {
    const run = await cartBuild();
    const result = await run.build();
    if (result.status !== "proposed") throw new Error(`expected a proposal, got ${JSON.stringify(result)}`);

    expect(lastOf(run.supervisorSaw[5]!, "core.test_candidate")).toMatchObject({ ok: false, code: "project.trial_reset_required", actsInPlace: [{ act: "act-1" }] });
    expect(lastOf(run.supervisorSaw[6]!, "project.dispatch")).toMatchObject({ ok: true, returns: [{ outcome: "done" }], lastingActsInPlace: 0 });
    // The add, then the removal of the very line it created; the domain never saw `undoes`.
    expect(run.acted).toEqual(["add herb-tea", "remove herb-tea"]);
    expect(run.inputs.every((value) => !Object.prototype.hasOwnProperty.call(value, "undoes"))).toBe(true);
    expect(run.cart).toEqual(["dish-soap"]);
    expect(run.cartWhenWholeJudged).toEqual([["dish-soap"], ["dish-soap"]]);
    // From its first decision the reset was told its task, not the person's: the act, how it was done, and its page.
    const task = run.resetFirstInstructions();
    expect(task).toContain("This brief is a reset, not a build");
    expect(task).toContain("act-1: ");
    expect(task).toContain(`made on the page ${PRODUCT_PAGE}`);
    expect(task).not.toContain(TASK);
    const stored = await run.record();
    expect(stored.lastingActs).toMatchObject([{ act: "act-1", owner: { role: "builder" }, consequences: ["create_new"], undoable: true }]);
  });
});

const PRODUCT_PAGE = "https://shop.test/product/herb-tea";
const ADD = "domain.example.add-to-cart";
const REMOVE = "domain.example.remove-line";
const GO = "domain.example.go";

function shopNode(id: string, label: string, parameters: AutomationStudioNodeDefinition["parameters"]): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1", id, version: "1.0.0", label, description: `${label} in the shop.`, category: "action",
    source: { kind: "importer", domainId: "example", packageId: "example.shop", implementationKey: id },
    availability: { kind: "domain", domainId: "example" }, requiredRuntimeCapabilities: ["example.actions"], capabilities: { executable: true, codeBacked: true },
    inputs: [{ id: "in", label: "In", valueType: "any", required: false }], outputs: [{ id: "success", label: "Success", valueType: "any" }], parameters,
    outputAction: { fixedOutputId: id }
  };
}

function shopRuntime() {
  const nodes = [
    shopNode(ADD, "Add to cart", []),
    shopNode(REMOVE, "Remove cart line", [{ id: "line", label: "Line", valueType: "string", required: true }]),
    shopNode(GO, "Go to page", [{ id: "to", label: "To", valueType: "string", required: true }])
  ];
  return new AutomationStudioNativeNodeRuntime({ permissions: [], runtimeCapabilities: ["example.actions"] }).register(
    { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "example.shop", packageVersion: "1.0.0", domainId: "example", nodes },
    { packageId: "example.shop", packageVersion: "1.0.0", implementations: Object.fromEntries(nodes.map((definition) => [definition.id, () => ({ status: "success", route: "success", outputs: { success: true } })])) }
  );
}

/**
 * A product page with the cart drawer open: the drawer lists the cart's lines,
 * each by its own item token. "Add to cart" sits in no item; each line's
 * Remove sits in its line. Every lasting press is put to the gate first.
 */
function shopDomain(cart: string[]) {
  const inputs: JsonObject[] = [];
  const acted: string[] = [];
  const read = () => ({ lines: cart.map((line) => `line ${line}`), items: cart.map((line) => `line:${line}`) });
  const binding: AutomationStudioLlmEvidenceRuntimeBinding = {
    domainId: "example",
    deniedEvidenceKeys: [],
    tools: [{ toolId: "shop.look", description: "Look at the page.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } }],
    runsNodes: { arrival: { node: GO, parameter: "to" } },
    startState: async (input: { start?: JsonObject }) => {
      const now = read();
      const was = Array.isArray(input.start?.lines) ? (input.start!.lines as string[]) : undefined;
      const gone = was ? was.filter((line) => !now.lines.includes(line)) : [];
      const added = was ? now.lines.filter((line) => !was.includes(line)) : [];
      return { state: { lines: now.lines }, differs: [...gone.map((line) => `gone: ${line}`), ...added.map((line) => `new: ${line}`)], location: PRODUCT_PAGE, lines: { gone, added }, items: now.items };
    },
    executeTool: async ({ toolId, value, permission }) => {
      inputs.push(structuredClone(value));
      if (toolId === "shop.look") return { kind: "llm_evidence_tool_execution", evidence: { page: "Herb tea", cart: [...cart], controls: ["Add to cart", "Remove"] }, effectApplied: false };
      const parameters = (value.parameters ?? {}) as JsonObject;
      if (value.node === GO) return { kind: "llm_evidence_tool_execution", evidence: { ok: true, at: String(parameters.to) }, effectApplied: true };
      const line = typeof parameters.line === "string" ? parameters.line : undefined;
      const consequences = (Array.isArray(value.consequences) ? value.consequences : []) as AutomationStudioActionConsequence[];
      const declaration: AutomationStudioActionDeclaration = { consequences, control: { name: value.node === ADD ? "Add to cart" : "Remove", kind: "button", ...(line ? { item: `line:${line}` } : {}) }, verb: "press", effect: "mutate" };
      const verdict = await permission!(declaration);
      if (!verdict.permitted) return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "permission_required" }, effectApplied: false };
      if (value.node === ADD) {
        cart.push("herb-tea");
        acted.push("add herb-tea");
      } else if (line) {
        cart.splice(cart.indexOf(line), 1);
        acted.push(`remove ${line}`);
      }
      return { kind: "llm_evidence_tool_execution", evidence: { ok: true, cart: [...cart] }, effectApplied: true };
    }
  };
  return { binding, inputs, acted };
}

/** One decision of the reset agent: its decisions so far (this one counted), and what it sees. */
type ResetScript = (n: number, evidence: readonly Entry[]) => JsonObject;

/** The reset agent of the cases above: remove the line the build added, naming its act, then complete. */
const UNDO_THE_ADD: ResetScript = (n) => n === 1
  ? { kind: "tool_call", callId: "undo.add", toolId: "core.run_node", input: { node: REMOVE, parameters: { line: "herb-tea" }, consequences: ["delete"], undoes: "act-1" } }
  : { kind: "complete", result: { summary: "The line this build added is out of the cart again." } };

async function cartBuild(resetScript: ResetScript = UNDO_THE_ADD, options: { startLocation?: string } = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-project-build-cart-"));
  /** The cart held dish soap before the build. */
  const cart = ["dish-soap"];
  const cartWhenWholeJudged: string[][] = [];
  const supervisorSaw: Record<number, readonly Entry[]> = {};
  let supervisorDecisions = 0;
  /** The instructions of the reset agent's first request. */
  let resetFirst: string | undefined;
  let resetDecisions = 0;
  /** What the reset agent was offered and saw, at its latest request. */
  const resetSaw: { tools: Array<{ toolId: string; inputSchema: JsonObject }>; completion: JsonObject; evidence: Entry[] } = { tools: [], completion: {}, evidence: [] };
  /** The builder's run-node tool, as it was offered. */
  let builderRunNode: JsonObject | undefined;
  const provider = mockProvider(async (request) => {
    if (request.metadata?.source === "instructionAuthority") return decision({ kind: "tool_call", callId: "read", toolId: "none", input: {} });
    if (request.taskKind === "loop_verification") {
      if (!JSON.stringify(request.context).includes("This trial ran only the subflow")) cartWhenWholeJudged.push([...cart]);
      return judgeReply("yes");
    }
    const loop = request.context.evidenceLoop!;
    const evidence = loop.evidence as Entry[];
    const tools = loop.tools.map((tool) => tool.toolId);
    if (tools.includes("project.write_plan")) {
      supervisorDecisions += 1;
      supervisorSaw[supervisorDecisions] = evidence.map((entry) => ({ ...entry }));
      return decision(supervisorDecision(supervisorDecisions, evidence));
    }
    const properties = (loop.completionSchema.properties ?? {}) as JsonObject;
    const ranNode = lastOf(evidence, "core.run_node");
    if (properties.summary !== undefined && properties.subflowKey === undefined) {
      resetFirst ??= JSON.stringify(request.context.instructions);
      resetDecisions += 1;
      Object.assign(resetSaw, { tools: structuredClone(loop.tools), completion: structuredClone(loop.completionSchema), evidence: evidence.map((entry) => structuredClone(entry)) });
      return decision(resetScript(resetDecisions, evidence));
    }
    builderRunNode ??= structuredClone(loop.tools.find((tool) => tool.toolId === "core.run_node")?.inputSchema) as JsonObject | undefined;
    const subflowKey = (properties.subflowKey as JsonObject | undefined)?.const as string;
    const submitted = lastOf(evidence, "core.submit_subflow");
    const tested = lastOf(evidence, "core.test_subflow");
    if (submitted?.ok !== true) return decision({ kind: "tool_call", callId: "submit", toolId: "core.submit_subflow", input: SUBMISSION });
    if (tested?.verdict !== "yes") return decision({ kind: "tool_call", callId: "test", toolId: "core.test_subflow", input: { revision: submitted.revision as number, digest: submitted.digest as string } });
    // After its own passing trial, as in the case above (t578).
    if (!ranNode) return decision({ kind: "tool_call", callId: "add", toolId: "core.run_node", input: { node: ADD, parameters: {}, consequences: ["create_new"] } });
    return decision({ kind: "complete", result: { subflowKey, revision: submitted.revision as number, digest: submitted.digest as string } });
  });
  const domain = shopDomain(cart);
  const service = new AutomationStudioService({ dataDir, llmProviderResolver: () => ({ provider, maxCallsPerRun: 80, maxEstimatedCostUsd: 0.1 }), llmEvidenceRuntime: domain.binding });
  service.bindNativeNodeRuntime(shopRuntime());
  cleanups.push(async () => {
    await service.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const { project, flow } = await blankFixture(service, "active", "example");
  return {
    cart, cartWhenWholeJudged, supervisorSaw, acted: domain.acted, inputs: domain.inputs, record: () => storedRecord(dataDir), resetFirstInstructions: () => resetFirst ?? "", resetSaw, builderRunNode: () => builderRunNode,
    build: () => service.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, caller: caller(), evidenceGuided: true, authoringMode: "project", ...(options.startLocation ? { startLocation: options.startLocation } : {}) })
  };
}

// t593, A8 bigbox `run-mv8c7unr-42a8456d`: the whole trial never went to the build's start location. A build told where it
// starts assembles a Flow whose router-run subflow opens with the arrival, after its Start, so the whole trial -- and a run of
// the saved Flow on its own -- loads the start location first, and the whole trial says so.
describe("a project build told where it starts", () => {
  it("assembles a Flow that loads the start location first, and its whole trial says it did", async () => {
    const start = "https://shop.test/";
    const run = await cartBuild(UNDO_THE_ADD, { startLocation: start });
    const result = await run.build();
    if (result.status !== "proposed") throw new Error(`expected a proposal, got ${JSON.stringify(result)}`);
    const judged = lastOf(run.supervisorSaw[7]!, "core.test_candidate")!;
    expect(judged).toMatchObject({ verdict: "yes" });
    const feedback = judged.feedback as JsonObject;
    // The first step after the Start is the arrival, to the start location.
    const steps = (feedback.steps as JsonObject[]).filter((step) => step.definitionId !== "builtin.control.start");
    expect(steps[0]).toMatchObject({ definitionId: GO, status: "succeeded" });
    expect(feedback.phaseStart).toMatchObject({ phase: "whole_trial", startHook: "none", arrival: "loaded", standsOn: `the build's start location (${start})` });
    // The reset's own start told it what was still on the site.
    expect(run.resetSaw.evidence[0]?.value).toMatchObject({ phaseStart: { phase: "reset", startHook: "none", stillOnSite: [{ act: "act-1" }] } });
  });
});

// A reset is a reset in every word it is shown (t591, social debug fixes 2-4).
// Its run-node tool offers `undoes` and no `write`. A lasting press of its own
// that names no act runs, and is told as outside the reset; an act the site
// offers no control to reverse is named under `cannotUndo` once the reset was
// asked for it, and the reset comes back done with that act kept. An undo aimed
// at another item's control is refused in the reset's words, never "test
// again".
describe("a reset brief", () => {
  it("offers undoes and no write, tells its own lasting press as outside it, and ends done with the acts it names under cannotUndo kept", async () => {
    const kept = vi.spyOn(AutomationStudioSiteResetLedger.prototype, "beforeTrial");
    cleanups.push(async () => kept.mockRestore());
    const run = await cartBuild((n) => {
      if (n === 1) return { kind: "tool_call", callId: "extra.add", toolId: "core.run_node", input: { node: ADD, parameters: {}, consequences: ["create_new"] } };
      if (n === 2) return { kind: "complete", result: { summary: "Nothing here can be undone." } };
      return { kind: "complete", result: { summary: "The site offers no control that takes these back.", cannotUndo: ["act-1", "act-2"] } };
    });
    await run.build().catch(() => undefined);

    // Its run-node tool: undoes, and no write; the builder's still had write.
    const runNode = run.resetSaw.tools.find((tool) => tool.toolId === "core.run_node")!.inputSchema.properties as JsonObject;
    expect(runNode).toHaveProperty("undoes");
    expect(runNode).not.toHaveProperty("write");
    expect((run.builderRunNode()!.properties as JsonObject)).toHaveProperty("write");
    expect((run.resetSaw.completion.properties as JsonObject)).toHaveProperty("cannotUndo");

    // Its own add ran, as no gate asks about creating, and was told as outside the reset.
    expect(run.acted).toEqual(["add herb-tea", "add herb-tea"]);
    const extra = run.resetSaw.evidence.find((entry) => entry.callId === "extra.add")!.value as JsonObject;
    expect(extra).toMatchObject({ ok: true, outsideBrief: { consequences: ["create_new"] } });
    expect((extra.outsideBrief as JsonObject).note).toContain("outside this reset");
    expect((extra.outsideBrief as JsonObject).note).not.toContain("subflow");

    // Its first completion was refused with both acts; the second named them under cannotUndo, which reached the ledgers, and it came back done.
    expect(JSON.stringify(run.resetSaw.evidence)).toContain("project.reset_acts_in_place");
    expect(kept.mock.calls.some((call) => JSON.stringify(call[1]) === JSON.stringify(["act-1", "act-2"]))).toBe(true);
    expect(lastOf(run.supervisorSaw[6]!, "project.dispatch")).toMatchObject({ ok: true, returns: [{ outcome: "done" }], lastingActsInPlace: 0 });
    // Kept, not undone: both lines are still in the cart.
    expect(run.cart.filter((line) => line === "herb-tea")).toHaveLength(2);
  });

  it("refuses an undo aimed at another item in a reset's words: undo another act or name it under cannotUndo, never test again", async () => {
    const run = await cartBuild((n) => n === 1
      ? { kind: "tool_call", callId: "undo.wrong", toolId: "core.run_node", input: { node: REMOVE, parameters: { line: "dish-soap" }, consequences: ["delete"], undoes: "act-1" } }
      : { kind: "complete", result: { summary: "The act this build made cannot be undone here." } });
    await run.build().catch(() => undefined);

    const refused = run.resetSaw.evidence.find((entry) => entry.callId === "undo.wrong")!.value as JsonObject;
    expect(refused).toMatchObject({ ok: false, code: "candidate.undo_wrong_target", act: "act-1" });
    expect(refused.instruction).toBe(AUTOMATION_STUDIO_SITE_RESET_WORDS.wrongTarget("reset"));
    expect(refused).not.toHaveProperty("outsideBrief");
    // The dish soap the cart held before the build was never touched.
    expect(run.acted).toEqual(["add herb-tea"]);
    expect(run.cart).toEqual(["dish-soap", "herb-tea"]);
    expect(lastOf(run.supervisorSaw[6]!, "project.dispatch")).toMatchObject({ ok: true, returns: [{ outcome: "done" }], lastingActsInPlace: 0 });
  });
});
