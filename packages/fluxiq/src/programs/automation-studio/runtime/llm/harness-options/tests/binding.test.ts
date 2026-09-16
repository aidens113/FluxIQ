import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioNodeRegistryResolution } from "../../../../nodes/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../evidence-loop.ts";
import { automationStudioHarnessOptionBundleFromBinding, automationStudioHarnessOptionRegistry, type AutomationStudioLlmEvidenceRuntimeBinding } from "../binding.ts";
import { AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS } from "../builtin.ts";
import type { AutomationStudioHarnessOptionHost } from "../host.ts";
import type { AutomationStudioHarnessOptionResolution } from "../registry.ts";

const DOMAIN_ID = "erp-ledger";
const SCOPE: AutomationStudioHarnessOptionResolution = { scope: { kind: "domain", domainId: DOMAIN_ID } };

function slot(executeTool = vi.fn(async () => ({ observed: true }))): AutomationStudioLlmEvidenceRuntimeBinding {
  return {
    domainId: DOMAIN_ID,
    // Declared rather than omitted, because an omitted declaration is a domain
    // silently denying nothing. This is the shape the field is about to become
    // required in; the fixtures under runtime/tests are the rest of that change.
    deniedEvidenceKeys: ["ledgerExport"],
    tools: [
      { toolId: "erp.inspect", description: "Read the ledger records in view.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } },
      { toolId: "erp.advance", description: "Advance to the next accounting period.", inputSchema: { type: "object" }, effect: "mutate" }
    ],
    executeTool
  };
}

const host: AutomationStudioHarnessOptionHost = { describeFlowGraph: async () => ({ nodes: [] }) };

describe("Automation Studio harness option binding", () => {
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
    expect(executeTool).toHaveBeenNthCalledWith(1, { projectId: "project.one", flowId: "flow.one", callId: "initial.erp.inspect", toolId: "erp.inspect", value: {}, maxEvidenceBytes: expect.any(Number) });
    expect(executeTool).toHaveBeenNthCalledWith(2, { projectId: "project.one", flowId: "flow.one", callId: "call.1", toolId: "erp.advance", value: { to: "2026-10" }, maxEvidenceBytes: expect.any(Number) });
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
