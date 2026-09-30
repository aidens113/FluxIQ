// A build that ends without an accepted completion keeps its proposable steps
// as an explicitly incomplete record, and the next build of the same Flow
// continues from it.
//
// Before this, `run-mum0ke7z-940cbd27` (bigbox-retail) spent 34 decisions on a
// twelve-step draft and left nothing behind, and so did both crossborder
// builds of round 1: the repair loop had nothing to improve.
import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceLoopResult } from "../../../llm/evidence-loop/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../../../loop-limits/index.ts";
import { automationStudioFlowBootstrapLargestSizeLimits } from "../../plan/index.ts";
import {
  AutomationStudioFlowBootstrapGenerationError,
  flowBootstrapEvidenceLoopFailure,
  flowBootstrapEvidenceUnusableDecisionFailure,
  parseAutomationStudioFlowBootstrapGenerationError
} from "../../generation-failure/index.ts";
import {
  automationStudioFlowBootstrapIncompleteDraftContinuation,
  automationStudioFlowBootstrapIncompleteDraftKeeper,
  automationStudioFlowBootstrapIncompleteDraftKept,
  parseAutomationStudioFlowBootstrapIncompleteDraft,
  type AutomationStudioFlowBootstrapIncompleteDraft
} from "../index.ts";

const OWNER = { projectId: "p1", flowId: "f1" };
const BUILD = { ...OWNER, baseDependencyDigest: "digest-1", sourceInstructionIds: ["i2", "i1"] };

function step(position: number, overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return { position, id: `d${position}`, iteration: position, callId: `call.${position}`, actionId: "web.dom.click", input: { n: position }, effect: "mutate", effectApplied: true, disposition: "kept", ...overrides };
}

// Twelve steps as bigbox's draft had them, with the three kinds a Flow is not
// made of mixed in: one the model dropped, one that only looked, one that failed.
const DRAFT: AutomationStudioFlowDraftStep[] = [
  step(1, { actionId: "web.navigate", replay: { from: { url: "start" } }, replayed: { status: "reproduced" } as never }),
  step(2, { disposition: "dropped" }),
  step(3, { effect: "observe", effectApplied: false }),
  step(4, { effectApplied: false }),
  step(5, { routing: { kind: "only_if", check: "d1" } }),
  step(6, { actionId: "web.dom.extract_list", effect: "observe", proposes: true })
];

function kept(previous?: AutomationStudioFlowBootstrapIncompleteDraft, now = 1_000): AutomationStudioFlowBootstrapIncompleteDraft {
  return automationStudioFlowBootstrapIncompleteDraftKept({
    ...BUILD, stopped: "budget", outstandingIssueCodes: ["flow_bootstrap.instructed_act_missing", "has a space"], completionAttempts: 4, steps: DRAFT, now,
    ...(previous ? { previous } : {})
  })!;
}

function exhaustedLoop(steps: AutomationStudioFlowDraftStep[], outstanding: string[] = ["plan.profile_limit_exceeded"]): Extract<AutomationStudioLlmEvidenceLoopResult, { ok: false }> {
  return {
    ok: false,
    code: "llm_evidence_loop.iteration_limit",
    trace: [],
    steps,
    accounting: { iterations: 34, toolCalls: 20, evidenceBytes: 1_000, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 } as never,
    exhaustion: { bound: "budget", maxIterations: 34, iterations: 34, draftSteps: steps.length, proposableSteps: 3, completionAttempts: 4, lastIssueCodes: [], budgetBound: "tokens", outstandingIssueCodes: outstanding }
  };
}

