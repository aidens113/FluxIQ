import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { automationStudioActivityDecisionReason } from "../decision-reason.ts";
import { automationStudioActivityHub } from "../default-hub.ts";
import { runWithAutomationStudioActivity } from "../scope.ts";
import { emitAutomationStudioActivityThought } from "../thought.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

describe("automationStudioActivityDecisionReason", () => {
  it("keeps the reason beside the decision, not on it", () => {
    const decision = { kind: "complete", result: {} };
    const returned = automationStudioActivityDecisionReason.attach(decision, "Everything asked for is in the draft.");
    expect(returned).toBe(decision);
    expect(Object.keys(returned)).toEqual(["kind", "result"]);
    expect(JSON.stringify(returned)).not.toContain("Everything");
    expect(automationStudioActivityDecisionReason.of(decision)).toBe("Everything asked for is in the draft.");
  });

  it("is not carried by a copy, and ignores an empty or missing reason", () => {
    const decision = automationStudioActivityDecisionReason.attach({ kind: "complete" }, "why");
    expect(automationStudioActivityDecisionReason.of({ ...decision })).toBeUndefined();
    expect(automationStudioActivityDecisionReason.of(automationStudioActivityDecisionReason.attach({}, "  "))).toBeUndefined();
    expect(automationStudioActivityDecisionReason.of(automationStudioActivityDecisionReason.attach({}, undefined))).toBeUndefined();
    expect(automationStudioActivityDecisionReason.of("text")).toBeUndefined();
  });
});

describe("emitAutomationStudioActivityThought", () => {
  const inRun = (fn: () => void) => runWithAutomationStudioActivity({ kind: "run", id: "r1", projectId: "p1" }, fn);

  it("says the title as the label and the reason as a thought's text", () => {
    inRun(() => emitAutomationStudioActivityThought({ phase: "repairing", title: "Working out what went wrong", text: " The button   moved. ", ref: "n1" }));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ phase: "repairing", label: "Working out what went wrong", detail: { kind: "thought", title: "Working out what went wrong", text: "The button moved.", status: "succeeded", ref: "n1" } });
  });

  it("says nothing when there is no reason", () => {
    inRun(() => emitAutomationStudioActivityThought({ phase: "repairing", title: "Working out what went wrong", text: undefined }));
    inRun(() => emitAutomationStudioActivityThought({ phase: "repairing", title: "Working out what went wrong", text: "  " }));
    expect(seen).toEqual([]);
  });
});
