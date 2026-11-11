// A FluxNode run's overrides (W3, t899): the frame its attempt runs inside, kept apart per run, the person wait they
// set, the judge's changed criteria, and the digest on the result. The service is a fake whose attempt reads the frame.
import { fluxNodeSpecSchema, resolveFluxNodeOverrides, type FluxNodeOptions, type FluxNodeOverrides, type FluxNodeResolvedOptions, type FluxNodeRunResult, type FluxNodeSpec } from "@fluxiq/contracts/fluxnode";
import { describe, expect, it } from "vitest";
import type { AutomationStudioAsk } from "../../../../../runtime/automation-parking/index.ts";
import type { AutomationStudioService } from "../../../service.ts";
import { automationStudioRunOverrides, type AutomationStudioRunOverrides } from "../../../../../runtime/run-overrides/index.ts";
import { fluxNodeCallerOptions } from "../caller-options.ts";
import { FluxNodeRun } from "../fluxnode-run.ts";
import type { FluxNodeRegisteredSpec } from "../owner-flows.ts";
import { runFluxNode, type FluxNodeRunContext } from "../run-fluxnode.ts";
import { FluxNodeRunRegistry } from "../run-registry.ts";

type Seen = { frame: Readonly<AutomationStudioRunOverrides> | undefined; options: Record<string, unknown> };

const specOf = (over: { overrides?: FluxNodeOverrides; options?: FluxNodeOptions }): FluxNodeSpec =>
  fluxNodeSpecSchema.parse({ name: "library.find-loans", runtime: "library", start: "library://account", goal: "List my loans whose title has {title} in it.", inputs: { type: "object", properties: { title: { type: "string" } }, required: ["title"] }, scope: { acts: [] }, ...over });

/** A service whose attempt records the frame it runs in, after `pauseMs` so that runs overlap. */
function fakeContext(seen: Seen[], over: Partial<FluxNodeRunContext> = {}, pauseMs = 0): FluxNodeRunContext {
  const service = {
    buildCancellation: { cancel: () => true },
    generateFlowBootstrapAdaptation: async (_request: unknown, options: Record<string, unknown>) => {
      if (pauseMs) await new Promise((resolve) => setTimeout(resolve, pauseMs));
      seen.push({ frame: automationStudioRunOverrides(), options });
      return { status: "stopped" };
    }
  };
  return { service: service as unknown as AutomationStudioService, flows: { instruct: async () => undefined }, modelCaller: { actorUserId: "t", actorSessionId: "t" }, startLocationOf: () => undefined, personWaitMs: 600_000, now: () => 1000, ...over };
}

async function run(context: FluxNodeRunContext, declared: FluxNodeOverrides | undefined, perRun: FluxNodeOverrides | undefined, options?: FluxNodeOptions): Promise<{ result: FluxNodeRunResult; run: FluxNodeRun }> {
  const spec = specOf({ ...(declared === undefined ? {} : { overrides: declared }), ...(options === undefined ? {} : { options }) });
  const registered: FluxNodeRegisteredSpec = { name: spec.name, specHash: "a".repeat(64), spec, projectId: "p", flowId: "f", flowPath: "nodes/library/find-loans", registeredAt: 1 };
  const target = { name: spec.name, specHash: registered.specHash, projectId: "p", flowId: "f", flowPath: registered.flowPath };
  const fluxRun = new FluxNodeRun("fnr-1", target, { inputs: { title: "x" }, ...(perRun === undefined ? {} : { overrides: perRun }) }, "/events", () => 1000);
  const outcome = await runFluxNode(context, fluxRun, registered, "resume.fnr-1");
  return { result: outcome.result, run: fluxRun };
}

