// The trial a repair starts from: the closest to passing, not the latest
// (t606). A8 towels (`run-mv8p37k8-f1a90624`): three trials stored the right
// rows and answered unsure, and the repair was sent the last, a no that stored
// two rows.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioProjectBuilderReturn as RETURN, type AutomationStudioProjectBuilderReturn, type AutomationStudioProjectTrialRef } from "../../contracts/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../index.ts";
import { planInput, project, subflow, taskSpecInput } from "./supervisor-fixture.ts";
import { FIND, brief, call, dispatch, end, supervise } from "./supervisor-script.ts";

const trial = (n: number, verdict?: AutomationStudioProjectTrialRef["verdict"], rows?: number): AutomationStudioProjectTrialRef => ({
  kind: "subflow_trial", receiptId: `trial-${n}`, digest: String(n).repeat(64), ...(verdict ? { verdict } : {}), ...(rows !== undefined ? { rows } : {})
});
const returned = (trials: AutomationStudioProjectTrialRef[], outcome: AutomationStudioProjectBuilderReturn["outcome"] = "partial"): AutomationStudioProjectBuilderReturn => ({ briefId: "b1", outcome, reason: "r", trials, spentUsd: 0, calls: 1 });
// The towels run's five trials, in order.
const FIVE = [trial(1, "no", 10), trial(2, "unsure", 9), trial(3, "unsure", 9), trial(4, "no", 9), trial(5, "no", 2)];

describe("the closest trial to passing", () => {
  it("is an unsure trial over a no, and the latest among equals", () => {
    expect(RETURN.closestTrial([returned(FIVE)])?.receiptId).toBe("trial-3");
  });

  // More rows is not closer to passing for a filtered request (t752): among one verdict the latest that stored answer rows.
  it("is, among the same verdict, the latest, unless only an earlier one stored answer rows", () => {
    expect(RETURN.closestTrial([returned([trial(1, "no", 10), trial(2, "no", 2)])])?.receiptId).toBe("trial-2");
    expect(RETURN.closestTrial([returned([trial(1, "no", 2), trial(2, "no", 2)])])?.receiptId).toBe("trial-2");
    expect(RETURN.closestTrial([returned([trial(1, "no", 2), trial(2, "no", 0)])])?.receiptId).toBe("trial-1");
  });

  it("ranks no over a trial not judged and one whose run failed, and looks across every return of the subflow", () => {
    expect(RETURN.closestTrial([returned([trial(1, "no", 0)]), returned([trial(2, "not_judged", 5), trial(3, "execution_failed", 7)])])?.receiptId).toBe("trial-1");
  });

  it("never chooses a trial that passed, and is the latest where no trial carries its verdict", () => {
    expect(RETURN.closestTrial([returned([trial(1, "no", 1), trial(2, "yes", 9)], "done")])?.receiptId).toBe("trial-1");
    expect(RETURN.closestTrial([returned([trial(1, "yes", 9)], "done")])).toBeUndefined();
    expect(RETURN.closestTrial([returned([trial(1), trial(2)])])?.receiptId).toBe("trial-2");
  });

  it("is copied as the reference alone", () => {
    expect(RETURN.trialRef(FIVE[2]!)).toEqual({ kind: "subflow_trial", receiptId: "trial-3", digest: "3".repeat(64) });
  });
});

describe("a repair of a subflow whose trials did not pass", () => {
  const ONE_PART = planInput([subflow("main", ["p1"])], taskSpecInput([["p1", FIND, []]]));
  const firstPartial = () => project({ builder: (_brief, attempt) => (attempt === 1 ? "partial" : "done"), notDoneTrials: (_brief, attempt) => (attempt === 1 ? FIVE : []) });

  it("is offered the closest trial beside the return, and is sent with it in place of the worse latest one it named", async () => {
    const run = await supervise([
      call(IDS.writePlan, ONE_PART),
      dispatch([brief("main", ["p1"])]),
      call(IDS.dispatch, { reason: "The last trial did not pass.", briefs: [brief("main", ["p1"], [], { kind: "repair", failingReceipt: RETURN.trialRef(FIVE[4]!) as unknown as JsonObject })] }),
      end("blocked")
    ], firstPartial());
    const answered = run.shown.filter((entry) => entry.toolId === IDS.dispatch).map((entry) => entry.value as JsonObject);
    expect(answered[0]).toMatchObject({ ok: true, returns: [{ outcome: "partial", repairFrom: { failingReceipt: { kind: "subflow_trial", receiptId: "trial-3", digest: "3".repeat(64) } } }] });
    const shownReturn = (answered[0]!.returns as JsonObject[])[0]!;
    // The refs stay copyable whole; what each answered is beside them.
    expect(shownReturn.trials).toEqual(FIVE.map((each) => RETURN.trialRef(each)));
    expect(shownReturn.trialsAnswered).toEqual(FIVE.map(({ receiptId, verdict, rows }) => ({ receiptId, verdict, rows })));
    expect(run.dispatched[1]!.briefs[0]!.failingReceipt).toEqual({ kind: "subflow_trial", receiptId: "trial-3", digest: "3".repeat(64) });
  });

  it("keeps the trial it named when that one is as close as any", async () => {
    const run = await supervise([
      call(IDS.writePlan, ONE_PART),
      dispatch([brief("main", ["p1"])]),
      call(IDS.dispatch, { reason: "Start from the second trial.", briefs: [brief("main", ["p1"], [], { kind: "repair", failingReceipt: RETURN.trialRef(FIVE[1]!) as unknown as JsonObject })] }),
      end("blocked")
    ], firstPartial());
    expect(run.dispatched[1]!.briefs[0]!.failingReceipt).toEqual(RETURN.trialRef(FIVE[1]!));
  });
});
