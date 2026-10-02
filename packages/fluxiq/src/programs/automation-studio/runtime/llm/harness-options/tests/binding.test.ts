import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioNodeRegistryResolution } from "../../../../nodes/index.ts";
import { runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceToolExecutionResult } from "../../evidence-loop.ts";
import { automationStudioLlmNodeDescriptions } from "../../node-tools/index.ts";
import { automationStudioHarnessOptionBundleFromBinding, automationStudioHarnessOptionRegistry, type AutomationStudioLlmEvidenceRuntimeBinding } from "../binding.ts";
import { AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS } from "../builtin.ts";
import type { AutomationStudioHarnessOptionHost } from "../host.ts";
import type { AutomationStudioHarnessOptionResolution } from "../registry.ts";

const DOMAIN_ID = "erp-ledger";
const SCOPE: AutomationStudioHarnessOptionResolution = { scope: { kind: "domain", domainId: DOMAIN_ID } };

function slot(executeTool = vi.fn(async () => ({ observed: true }))): AutomationStudioLlmEvidenceRuntimeBinding {
  return {
    domainId: DOMAIN_ID,
    // Declared rather than omitted, because an omitted declaration was a domain
    // silently denying nothing. The field is now required, and the assertion
    // below is what holds it required.
    deniedEvidenceKeys: ["ledgerExport"],
    tools: [
      { toolId: "erp.inspect", description: "Read the ledger records in view.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } },
      { toolId: "erp.advance", description: "Advance to the next accounting period.", inputSchema: { type: "object" }, effect: "mutate" }
    ],
    executeTool
  };
}

const host: AutomationStudioHarnessOptionHost = { describeFlowGraph: async () => ({ nodes: [] }) };

// A binding that declares no denied keys does not compile. This is the half of
// the protection that cannot be argued with at run time: a domain which forgets
// the field never reaches a packet, because it never builds. The run-time half,
// for a harness input assembled by hand, is in llm/tests/harness.test.ts.
// @ts-expect-error -- deniedEvidenceKeys is required on the binding.
const UNDECLARED_BINDING: AutomationStudioLlmEvidenceRuntimeBinding = {
  domainId: DOMAIN_ID,
  tools: [],
  executeTool: async () => ({})
};
void UNDECLARED_BINDING;

describe("Automation Studio harness option binding", () => {
  it("offers the model only the nodes the domain said it runs", async () => {
    // The defect this holds shut: the names offered were the whole registry for
    // the build's resolution, and Core's own built-ins are available in every
    // scope, so a web build was handed builtin.control.for-each and friends
    // inside a closed enum and told to copy one exactly. Every call naming one
    // went to the domain, which runs its own nodes and refuses the rest, so the
    // model was offered choices whose only possible answer was a refusal — and
    // a live build spent fourteen of them (`run-mug776kx-0214b287`).
    const registry = automationStudioHarnessOptionRegistry({
      binding: { ...slot(), runsNodes: { runnable: ["erp.output.post-entry", "erp.output.read-ledger"] } },
      nodeIds: ["builtin.control.for-each", "builtin.data.filter-list", "erp.output.post-entry", "erp.output.read-ledger"]
    });
    const options = registry.list({ ...SCOPE, allowSideEffectsWithoutPolicy: true });
    const runNode = options.find((option) => option.toolId === "core.run_node");
    expect(runNode).toBeDefined();
    const node = (runNode?.inputSchema as { properties?: { node?: { enum?: string[] } } }).properties?.node;
    expect(node?.enum).toEqual(["erp.output.post-entry", "erp.output.read-ledger"]);
  });

  it("offers every registry name to a domain that names no runnable set", async () => {
    // Absent, the declaration changes nothing: a domain that runs whatever Core
    // can resolve keeps the behaviour it had.
    const registry = automationStudioHarnessOptionRegistry({
      binding: { ...slot(), runsNodes: {} },
      nodeIds: ["builtin.control.for-each", "erp.output.post-entry"]
    });
    const options = registry.list({ ...SCOPE, allowSideEffectsWithoutPolicy: true });
    const node = (options.find((option) => option.toolId === "core.run_node")?.inputSchema as { properties?: { node?: { enum?: string[] } } }).properties?.node;
    expect(node?.enum).toEqual(["builtin.control.for-each", "erp.output.post-entry"]);
  });

  it("keeps a host's existing slot working and puts Core's options beside it", async () => {
    const executeTool = vi.fn(async () => ({ observed: true }));
    const registry = automationStudioHarnessOptionRegistry({ host, binding: slot(executeTool) });
    const resolution: AutomationStudioHarnessOptionResolution = { ...SCOPE, allowSideEffectsWithoutPolicy: true };

    expect(registry.tools(resolution).map((tool) => tool.toolId))
      .toEqual([AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS.flowGraph, "erp.inspect", "erp.advance"]);

    const binding = registry.evidenceLoopBinding({ projectId: "project.one", flowId: "flow.one", runId: "run.one" }, resolution);
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: binding.tools,
      executeTool: binding.executeTool,
      decide: async ({ evidence }) => (evidence.length >= 2
        ? { kind: "complete", result: { done: true } }
        : { kind: "tool_call", callId: "call.1", toolId: "erp.advance", input: { to: "2026-10" } })
    });

    expect(result).toMatchObject({ ok: true, result: { done: true } });
    // The initial observation the slot declared still runs, and the host still
    // receives exactly the request shape it received before the registry.
    expect(executeTool).toHaveBeenNthCalledWith(1, { projectId: "project.one", flowId: "flow.one", callId: "initial.erp.inspect", toolId: "erp.inspect", value: {}, permission: expect.any(Function) });
    expect(executeTool).toHaveBeenNthCalledWith(2, { projectId: "project.one", flowId: "flow.one", callId: "call.1", toolId: "erp.advance", value: { to: "2026-10" }, permission: expect.any(Function) });
  });

  it("scopes the adapted options to the binding's domain and reads their side effect off the loop's own field", () => {
    const bundle = automationStudioHarnessOptionBundleFromBinding(slot());
    expect(bundle).toMatchObject({ schemaVersion: "0.1", domainId: DOMAIN_ID });
    expect(bundle.options.map((option) => [option.toolId, option.availability, option.safety])).toEqual([
      ["erp.inspect", { kind: "domain", domainId: DOMAIN_ID }, { sideEffect: "observe" }],
      ["erp.advance", { kind: "domain", domainId: DOMAIN_ID }, { sideEffect: "mutate" }]
    ]);
    expect(Object.keys(bundle.implementations)).toEqual(["erp.inspect", "erp.advance"]);
  });

  it("withholds a mutating option until something says it may run", () => {
    const registry = automationStudioHarnessOptionRegistry({ binding: slot() });
    expect(registry.list(SCOPE).map((option) => option.toolId)).toEqual(["erp.inspect"]);
    expect(registry.list({ ...SCOPE, allowSideEffectsWithoutPolicy: true }).map((option) => option.toolId)).toEqual(["erp.inspect", "erp.advance"]);
    // Another domain's Flow sees none of it.
    expect(registry.list({ scope: { kind: "domain", domainId: "warehouse" }, allowSideEffectsWithoutPolicy: true })).toEqual([]);
  });

  it("offers the host's options to a Flow that declares no domain of its own", () => {
    // The regression this pins. Before the registry the bound slot's tools went
    // to the loop unfiltered, so a Flow whose project names no domain -- which
    // is every Flow until someone gives its project one -- could be authored
    // with evidence. Reading the binding's domain id as the Flow scope the
    // tools are for narrowed that to domain-scoped Flows alone, and every other
    // Flow got an empty tool list, which the evidence loop correctly refuses as
    // `llm_evidence_loop.invalid_configuration`. The loop was right and the
    // configuration it was handed was wrong.
    //
    // A Flow that named no domain is run by whichever host is bound, so that
    // host's options are what it has. A Flow that named a different domain is a
    // different matter and is still refused, above.
    const registry = automationStudioHarnessOptionRegistry({ binding: slot() });
    const unscopedFlow: AutomationStudioHarnessOptionResolution = { scope: { kind: "global" }, allowSideEffectsWithoutPolicy: true };
    expect(registry.tools(unscopedFlow).map((tool) => tool.toolId)).toEqual(["erp.inspect", "erp.advance"]);
  });

  it("binds nothing when the host binds nothing, exactly as before the registry existed", () => {
    const registry = automationStudioHarnessOptionRegistry({});
    expect(registry.list(SCOPE)).toEqual([]);
    expect(registry.tools(SCOPE)).toEqual([]);
  });

  it("takes the service's own optional field and node resolution unchanged", () => {
    // The shape the Flow runtime already has at the call site: a possibly
    // unbound slot and the node registry resolution it built for the node
    // catalogue. Both go straight in, so wiring the loop through the registry
    // needs no new plumbing and no cast.
    const unbound: AutomationStudioLlmEvidenceRuntimeBinding | undefined = undefined;
    expect(automationStudioHarnessOptionRegistry({ binding: unbound }).list(SCOPE)).toEqual([]);

    const nodeResolution: AutomationStudioNodeRegistryResolution = { scope: { kind: "domain", domainId: DOMAIN_ID }, runtimeCapabilities: ["state-snapshot"] };
    const bound = automationStudioHarnessOptionRegistry({ host, binding: slot() });
    const loopBinding = bound.evidenceLoopBinding({ projectId: "project.one", flowId: "flow.one" }, { ...nodeResolution, allowSideEffectsWithoutPolicy: true });
    expect(loopBinding.tools.map((tool) => tool.toolId)).toEqual([AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS.flowGraph, "erp.inspect", "erp.advance"]);
  });
});