describe("a FluxNode run sets its overrides frame around the attempt", () => {
  it("shows the attempt retries + 1, the merged overrides and their digest, and leaves empty groups out", async () => {
    const seen: Seen[] = [];
    const declared: FluxNodeOverrides = { judgeCriteria: ["Titles are complete."], pace: { minStepGapMs: 5 } };
    const perRun: FluxNodeOverrides = { prompts: { "core.efficiency": { mode: "append", text: "Prefer fewer steps." } } };
    const { result } = await run(fakeContext(seen), declared, perRun, { retries: 6 });
    const expected = await resolveFluxNodeOverrides(declared, perRun);
    expect(seen[0]?.frame).toEqual({ nodeAttempts: 7, prompts: { "core.efficiency": { mode: "append", text: "Prefer fewer steps." } }, judgeCriteria: ["Titles are complete."], pace: { minStepGapMs: 5 }, digest: expected.digest });
    expect(result.overridesDigest).toBe(expected.digest);
  });

  it("sets a frame with only the attempts, and no digest, for a run with no overrides", async () => {
    const seen: Seen[] = [];
    const { result } = await run(fakeContext(seen), undefined, undefined);
    expect(seen[0]?.frame).toEqual({ nodeAttempts: 4 });
    expect(result.overridesDigest).toBeUndefined();
    expect(automationStudioRunOverrides()).toBeUndefined();
  });

  it("gives two runs at once each its own frame", async () => {
    const seen: Seen[] = [];
    const context = fakeContext(seen, {}, 20);
    await Promise.all([run(context, undefined, { pace: { minStepGapMs: 1 } }, { retries: 4 }), run(context, undefined, { pace: { minStepGapMs: 2 } }, { retries: 9 })]);
    expect(new Map(seen.map((each) => [each.frame?.pace?.minStepGapMs, each.frame?.nodeAttempts]))).toEqual(new Map([[1, 5], [2, 10]]));
  });

  it("waits for a person as long as the overrides' deadline says, else as long as the service does", async () => {
    const ask = { askId: "a", kind: "open", text: "Sign in." } as unknown as AutomationStudioAsk;
    const waitUntilOf = async (perRun: FluxNodeOverrides | undefined): Promise<unknown> => {
      const seen: Seen[] = [];
      const done = await run(fakeContext(seen, { personWaitMs: 40 }), undefined, perRun);
      const sink = seen[0]?.options.personAsk as { answer: (ask: AutomationStudioAsk, wait: object) => Promise<unknown> };
      await sink.answer(ask, {});
      return (done.run.eventsAfter(0).find((event) => event.type === "person_needed") as { waitUntil: number } | undefined)?.waitUntil;
    };
    expect(await waitUntilOf({ deadlines: { personWaitMs: 15 } })).toBe(1015);
    expect(await waitUntilOf(undefined)).toBe(1040);
  });
});

describe("changed judge criteria are judged on a Flow whose replay would skip the judge", () => {
  const judgeOf = async (recorded: string | undefined, perRun: FluxNodeOverrides | undefined): Promise<unknown> => {
    const seen: Seen[] = [];
    await run(fakeContext(seen, { judgedWith: () => recorded }), undefined, perRun);
    return seen[0]?.options.judge;
  };

  it("passes judge always when the criteria differ from the recorded ones", async () => {
    const same = await resolveFluxNodeOverrides(undefined, { judgeCriteria: ["Titles are complete."] });
    const other = await resolveFluxNodeOverrides(undefined, { judgeCriteria: ["Dates are in ISO form."] });
    expect(await judgeOf(same.judgeDigest, { judgeCriteria: ["Titles are complete."] })).toBe("auto");
    expect(await judgeOf(other.judgeDigest, { judgeCriteria: ["Titles are complete."] })).toBe("always");
    expect(await judgeOf(undefined, { judgeCriteria: ["Titles are complete."] })).toBe("always");
    expect(await judgeOf(undefined, undefined)).toBe("auto");
  });

  it("never turns an off judge on", () => {
    const options = { retries: 3, judge: "off", budgetUsd: 1, mode: "auto" } as FluxNodeResolvedOptions;
    const input = { spec: { name: "n", scope: { acts: [] as [] }, hasCheck: false }, specHash: "a", runId: "r", options, inputs: {}, bridge: undefined, personAsk: { raised: () => undefined }, judgeChanged: true };
    expect(fluxNodeCallerOptions(input).judge).toBe("off");
    expect(fluxNodeCallerOptions({ ...input, options: { ...options, judge: "auto" } }).judge).toBe("always");
  });

  it("records a digest per Flow, kept until another judged run replaces it", () => {
    const registry = new FluxNodeRunRegistry();
    expect(registry.judgedWith("f")).toBeUndefined();
    registry.judged("f", "one");
    registry.judged("f", "two");
    expect(registry.judgedWith("f")).toBe("two");
    expect(registry.judgedWith("g")).toBeUndefined();
  });
});

describe("humanness reaches the attempt", () => {
  it("is passed through when set and left out when not", () => {
    const base = { retries: 3, judge: "auto", budgetUsd: 1, mode: "auto" };
    const input = (options: object) => ({ spec: { name: "n", scope: { acts: [] as [] }, hasCheck: false }, specHash: "a", runId: "r", options: options as FluxNodeResolvedOptions, inputs: {}, bridge: undefined, personAsk: { raised: () => undefined } });
    const humanness = { pace: "slow" };
    expect((fluxNodeCallerOptions(input({ ...base, humanness })) as { humanness?: unknown }).humanness).toEqual(humanness);
    expect("humanness" in fluxNodeCallerOptions(input(base))).toBe(false);
  });
});
