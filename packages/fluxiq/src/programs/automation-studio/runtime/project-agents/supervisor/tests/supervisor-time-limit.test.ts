// The supervisor's time limit (t592, `../supervisor-loop.ts`): A8 launch 7's
// project builds ran under no bound of their own and the Lab stopped watching
// them mid-build. A run that reaches its limit stops its builders, puts the
// target back through Core's reset brief and records an ending naming what is
// left, all inside the bound; a reset that overruns is stopped at the bound
// itself and the ending is still recorded. Run with short limits on the build
// of `./supervisor-fixture.ts`, whose real lasting-act ledger the reset undoes.
import { describe, expect, it } from "vitest";
import { AutomationStudioLlmBuildPurse } from "../../../llm/build-purse/index.ts";
import type { AutomationStudioProjectBuilderReturn } from "../../contracts/index.ts";
import type { AutomationStudioProjectDispatchRequest } from "../../dispatch/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../index.ts";
import { BUILD, planInput, project, subflow, taskSpecInput } from "./supervisor-fixture.ts";
import { FIND, HOLD, brief, call, complete, dispatch, supervise, test } from "./supervisor-script.ts";

const TWO_PART = planInput([subflow("find_titles", ["p1"], { inputs: ["author"], outputs: ["titles"] }), subflow("place_hold", ["p2"], { inputs: ["titles"], outputs: ["shelf"] })], taskSpecInput([["p1", FIND, []], ["p2", HOLD, ["create_new"]]]));
const BUILDS = [brief("find_titles", ["p1"]), brief("place_hold", ["p2"], ["find_titles"], { permittedActs: ["create_new"] })];
const AGAIN = dispatch([brief("find_titles", ["p1"])], "Read the titles again.");

/** A builder still working when its signal aborts, coming back stopped as the dispatcher's do. */
async function stoppedWhenAborted(request: AutomationStudioProjectDispatchRequest): Promise<{ returns: AutomationStudioProjectBuilderReturn[] }> {
  await new Promise<void>((resolve) => request.signal.addEventListener("abort", () => resolve(), { once: true }));
  return { returns: request.briefs.map((sent) => ({ briefId: sent.briefId, outcome: "partial" as const, reason: "The build was stopped before this brief finished.", trials: [], spentUsd: 0, calls: 1 })) };
}

/** The build's dispatcher, with the dispatches numbered in `hang` (from 0) still working until their signal aborts. */
function hanging(built: ReturnType<typeof project>, hang: readonly number[]) {
  const real = built.ports.dispatch;
  const requests: AutomationStudioProjectDispatchRequest[] = [];
  const startedAt: number[] = [];
  built.ports.dispatch = async (request) => {
    requests.push(request);
    startedAt.push(Date.now());
    if (!hang.includes(requests.length - 1)) return await real(request);
    built.dispatched.push({ briefs: request.briefs.map((sent) => structuredClone(sent)), signal: request.signal });
    return await stoppedWhenAborted(request);
  };
  return { requests, startedAt };
}

describe("a supervisor that reaches its time limit", () => {
  it("stops the builder in flight at the work deadline, runs Core's reset and records an ending inside the bound", async () => {
    const built = project({ ledger: {}, purse: new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.5 }) });
    const sent = hanging(built, [1]);
    const startedAt = Date.now();
    const run = await supervise([call(IDS.writePlan, TWO_PART), dispatch(BUILDS), AGAIN, call(IDS.assemble)], built, { timeLimit: { maxMs: 1_200, endingMs: 600 } });
    const tookMs = Date.now() - startedAt;

    expect(run.outcome.timedOut).toBe(true);
    expect(run.outcome.status).toBe("ended");
    // The builder working at the deadline was stopped, and no decision was asked for after it.
    expect(sent.requests[1]!.signal.aborted).toBe(true);
    expect(run.offered).toHaveLength(3);
    expect(built.dispatched.map((request) => request.briefs.map((brief) => brief.kind))).toEqual([["build", "build"], ["build"], ["reset"]]);
    // Core's reset ran under the bound's signal, not the stopped work's.
    expect(sent.requests[2]!.signal.aborted).toBe(false);
    const view = await built.record.read(BUILD);
    expect(view?.record.ending?.outcome).toBe("partial");
    expect(view?.record.ending?.reason).toContain("The build reached its time limit of 1 second before a whole trial passed.");
    expect(view?.record.ending?.reason).not.toContain("Still on the target");
    expect(built.ledger.snapshot().acts.every((act) => !act.inPlace)).toBe(true);
    expect(tookMs).toBeGreaterThanOrEqual(600 - 20);
    expect(tookMs).toBeLessThan(1_200);
  });

  it("stops a reset that overruns at the bound itself and still records the ending, naming what is left", async () => {
    const built = project({ ledger: { undoes: false }, purse: new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.5 }) });
    const sent = hanging(built, [1, 2]);
    const startedAt = Date.now();
    const run = await supervise([call(IDS.writePlan, TWO_PART), dispatch(BUILDS), AGAIN, call(IDS.assemble)], built, { timeLimit: { maxMs: 900, endingMs: 400 } });
    const tookMs = Date.now() - startedAt;

    expect(run.outcome.timedOut).toBe(true);
    expect(built.dispatched.map((request) => request.briefs.map((brief) => brief.kind))).toEqual([["build", "build"], ["build"], ["reset"]]);
    expect(sent.requests[2]!.signal.aborted).toBe(true);
    const view = await built.record.read(BUILD);
    expect(view?.record.ending?.outcome).toBe("partial");
    expect(view?.record.ending?.reason).toContain("reached its time limit");
    expect(view?.record.ending?.reason).toContain("Still on the target from this build: trial step 1 \"press hold for place_hold\".");
    expect(tookMs).toBeGreaterThanOrEqual(900 - 20);
    expect(tookMs).toBeLessThan(2_000);
  });

  it("ends a run that did nothing before its limit blocked, with no reset to send", async () => {
    const built = project({ ledger: {}, purse: new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.5 }) });
    hanging(built, [0]);
    const run = await supervise([call(IDS.writePlan, TWO_PART), dispatch(BUILDS), call(IDS.assemble)], built, { timeLimit: { maxMs: 400, endingMs: 200 } });

    expect(run.outcome.timedOut).toBe(true);
    expect(built.dispatched.map((request) => request.briefs.map((brief) => brief.kind))).toEqual([["build", "build"]]);
    const view = await built.record.read(BUILD);
    expect(view?.record.ending?.outcome).toBe("blocked");
    expect(view?.record.ending?.reason).toContain("reached its time limit");
  });
});

describe("a supervisor inside its time limit", () => {
  it("completes as before, and its limit's clock is stopped once it returns", async () => {
    const built = project({ ledger: { hook: true } });
    const run = await supervise([call(IDS.writePlan, TWO_PART), dispatch(BUILDS), call(IDS.assemble), test, complete], built, { timeLimit: { maxMs: 300, endingMs: 100 } });

    expect(run.outcome.status, JSON.stringify(run.outcome.loop)).toBe("candidate");
    expect(run.outcome.timedOut).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(built.dispatched[0]!.signal.aborted).toBe(false);
  });
});