// Where the Flow being built starts. It belongs to one build, and a binding
// outlives every build made through it, so it travels on the call rather than
// on the binding -- and it has to reach the free first look, because that look
// is where a domain says "you are not there yet" instead of trying to read a
// target nobody opened.
describe("the start location a build was told", () => {
  it("reaches the domain on every call, the initial observation included", async () => {
    const executeTool = vi.fn(async () => ({ observed: true }));
    const registry = automationStudioHarnessOptionRegistry({
      binding: slot(executeTool),
      startLocation: "http://127.0.0.1:53017/scenarios/everything-store/"
    });
    const resolution: AutomationStudioHarnessOptionResolution = { ...SCOPE, allowSideEffectsWithoutPolicy: true };

    const binding = registry.evidenceLoopBinding({ projectId: "project.one", flowId: "flow.one" }, resolution);
    await runAutomationStudioLlmEvidenceLoop({
      tools: binding.tools,
      executeTool: binding.executeTool,
      decide: async ({ evidence }) => (evidence.length >= 2
        ? { kind: "complete", result: { done: true } }
        : { kind: "tool_call", callId: "call.1", toolId: "erp.advance", input: { to: "2026-10" } })
    });

    // The slot's default mock declares no parameters, so the recorded calls are
    // read through the shape the binding is contracted to pass.
    const calls = executeTool.mock.calls as unknown as Array<[{ startLocation?: string }]>;
    expect(calls).toHaveLength(2);
    for (const [passed] of calls) expect(passed).toMatchObject({ startLocation: "http://127.0.0.1:53017/scenarios/everything-store/" });
  });

  it("is absent from the call when the build was told none, so a domain sees exactly what it saw before", async () => {
    const executeTool = vi.fn(async () => ({ observed: true }));
    const registry = automationStudioHarnessOptionRegistry({ binding: slot(executeTool) });
    const binding = registry.evidenceLoopBinding({ projectId: "project.one", flowId: "flow.one" }, { ...SCOPE, allowSideEffectsWithoutPolicy: true });

    await runAutomationStudioLlmEvidenceLoop({
      tools: binding.tools,
      executeTool: binding.executeTool,
      decide: async () => ({ kind: "complete", result: { done: true } })
    });

    const calls = executeTool.mock.calls as unknown as Array<[{ startLocation?: string }]>;
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).not.toHaveProperty("startLocation");
  });
});

