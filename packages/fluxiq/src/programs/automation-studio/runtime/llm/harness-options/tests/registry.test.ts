import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioAdaptationPolicy } from "../../../../model/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../evidence-loop.ts";
import { AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS } from "../builtin.ts";
import type { AutomationStudioHarnessOptionHost } from "../host.ts";
import type { AutomationStudioHarnessOption, AutomationStudioHarnessOptionBundle } from "../option.ts";
import { AutomationStudioHarnessOptionRegistry, type AutomationStudioHarnessOptionResolution } from "../registry.ts";

const GLOBAL_SCOPE: AutomationStudioHarnessOptionResolution = { scope: { kind: "global" } };

// A domain with no web page anywhere in it: a ledger whose state is accounting
// periods and balances, and whose one mutating action opens a period. If the
// loop stops working for this, the claim that exploration is a framework
// capability rather than a web one has stopped being true.
const LEDGER_DOMAIN_ID = "erp-ledger";
const LEDGER_SCOPE: AutomationStudioHarnessOptionResolution = { scope: { kind: "domain", domainId: LEDGER_DOMAIN_ID } };

function ledgerBundle(overrides: Partial<AutomationStudioHarnessOptionBundle> = {}): AutomationStudioHarnessOptionBundle {
  const balances: AutomationStudioHarnessOption = {
    toolId: "erp.ledger_balances",
    description: "Read the account balances for the current accounting period.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    effect: "observe",
    availability: { kind: "domain", domainId: LEDGER_DOMAIN_ID },
    safety: { sideEffect: "observe" }
  };
  const openPeriod: AutomationStudioHarnessOption = {
    toolId: "erp.open_period",
    description: "Open the next accounting period so its postings become readable.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    effect: "mutate",
    availability: { kind: "domain", domainId: LEDGER_DOMAIN_ID },
    safety: { sideEffect: "mutate" }
  };
  return {
    schemaVersion: "0.1",
    domainId: LEDGER_DOMAIN_ID,
    options: [balances, openPeriod],
    implementations: {
      "erp.ledger_balances": async () => ({ period: "2026-09", accounts: [{ code: "1000", balance: 42 }] }),
      "erp.open_period": async () => ({ kind: "llm_evidence_tool_execution", evidence: { opened: "2026-10" }, effectApplied: true })
    },
    ...overrides
  };
}

function fullHost(): AutomationStudioHarnessOptionHost {
  return {
    describeFlowGraph: async () => ({ nodes: [{ nodeId: "node.one", definitionId: "definition.one" }], edges: [] }),
    describeNode: async ({ nodeId }) => ({ nodeId, parameters: { amount: 1 } }),
    listAvailableNodes: async () => ({ definitions: [{ id: "definition.one", label: "Post entry" }] }),
    captureStateSnapshot: async () => ({ stateRef: "state.after", summary: { open: true } }),
    inspectStateDiff: async ({ beforeRef, afterRef }) => ({ beforeRef, afterRef, changed: ["open"] }),
    listPriorAdaptations: async ({ limit }) => ({ limit, adaptations: [] })
  };
}

function permissivePolicy(): AutomationStudioAdaptationPolicy {
  return {
    schemaVersion: "0.1",
    policyId: "policy.one",
    scope: { kind: "flow", flowId: "flow.one" },
    preset: "adaptive",
    proposalMode: "auto",
    allowRuntimeRecovery: true,
    allowCreateRecoveryPaths: true,
    allowModifySubflows: true,
    allowCreateSubflows: true,
    allowModifyRouter: true,
    allowModifyExpectations: true,
    allowModifyActionTargets: true,
    allowDeleteOrDisableBehavior: false,
    allowExternalSideEffects: true,
    requireApprovalForDestructiveChanges: true,
    requireApprovalForExternalSideEffects: false,
    createdAt: 1,
    updatedAt: 1
  };
}

