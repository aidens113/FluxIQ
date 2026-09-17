import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioAdaptationPolicy, AutomationStudioFlowRunDetail } from "../../../../model/index.ts";
import {
  AutomationStudioLlmRunBudgetLedger,
  automationStudioExploredEvidenceLabel,
  type AutomationStudioLlmEvidenceRuntimeBinding,
  type AutomationStudioLlmEvidenceTool,
  type AutomationStudioLlmProvider
} from "../../../llm/index.ts";
import { buildAutomationStudioRuntimeRecoveryContext } from "../../context.ts";
import { resolveAutomationStudioExplorationBudget } from "../../exploration-budget.ts";
import { startAutomationStudioRecoveryDeadline } from "../../recovery-deadline.ts";
import { runAutomationStudioRecoveryExploration } from "../exploration.ts";

// Two things the recovery path has to carry into the runner and can silently
// fail to: the whole recovery's clock, and the domain's own reading of a
// refusal. Each is asserted by the outcome it produces, because each one
// missing leaves an exploration that simply ran on and reported something else.
describe("runAutomationStudioRecoveryExploration", () => {
  it("stops before the first provider call when the whole recovery is already out of time", async () => {
    const calls: string[] = [];
    const { exploration } = await runAutomationStudioRecoveryExploration({
      ...base(calls),
      recoveryDeadline: startAutomationStudioRecoveryDeadline({ startedAtMs: 0, maxDurationMs: 1 }),
      now: () => 10_000
    });

    expect(calls).toEqual([]);
    expect(exploration).toMatchObject({
      outcome: "budget_exhausted",
      stopReason: "recovery_deadline_expired",
      endedBy: "recovery_deadline_expired",
      actions: 0
    });
    // The recovery needing longer and this exploration needing longer are
    // different advice, so they are never the same stop reason.
    expect(exploration.stopReason).not.toBe("wall_clock_expired");
  });

  it("ends in unsafe_action_blocked when the domain refuses what the model asked for", async () => {
    const calls: string[] = [];
    const { exploration } = await runAutomationStudioRecoveryExploration({
      ...base(calls, "test.refused.unsafe"),
      recoveryDeadline: startAutomationStudioRecoveryDeadline({ startedAtMs: Date.now() }),
      budget: resolveAutomationStudioExplorationBudget({ maxRefusedActions: 1 })
    });

    expect(calls).toEqual(["provider", "test.inspect"]);
    expect(exploration).toMatchObject({
      outcome: "unsafe_action_blocked",
      stopReason: "destructive_action_refused",
      refusedActions: 1,
      observedActions: 0
    });
    expect(exploration.result).toBeUndefined();
  });

  // The patch that follows is shown what the exploration saw. What comes back
  // is the domain's own packets, in the order they were returned, each with the
  // label a handle taken from it will carry -- and nothing that was not a page.
  it("returns the domain's packets the loop accepted, labelled in order, and no refusal", async () => {
    const calls: string[] = [];
    const first = { schemaVersion: "test.page.v1", controls: ["candidate.1"] };
    const second = { schemaVersion: "test.page.v1", controls: ["candidate.1", "candidate.2"] };
    const { exploration, explored } = await runAutomationStudioRecoveryExploration({
      ...base(calls),
      binding: pagesBinding(calls, { "test.inspect": first, "test.refused": { ok: false, code: "test.nothing_there" }, "test.reveal": second }),
      provider: sequenceProvider(calls, ["test.inspect", "test.refused", "test.reveal"]),
      recoveryDeadline: startAutomationStudioRecoveryDeadline({ startedAtMs: Date.now() })
    });

    expect(calls).toEqual(["provider", "test.inspect", "provider", "test.refused", "provider", "test.reveal", "provider"]);
    expect(exploration.outcome).toBe("evidence_gathered");
    // Labelled by the one definition the packet builder and the target check read.
    expect(explored).toEqual([
      { evidenceId: automationStudioExploredEvidenceLabel(1), toolId: "test.inspect", packet: first },
      { evidenceId: automationStudioExploredEvidenceLabel(2), toolId: "test.reveal", packet: second }
    ]);
    expect(explored.map((entry) => entry.evidenceId)).toEqual(["explored.1", "explored.2"]);
  });

  // C-7b. Every decision after the first carries what the domain's options
  // returned, so each one is held to the domain's declared keys. A page with a
  // denied key in it is refused while the next decision is being built: the
  // exploration ends there, and the model is never sent it.
  it("ends the exploration before a decision could carry a key the bound domain denies", async () => {
    const calls: string[] = [];
    const sent: string[] = [];
    const leaking = { schemaVersion: "test.page.v1", controls: ["candidate.1"], raw: { outer_html: "PRIVATE-RAW-PAYLOAD" } };
    const recording = sequenceProvider(calls, ["test.inspect", "test.reveal"]);
    const { exploration } = await runAutomationStudioRecoveryExploration({
      ...base(calls),
      binding: { ...pagesBinding(calls, { "test.inspect": leaking, "test.reveal": { schemaVersion: "test.page.v1" } }), deniedEvidenceKeys: ["outerHtml"] },
      provider: { ...recording, runTask: async (request, execution) => { sent.push(JSON.stringify(request)); return await recording.runTask(request, execution); } },
      recoveryDeadline: startAutomationStudioRecoveryDeadline({ startedAtMs: Date.now() })
    });

    expect(calls).toEqual(["provider", "test.inspect"]);
    expect(sent).toHaveLength(1);
    for (const request of sent) expect(request).not.toContain("PRIVATE-RAW-PAYLOAD");
    expect(exploration.outcome).toBe("failed");
  });

  // A domain's plain `tools` are its authoring set: they carry no stage, so the
  // registry would offer them at `gather` too. They bind targets through the
  // authoring packet map, so a handle the model copied from a recovery packet
  // could resolve against an older authoring packet. A domain that declares
  // recovery options explores with exactly those.
  it("offers exactly the domain's declared options, never its plain authoring tools", async () => {
    const calls: string[] = [];
    const offered: string[][] = [];
    const declared = pagesBinding(calls, { "test.inspect": { schemaVersion: "test.page.v1" }, "test.reveal": { schemaVersion: "test.page.v1" } });
    const { exploration } = await runAutomationStudioRecoveryExploration({
      ...base(calls),
      binding: {
        ...declared,
        tools: [plainTool("test.authoring.inspect"), plainTool("test.authoring.navigate")],
        executeTool: async (call) => { calls.push(`plain:${call.toolId}`); return { schemaVersion: "test.page.v1" }; }
      },
      provider: recordingProvider(calls, offered, ["test.inspect"]),
      recoveryDeadline: startAutomationStudioRecoveryDeadline({ startedAtMs: Date.now() })
    });

    expect(exploration.outcome).toBe("evidence_gathered");
    expect(offered.length).toBeGreaterThan(0);
    for (const toolIds of offered) expect([...toolIds].sort()).toEqual(declared.harnessOptions!.options.map((option) => option.toolId).sort());
    expect(calls.filter((call) => call.startsWith("plain:"))).toEqual([]);
  });

  // The fallback: a domain that binds only the plain slot has nothing else to
  // explore with, so those tools stay reachable during a recovery.
  it("still explores with a tools-only binding's plain tools", async () => {
    const calls: string[] = [];
    const offered: string[][] = [];
    const page = { schemaVersion: "test.page.v1", controls: ["candidate.1"] };
    const { exploration, explored } = await runAutomationStudioRecoveryExploration({
      ...base(calls),
      binding: {
        domainId: "test.domain",
        deniedEvidenceKeys: [],
        tools: [plainTool("test.inspect")],
        executeTool: async (call) => { calls.push(`plain:${call.toolId}`); return page; }
      },
      provider: recordingProvider(calls, offered, ["test.inspect"]),
      recoveryDeadline: startAutomationStudioRecoveryDeadline({ startedAtMs: Date.now() })
    });

    expect(calls).toEqual(["provider", "plain:test.inspect", "provider"]);
    expect(offered).toEqual([["test.inspect"], ["test.inspect"]]);
    expect(exploration.outcome).toBe("evidence_gathered");
    expect(explored).toEqual([{ evidenceId: automationStudioExploredEvidenceLabel(1), toolId: "test.inspect", packet: page }]);
  });

  it("returns no packet the loop refused, and none when the exploration never ran", async () => {
    const calls: string[] = [];
    const oversized = { schemaVersion: "test.page.v1", text: "x".repeat(5_000) };
    const refused = await runAutomationStudioRecoveryExploration({
      ...base(calls),
      binding: pagesBinding(calls, { "test.inspect": oversized }),
      provider: sequenceProvider(calls, ["test.inspect"]),
      recoveryDeadline: startAutomationStudioRecoveryDeadline({ startedAtMs: Date.now() }),
      budget: resolveAutomationStudioExplorationBudget({ maxEvidenceBytes: 4_096 })
    });
    expect(calls).toEqual(["provider", "test.inspect"]);
    expect(refused.exploration.outcome).not.toBe("evidence_gathered");
    expect(refused.explored).toEqual([]);

    const notRun = await runAutomationStudioRecoveryExploration({
      ...base([]),
      recoveryDeadline: startAutomationStudioRecoveryDeadline({ startedAtMs: 0, maxDurationMs: 1 }),
      now: () => 10_000
    });
    expect(notRun.explored).toEqual([]);
  });
});

