// The warning before the last refusal of a run, in the words of the loop it is sent in (`../refusal-run.ts`, t587).
// A8 launch 6 (`run-mv85vjqo-4c022aec`, step 107): the project supervisor, a loop that drafts nothing, was told the Flow
// would be tested and judged as it stands; nothing was, and the build threw. The draft and candidate wordings are pinned
// byte for byte as they were before.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioLlmEvidenceRefusalRun } from "../../evidence-progress/index.ts";
import { automationStudioLlmEvidenceRefusedOfAKind } from "../refusal-run.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext } from "../types.ts";

/** The instruction a loop with `input` is warned with at the second refusal of one kind in a row. */
function warning(input: JsonObject): string {
  const evidence: AutomationStudioLlmEvidenceDecisionHandlerContext["evidence"] = [];
  const context = {
    input, trace: [], accounting: {}, draftSteps: [], evidence, refusalRun: automationStudioLlmEvidenceRefusalRun(), accountEvidence: () => undefined
  } as unknown as AutomationStudioLlmEvidenceDecisionHandlerContext;
  expect(automationStudioLlmEvidenceRefusedOfAKind(context, 4, "call:project.predecessor_not_done", "code")).toBeUndefined();
  expect(automationStudioLlmEvidenceRefusedOfAKind(context, 5, "call:project.predecessor_not_done", "code")).toBeUndefined();
  return String((evidence.at(-1)!.value as JsonObject).instruction);
}

const reason = "call:project.predecessor_not_done";

describe("the warning that one more refusal of a kind ends the round", () => {
  it("tells a loop that drafts nothing that it ends with nothing tested or judged, and offers an honest completion", () => {
    const told = warning({ draft: false });
    expect(told).toBe(`Your last 2 decisions were refused, or changed nothing, for the same reason (${reason}). One more decision refused for it ends this work where it stands, with nothing tested or judged. `
      + "Do not send another decision of that kind: do what next beside the refusal says instead, send the move the refusal names as missing first, or complete with what you can honestly say is done and what is not.");
    expect(told).not.toContain("tested and judged as it stands");
  });

  it("keeps the draft-mode and candidate-mode wordings byte for byte", () => {
    expect(warning({})).toBe(`Your last 2 decisions were refused, or changed nothing, for the same reason (${reason}). One more decision refused for it ends this exploration, and the Flow is then tested and judged as it stands. `
      + "Do not send another decision of that kind: do what next beside the refusal says instead, run what the Flow still lacks, or complete if the Flow already does what the person asked.");
    expect(warning({ draft: false, discoveryOnly: true })).toBe(`Your last 2 decisions were refused, or changed nothing, for the same reason (${reason}). One more decision refused for it ends this build with nothing tested. `
      + "Do not send another decision of that kind: do what next beside the refusal says instead -- correct the lines a refused submission names and submit the whole candidate again -- or look at the page for what the Flow still needs.");
  });
});