// The build's described-node memory (t235): the model is shown every node by
// name, asks for the definitions it needs, and a library call that fails
// naming a node it never asked about describes that node on the way back.
describe("Automation Studio harness option binding with a described-node memory", () => {
  const AND = "builtin.logic.and";
  const LIBRARY = [AND, "builtin.logic.or"];
  const resolution: AutomationStudioHarnessOptionResolution = { ...SCOPE, allowSideEffectsWithoutPolicy: true };
  const failed = (): AutomationStudioLlmEvidenceToolExecutionResult => ({ kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "node_failed" }, effectApplied: false, resultCode: "node_failed" });
  function wired(executeTool: AutomationStudioLlmEvidenceRuntimeBinding["executeTool"]) {
    const memory = automationStudioLlmNodeDescriptions({ resolution: { scope: { kind: "global" } } });
    const registry = automationStudioHarnessOptionRegistry({ binding: { ...slot(), runsNodes: {}, executeTool }, nodeIds: LIBRARY, nodeDescriptions: memory });
    const loop = registry.evidenceLoopBinding({ projectId: "project.one", flowId: "flow.one" }, resolution);
    const run = (value: Record<string, unknown>, callId = "call.1") => loop.executeTool({ callId, toolId: "core.run_node", value: value as never });
    return { memory, registry, loop, run };
  }

  it("offers core.describe_nodes only with a memory and the library beside it", () => {
    const ids = (input: Parameters<typeof automationStudioHarnessOptionRegistry>[0]) => automationStudioHarnessOptionRegistry(input).tools(resolution).map((tool) => tool.toolId);
    const memory = automationStudioLlmNodeDescriptions({ resolution: { scope: { kind: "global" } } });
    expect(ids({ binding: { ...slot(), runsNodes: {} }, nodeIds: LIBRARY })).not.toContain("core.describe_nodes");
    expect(ids({ binding: slot(), nodeIds: LIBRARY, nodeDescriptions: memory })).not.toContain("core.describe_nodes");
    expect(ids({ binding: { ...slot(), runsNodes: {} }, nodeIds: LIBRARY, nodeDescriptions: memory })).toEqual(["erp.inspect", "erp.advance", "core.run_node", "core.describe_nodes"]);
  });

  it("describes a node through the loop binding, and the memory is the one the build holds", async () => {
    const { memory, loop } = wired(vi.fn(async () => ({ observed: true })));
    expect(await loop.executeTool({ callId: "call.1", toolId: "core.describe_nodes", value: { ids: [AND] } })).toMatchObject({ ok: true, described: [AND] });
    expect(memory.ids()).toEqual([AND]);
  });

  it("describes the node of a failed call once, and names the parameters its definition does not declare", async () => {
    const { memory, run } = wired(vi.fn(async () => failed()));
    const first = await run({ node: AND, parameters: { emptyBehavior: "true", selector: "#go" }, consequences: [] });
    expect(first).toMatchObject({ resultCode: "node_failed", evidence: { ok: false, code: "node_failed", described: `${AND} is now in flowBootstrap.describedNodes`, undeclaredParameters: ["selector"] } });
    expect(memory.ids()).toEqual([AND]);

    // Already described: no second `described`, only the pointer and the list.
    const second = await run({ node: AND, parameters: { emptyBehavior: "true" }, consequences: [] }, "call.2") as AutomationStudioLlmEvidenceToolExecutionResult;
    expect(second.evidence).toEqual({ ok: false, code: "node_failed", definition: `${AND} is in flowBootstrap.describedNodes` });
    expect(memory.ids()).toEqual([AND]);
  });

  it("explains a failure answered as bare evidence the same way", async () => {
    const { run } = wired(vi.fn(async () => ({ ok: false, code: "node_failed" })));
    expect(await run({ node: AND, parameters: { bogus: 1 }, consequences: [] })).toEqual({ ok: false, code: "node_failed", described: `${AND} is now in flowBootstrap.describedNodes`, undeclaredParameters: ["bogus"] });
  });

  it("leaves a call that worked untouched, and never refuses an undescribed node before it runs", async () => {
    const answer = { kind: "llm_evidence_tool_execution" as const, evidence: { ok: true, rows: 2 }, effectApplied: false };
    const executeTool = vi.fn(async () => answer);
    const { memory, run } = wired(executeTool);
    expect(await run({ node: AND, parameters: { bogus: 1 }, consequences: [] })).toBe(answer);
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(memory.ids()).toEqual([]);
  });

  it("passes the loop's own replays through untouched", async () => {
    const { memory, run } = wired(vi.fn(async () => failed()));
    expect(await run({ node: AND, parameters: {}, consequences: [], replay: "verify" })).toEqual(failed());
    expect(memory.ids()).toEqual([]);
  });

  it("describes the node of a call that threw, and still throws", async () => {
    const { memory, run } = wired(vi.fn(async () => { throw new Error("page gone"); }));
    await expect(run({ node: AND, parameters: {}, consequences: [] })).rejects.toThrow("page gone");
    expect(memory.ids()).toEqual([AND]);
  });
});
