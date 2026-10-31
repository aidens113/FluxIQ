// A submission that asks for its test gets it in the same call (t811,
// `../../../../subflow-submit-then/submit-then.ts`): the folded test is answered exactly as core.test_subflow
// answers it, page after the trial included; a submission without `then` only
// saves; a refused submission, or a `then` Core cannot read, tests nothing.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_SUBMIT_THEN_WORDS, AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID } from "../../../index.ts";
import { PAGE, answerOf, runBuilder, submitCall, twoSteps } from "./then-fixture.ts";

const ended = (reason: string) => () => ({ kind: "complete", result: { ended: "partial", reason } });

describe("a submission with then (t811)", () => {
  it("tests the revision it made in the same call and answers it as the test tool does", async () => {
    const run = await runBuilder([submitCall("submit", twoSteps(), { then: "test_whole" })], { trials: [{ verdict: "yes" }] });
    expect(run.outcome.loop.ok, JSON.stringify(run.outcome.loop)).toBe(true);
    expect(run.asked).toHaveLength(1);
    const answer = run.answers.get("submit")!;
    expect(answer).toMatchObject({ ok: true, status: "draft", revision: 1, testedWith: { revision: 1, digest: answer.digest } });
    expect(answer.next).toBe(AUTOMATION_STUDIO_SUBFLOW_SUBMIT_THEN_WORDS.tested);
    // The test's own answer, page after the trial included, as core.test_subflow gives it.
    expect(answer.tested).toMatchObject({ ok: true, partial: true, verdict: "yes", revision: 1, digest: answer.digest, pageAfterTrial: PAGE });
    expect(run.outcome.lastTrial).toMatchObject({ verdict: "yes", revision: 1 });
    expect(run.outcome.trial).toMatchObject({ verdict: "yes" });
  });

  it("only saves without then, and its next says how a submission can test", async () => {
    const run = await runBuilder([submitCall("submit", twoSteps()), ended("stopping here")]);
    expect(run.outcome.loop.ok, JSON.stringify(run.outcome.loop)).toBe(true);
    expect(run.asked).toHaveLength(0);
    const answer = answerOf(run.seen[1]!, "submit");
    expect(answer.tested).toBeUndefined();
    expect(answer.testedWith).toBeUndefined();
    expect(String(answer.next)).toMatch(/^Test next with core\.test_subflow/u);
    expect(String(answer.next)).toContain(AUTOMATION_STUDIO_SUBFLOW_SUBMIT_THEN_WORDS.plainNext);
    expect(run.outcome.lastTrial).toBeUndefined();
  });

  it("sets aside a reason for a whole test sent without then test_whole", async () => {
    const run = await runBuilder([submitCall("submit", twoSteps(), { fromStepImpossible: "the step needs the start" }), ended("stopping here")], { fromStep: true });
    const answer = answerOf(run.seen[1]!, "submit");
    expect(run.asked).toHaveLength(0);
    expect(answer.setAside).toBe(AUTOMATION_STUDIO_SUBFLOW_SUBMIT_THEN_WORDS.impossibleIgnored);
    expect(answer.ok).toBe(true);
  });

  it("tests nothing when the submission is refused", async () => {
    const broken = ["flow: Find the listings", "step: press the filter", "  node: web.no-such-node"];
    const run = await runBuilder([submitCall("submit", broken, { then: "test_whole" }), ended("stopping here")]);
    const answer = answerOf(run.seen[1]!, "submit");
    expect(answer.ok).toBe(false);
    expect(answer.tested).toBeUndefined();
    expect(run.asked).toHaveLength(0);
    expect(run.outcome.proposal).toBeUndefined();
  });

  it("refuses a then it cannot read before anything is submitted", async () => {
    const run = await runBuilder([submitCall("submit", twoSteps(), { then: "test_twice" }), ended("stopping here")], { fromStep: true });
    const answer = answerOf(run.seen[1]!, "submit");
    expect(answer).toMatchObject({ ok: false, code: "subflow.submit_then_invalid" });
    expect(String(answer.instruction)).toContain("{\"from\": \"<step>\"}");
    expect(run.outcome.proposal).toBeUndefined();
    expect(run.asked).toHaveLength(0);
  });

  it("offers then and its reason on the submit tool, in words that stay within the tool's bound", async () => {
    const run = await runBuilder([submitCall("submit", twoSteps()), ended("stopping here")], { fromStep: true });
    const submit = run.observed[0]!.tools.find((tool) => tool.toolId === AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID)!;
    const properties = submit.inputSchema.properties as JsonObject;
    expect(Object.keys(properties)).toEqual(expect.arrayContaining(["flow", "plan", "summary", "then", "fromStepImpossible"]));
    expect((properties.then as JsonObject).anyOf).toEqual([{ type: "string", enum: ["test_whole"] }, expect.objectContaining({ type: "object", required: ["from"] })]);
    expect(submit.description).toContain(AUTOMATION_STUDIO_SUBFLOW_SUBMIT_THEN_WORDS.tool);
    expect(submit.description.length).toBeLessThanOrEqual(2000);
  });
});
