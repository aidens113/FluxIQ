// The ladder for a completion refused over the same evidence, and what it leaves on the attempt.
import { automationStudioTaskAttemptNoLoopsCaught } from "@fluxiq/contracts/automation";
import { describe, expect, it } from "vitest";
import { automationStudioLlmLoopAttemptRecord } from "../../../../../../runtime/llm/repeat-guard/index.ts";
import { automationStudioAnswerFirstCompletionRefusedAgain, automationStudioAnswerFirstToldTried } from "../index.ts";

function ladder(approaches = 0) {
  const record = automationStudioLlmLoopAttemptRecord({ version: 1, tried: [], approaches });
  const caught = automationStudioTaskAttemptNoLoopsCaught();
  const said: string[] = [];
  const refused = (times: number) => automationStudioAnswerFirstCompletionRefusedAgain({ times, evidence: "sha256:same", iteration: times, record, caught, say: (title, text) => said.push(`${title}: ${text}`) });
  return { record, caught, said, refused };
}

describe("a completion refused again", () => {
  it("is steered, then changes approach, then asks, and keeps asking", () => {
    const { record, caught, said, refused } = ladder();
    expect([refused(1), refused(2), refused(3), refused(4)]).toEqual(["steered", "change_approach", "ask_person", "ask_person"]);
    expect(caught.near_repeat).toEqual({ steered: 1, refused: 4, changeApproach: 1, askPerson: 2 });
    expect(record.approaches).toBe(1);
    expect(said).toHaveLength(1);
    expect(said[0]).toContain("FluxIQ tried the same thing 2 times");
    expect(said[0]).not.toMatch(/near_repeat|same_evidence|core\./u);
  });

  it("goes straight to the person where fresh approaches are used up, as the watch does", () => {
    const { refused, record } = ladder(2);
    expect([refused(1), refused(2)]).toEqual(["steered", "ask_person"]);
    expect(record.approaches).toBe(2);
  });

  it("goes on the attempt's record, content-free, so a fresh round is told", () => {
    const { record, refused } = ladder();
    refused(1);
    refused(2);
    const told = automationStudioAnswerFirstToldTried(record.data());
    expect(told).toMatchObject({ freshStarts: 1, tried: [{ kind: "call", toolId: "core.completion_check", outcome: "failed", times: 2, caughtAs: "near_repeat" }] });
    expect(JSON.stringify(told)).not.toContain("sha256:same");
  });
});
