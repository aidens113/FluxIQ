import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceNoProgress, type AgentNoProgressSnapshot } from "../index.ts";

const guard = () => automationStudioLlmEvidenceNoProgress({ max: 5, redirectAt: 3, onRedirect: () => {} });

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

  it("emits unchanged progress facts through a policy callback only at the redirect boundary", () => {
    const redirects: Array<{ iteration: number; snapshot: AgentNoProgressSnapshot }> = [];
    const progress = automationStudioLlmEvidenceNoProgress({ max: 5, redirectAt: 3, onRedirect: (iteration, snapshot) => { redirects.push({ iteration, snapshot }); } });
    progress.completionRefused(["answer.incomplete"]);
    for (let iteration = 1; iteration <= 5; iteration += 1) {
      progress.stepped("records.read");
      progress.redirect(iteration);
    }
    expect(redirects).toEqual([3, 4].map((iteration) => ({ iteration, snapshot: { stepsWithoutProgress: iteration, maxStepsWithoutProgress: 5, repeatingToolIds: ["records.read"], lastIssueCodes: ["answer.incomplete"] } })));
    expect(progress.reached()).toBe(true);
  });
});
