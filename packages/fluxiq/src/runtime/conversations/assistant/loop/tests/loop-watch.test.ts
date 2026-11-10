// Core's loop detection as the assistant reads it: the same call answering the
// same again is steered, then refused before it runs, then stopped.

import { describe, expect, it } from "vitest";
import { panelAssistantLoopWatch } from "../loop-watch.ts";

describe("panelAssistantLoopWatch", () => {
  it("steers a repeated identical call, refuses the next ones, then signals a stop", () => {
    const watch = panelAssistantLoopWatch("conversation.one");
    const input = { projectId: "p" };
    const ran = (index: number) => watch.after({ callId: `call.${index}`, toolId: "automation-studio__list-flows", input, answer: { flows: [] }, mutate: false, lasting: false, refused: false });
    expect(watch.before("automation-studio__list-flows", input)).toBeUndefined();
    expect(ran(1)).toBeUndefined();
    expect(ran(2)).toBeUndefined();
    const steer = ran(3);
    expect(steer?.chat.title).toBe("Noticed it was repeating itself");
    expect(steer?.model).toContain("the next one like it will be refused");
    expect(watch.due()).toBeUndefined();
    const refusals = [watch.before("automation-studio__list-flows", input), watch.before("automation-studio__list-flows", input), watch.before("automation-studio__list-flows", input)];
    expect(refusals.every((refusal) => refusal?.model.includes("this one was not run"))).toBe(true);
    expect(watch.due()?.kind).toBe("change_approach");
  });

  it("does not count calls that each answer something new", () => {
    const watch = panelAssistantLoopWatch("conversation.two");
    for (let index = 0; index < 30; index += 1) {
      expect(watch.before("automation-studio__get-run", { runId: `run.${index}` })).toBeUndefined();
      expect(watch.after({ callId: `call.${index}`, toolId: "automation-studio__get-run", input: { runId: `run.${index}` }, answer: { run: index }, mutate: false, lasting: false, refused: false })).toBeUndefined();
    }
    expect(watch.due()).toBeUndefined();
  });

  it("tells the same consequential act done twice", () => {
    const watch = panelAssistantLoopWatch("conversation.three");
    const act = (index: number) => watch.after({ callId: `call.${index}`, toolId: "automation-studio__delete-flow", input: { flowId: "f" }, answer: { deleted: index }, mutate: true, lasting: true, refused: false });
    expect(act(1)).toBeUndefined();
    expect(act(2)?.chat.text).toContain("same thing 2 times");
    expect(watch.before("automation-studio__delete-flow", { flowId: "f" })).toBeDefined();
  });
});
