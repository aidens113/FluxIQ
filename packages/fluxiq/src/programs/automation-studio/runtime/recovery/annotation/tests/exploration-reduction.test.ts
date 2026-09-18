import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioAdaptationPolicy, AutomationStudioFlowRunDetail } from "../../../../model/index.ts";
import {
  AutomationStudioLlmRunBudgetLedger,
  type AutomationStudioHarnessOption,
  type AutomationStudioLlmEvidenceRuntimeBinding,
  type AutomationStudioLlmProvider
} from "../../../llm/index.ts";
import { buildAutomationStudioRuntimeRecoveryContext } from "../../context.ts";
import { startAutomationStudioRecoveryDeadline } from "../../recovery-deadline.ts";
import { runAutomationStudioRecoveryExploration } from "../exploration.ts";

// The recovery path is the only place holding both the finished exploration and
// the domain that can observe its own state, so it is the only place the
// reduction can be computed at all. These cases are about what it does with the
// answer.
//
// The exploration below is the one from the plan, written in the web domain's
// own words because this is a test file: look at the page, open the wrong
// panel, close it again, then open the right one. The states say what a browser
// would say -- closing the wrong panel puts the page back exactly where it was,
// which is the only thing that makes it an undo as far as Core is concerned.

const LISTING = "state.listing";
const WRONG_PANEL = "state.wrong-panel-open";
const RIGHT_PANEL = "state.right-panel-open";

/** What the world was at each moment of the canonical exploration. */
const CANONICAL_STATES: Record<string, string> = {
  "call.1:before": LISTING,
  "call.1:after": LISTING,
  "call.2:before": LISTING,
  "call.2:after": WRONG_PANEL,
  "call.3:before": WRONG_PANEL,
  "call.3:after": LISTING,
  "call.4:before": LISTING,
  "call.4:after": RIGHT_PANEL
};

describe("runAutomationStudioRecoveryExploration, reduced", () => {
  // Four steps of wandering become the one that did the work, and the two
  // predicates that make it reusable rather than a list of things that once
  // happened.
  it("publishes the shortest sequence that reached the state success was observed in", async () => {
    const { exploration, reduced } = await exploreCanonical();

    expect(exploration.outcome).toBe("evidence_gathered");
    expect(reduced?.replayable).toBe(true);
    expect(reduced?.reduction?.actions).toEqual([{ index: 3, actionId: "test.open", input: { panel: "right" } }]);
    expect(reduced?.reduction?.inputState).toEqual({ kind: "state_digest_equals", digest: LISTING });
    expect(reduced?.reduction?.outputState).toEqual({ kind: "state_digest_equals", digest: RIGHT_PANEL });
    expect(reduced?.reduction?.dropped.map((step) => step.reason)).toEqual(["observation_only", "undone", "undone"]);
  });

  // Mutation: ignore `stateChainIntact` at the call site. An action with no
  // declared effect defaults to `observe`, so a mutating action whose table
  // forgot to say so is dropped from every reduction -- and the reduction then
  // reports a state it cannot account for. Ignoring the flag publishes an empty
  // sequence as a fix for a failure it would not fix.
  it("refuses the reduction when an action that changed something was declared as only observing", async () => {
    const { exploration, reduced } = await exploreCanonical({ undeclaredEffect: true });

    expect(exploration.outcome).toBe("evidence_gathered");
    expect(reduced?.reduction?.stateChainIntact).toBe(false);
    expect(reduced?.replayable).toBe(false);
    expect(reduced?.reason).toContain("declared as only observing");
    // The receipt is still worth having, and it is emphatically not a fix.
    expect(reduced?.reduction?.actions).toEqual([]);
  });

  // A reduction is the path that *worked*, so an ending in which nothing worked
  // has none. Reducing one would answer with a fix for a success never observed.
  it("publishes no reduction for an exploration that gathered no evidence", async () => {
    const { exploration, reduced } = await exploreCanonical({ completeImmediately: true });

    expect(exploration.outcome).toBe("no_evidence_found");
    expect(reduced).toBeUndefined();
  });

  // A domain that cannot observe its own state binds no digest source, and the
  // exploration is simply not reduced. It says so rather than answering with the
  // empty reduction an empty chain would produce.
  it("publishes an unusable reduction, with a reason, when the domain observes no state", async () => {
    const { exploration, reduced } = await exploreCanonical({ observeState: false });

    expect(exploration.outcome).toBe("evidence_gathered");
    expect(exploration.observedState).toBe(false);
    expect(reduced?.replayable).toBe(false);
    expect(reduced?.reduction).toBeUndefined();
    expect(reduced?.reason).toContain("no chain of states");
  });
});