describe("what a stopped build keeps", () => {
  it("keeps exactly the steps a Flow could be proposed from, renumbered, with nothing of the calls that took them", () => {
    const record = kept();
    expect(record).toMatchObject({ kind: "flow_bootstrap_incomplete_draft", status: "incomplete", revision: 1, stopped: "budget", completionAttempts: 4, createdAt: 1_000, updatedAt: 1_000 });
    expect(record.steps.map((kept) => [kept.position, kept.id, kept.actionId])).toEqual([[1, "d1", "web.navigate"], [2, "d5", "web.dom.click"], [3, "d6", "web.dom.extract_list"]]);
    for (const kept of record.steps) {
      expect(kept.iteration).toBe(0);
      expect(kept).not.toHaveProperty("callId");
      expect(kept).not.toHaveProperty("replayed");
    }
    // What a replay needs, and a routing statement naming another kept step, both survive.
    expect(record.steps[0]!.replay).toEqual({ from: { url: "start" } });
    expect(record.steps[1]!.routing).toEqual({ kind: "only_if", check: "d1" });
    // Sorted instructions; codes only.
    expect(record.sourceInstructionIds).toEqual(["i1", "i2"]);
    expect(record.outstandingIssueCodes).toEqual(["flow_bootstrap.instructed_act_missing"]);
  });

  it("does not change the draft it was given", () => {
    const before = structuredClone(DRAFT);
    kept();
    expect(DRAFT).toEqual(before);
  });

  it("keeps nothing from a draft with no proposable step", () => {
    const record = automationStudioFlowBootstrapIncompleteDraftKept({ ...BUILD, stopped: "iterations", outstandingIssueCodes: [], completionAttempts: 0, steps: [step(1, { disposition: "dropped" }), step(2, { effect: "observe", effectApplied: false })], now: 1 });
    expect(record).toBeUndefined();
  });

  it("numbers a continuation's record after the one it continued, and keeps when the work began", () => {
    const second = kept(kept(undefined, 1_000), 2_000);
    expect(second).toMatchObject({ revision: 2, createdAt: 1_000, updatedAt: 2_000 });
  });
});

describe("whether a later build continues it", () => {
  it("continues a record of the same Flow and instructions, told what it still owes", () => {
    const record = kept();
    const continuation = automationStudioFlowBootstrapIncompleteDraftContinuation(record, { baseDependencyDigest: "digest-1", sourceInstructionIds: ["i1", "i2"] });
    expect(continuation?.seed).toEqual(record.steps);
    expect(continuation?.resume).toEqual({ revision: 1, stopped: "budget", outstandingIssueCodes: ["flow_bootstrap.instructed_act_missing"] });
    // A copy: the loop edits its seed.
    continuation!.seed[0]!.input = { changed: true };
    expect(record.steps[0]!.input).toEqual({ n: 1 });
  });

  it("starts afresh when the Flow or its settings changed since the draft was proved", () => {
    expect(automationStudioFlowBootstrapIncompleteDraftContinuation(kept(), { baseDependencyDigest: "digest-2", sourceInstructionIds: ["i1", "i2"] })).toBeUndefined();
  });

  it("starts afresh when the instructions changed", () => {
    expect(automationStudioFlowBootstrapIncompleteDraftContinuation(kept(), { baseDependencyDigest: "digest-1", sourceInstructionIds: ["i1"] })).toBeUndefined();
    expect(automationStudioFlowBootstrapIncompleteDraftContinuation(kept(), { baseDependencyDigest: "digest-1", sourceInstructionIds: ["i1", "i3"] })).toBeUndefined();
  });

  it("starts afresh with no record", () => {
    expect(automationStudioFlowBootstrapIncompleteDraftContinuation(undefined, BUILD)).toBeUndefined();
  });
});

