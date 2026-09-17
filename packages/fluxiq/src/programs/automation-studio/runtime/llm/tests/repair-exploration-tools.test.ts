import { describe, expect, it } from "vitest";
import type { AutomationStudioAdaptationPolicy } from "../../../model/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../evidence-loop.ts";
import {
  AutomationStudioHarnessOptionRegistry,
  type AutomationStudioHarnessOption,
  type AutomationStudioHarnessOptionBundle,
  type AutomationStudioHarnessOptionResolution
} from "../harness-options/index.ts";

// What a repair may explore with, and under which policy.
//
// A runtime recovery always has an adaptation policy, and the policy is
// authoritative over side effects: a mutating option is offered when, and only
// when, `allowExternalSideEffects` is true. That is not the defect. The defect
// is what the refusal did to the observations left behind. The web domain's
// `inspect` declares an initial observation and `repeatPolicy: "after_mutation"`,
// so once the policy withholds every mutating option the loop's "not again
// until something changes" became "never again": the model looked once, for
// free, before it was asked anything, and could not look a second time.
//
// The domain is imitated here rather than imported -- Core must not learn what
// a page is -- with the same six shapes the web domain declares: three
// observations, one of them with a free first look and a mutation-gated repeat,
// and three mutations.

const DOMAIN_ID = "web-automation";
const SCOPE: AutomationStudioHarnessOptionResolution = { scope: { kind: "domain", domainId: DOMAIN_ID } };

const INSPECT = "web.recovery.inspect";
const WAIT = "web.recovery.wait_for_change";
const DETECT = "web.recovery.detect_repeating_structure";
const REVEAL = "web.recovery.reveal";
const ACT = "web.recovery.act_safe";
const NAVIGATE = "web.recovery.navigate_in_scope";

const OBSERVATIONS = [INSPECT, WAIT, DETECT];
const MUTATIONS = [REVEAL, ACT, NAVIGATE];

describe("what a repair may explore with", () => {
  it("withholds every mutating option while the policy denies side effects, and offers all six when it allows them", () => {
    const registry = domainRegistry();
    expect(registry.tools(denying()).map((tool) => tool.toolId)).toEqual(OBSERVATIONS);
    expect(registry.tools(allowing()).map((tool) => tool.toolId)).toEqual([...OBSERVATIONS, ...MUTATIONS]);
  });

  it("keeps the free first look and lets the model look again when nothing offered can mutate", async () => {
    const registry = domainRegistry();
    const tools = registry.tools(denying());
    // The free look survives the refusal: the first decision is still made with
    // the page in front of the model rather than blind.
    expect(tools.find((tool) => tool.toolId === INSPECT)?.initialObservation).toEqual({ input: {} });
    // And the repeat policy is dropped, because nothing can ever satisfy it.
    expect(tools.every((tool) => tool.repeatPolicy === undefined)).toBe(true);

    const offered = await offeredPerIteration(tools, 2);
    expect(offered[0]).toEqual(OBSERVATIONS);
    expect(offered[1]).toEqual(OBSERVATIONS);
  });

  it("still holds a mutation-gated observation shut until a mutation is applied, when one is reachable", async () => {
    const registry = domainRegistry();
    const tools = registry.tools(allowing());
    expect(tools.find((tool) => tool.toolId === INSPECT)?.repeatPolicy).toBe("after_mutation");

    const offered = await offeredPerIteration(tools, 2);
    // The free look has already been taken, and the policy that would let a
    // mutation undo it has not been exercised, so inspect is withheld.
    expect(offered[0]).toEqual([WAIT, DETECT, ...MUTATIONS]);
    expect(offered[1]).toEqual([WAIT, DETECT, ...MUTATIONS]);
  });

  it("offers a mutation-gated observation again once a mutation really was applied", async () => {
    const registry = domainRegistry();
    const tools = registry.tools(allowing());
    const offered: string[][] = [];
    let iterations = 0;
    await runAutomationStudioLlmEvidenceLoop({
      tools,
      decide: async (decision) => {
        offered.push(decision.tools.map((tool) => tool.toolId));
        iterations += 1;
        if (iterations === 1) return { kind: "tool_call", callId: "call.1", toolId: REVEAL, input: {} };
        return { kind: "complete", result: {} };
      },
      executeTool: async ({ toolId }) => (MUTATIONS.includes(toolId)
        ? { kind: "llm_evidence_tool_execution" as const, evidence: { revealed: true }, effectApplied: true }
        : { looked: true })
    });
    expect(offered[0]).toEqual([WAIT, DETECT, ...MUTATIONS]);
    expect(offered[1]).toEqual([...OBSERVATIONS, ...MUTATIONS]);
  });
});

/** Which tool ids the loop offered on each of its first `count` decisions. */
async function offeredPerIteration(tools: ReturnType<AutomationStudioHarnessOptionRegistry["tools"]>, count: number): Promise<string[][]> {
  const offered: string[][] = [];
  await runAutomationStudioLlmEvidenceLoop({
    tools,
    decide: async (decision) => {
      offered.push(decision.tools.map((tool) => tool.toolId));
      if (offered.length >= count) return { kind: "complete", result: {} };
      return { kind: "tool_call", callId: `call.${offered.length}`, toolId: WAIT, input: {} };
    },
    executeTool: async () => ({ looked: true })
  });
  return offered;
}

function domainRegistry(): AutomationStudioHarnessOptionRegistry {
  return new AutomationStudioHarnessOptionRegistry().register(domainBundle());
}

function denying(): AutomationStudioHarnessOptionResolution {
  return { ...SCOPE, stage: "gather", policy: { ...policy(), allowExternalSideEffects: false } };
}

function allowing(): AutomationStudioHarnessOptionResolution {
  return { ...SCOPE, stage: "gather", policy: policy() };
}

function domainBundle(): AutomationStudioHarnessOptionBundle {
  const options: AutomationStudioHarnessOption[] = [
    observation(INSPECT, { initialObservation: { input: {} }, repeatPolicy: "after_mutation" }),
    observation(WAIT),
    observation(DETECT),
    mutation(REVEAL),
    mutation(ACT),
    mutation(NAVIGATE)
  ];
  return {
    schemaVersion: "0.1",
    domainId: DOMAIN_ID,
    options,
    implementations: Object.fromEntries(options.map((option) => [
      option.toolId,
      option.effect === "mutate"
        ? async () => ({ kind: "llm_evidence_tool_execution" as const, evidence: { changed: true }, effectApplied: true })
        : async () => ({ looked: true })
    ]))
  };
}

function observation(toolId: string, extra: Partial<AutomationStudioHarnessOption> = {}): AutomationStudioHarnessOption {
  return {
    toolId,
    description: `Observe ${toolId}.`,
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    effect: "observe",
    availability: { kind: "domain", domainId: DOMAIN_ID },
    safety: { sideEffect: "observe" },
    stages: ["gather", "iterate"],
    ...extra
  };
}

function mutation(toolId: string): AutomationStudioHarnessOption {
  return {
    toolId,
    description: `Change the page with ${toolId}.`,
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    effect: "mutate",
    availability: { kind: "domain", domainId: DOMAIN_ID },
    safety: { sideEffect: "mutate" },
    stages: ["gather", "iterate"]
  };
}

function policy(): AutomationStudioAdaptationPolicy {
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
