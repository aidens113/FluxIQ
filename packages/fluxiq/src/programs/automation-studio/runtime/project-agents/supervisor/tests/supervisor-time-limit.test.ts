// The supervisor's time limit (t592, `../supervisor-loop.ts`): A8 launch 7's
// project builds ran under no bound of their own and the Lab stopped watching
// them mid-build. A run that reaches its limit stops its builders, puts the
// target back through Core's reset brief and records an ending naming what is
// left, all inside the bound; a reset that overruns is stopped at the bound
// itself and the ending is still recorded. Run with short limits on the build
// of `./supervisor-fixture.ts`, whose real lasting-act ledger the reset undoes.
//
// **The limit runs on a clock the test holds (t644).** On the real clock its
// limits of 300-1200 ms raced the work itself, and the run's own length was
// asserted in wall-clock milliseconds, so a loaded machine could reach a
// deadline before the work it was meant to interrupt had started, or end a run
// past its bound. The supervisor takes its timers from the clock it is handed
// (`AutomationStudioProjectSupervisorClock`, t616); here a timer fires only when
// the test moves the clock past it, at the point of the run the case is about:
// while a builder or the reset is still working. What the elapsed times
// asserted is asserted on that clock instead: which deadline fired, which was
// still pending, and that the run cleared both when it returned.
import { describe, expect, it } from "vitest";
import { AutomationStudioLlmBuildPurse } from "../../../llm/build-purse/index.ts";
import type { AutomationStudioProjectBuilderReturn } from "../../contracts/index.ts";
import type { AutomationStudioProjectDispatchRequest } from "../../dispatch/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS, type AutomationStudioProjectSupervisorClock } from "../index.ts";
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

/**
 * The build's dispatcher, with the dispatches numbered in `hang` (from 0) still working until their signal aborts.
 * `whileWorking` is called with a hanging dispatch's number once it is waiting on its signal: where a case moves the clock.
 */
function hanging(built: ReturnType<typeof project>, hang: readonly number[], whileWorking: (n: number, request: AutomationStudioProjectDispatchRequest) => void = () => undefined) {
  const real = built.ports.dispatch;
  const requests: AutomationStudioProjectDispatchRequest[] = [];
  built.ports.dispatch = async (request) => {
    requests.push(request);
    const n = requests.length - 1;
    if (!hang.includes(n)) return await real(request);
    built.dispatched.push({ briefs: request.briefs.map((sent) => structuredClone(sent)), signal: request.signal });
    const stopped = stoppedWhenAborted(request);
    setImmediate(() => whileWorking(n, request));
    return await stopped;
  };
  return { requests };
}

/**
 * The supervisor's clock, held by the test (header): a timer fires only when `reach` moves the clock to or past its
 * delay. `timers` reads each timer as "<delay> held", "<delay> fired" or "<delay> cleared", in the order they were set.
 */
function heldClock() {
  type Timer = { delay: number; fire: () => void; state: "held" | "fired" | "cleared" };
  const set: Timer[] = [];
  const clock: AutomationStudioProjectSupervisorClock = {
    setTimeout: (fire, ms) => {
      const timer: Timer = { delay: ms, fire, state: "held" };
      set.push(timer);
      return timer;
    },
    clearTimeout: (handle) => {
      const timer = set.find((each) => each === handle);
      if (timer?.state === "held") timer.state = "cleared";
    }
  };
  return {
    clock,
    reach: (ms: number) => {
      for (const timer of set.filter((each) => each.state === "held" && each.delay <= ms).sort((a, b) => a.delay - b.delay)) {
        timer.state = "fired";
        timer.fire();
      }
    },
    timers: () => set.map((timer) => `${timer.delay} ${timer.state}`)
  };
}

describe("a supervisor that reaches its time limit", () => {


  it("ends a run that did nothing before its limit blocked, with no reset to send", async () => {
    const built = project({ ledger: {}, purse: new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.5 }) });
    const held = heldClock();
    // The work deadline while the first dispatch's builders are still working.
    hanging(built, [0], () => held.reach(200));
    const run = await supervise([call(IDS.writePlan, TWO_PART), dispatch(BUILDS), call(IDS.assemble)], built, { timeLimit: { maxMs: 400, endingMs: 200 }, clock: held.clock });

    expect(run.outcome.timedOut).toBe(true);
    expect(built.dispatched.map((request) => request.briefs.map((brief) => brief.kind))).toEqual([["build", "build"]]);
    const view = await built.record.read(BUILD);
    expect(view?.record.ending?.outcome).toBe("blocked");
    expect(view?.record.ending?.reason).toContain("reached its time limit");
    expect(held.timers()).toEqual(["200 fired", "400 cleared"]);
  });
});

describe("a supervisor inside its time limit", () => {
  it("completes as before, and its limit's clock is stopped once it returns", async () => {
    const built = project({ ledger: { hook: true } });
    const held = heldClock();
    const run = await supervise([call(IDS.writePlan, TWO_PART), dispatch(BUILDS), call(IDS.assemble), test, complete], built, { timeLimit: { maxMs: 300, endingMs: 100 }, clock: held.clock });

    expect(run.outcome.status, JSON.stringify(run.outcome.loop)).toBe("candidate");
    expect(run.outcome.timedOut).toBeUndefined();
    // Both timers were cleared as it returned, so moving the clock past the bound afterwards stops nothing.
    expect(held.timers()).toEqual(["200 cleared", "300 cleared"]);
    held.reach(300);
    expect(built.dispatched[0]!.signal.aborted).toBe(false);
  });
});