describe("a stored record read back", () => {
  it("reads back what was written, through JSON", () => {
    const record = kept();
    expect(parseAutomationStudioFlowBootstrapIncompleteDraft(JSON.parse(JSON.stringify(record)), OWNER)).toEqual(record);
  });

  it("refuses a record of another Flow, one not marked incomplete, and an empty file", () => {
    const record = JSON.parse(JSON.stringify(kept()));
    expect(parseAutomationStudioFlowBootstrapIncompleteDraft(record, { projectId: "p1", flowId: "f2" })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapIncompleteDraft({ ...record, status: "proposed" }, OWNER)).toBeNull();
    expect(parseAutomationStudioFlowBootstrapIncompleteDraft({}, OWNER)).toBeNull();
  });

  it("refuses the whole record for one damaged step rather than seeding half a draft", () => {
    const record = JSON.parse(JSON.stringify(kept()));
    record.steps[1].callId = "call.5";
    expect(parseAutomationStudioFlowBootstrapIncompleteDraft(record, OWNER)).toBeNull();
    const moved = JSON.parse(JSON.stringify(kept()));
    moved.steps[2].position = 7;
    expect(parseAutomationStudioFlowBootstrapIncompleteDraft(moved, OWNER)).toBeNull();
  });

  // A Flow is no longer capped at sixty-four nodes, so a draft kept from a
  // build of a larger Flow must seed the next build. The reader has only the
  // owner's ids and bounds by the largest Flow the setting allows.
  it.each([100, 150])("reads back a kept draft of %i steps", (count) => {
    const record = JSON.parse(JSON.stringify(kept())) as { steps: Array<Record<string, unknown>> };
    record.steps = Array.from({ length: count }, (_, index) => ({ ...record.steps[0], position: index + 1 }));
    expect(parseAutomationStudioFlowBootstrapIncompleteDraft(record, OWNER)?.steps).toHaveLength(count);
  });

  it("refuses a kept draft longer than any Flow could hold", () => {
    const beyond = automationStudioFlowBootstrapLargestSizeLimits().maxTotalNodes + AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations + 2;
    const record = JSON.parse(JSON.stringify(kept())) as { steps: Array<Record<string, unknown>> };
    record.steps = Array.from({ length: beyond }, (_, index) => ({ ...record.steps[0], position: index + 1 }));
    expect(parseAutomationStudioFlowBootstrapIncompleteDraft(record, OWNER)).toBeNull();
  });
});

