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
  it("is steered, then stops the round each time after, and never asks the person by itself (run-mwo3dp11-a47a032d)", () => {
    const { record, caught, said, refused } = ladder();
    expect([refused(1), refused(2), refused(3), refused(4)]).toEqual(["steered", "change_approach", "change_approach", "change_approach"]);
    expect(caught.near_repeat).toEqual({ steered: 1, refused: 4, changeApproach: 3, askPerson: 0 });
    expect(record.approaches).toBe(3);
    expect(said).toHaveLength(1);
    expect(said[0]).toContain("FluxIQ tried the same thing 2 times");
    expect(said[0]).not.toMatch(/near_repeat|same_evidence|core\./u);
  });

  it("does not ask the person where fresh approaches are used up either", () => {
    const { refused } = ladder(2);
    expect([refused(1), refused(2), refused(3)]).toEqual(["steered", "change_approach", "change_approach"]);
  });

  // A task keeps the model it starts with and nothing climbs when it is stuck (user, 2026-11-20, U1; 002650596 made
  // `automationStudioLlmModelLadderClimb` a no-op). The refusal still steers, then stops the round, and leaves the model alone.
  it("never changes the model it is served by, however often it is refused again, and still stops the round", () => {
    const { record, refused } = ladder();
    record.ladder.serve(["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"]);
    expect(refused(1)).toBe("steered");
    expect(record.ladder.level).toBe(0);
    expect(refused(2)).toBe("change_approach");
    expect(refused(3)).toBe("change_approach");
    expect(record.ladder.level).toBe(0);
    expect(record.data().ladder?.escalations ?? []).toEqual([]);
  });

  it("tells the fresh round what it repeated and to take a different approach", () => {
    const { record, refused } = ladder();
    refused(1);
    refused(2);
    const told = automationStudioAnswerFirstToldTried(record.data());
    expect(told.loopStopped).toMatchObject({ pattern: "near_repeat", repeats: 3 });
    expect(String((told.loopStopped as { words: string }).words)).toContain("You completed with the same result 3 times over the same evidence, and the check refused it each time.");
    expect(String((told.loopStopped as { words: string }).words)).toContain("Take a different approach");
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