/** Observing options that each return a fixed value, recorded as they run. */
function pagesBinding(calls: string[], pages: Record<string, JsonObject>): AutomationStudioLlmEvidenceRuntimeBinding {
  return {
    domainId: "test.domain",
    deniedEvidenceKeys: [],
    tools: [],
    harnessOptions: {
      schemaVersion: "0.1",
      domainId: "test.domain",
      options: Object.keys(pages).map((toolId) => ({
        toolId,
        description: `Return ${toolId}.`,
        inputSchema: { type: "object", additionalProperties: false, properties: {} },
        effect: "observe" as const,
        availability: { kind: "domain" as const, domainId: "test.domain" },
        safety: { sideEffect: "observe" as const },
        stages: ["gather" as const, "iterate" as const]
      })),
      implementations: Object.fromEntries(Object.entries(pages).map(([toolId, page]) => [toolId, async () => {
        calls.push(toolId);
        return { kind: "llm_evidence_tool_execution" as const, evidence: page, effectApplied: false };
      }]))
    },
    executeTool: async () => { throw new Error("The bare tool slot is not used by this binding."); }
  };
}

/** Calls each tool once, in order, then completes. */
function sequenceProvider(calls: string[], toolIds: string[]): AutomationStudioLlmProvider {
  return {
    metadata: { provider: "mock", model: "debug-model" },
    runTask: async (request) => {
      calls.push("provider");
      const iteration = request.context.evidenceLoop?.iteration ?? 0;
      const toolId = toolIds[iteration - 1];
      const decision = toolId
        ? { kind: "tool_call" as const, callId: `call.${iteration}`, toolId, input: {} }
        : { kind: "complete" as const, result: { findings: "The control is behind the disclosure." } };
      return { response: { kind: "evidence_tool_decision", summary: "Looking.", decision } };
    }
  };
}