describe("one build's keeper", () => {
  function keeper(overrides: Partial<Parameters<typeof automationStudioFlowBootstrapIncompleteDraftKeeper>[0]> = {}) {
    const save = vi.fn(async (record: AutomationStudioFlowBootstrapIncompleteDraft) => record);
    const discard = vi.fn(async () => undefined);
    return { save, discard, keeper: automationStudioFlowBootstrapIncompleteDraftKeeper({ enabled: true, stored: undefined, ...BUILD, save, discard, now: () => 5_000, ...overrides }) };
  }

  it("keeps an exhausted build's draft and points at it, the ending unchanged", async () => {
    const { keeper: build, save } = keeper();
    const loop = exhaustedLoop(DRAFT);
    const pointer = await build.exhausted(loop, (kept) => kept);
    expect(pointer).toEqual({ revision: 1, steps: 3 });
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0]![0]).toMatchObject({ status: "incomplete", stopped: "budget", outstandingIssueCodes: ["plan.profile_limit_exceeded"], completionAttempts: 4 });
    // The terminal code is still the truth, and the diagnostic still parses as Core's own.
    const diagnostic = parseAutomationStudioFlowBootstrapGenerationError(flowBootstrapEvidenceLoopFailure(loop, undefined, pointer));
    expect(diagnostic?.code).toBe("flow_bootstrap.evidence_iteration_limit");
    expect(diagnostic?.evidenceLoop?.incompleteDraft).toEqual({ revision: 1, steps: 3 });
    expect(diagnostic?.evidenceLoop?.exhausted).toMatchObject({ bound: "budget", proposableSteps: 3 });
  });

  it("points at nothing when there was nothing to keep, or the write failed", async () => {
    const nothing = keeper();
    expect(await nothing.keeper.exhausted(exhaustedLoop([step(1, { disposition: "dropped" })]), (kept) => kept)).toBeUndefined();
    expect(nothing.save).not.toHaveBeenCalled();
    const failing = keeper({ save: vi.fn(async () => { throw new Error("disk full"); }) });
    expect(await failing.keeper.exhausted(exhaustedLoop(DRAFT), (kept) => kept)).toBeUndefined();
    // A diagnostic with no pointer is exactly the one this build would have published before.
    const diagnostic = parseAutomationStudioFlowBootstrapGenerationError(flowBootstrapEvidenceLoopFailure(exhaustedLoop(DRAFT), undefined, undefined));
    expect(diagnostic?.evidenceLoop).not.toHaveProperty("incompleteDraft");
  });

  it("keeps a stalled build's last offered draft, writing it before the stall travels on", async () => {
    const { keeper: build, save } = keeper();
    build.attempted(DRAFT.slice(0, 1));
    build.attempted(DRAFT);
    const stall = flowBootstrapEvidenceUnusableDecisionFailure({ trace: [], accounting: { iterations: 8, toolCalls: 5, evidenceBytes: 10 } as never, issueCodes: ["flow_bootstrap.instructed_act_missing"] });
    const pointed = build.stalled(stall);
    expect(save).not.toHaveBeenCalled();
    await expect(build.settle(Promise.reject(pointed))).rejects.toBe(pointed);
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0]![0]).toMatchObject({ stopped: "unusable_decisions", completionAttempts: 2, outstandingIssueCodes: ["flow_bootstrap.instructed_act_missing"] });
    const diagnostic = parseAutomationStudioFlowBootstrapGenerationError(pointed);
    expect(diagnostic?.code).toBe("flow_bootstrap.evidence_unusable_decision");
    expect(diagnostic?.evidenceLoop?.incompleteDraft).toEqual({ revision: 1, steps: 3 });
  });

  it("lets the stall travel without a pointer when its record could not be written", async () => {
    const { keeper: build } = keeper({ save: vi.fn(async () => { throw new Error("disk full"); }) });
    build.attempted(DRAFT);
    const stall = flowBootstrapEvidenceUnusableDecisionFailure({ trace: [], accounting: { iterations: 8, toolCalls: 5, evidenceBytes: 10 } as never, issueCodes: ["x.y"] });
    const pointed = build.stalled(stall);
    await expect(build.settle(Promise.reject(pointed))).rejects.toBe(stall);
  });

  it("keeps nothing for a stall that never tried to finish", async () => {
    const { keeper: build, save } = keeper();
    const stall = flowBootstrapEvidenceUnusableDecisionFailure({ trace: [], accounting: { iterations: 8, toolCalls: 5, evidenceBytes: 10 } as never, issueCodes: ["x.y"] });
    expect(build.stalled(stall)).toBe(stall);
    await expect(build.settle(Promise.reject(stall))).rejects.toBe(stall);
    expect(save).not.toHaveBeenCalled();
  });

  it("passes any other failure through untouched", async () => {
    const { keeper: build, save } = keeper();
    const other = new AutomationStudioFlowBootstrapGenerationError({ code: "flow_bootstrap.evidence_cancelled", stage: "provider_output_validation", retryable: true, providerInvocation: "attempted", providerResponse: "received" });
    await expect(build.settle(Promise.reject(other))).rejects.toBe(other);
    expect(save).not.toHaveBeenCalled();
  });

  it("continues a stored record, numbering what it keeps next, and clears it once a Flow is proposed", async () => {
    const stored = kept();
    const { keeper: build, save, discard } = keeper({ stored });
    expect(build.draft?.resume.revision).toBe(1);
    expect(await build.exhausted(exhaustedLoop(DRAFT), (kept) => kept)).toEqual({ revision: 2, steps: 3 });
    expect(save.mock.calls[0]![0]).toMatchObject({ revision: 2, createdAt: 1_000, updatedAt: 5_000 });
    await build.finished();
    expect(discard).toHaveBeenCalledOnce();
  });

  it("does not continue a stale record, and writes revision 1 over it", async () => {
    const { keeper: build } = keeper({ stored: kept(), baseDependencyDigest: "digest-2" });
    expect(build.draft).toBeUndefined();
    expect(await build.exhausted(exhaustedLoop(DRAFT), (kept) => kept)).toEqual({ revision: 1, steps: 3 });
  });

  it("does nothing at all for an extend, whose draft is the Flow as it stands", async () => {
    const { keeper: build, save, discard } = keeper({ enabled: false, stored: kept() });
    expect(build.draft).toBeUndefined();
    expect(await build.exhausted(exhaustedLoop(DRAFT), (kept) => kept)).toBeUndefined();
    build.attempted(DRAFT);
    const stall = flowBootstrapEvidenceUnusableDecisionFailure({ trace: [], accounting: { iterations: 8, toolCalls: 5, evidenceBytes: 10 } as never, issueCodes: ["x.y"] });
    expect(build.stalled(stall)).toBe(stall);
    await build.finished();
    expect(save).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
  });
});
