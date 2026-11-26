import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceNoProgress, type AgentNoProgressSnapshot } from "../index.ts";

const guard = () => automationStudioLlmEvidenceNoProgress({ redirectAt: 3, onRedirect: () => {} });

describe("the generic repeated-state and issue guard", () => {
  it("remembers visited states across tools and clears without treating opaque applied calls as repeats", () => {
    const progress = guard();
    const answer = (toolId: string, stateAfter?: string) => progress.answerRepeats({ toolId, stateAfter, answer: "answer", mutated: true });
    expect(answer("read", "A")).toBe(false);
    expect(answer("read", "B")).toBe(false);
    expect(answer("other", "A")).toBe(true);
    progress.cleared();
    expect(answer("read", "A")).toBe(true);
    expect(answer("read")).toBe(false);
    expect(answer("read")).toBe(false);
  });

  it("remembers matching issues across calls and forgets a replaced candidate signature", () => {
    const progress = guard();
    expect(progress.refusedAgain("candidate.1", "a|b")).toBe(false);
    progress.cleared();
    expect(progress.refusedAgain("candidate.1", "a|b")).toBe(true);
    expect(progress.refusedAgain("candidate.1", "c")).toBe(false);
    expect(progress.refusedAgain("candidate.2", "a|b")).toBe(false);
    expect(progress.refusedAgain("candidate.1", "a|b")).toBe(false);
  });

  // t1049: no count of steps without progress ends anything. From the redirect boundary the model is told on every
  // further step, however many there are; there is no stop to reach and no countdown in what it is told.
  it("steers from the redirect boundary on every further step, and has no stop to reach", () => {
    const redirects: Array<{ iteration: number; snapshot: AgentNoProgressSnapshot }> = [];
    const progress = automationStudioLlmEvidenceNoProgress({ redirectAt: 3, onRedirect: (iteration, snapshot) => { redirects.push({ iteration, snapshot }); } });
    progress.completionRefused(["answer.incomplete"]);
    for (let iteration = 1; iteration <= 40; iteration += 1) {
      progress.stepped("records.read");
      progress.redirect(iteration);
    }
    expect(redirects.map((redirect) => redirect.iteration)).toEqual(Array.from({ length: 38 }, (_, index) => index + 3));
    expect(redirects[0]).toEqual({ iteration: 3, snapshot: { stepsWithoutProgress: 3, repeatingToolIds: ["records.read"], lastIssueCodes: ["answer.incomplete"] } });
    expect(progress.steps).toBe(40);
    expect("reached" in progress).toBe(false);
  });
});
