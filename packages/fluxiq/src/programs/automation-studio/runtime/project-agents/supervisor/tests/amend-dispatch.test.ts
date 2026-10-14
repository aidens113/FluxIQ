// What the supervisor is told around a `project.amend_plan` (bigbox debug C2
// and C4, t588). On A8 launch 6 the supervisor amended its plan, then sent a
// brief whose predecessor's proposal the amendment had made stop counting, and
// was refused three times with an issue naming only a path. A dispatch's
// return now lists each trial's receipt ref, as a repair's failingReceipt names
// one, and a refused predecessor is named, with why it does not count.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../index.ts";
import { planInput, subflow, taskSpecInput } from "./supervisor-fixture.ts";
import { FIND, HOLD, NOTE, brief, call, dispatch, end, supervise } from "./supervisor-script.ts";

const TWO = planInput([
  subflow("find_titles", ["p1"], { inputs: ["author"], outputs: ["titles"] }),
  subflow("place_hold", ["p2"], { inputs: ["titles"], after: ["find_titles"] })
], taskSpecInput([["p1", FIND, []], ["p2", HOLD, []]]));
const THREE = planInput([
  subflow("find_titles", ["p1"], { inputs: ["author"], outputs: ["titles"] }),
  subflow("place_hold", ["p2"], { inputs: ["titles"], outputs: ["shelf"], after: ["find_titles"] }),
  subflow("note_shelf", ["p3"], { inputs: ["shelf"], after: ["place_hold"] })
], taskSpecInput([["p1", FIND, []], ["p2", HOLD, []], ["p3", NOTE, []]]));

describe("a dispatch around an amended plan", () => {
  it("returns each trial's receipt ref, and names a predecessor the amendment left without a done proposal, and why", async () => {
    const run = await supervise([
      call(IDS.writePlan, TWO),
      dispatch([brief("find_titles", ["p1"])]),
      call(IDS.amendPlan, { ...THREE, reason: "The shelf is a third part." }),
      dispatch([brief("place_hold", ["p2"], ["find_titles"])]),
      dispatch([brief("place_hold", ["p2"], ["note_shelf"])]),
      end("blocked")
    ]);
    const answers = run.shown.filter((entry) => entry.toolId === IDS.dispatch).map((entry) => entry.value as JsonObject);
    expect(answers[0]).toMatchObject({ ok: true, returns: [{ subflowKey: "find_titles", outcome: "done", trials: [{ kind: "subflow_trial", receiptId: "trial-brief-1", digest: "c".repeat(64) }] }] });
    expect(answers[1]).toMatchObject({ ok: false, code: "project.predecessor_not_done" });
    const [dropped] = answers[1]!.issues as JsonObject[];
    expect(dropped).toMatchObject({ code: "project.predecessor_not_done", path: "briefs.0.entry.predecessors.0", predecessor: "find_titles" });
    expect(dropped!.why).toBe("\"find_titles\" had a done proposal only under an earlier plan: proposals made before project.amend_plan no longer count. Send a build or repair brief for \"find_titles\" before this one, or in this same call.");
    const [never] = answers[2]!.issues as JsonObject[];
    expect(never).toMatchObject({ predecessor: "note_shelf", why: "\"note_shelf\" has no done proposal under this plan, and no brief in this call builds it. Send a build or repair brief for \"note_shelf\" before this one, or in this same call." });
    expect(run.dispatched).toHaveLength(1);
  });
});
