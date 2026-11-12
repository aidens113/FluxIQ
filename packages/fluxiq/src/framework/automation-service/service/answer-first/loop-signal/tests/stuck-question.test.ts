// The question a stuck attempt asks the person (run-mwc6ut8u-52e3c1b3, R7): built from the loop's
// own evidence, in the person's words, asking something only they can answer.
import { automationStudioTaskAttemptNoLoopsCaught } from "@fluxiq/contracts/automation";
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_LLM_LOOP_PATTERNS, automationStudioLlmLoopAttemptRecord } from "../../../../../../runtime/llm/repeat-guard/index.ts";
import { personFacingTextFaults } from "../../../../../../ui/index.ts";
import { automationStudioAnswerFirstStuckQuestion } from "../index.ts";

/** The attempt as run-mwc6ut8u-52e3c1b3 left it, in counts: steered, refused, two fresh starts, presses that changed nothing. */
function evidence() {
  const caught = automationStudioTaskAttemptNoLoopsCaught();
  caught.exact_repeat.refused = 22;
  caught.no_progress.steered = 2;
  caught.near_repeat.steered = 1;
  const record = automationStudioLlmLoopAttemptRecord({ version: 1, tried: [], approaches: 0 });
  record.tried({ kind: "call", key: "a".repeat(24), toolId: "core.run_node", outcome: "changed_nothing" });
  record.tried({ kind: "call", key: "a".repeat(24), toolId: "core.run_node", outcome: "changed_nothing" });
  record.tried({ kind: "call", key: "b".repeat(24), toolId: "core.run_node", outcome: "failed" });
  record.tried({ kind: "call", key: "c".repeat(24), toolId: "core.run_node", outcome: "applied" });
  record.approachChanged();
  record.approachChanged();
  return { caught, tried: record.data() };
}

describe("the question a stuck attempt asks", () => {
  it("says what is stuck, what was tried, what it has, and what the person can do", () => {
    const words = automationStudioAnswerFirstStuckQuestion({ stuck: { finding: { pattern: "near_repeat", repeats: 3, unchanged: ["page", "rows"] } }, ...evidence(), held: { rows: 7, acts: 0, answered: false } });
    expect(words).toContain("I kept making the same move on the same page, 3 times, and it came to nothing: the page did not change and nothing new was read.");
    expect(words).toContain("What I tried: I noticed I was repeating myself and changed course 3 times, 22 repeated steps were stopped before they ran and I started afresh from the page as it stood 2 times.");
    expect(words).toContain("In all, 2 different things did not get there, over 3 tries.");
    expect(words).toContain("What I have so far: 7 rows.");
    expect(words).toMatch(/tell me in your own words where what you asked for is shown, what to try differently/u);
    expect(words).toMatch(/press Stop to end the task here/u);
    // It never waits for the answer (R7 revision): the words say it carries on.
    expect(words).toContain("I carry on meanwhile");
    expect(words).not.toMatch(/stopped spending/u);
    // A real question: never the old choice between going on and stopping.
    expect(words).not.toMatch(/keep going, or stop/u);
  });

  it("says the result keeps being refused, with what was said of it, where completions were refused again", () => {
    const reason = "The list holds one week of slots, and the request asks for three.";
    const words = automationStudioAnswerFirstStuckQuestion({ stuck: { finding: { pattern: "near_repeat", repeats: 4, unchanged: ["rows", "acts"] }, completionRefused: { reason } }, ...evidence(), held: { rows: 3, acts: 1, answered: true } });
    expect(words).toContain("the result I have keeps being refused");
    expect(words).toContain(`What was said about it: ${reason}`);
    expect(words).toContain("What I have so far: 3 rows, 1 act on the site and an answer in words.");
  });

  it("names no code, tool, digest or machinery, for every pattern, and leaves out what never happened", () => {
    const none = { caught: automationStudioTaskAttemptNoLoopsCaught(), tried: automationStudioLlmLoopAttemptRecord().data() };
    for (const pattern of AUTOMATION_STUDIO_LLM_LOOP_PATTERNS) {
      for (const counts of [evidence(), none]) {
        const words = automationStudioAnswerFirstStuckQuestion({ stuck: { finding: { pattern, repeats: 2, unchanged: ["page", "rows", "acts", "draft"] } }, ...counts, held: { rows: 0, acts: 0, answered: false } });
        expect(personFacingTextFaults(words), `${pattern}: ${words}`).toEqual([]);
        expect(words, pattern).not.toMatch(/core\.|run_node|near_repeat|exact_repeat|no_progress|same_fix|same_act|aaaa/u);
        expect(words, pattern).toMatch(/^I keep getting stuck, so I am trying a different way, and asking you in case you can help\. What is stuck: /u);
      }
    }
    const bare = automationStudioAnswerFirstStuckQuestion({ stuck: { finding: { pattern: "no_progress", repeats: 12, unchanged: [] } }, ...none, held: { rows: 0, acts: 0, answered: false } });
    expect(bare).not.toMatch(/What I tried|In all/u);
    expect(bare).toContain("my last 12 steps each found nothing new.");
    expect(bare).toContain("What I have so far: nothing confirmed yet.");
  });
});