type ExploreOptions = {
  /** The mutating action's table entry says nothing about its effect. */
  undeclaredEffect?: boolean;
  /** The domain binds no way of saying what the state was. */
  observeState?: boolean;
  /** The model completes without looking at anything. */
  completeImmediately?: boolean;
};

async function exploreCanonical(options: ExploreOptions = {}) {
  const detail = runDetail();
  const requested = options.completeImmediately
    ? []
    : [
      { toolId: "test.inspect", input: {} },
      { toolId: "test.open", input: { panel: "wrong" } },
      { toolId: "test.open", input: { panel: "close" } },
      { toolId: "test.open", input: { panel: "right" } }
    ];
  return await runAutomationStudioRecoveryExploration({
    binding: binding(options),
    scope: { kind: "domain", domainId: "test.domain" },
    policy: adaptationPolicy(),
    provider: scriptedProvider(requested),
    context: { projectId: "project.recovery", flowId: "flow.recovery", runId: "run.failed" },
    instructions: [],
    runDetail: detail,
    recoveryContext: buildAutomationStudioRuntimeRecoveryContext({ detail }),
    runBudget: new AutomationStudioLlmRunBudgetLedger({ maxCallsPerRun: 8, maxTotalTokensPerRun: 200_000, maxOutputTokensPerRun: 100_000 }),
    maxEstimatedCostUsd: 0.05,
    recoveryDeadline: startAutomationStudioRecoveryDeadline({ startedAtMs: Date.now() })
  });
}

/**
 * A domain with one observing option and one that changes something, each
 * answering with a page whose contents depend on which panel is open -- so the
 * evidence moves with the state and neither can stand in for the other.
 */
function binding(options: ExploreOptions): AutomationStudioLlmEvidenceRuntimeBinding {
  const open: AutomationStudioHarnessOption = {
    toolId: "test.open",
    description: "Open a panel.",
    inputSchema: { type: "object", additionalProperties: true, properties: {} },
    // The trap: an option with no declared effect is read as observing.
    ...(options.undeclaredEffect ? {} : { effect: "mutate" as const }),
    availability: { kind: "domain", domainId: "test.domain" },
    safety: { sideEffect: options.undeclaredEffect ? "observe" : "mutate" },
    stages: ["gather", "iterate"]
  };
  const inspect: AutomationStudioHarnessOption = {
    toolId: "test.inspect",
    description: "Look at the page.",
    inputSchema: { type: "object", additionalProperties: true, properties: {} },
    effect: "observe",
    availability: { kind: "domain", domainId: "test.domain" },
    safety: { sideEffect: "observe" },
    stages: ["gather", "iterate"]
  };
  return {
    domainId: "test.domain",
    deniedEvidenceKeys: [],
    tools: [],
    harnessOptions: {
      schemaVersion: "0.1",
      domainId: "test.domain",
      options: [inspect, open],
      implementations: {
        "test.inspect": async (call) => page(call.value),
        "test.open": async (call) => page(call.value)
      }
    },
    executeTool: async () => { throw new Error("The bare tool slot is not used by this binding."); },
    ...(options.observeState === false ? {} : {
      captureStateDigest: async ({ callId, phase }) => CANONICAL_STATES[`${callId}:${phase}`]
    })
  };
}

/** One page packet, whose contents follow the request so the evidence is never a repeat. */
function page(value: JsonObject) {
  return { kind: "llm_evidence_tool_execution" as const, evidence: { schemaVersion: "test.page.v1", showing: value }, effectApplied: true };
}

/** Calls each requested action once, in order, then completes. */
function scriptedProvider(requested: Array<{ toolId: string; input: JsonObject }>): AutomationStudioLlmProvider {
  return {
    metadata: { provider: "mock", model: "debug-model" },
    runTask: async (request) => {
      const iteration = request.context.evidenceLoop?.iteration ?? 0;
      const next = requested[iteration - 1];
      const decision = next
        ? { kind: "tool_call" as const, callId: `call.${iteration}`, toolId: next.toolId, input: next.input }
        : { kind: "complete" as const, result: { findings: "The control is inside the right panel." } };
      return { response: { kind: "evidence_tool_decision", summary: "Looking.", decision } };
    }
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
    allowExternalSideEffects: true,
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
