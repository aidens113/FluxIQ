// A do-while loop whose passes make no progress ends as a failure naming them
// (lane 3, `run-mvcvzwk1-c1d869e4`): the guard over the attempts of one frame.
import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../contracts.ts";
import { AUTOMATION_STUDIO_REPEAT_NO_PROGRESS_LIMIT, automationStudioRepeatNoProgress } from "../index.ts";

const repeat: AutomationStudioFlowNode = { id: "again", definitionId: "builtin.control.repeat", parameterValues: { most: 40 } };
const read: AutomationStudioFlowNode = { id: "read", definitionId: "builtin.policy.action", parameterValues: { outputId: "output.read" } };
const onward: AutomationStudioFlowNode = { id: "onward", definitionId: "builtin.policy.action", parameterValues: { outputId: "output.onward" } };
const counter: AutomationStudioFlowNode = { id: "counter", definitionId: "builtin.data.set-variable", parameterValues: { name: "seen" } };
const nodesById = new Map([repeat, read, onward, counter].map((node) => [node.id, node]));

let next = 0;
function attempt(node: AutomationStudioFlowNode, fields: Partial<AutomationStudioNodeAttemptTrace> = {}): AutomationStudioNodeAttemptTrace {
  next += 1;
  return { attemptId: `${node.id}.attempt.${next}`, nodeId: node.id, definitionId: node.definitionId, startedAt: next, finishedAt: next, status: "succeeded", route: "success", inputs: {}, outputs: {}, effects: [], ...fields };
}
const head = (pass: number) => attempt(repeat, { route: "body", outputs: { pass } });
const still: JsonObject = { documentChanged: false, locationChanged: false, added: "", removed: "", addedCount: 0, removedCount: 0 };
const grew: JsonObject = { ...still, added: "t9 \"Another row\"", addedCount: 1 };
/** One pass: the read storing `rows`, then the step meant to move on, each with the diff given (`null`: none traced). */
function pass(rows: JsonValue[], diff: JsonObject | null = still): AutomationStudioNodeAttemptTrace[] {
  const refs = diff ? { stateRefs: { stateDiff: diff } } : {};
  return [attempt(read, { outputs: { records: rows }, ...refs }), attempt(onward, refs)];
}
/** `passes` passes of the loop, each built by `body`, and the head that would begin the next. */
function loop(passes: number, body: (index: number) => AutomationStudioNodeAttemptTrace[]): { attempts: AutomationStudioNodeAttemptTrace[]; next: AutomationStudioNodeAttemptTrace } {
  const attempts: AutomationStudioNodeAttemptTrace[] = [];
  for (let index = 1; index <= passes; index += 1) attempts.push(head(index), ...body(index));
  return { attempts, next: head(passes + 1) };
}
const sameRows = [{ title: "First" }, { title: "Second" }];

describe("a do-while loop that makes no progress", () => {
  it("fails the head of the next pass once the last three passes stored no new rows and left the page as it was, saying which passes and where it stopped", () => {
    const { attempts, next: fifth } = loop(4, () => pass(sameRows));
    const stalled = automationStudioRepeatNoProgress({ node: repeat, attempt: fifth, attempts, nodesById });
    expect(AUTOMATION_STUDIO_REPEAT_NO_PROGRESS_LIMIT).toBe(3);
    expect(stalled).toMatchObject({ nodeId: "again", status: "failed", route: "failed", outputs: { pass: 4 }, failure: { category: "unexpected_state", code: "repeat.no_progress", retryable: false } });
    expect(stalled!.failure!.actual).toBe("Passes 2 to 4 of this repeat stored no new rows and left the page as it was, so the loop stopped before pass 5 instead of doing the same again.");
    expect(stalled!.message).toContain("The loop made no progress");
  });

  it("lets the loop go on while fewer than three passes in a row stood still", () => {
    const { attempts, next: fourth } = loop(3, () => pass(sameRows));
    expect(automationStudioRepeatNoProgress({ node: repeat, attempt: fourth, attempts, nodesById })).toBeUndefined();
  });

  it("counts a pass that stored a row no earlier pass stored as progress, though the page stood still", () => {
    const { attempts, next } = loop(6, (index) => pass([{ title: `Row ${index}` }]));
    expect(automationStudioRepeatNoProgress({ node: repeat, attempt: next, attempts, nodesById })).toBeUndefined();
  });

  it("counts a pass whose step changed the page as progress, though it stored nothing new", () => {
    const { attempts, next } = loop(6, () => pass(sameRows, grew));
    expect(automationStudioRepeatNoProgress({ node: repeat, attempt: next, attempts, nodesById })).toBeUndefined();
  });

  it("restarts the count after a pass that made progress", () => {
    const { attempts, next } = loop(6, (index) => pass(sameRows, index === 4 ? grew : still));
    expect(automationStudioRepeatNoProgress({ node: repeat, attempt: next, attempts, nodesById })).toBeUndefined();
  });

  it("never says a pass stood still when a step that acts outside the run has no diff traced", () => {
    const { attempts, next } = loop(6, () => pass(sameRows, null));
    expect(automationStudioRepeatNoProgress({ node: repeat, attempt: next, attempts, nodesById })).toBeUndefined();
  });

  it("never says a pass of Core's own steps alone stood still, however many passes run", () => {
    const { attempts, next } = loop(10, () => [attempt(counter)]);
    expect(automationStudioRepeatNoProgress({ node: repeat, attempt: next, attempts, nodesById })).toBeUndefined();
  });

  it("weighs only the passes of the loop's current round, after it last began again at pass 1", () => {
    const earlier = loop(4, () => pass(sameRows)).attempts;
    const ended = attempt(repeat, { route: "done", outputs: { pass: 4 } });
    const { attempts, next } = loop(2, () => pass(sameRows));
    expect(automationStudioRepeatNoProgress({ node: repeat, attempt: next, attempts: [...earlier, ended, ...attempts], nodesById })).toBeUndefined();
  });

  it("answers nothing for any attempt but a Repeat beginning a pass", () => {
    const { attempts } = loop(4, () => pass(sameRows));
    expect(automationStudioRepeatNoProgress({ node: repeat, attempt: attempt(repeat, { route: "done", outputs: { pass: 4 } }), attempts, nodesById })).toBeUndefined();
    expect(automationStudioRepeatNoProgress({ node: read, attempt: attempt(read), attempts, nodesById })).toBeUndefined();
  });
});