/** A bare tool in the plain slot: no stage and no availability of its own. */
function plainTool(toolId: string): AutomationStudioLlmEvidenceTool {
  return { toolId, description: `Return ${toolId}.`, inputSchema: { type: "object", additionalProperties: false, properties: {} }, effect: "observe" };
}

/** `sequenceProvider`, also recording the tool ids each request offered. */
function recordingProvider(calls: string[], offered: string[][], toolIds: string[]): AutomationStudioLlmProvider {
  const sequence = sequenceProvider(calls, toolIds);
  return {
    ...sequence,
    runTask: async (request, execution) => {
      offered.push((request.context.evidenceLoop?.tools ?? []).map((tool) => tool.toolId));
      return await sequence.runTask(request, execution);
    }
  };
}

function base(calls: string[], resultCode?: string) {
  const detail = runDetail();
  return {
    binding: binding(calls, resultCode),
    scope: { kind: "domain" as const, domainId: "test.domain" },
    policy: adaptationPolicy(),
    provider: provider(calls),
    context: { projectId: "project.recovery", flowId: "flow.recovery", runId: "run.failed" },
    instructions: [],
    runDetail: detail,
    recoveryContext: buildAutomationStudioRuntimeRecoveryContext({ detail }),
    runBudget: new AutomationStudioLlmRunBudgetLedger({ maxCallsPerRun: 4, maxTotalTokensPerRun: 200_000, maxOutputTokensPerRun: 100_000 }),
    maxEstimatedCostUsd: 0.05
  };
}

function provider(calls: string[]): AutomationStudioLlmProvider {
  return {
    metadata: { provider: "mock", model: "debug-model" },
    runTask: async () => {
      calls.push("provider");
      return {
        response: {
          kind: "evidence_tool_decision",
          summary: "Looking at the control.",
          decision: { kind: "tool_call", callId: "call.1", toolId: "test.inspect", input: {} }
        }
      };
    }
  };
}

function binding(calls: string[], resultCode?: string): AutomationStudioLlmEvidenceRuntimeBinding {
  return {
    domainId: "test.domain",
    deniedEvidenceKeys: [],
    tools: [],
    classifyRefusal: (code) => (code === "test.refused.unsafe" ? "destructive_action_refused" : undefined),
    harnessOptions: {
      schemaVersion: "0.1",
      domainId: "test.domain",
      options: [{
        toolId: "test.inspect",
        description: "Look at what is actually there.",
        inputSchema: { type: "object", additionalProperties: false, properties: {} },
        effect: "observe",
        availability: { kind: "domain", domainId: "test.domain" },
        safety: { sideEffect: "observe" },
        stages: ["gather", "iterate"]
      }],
      implementations: {
        "test.inspect": async () => {
          calls.push("test.inspect");
          return { kind: "llm_evidence_tool_execution", evidence: { control: "absent" }, effectApplied: false, ...(resultCode ? { resultCode } : {}) };
        }
      }
    },
    executeTool: async () => { throw new Error("The bare tool slot is not used by this binding."); }
  };
}

function adaptationPolicy(): AutomationStudioAdaptationPolicy {
  return {
    schemaVersion: "0.1",
    policyId: "policy.exploration",
    scope: { kind: "flow", flowId: "flow.recovery" },
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
    allowExternalSideEffects: false,
    requireApprovalForDestructiveChanges: true,
    requireApprovalForExternalSideEffects: false,
    createdAt: 1,
    updatedAt: 1
  };
}

function runDetail(): AutomationStudioFlowRunDetail {
  return {
    schemaVersion: "0.1",
    summary: {
      schemaVersion: "0.1",
      runId: "run.failed",
      flowId: "flow.recovery",
      projectId: "project.recovery",
      status: "failed",
      updatedAt: 1_000,
      routeDecisionCount: 0,
      subflowEntryCount: 0,
      actionAttemptCount: 0,
      interventionCount: 0,
      adaptationCount: 0
    },
    routeDecisions: [],
    subflows: [],
    interventions: [],
    adaptationIds: [],
    changeProposalIds: []
  };
}