describe("Automation Studio harness option registry", () => {
  it("offers a non-browser domain's options alongside Core's own, through the real evidence loop", async () => {
    const registry = new AutomationStudioHarnessOptionRegistry({ host: fullHost() });
    registry.register(ledgerBundle());
    const resolution: AutomationStudioHarnessOptionResolution = {
      ...LEDGER_SCOPE,
      runtimeCapabilities: ["state-snapshot", "state-diff"],
      policy: permissivePolicy()
    };

    const offeredIds = registry.tools(resolution).map((tool) => tool.toolId);
    expect(offeredIds).toEqual(expect.arrayContaining([
      AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS.flowGraph,
      AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS.nodeCatalog,
      AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS.stateSnapshot,
      "erp.ledger_balances",
      "erp.open_period"
    ]));

    const binding = registry.evidenceLoopBinding({ projectId: "project.one", flowId: "flow.one" }, resolution);
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.1", toolId: AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS.flowGraph, input: {} })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.2", toolId: "erp.ledger_balances", input: {} })
      .mockResolvedValueOnce({ kind: "complete", result: { summary: "ready" } });

    const result = await runAutomationStudioLlmEvidenceLoop({ tools: binding.tools, decide, executeTool: binding.executeTool });

    expect(result).toMatchObject({ ok: true, result: { summary: "ready" } });
    expect(decide.mock.calls[2]?.[0].evidence).toEqual([
      { callId: "call.1", toolId: AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS.flowGraph, value: { nodes: [{ nodeId: "node.one", definitionId: "definition.one" }], edges: [] } },
      { callId: "call.2", toolId: "erp.ledger_balances", value: { period: "2026-09", accounts: [{ code: "1000", balance: 42 }] } }
    ]);
    // The tool list the loop saw is what the provider would be handed, so the
    // gate metadata must not have travelled with it.
    for (const tool of binding.tools) {
      expect(Object.keys(tool).every((key) => ["toolId", "description", "inputSchema", "effect", "repeatPolicy", "initialObservation"].includes(key))).toBe(true);
    }
  });

  it("lets a domain extend the Core set and never replace it", () => {
    const registry = new AutomationStudioHarnessOptionRegistry({ host: fullHost() });
    const shadow = ledgerBundle({
      options: [{
        toolId: AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS.flowGraph,
        description: "A domain's own take on reading the Flow.",
        inputSchema: { type: "object" },
        effect: "observe",
        availability: { kind: "domain", domainId: LEDGER_DOMAIN_ID },
        safety: { sideEffect: "observe" }
      }],
      implementations: { [AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS.flowGraph]: async () => ({}) }
    });
    expect(() => registry.register(shadow)).toThrow(/already registered/);

    registry.register(ledgerBundle());
    expect(() => registry.register(ledgerBundle())).toThrow(/already registered/);
  });

  it("refuses a bundle whose options are scoped to the wrong owner", () => {
    const registry = new AutomationStudioHarnessOptionRegistry();
    const globalFromDomain = ledgerBundle({
      options: [{
        toolId: "erp.ledger_balances",
        description: "Read the account balances for the current accounting period.",
        inputSchema: { type: "object" },
        effect: "observe",
        availability: { kind: "both" },
        safety: { sideEffect: "observe" }
      }],
      implementations: { "erp.ledger_balances": async () => ({}) }
    });
    expect(() => registry.register(globalFromDomain)).toThrow(/must be scoped to domain/);

    const domainFromCore = ledgerBundle();
    delete domainFromCore.domainId;
    expect(() => registry.register(domainFromCore)).toThrow(/registered as a Core option/);
  });

  it("refuses an option it cannot run and an implementation nothing declares", () => {
    const registry = new AutomationStudioHarnessOptionRegistry();
    const orphanImplementation = ledgerBundle({ implementations: { "erp.ledger_balances": async () => ({}), "erp.open_period": async () => ({}), "erp.ghost": async () => ({}) } });
    expect(() => registry.register(orphanImplementation)).toThrow(/declares no option/);

    const missingImplementation = ledgerBundle({ implementations: { "erp.ledger_balances": async () => ({}) } });
    expect(() => registry.register(missingImplementation)).toThrow(/has no implementation/);
  });

  it("rejects an option whose declared side effect contradicts what it does", () => {
    const registry = new AutomationStudioHarnessOptionRegistry();
    const mislabelled = ledgerBundle({
      options: [{
        toolId: "erp.open_period",
        description: "Open the next accounting period so its postings become readable.",
        inputSchema: { type: "object" },
        effect: "mutate",
        availability: { kind: "domain", domainId: LEDGER_DOMAIN_ID },
        safety: { sideEffect: "observe" }
      }],
      implementations: { "erp.open_period": async () => ({}) }
    });
    expect(() => registry.register(mislabelled)).toThrow(/side_effect_mismatch/);
  });

  it("withholds a mutating option unless the policy permits side effects, and a destructive one always", () => {
    const registry = new AutomationStudioHarnessOptionRegistry();
    registry.register(ledgerBundle());
    expect(registry.list(LEDGER_SCOPE).map((option) => option.toolId)).toEqual(["erp.ledger_balances"]);
    expect(registry.list({ ...LEDGER_SCOPE, policy: permissivePolicy() }).map((option) => option.toolId))
      .toEqual(["erp.ledger_balances", "erp.open_period"]);
    // A policy present decides, and the caller's opt-in never overrides it.
    expect(registry.list({ ...LEDGER_SCOPE, policy: { ...permissivePolicy(), allowExternalSideEffects: false }, allowSideEffectsWithoutPolicy: true }).map((option) => option.toolId))
      .toEqual(["erp.ledger_balances"]);
    // With no policy governing the call, the caller has to say so explicitly.
    expect(registry.list({ ...LEDGER_SCOPE, allowSideEffectsWithoutPolicy: true }).map((option) => option.toolId))
      .toEqual(["erp.ledger_balances", "erp.open_period"]);

    const destructive = new AutomationStudioHarnessOptionRegistry();
    destructive.register(ledgerBundle({
      options: [{
        toolId: "erp.void_period",
        description: "Void an accounting period and everything posted in it.",
        inputSchema: { type: "object" },
        effect: "mutate",
        availability: { kind: "domain", domainId: LEDGER_DOMAIN_ID },
        safety: { sideEffect: "destructive" }
      }],
      implementations: { "erp.void_period": async () => ({}) }
    }));
    expect(destructive.list({ ...LEDGER_SCOPE, policy: permissivePolicy() })).toEqual([]);
  });

  // A recovery's actions each pass its permission gate, so there the gate is
  // the permission a mutating option needs: offered whatever the policy flag
  // says, and each lasting consequence permitted or asked for. Destruction is
  // still never on offer.
  it("offers a mutating option when mutations are governed by permission, whatever the policy says, and never a destructive one", () => {
    const registry = new AutomationStudioHarnessOptionRegistry();
    registry.register(ledgerBundle());
    const governed = { ...LEDGER_SCOPE, mutationsGovernedByPermission: true };
    expect(registry.list({ ...governed, policy: { ...permissivePolicy(), allowExternalSideEffects: false } }).map((option) => option.toolId))
      .toEqual(["erp.ledger_balances", "erp.open_period"]);
    expect(registry.list(governed).map((option) => option.toolId)).toEqual(["erp.ledger_balances", "erp.open_period"]);
    // Said false, or not said at all, the policy decides exactly as before.
    expect(registry.list({ ...LEDGER_SCOPE, mutationsGovernedByPermission: false, policy: { ...permissivePolicy(), allowExternalSideEffects: false } }).map((option) => option.toolId))
      .toEqual(["erp.ledger_balances"]);

    const destructive = new AutomationStudioHarnessOptionRegistry();
    destructive.register(ledgerBundle({
      options: [{
        toolId: "erp.void_period",
        description: "Void an accounting period and everything posted in it.",
        inputSchema: { type: "object" },
        effect: "mutate",
        availability: { kind: "domain", domainId: LEDGER_DOMAIN_ID },
        safety: { sideEffect: "destructive" }
      }],
      implementations: { "erp.void_period": async () => ({}) }
    }));
    expect(destructive.list({ ...governed, policy: permissivePolicy() })).toEqual([]);
  });

  it("gates on scope, runtime capability, permission, stage and operator approval", () => {
    const registry = new AutomationStudioHarnessOptionRegistry({ host: fullHost() });
    registry.register(ledgerBundle());

    // Another domain's Flow never sees the ledger's options; Core's still show.
    const otherDomain = registry.list({ scope: { kind: "domain", domainId: "crm" } }).map((option) => option.toolId);
    expect(otherDomain).toContain(AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS.flowGraph);
    expect(otherDomain).not.toContain("erp.ledger_balances");

    // The state options require the host capability the node registry names.
    expect(registry.list(GLOBAL_SCOPE).map((option) => option.toolId)).not.toContain(AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS.stateDiff);
    expect(registry.list({ ...GLOBAL_SCOPE, runtimeCapabilities: ["state-diff"] }).map((option) => option.toolId))
      .toContain(AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS.stateDiff);

    const gated = new AutomationStudioHarnessOptionRegistry();
    gated.register(ledgerBundle({
      options: [{
        toolId: "erp.payroll_register",
        description: "Read the payroll register for the current period.",
        inputSchema: { type: "object" },
        effect: "observe",
        availability: { kind: "domain", domainId: LEDGER_DOMAIN_ID },
        stages: ["gather"],
        safety: { sideEffect: "observe", requiredPermissions: ["ledger.payroll.read"], requiresOperatorApproval: true }
      }],
      implementations: { "erp.payroll_register": async () => ({}) }
    }));
    const permitted = { ...LEDGER_SCOPE, permissions: ["ledger.payroll.read"], approvedOptionIds: ["erp.payroll_register"] };
    expect(gated.list({ ...permitted, stage: "gather" }).map((option) => option.toolId)).toEqual(["erp.payroll_register"]);
    expect(gated.list({ ...permitted, stage: "verify" })).toEqual([]);
    expect(gated.list(permitted)).toEqual([]);
    expect(gated.list({ ...LEDGER_SCOPE, stage: "gather", approvedOptionIds: ["erp.payroll_register"] })).toEqual([]);
    expect(gated.list({ ...LEDGER_SCOPE, stage: "gather", permissions: ["ledger.payroll.read"] })).toEqual([]);
  });

  it("re-checks the resolution at dispatch, because the model chooses the id", async () => {
    const registry = new AutomationStudioHarnessOptionRegistry();
    registry.register(ledgerBundle());
    const call = {
      projectId: "project.one", flowId: "flow.one", callId: "call.1",
      optionId: "erp.open_period", value: {}, maxEvidenceBytes: 1_000
    };
    await expect(registry.execute(call, LEDGER_SCOPE)).rejects.toThrow(/not offered in this scope/);
    await expect(registry.execute(call, { ...LEDGER_SCOPE, policy: permissivePolicy() }))
      .resolves.toMatchObject({ kind: "llm_evidence_tool_execution", effectApplied: true });
    await expect(registry.execute({ ...call, optionId: "erp.unknown" }, LEDGER_SCOPE)).rejects.toThrow(/not offered in this scope/);
  });

  it("drops a repeat policy the loop would reject when nothing offered can mutate", async () => {
    const registry = new AutomationStudioHarnessOptionRegistry({ host: fullHost() });
    const observationOnly = registry.tools({ ...GLOBAL_SCOPE, runtimeCapabilities: ["state-snapshot"] });
    expect(observationOnly.some((tool) => tool.toolId === AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS.stateSnapshot)).toBe(true);
    expect(observationOnly.every((tool) => tool.repeatPolicy === undefined)).toBe(true);
    // Proof the drop matters: the loop refuses the configuration without it.
    await expect(runAutomationStudioLlmEvidenceLoop({
      tools: observationOnly.map((tool) => (tool.toolId === AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS.stateSnapshot ? { ...tool, repeatPolicy: "after_mutation" as const } : tool)),
      decide: async () => ({ kind: "complete", result: {} }),
      executeTool: async () => ({})
    })).resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.invalid_configuration" });

    registry.register(ledgerBundle());
    const withMutation = registry.tools({ ...LEDGER_SCOPE, runtimeCapabilities: ["state-snapshot"], policy: permissivePolicy() });
    expect(withMutation.find((tool) => tool.toolId === AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS.stateSnapshot)?.repeatPolicy).toBe("after_mutation");
  });
});
