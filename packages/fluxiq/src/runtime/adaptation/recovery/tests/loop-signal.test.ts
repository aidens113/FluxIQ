import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmLoopSignal } from "../../../llm/repeat-guard/index.ts";
import { automationStudioExplorationLoopSignal } from "../loop-signal.ts";

// t1057: the recovery exploration hands its loop loop detection's signal, so no count of the loop's own ends it. A
// change of approach goes on in place; the model's own decision that it needs a person ends the exploration, because
// nobody is asked in the middle of a Flow.
describe("automationStudioExplorationLoopSignal", () => {
  it("goes on after a change of approach, and says nobody was asked for", () => {
    const signalled = automationStudioExplorationLoopSignal();

    expect(signalled.loopSignal(signal("change_approach"))).toBe("continue");
    expect(signalled.loopSignal(signal("change_approach"))).toBe("continue");
    expect(signalled.askedForPerson()).toBe(false);
  });

  it("ends where the model decided it needs a person, and remembers that it did", () => {
    const signalled = automationStudioExplorationLoopSignal();

    expect(signalled.loopSignal(signal("change_approach"))).toBe("continue");
    expect(signalled.loopSignal(signal("ask_person"))).toBe("end");
    expect(signalled.askedForPerson()).toBe(true);
  });
});

function signal(kind: AutomationStudioLlmLoopSignal["kind"]): AutomationStudioLlmLoopSignal {
  return { kind, pattern: "cycle", repeats: 3, toolIds: ["test.inspect"], unchanged: ["page"], approaches: 1, ...(kind === "ask_person" ? { question: "Which account is meant?" } : {}) };
}
