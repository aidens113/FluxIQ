// @fluxiq-test-group real-sql
// Refused before any model call (plan: about 35 codes, "each one is either resolved automatically
// or becomes a setup step that says what to do. None is reported as a failed task"). Only this
// mode: the old modes' refusals stay what they were, and two tests hold that.
import { afterEach, describe, expect, it, vi } from "vitest";
import { caller } from "../../../../../tests/service-bootstrap/tests/fixtures.ts";
import type { AutomationStudioService, AutomationStudioServiceOptions } from "../../../../../service.ts";
import { automationStudioAnswerFirstAttemptPorts, automationStudioAnswerFirstSetupOf } from "../../../index.ts";
import { complete, READ_LOANS, runNode, scriptedAttempt } from "../../fake-library.ts";
import { expectReached, keptAttempt } from "../support.ts";

vi.setConfig({ testTimeout: 120_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const NO_RESOLVER = { llmProviderResolver: undefined } as unknown as Partial<AutomationStudioServiceOptions>;
const NO_RUNTIME = { llmEvidenceRuntime: undefined } as unknown as Partial<AutomationStudioServiceOptions>;

/** The diagnostic's code on what the old mode threw, read off it: the barrel that reads one must not be this file's first value import of the path it sits on. */
const codeOf = (error: unknown): string | undefined => (error as { diagnostic?: { code?: string } } | null)?.diagnostic?.code;
const adaptations = (service: AutomationStudioService) => (service as unknown as { bootstrapAdaptations: { listFlowBootstrapAdaptations: (projectId: string, flowId: string) => Promise<{ status: string }[]> } }).bootstrapAdaptations;

describe("a refusal before any model call", () => {
  it("a proposal waiting is resolved: an attempt proposes nothing, so it starts and reaches its result", async () => {
    let looked = 0;
    let legacyCode: string | undefined;
    const attempt = await scriptedAttempt({
      before: async (service, project) => {
        adaptations(service).listFlowBootstrapAdaptations = async () => {
          looked += 1;
          return [{ status: "proposed" }];
        };
        // The old mode's refusal, the same as ever, on this same Flow.
        await service.generateFlowBootstrapAdaptation({ ...project, caller: caller(), permittedConsequences: [] }).catch((error: unknown) => { legacyCode = codeOf(error); });
      },
      script: [runNode("read", READ_LOANS, {}, [], { add: true }), complete("Listed.")]
    }, cleanups);
    expect(legacyCode).toBe("flow_bootstrap.pending_adaptation_exists");
    // The legacy call looked; the attempt did not.
    expect(looked).toBe(1);
    expect(expectReached(attempt).result?.rows?.totalRows).toBe(3);
  });

  it("a Flow that already has steps is resolved: an attempt writes nothing into it", async () => {
    let legacyCode: string | undefined;
    let asked = 0;
    let restore: (() => void) | undefined;
    const attempt = await scriptedAttempt({
      before: async (service, project) => {
        // A top-level Flow's work is its Subflows: one is what makes it not blank.
        const subflows = vi.spyOn(service, "listFlowSubflowSummaries").mockImplementation(async () => {
          asked += 1;
          return { total: 1, subflows: [] } as unknown as Awaited<ReturnType<AutomationStudioService["listFlowSubflowSummaries"]>>;
        });
        restore = () => subflows.mockRestore();
        await service.generateFlowBootstrapAdaptation({ ...project, caller: caller(), permittedConsequences: [] }).catch((error: unknown) => { legacyCode = codeOf(error); });
        expect(asked).toBeGreaterThan(0);
        asked = 0;
      },
      script: [runNode("read", READ_LOANS, {}, [], { add: true }), complete("Listed.")]
    }, cleanups);
    restore?.();
    expect(legacyCode).toBe("flow_bootstrap.blank_target_required");
    expect(expectReached(attempt).result?.rows?.totalRows).toBe(3);
    // Nothing was written into the Flow.
    expect((await attempt.service.getFlow(attempt.projectId, attempt.flowId)).nodes).toEqual([]);
  });

  it("nothing asked yet is a setup step: no attempt, no model call, and words that say what to do", async () => {
    let legacyCode: string | undefined;
    const attempt = await scriptedAttempt({
      noInstruction: true,
      before: async (service, project) => {
        await service.generateFlowBootstrapAdaptation({ ...project, caller: caller(), permittedConsequences: [] }).catch((error: unknown) => { legacyCode = codeOf(error); });
      },
      script: []
    }, cleanups);
    expect(legacyCode).toBe("flow_bootstrap.active_instructions_required");
    expect(automationStudioAnswerFirstSetupOf(attempt.answered)).toMatchObject({ status: "setup_needed", code: "flow_bootstrap.active_instructions_required", say: expect.stringContaining("Tell me what you want done") });
    expect(attempt.requests).toEqual([]);
    expect(await keptAttempt(attempt.service, attempt.projectId, attempt.flowId)).toBeUndefined();
    const said = attempt.said.slice(attempt.said.findIndex((line) => line.includes("Working on your task")));
    expect(said.some((line) => line.includes("Before I can start"))).toBe(true);
    expect(said.join("\n")).not.toMatch(/failed/iu);
  });

  it("no model to ask is a setup step", async () => {
    const attempt = await scriptedAttempt({ over: NO_RESOLVER, script: [] }, cleanups);
    expect(automationStudioAnswerFirstSetupOf(attempt.answered)).toMatchObject({ status: "setup_needed", code: expect.stringMatching(/provider_resolver_unavailable/u), say: expect.stringContaining("model key") });
    expect(await keptAttempt(attempt.service, attempt.projectId, attempt.flowId)).toBeUndefined();
  });

  it("no site to reach is a setup step", async () => {
    const attempt = await scriptedAttempt({ over: NO_RUNTIME, script: [] }, cleanups);
    expect(automationStudioAnswerFirstSetupOf(attempt.answered)).toMatchObject({ status: "setup_needed", code: "flow_bootstrap.evidence_runtime_unavailable", say: expect.stringContaining("Connect") });
    expect(attempt.requests).toEqual([]);
  });

  it("a request a fresh round cannot make small enough is a setup step, after three rounds that spent nothing", async () => {
    const waits: number[] = [];
    const attempt = await scriptedAttempt({
      before: (service) => { automationStudioAnswerFirstAttemptPorts(service).sleep = async (ms) => { waits.push(ms); }; },
      resolver: { tokenLimits: { maxInputTokens: 50, maxOutputTokens: 10, maxTotalTokens: 60 } },
      script: [complete("Never asked.")]
    }, cleanups);
    expect(automationStudioAnswerFirstSetupOf(attempt.answered)).toMatchObject({ status: "setup_needed", code: expect.stringMatching(/pre_provider_(input_limit|request_total)_exceeded/u), say: expect.stringContaining("nothing was spent") });
    expect(attempt.requests.filter((request) => request.taskKind === "evidence_tool_decision")).toEqual([]);
    expect(await keptAttempt(attempt.service, attempt.projectId, attempt.flowId)).toBeUndefined();
    // It waited between rounds, since a round that spends nothing must not spin.
    expect(waits.length).toBeGreaterThanOrEqual(1);
  });

  it("limits the harness refuses at the first call are a setup step: nothing was sent or spent, and no attempt is kept", async () => {
    const waits: number[] = [];
    const attempt = await scriptedAttempt({
      before: (service) => { automationStudioAnswerFirstAttemptPorts(service).sleep = async (ms) => { waits.push(ms); }; },
      resolver: { timeoutMs: -5 },
      script: [complete("Never asked.")]
    }, cleanups);
    const setup = automationStudioAnswerFirstSetupOf(attempt.answered);
    expect(setup?.status).toBe("setup_needed");
    expect(setup?.say).toMatch(/settings/u);
    expect(attempt.requests.filter((request) => request.taskKind === "evidence_tool_decision")).toEqual([]);
    expect(await keptAttempt(attempt.service, attempt.projectId, attempt.flowId)).toBeUndefined();
    expect(waits).toEqual([]);
  });
});
