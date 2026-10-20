// A return that knows nothing a changed brief could say would let it go on
// carries a closed terminal reason (t743), set structurally where the return
// is made and never read from words: the allowance's refusal, the build's
// stop, and the brief's own permission or person-needed ending. The
// supervisor's repair-first rule does not hold an ending for such a return
// (`../../supervisor/completion.ts`). On the dispatcher's garden catalogue.
import { describe, expect, it } from "vitest";
import type { AutomationStudioSubflowBuilderOutcome } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioLlmBuildPurse } from "../../../llm/build-purse/index.ts";
import type { AutomationStudioLlmEvidenceLoopResult } from "../../../llm/index.ts";
import { automationStudioProjectBuilderReturn } from "../../contracts/index.ts";
import { automationStudioProjectDispatchEnding as ending } from "../ending.ts";
import { gardenBrief } from "./dispatch-fixture.ts";

const brief = gardenBrief("b-read", "list_seeds");
const spend = { allowance: undefined, trials: [] };
/** An allowance that refused its next call, as the purse keeps a refusal (`llm/build-purse/purse.ts`). */
const refused = { allowance: { refusal: { code: "llm_purse.allowance_spent" }, spentUsd: () => 0.01, spentCalls: () => 3, toppedUp: () => [] } as unknown as AutomationStudioLlmBuildPurse, trials: [] };

function loopFailed(code: string): Extract<AutomationStudioLlmEvidenceLoopResult, { ok: false }> {
  return { ok: false, code, trace: [], steps: [], accounting: {} } as unknown as Extract<AutomationStudioLlmEvidenceLoopResult, { ok: false }>;
}

function stopped(code: string): AutomationStudioSubflowBuilderOutcome {
  return { loop: loopFailed(code) as unknown as AutomationStudioSubflowBuilderOutcome["loop"], proposal: undefined, trial: undefined, promotionAllowed: false };
}

/** The return, read back through the record's shape and bound to its brief, as the build record keeps it. */
function readBack(returned: ReturnType<typeof ending.built>) {
  expect(automationStudioProjectBuilderReturn.issues(returned, brief)).toEqual([]);
  return automationStudioProjectBuilderReturn.parse(JSON.parse(JSON.stringify(returned)));
}

describe("a return's closed terminal reason", () => {
  it("is allowance_spent when the brief's allowance refused its next call, whether the loop returned or threw", () => {
    const built = ending.built(brief, stopped("llm_evidence_loop.budget"), refused);
    expect(built).toMatchObject({ outcome: "blocked", terminalReason: "allowance_spent" });
    expect(readBack(built)).toMatchObject({ status: "valid", value: { terminalReason: "allowance_spent" } });
    expect(ending.thrown(brief, new Error("refused"), false, refused)).toMatchObject({ outcome: "blocked", terminalReason: "allowance_spent" });
  });

  it("is stopped when the build was stopped: a thrown brief told so, or a loop its signal cancelled", () => {
    const thrown = ending.thrown(brief, new Error("aborted"), true, spend);
    expect(thrown).toMatchObject({ outcome: "blocked", terminalReason: "stopped" });
    expect(readBack(thrown)).toMatchObject({ status: "valid", value: { terminalReason: "stopped" } });
    expect(ending.built(brief, stopped("llm_evidence_loop.cancelled"), spend)).toMatchObject({ terminalReason: "stopped" });
  });

  it("is person_ended when the brief's own permission or person-needed ending stopped it, and its reason is that ending's", () => {
    const ended = ending.personEnded(brief, "blocked", "The person did not permit removing the entry.", spend);
    expect(ended).toMatchObject({ outcome: "blocked", reason: "The person did not permit removing the entry.", terminalReason: "person_ended" });
    expect(readBack(ended)).toMatchObject({ status: "valid", value: { terminalReason: "person_ended" } });
    // A reset that left nothing in place did its one job: done, with no terminal reason.
    expect(ending.personEnded(gardenBrief("b-reset", "list_seeds"), "done", "Every act is undone.", spend)).not.toHaveProperty("terminalReason");
  });

  it("is a reset loop's too, where its allowance refused or the build stopped it", () => {
    const reset = { ...brief, kind: "reset" as const, parts: [] };
    expect(ending.reset(reset, loopFailed("llm_evidence_loop.budget"), [], refused, "done")).toMatchObject({ outcome: "blocked", terminalReason: "allowance_spent" });
    expect(ending.reset(reset, loopFailed("llm_evidence_loop.cancelled"), [], spend, "done")).toMatchObject({ outcome: "blocked", terminalReason: "stopped" });
  });

  it("is never set for any other ending, nor from the reason's words", () => {
    // Another loop code, a builder's own failure, the guard's stop, and the words of a stop in a plain error.
    for (const code of ["llm_evidence_loop.iteration_limit", "llm_evidence_loop.repeat_without_progress", "llm_evidence_loop.no_progress"]) expect(ending.built(brief, stopped(code), spend)).not.toHaveProperty("terminalReason");
    expect(ending.thrown(brief, new Error("The build was stopped before this brief finished, and its allowance could not pay."), false, spend)).not.toHaveProperty("terminalReason");
    expect(ending.notStarted(brief, "The build was stopped before this brief's turn came.")).not.toHaveProperty("terminalReason");
  });
});
