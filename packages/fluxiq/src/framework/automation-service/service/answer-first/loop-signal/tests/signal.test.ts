// The attempt answers `end` to both of loop detection's last rungs: a round that looped
// ends as a stall does, and what comes next is the attempt's to decide.
import { describe, expect, it } from "vitest";
import { automationStudioAnswerFirstLoopSignal, type AutomationStudioAnswerFirstLoopSignalSeen } from "../index.ts";

function handler() {
  const caught: AutomationStudioAnswerFirstLoopSignalSeen[] = [];
  let asked = 0;
  const { loopSignal } = automationStudioAnswerFirstLoopSignal({ caught: (signal) => caught.push(signal), askPerson: () => { asked += 1; } });
  return { loopSignal, caught, asked: () => asked };
}

describe("the attempt's answer to a loop signal", () => {
  it("ends the round on change_approach and asks nobody", () => {
    const { loopSignal, caught, asked } = handler();
    expect(loopSignal({ kind: "change_approach", pattern: "cycle" })).toBe("end");
    expect(caught).toEqual([{ kind: "change_approach", pattern: "cycle" }]);
    expect(asked()).toBe(0);
  });

  it("ends the round on ask_person and says to ask", () => {
    const { loopSignal, caught, asked } = handler();
    expect(loopSignal({ kind: "ask_person", pattern: "no_progress" })).toBe("end");
    expect(caught).toHaveLength(1);
    expect(asked()).toBe(1);
  });

  it("is a key the loop input can take with or without the loop's own field", () => {
    const spread = { tools: [], ...automationStudioAnswerFirstLoopSignal({ caught: () => undefined, askPerson: () => undefined }) };
    expect(Object.keys(spread)).toContain("loopSignal");
  });
});
