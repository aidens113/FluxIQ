import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import { nodeAttemptFromResult, nodeAttemptWithAdaptationIds } from "../attempt-trace.ts";

const node: AutomationStudioFlowNode = { id: "click", definitionId: "builtin.policy.action", parameterValues: {} };
const timeoutFailure = { category: "timeout", code: "web.action.timed_out", retryable: true } as const;

describe("nodeAttemptFromResult", () => {
  it("carries the message, structured failure, and target resolution of a failed result", () => {
    const attempt = nodeAttemptFromResult(node, 1, 2, 1, {}, {
      status: "failed",
      route: "failed",
      outputs: {},
      message: "The client did not answer.",
      failure: timeoutFailure,
      targetResolution: { status: "matched", candidateCount: 2, minimumConfidence: 0.5, candidateId: "save", confidence: 0.9 }
    });

    expect(attempt).toMatchObject({
      status: "failed",
      message: "The client did not answer.",
      failure: timeoutFailure,
      targetResolution: { status: "matched", candidateId: "save", candidateCount: 2 }
    });
    expect(attempt.transitionComparison?.status).toBe("timeout");
  });

  it("drops a failure record that does not parse, and one attached to a success", () => {
    const malformed = nodeAttemptFromResult(node, 1, 2, 1, {}, { status: "failed", failure: { ...timeoutFailure, extra: true } as never });
    expect(malformed).not.toHaveProperty("failure");
    expect(malformed.transitionComparison?.status).toBe("action_failed");

    const succeeded = nodeAttemptFromResult(node, 1, 2, 1, {}, { status: "success", failure: timeoutFailure });
    expect(succeeded).not.toHaveProperty("failure");
  });

  it("keeps a waiting result's failure record", () => {
    const waiting = nodeAttemptFromResult(node, 1, 2, 1, {}, { status: "waiting", failure: { category: "user_intervention_required", code: "web.challenge", retryable: false } });
    expect(waiting.failure).toMatchObject({ category: "user_intervention_required" });
  });

  it("leaves results without the new fields unchanged", () => {
    const attempt = nodeAttemptFromResult(node, 1, 2, 1, {}, { status: "failed", route: "failed", outputs: {} });
    expect(attempt).not.toHaveProperty("message");
    expect(attempt).not.toHaveProperty("failure");
    expect(attempt).not.toHaveProperty("targetResolution");
    expect(attempt.transitionComparison?.status).toBe("action_failed");
  });
});

describe("nodeAttemptWithAdaptationIds", () => {
  const attempt = nodeAttemptFromResult(node, 1, 2, 1, {}, { status: "success", route: "success", outputs: {} });
  const stamped = (metadata: AutomationStudioFlowNode["metadata"]) => nodeAttemptWithAdaptationIds(metadata === undefined ? node : { ...node, metadata }, attempt);

  it("copies the node's adaptation ids onto the attempt, in the node's order", () => {
    const result = stamped({ adaptationIds: ["adaptation.run-1.retarget.1", "adaptation.bootstrap.0"] });
    expect(result.adaptationIds).toEqual(["adaptation.run-1.retarget.1", "adaptation.bootstrap.0"]);
    expect(result).toMatchObject({ attemptId: "click.attempt.1", status: "succeeded" });
  });

  it("hands the attempt its own array, so a later change to the node does not rewrite the trace", () => {
    const listed = ["adaptation.one"];
    const result = nodeAttemptWithAdaptationIds({ ...node, metadata: { adaptationIds: listed } }, attempt);
    listed.push("adaptation.added-later");
    expect(result.adaptationIds).toEqual(["adaptation.one"]);
    result.adaptationIds?.push("adaptation.added-to-trace");
    expect(listed).toEqual(["adaptation.one", "adaptation.added-later"]);
  });

  it("collapses a repeated id, keeping its first position", () => {
    expect(stamped({ adaptationIds: ["adaptation.b", "adaptation.a", "adaptation.b"] }).adaptationIds).toEqual(["adaptation.b", "adaptation.a"]);
  });

  it("accepts eight ids and an id of 256 characters", () => {
    const eight = Array.from({ length: 8 }, (_, index) => `adaptation.${index}`);
    expect(stamped({ adaptationIds: eight }).adaptationIds).toEqual(eight);
    const longest = `adaptation.${"x".repeat(245)}`;
    expect(longest).toHaveLength(256);
    expect(stamped({ adaptationIds: [longest] }).adaptationIds).toEqual([longest]);
  });

  it.each([
    { case: "the node has no metadata", metadata: undefined },
    { case: "the metadata has no list", metadata: { bootstrapAdaptationId: "adaptation.bootstrap.0" } },
    { case: "the list is empty", metadata: { adaptationIds: [] } }
  ])("gives no ids, and the attempt back unchanged, when $case", ({ metadata }) => {
    const result = stamped(metadata);
    expect(result).not.toHaveProperty("adaptationIds");
    expect(result).toBe(attempt);
  });

  it.each([
    { case: "a string, not a list", adaptationIds: "adaptation.one" },
    { case: "null", adaptationIds: null },
    { case: "a number", adaptationIds: 1 },
    { case: "an object", adaptationIds: { 0: "adaptation.one" } },
    { case: "a list holding a number", adaptationIds: ["adaptation.one", 2] },
    { case: "a list holding null", adaptationIds: ["adaptation.one", null] },
    { case: "a list holding a nested list", adaptationIds: ["adaptation.one", ["adaptation.two"]] },
    { case: "a list holding an empty id", adaptationIds: ["adaptation.one", ""] },
    { case: "a list holding a whitespace id", adaptationIds: ["adaptation.one", "   "] },
    { case: "a list holding an id with surrounding whitespace", adaptationIds: [" adaptation.one"] },
    { case: "a list holding an id with a control character", adaptationIds: [`adaptation.${String.fromCharCode(0)}one`] },
    { case: "a list holding an id with a line break", adaptationIds: ["adaptation.one\nadaptation.two"] },
    { case: "a list holding an id longer than 256 characters", adaptationIds: [`adaptation.${"x".repeat(246)}`] },
    { case: "a list of more than eight ids", adaptationIds: Array.from({ length: 9 }, (_, index) => `adaptation.${index}`) }
  ] satisfies Array<{ case: string; adaptationIds: NonNullable<AutomationStudioFlowNode["metadata"]>[string] }>)("ignores the whole list, never trusting part of it, when it is $case", ({ adaptationIds }) => {
    expect(stamped({ adaptationIds })).not.toHaveProperty("adaptationIds");
  });

  it("names only the node's ids, dropping any the attempt already carried", () => {
    const carried = { ...attempt, adaptationIds: ["adaptation.not-from-the-node"] };
    const unstamped = nodeAttemptWithAdaptationIds(node, carried);
    expect(unstamped).not.toHaveProperty("adaptationIds");
    expect(unstamped).toMatchObject({ attemptId: "click.attempt.1", status: "succeeded" });
    expect(carried.adaptationIds).toEqual(["adaptation.not-from-the-node"]);

    const replaced = nodeAttemptWithAdaptationIds({ ...node, metadata: { adaptationIds: ["adaptation.from-the-node"] } }, carried);
    expect(replaced.adaptationIds).toEqual(["adaptation.from-the-node"]);

    const malformed = nodeAttemptWithAdaptationIds({ ...node, metadata: { adaptationIds: [7] } }, carried);
    expect(malformed).not.toHaveProperty("adaptationIds");
  });
});
