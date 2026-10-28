import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { personFacingTextFaults } from "../../../../../../ui/index.ts";
import { automationStudioActivityHub } from "../../default-hub.ts";
import { runWithAutomationStudioActivity } from "../../scope.ts";
import { emitAutomationStudioActivityStepReacquire } from "../reacquire.ts";

// t786, D8: a stale target found again, or found gone, is said as one step
// recovery in Core's own words, naming the source step by its label at most.
let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const inRun = (fn: () => void) => runWithAutomationStudioActivity({ kind: "run", id: "r-reacquire", projectId: "p1" }, async () => fn());

describe("emitAutomationStudioActivityStepReacquire", () => {
  it("says an item found again as a reacquire recovery that succeeded, about the node", async () => {
    await inRun(() => emitAutomationStudioActivityStepReacquire({ nodeId: "node.save", outcome: "found", sourceLabel: " Read the recipes " }));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      phase: "running",
      label: "Recovered: Found the item from “Read the recipes” again",
      detail: { kind: "step", title: "Found the item from “Read the recipes” again", status: "succeeded", ref: "node.save", recovery: { kind: "reacquire", subject: "Found the item from “Read the recipes” again", outcome: "succeeded" } }
    });
    expect(seen[0]?.detail?.recovery).not.toHaveProperty("event");
  });

  it("says an item gone as a reacquire recovery that failed", async () => {
    await inRun(() => emitAutomationStudioActivityStepReacquire({ nodeId: "node.save", outcome: "gone", sourceLabel: "Read the recipes" }));
    expect(seen[0]).toMatchObject({
      phase: "repairing",
      label: "Recovery did not work: The item from “Read the recipes” is gone",
      detail: { status: "failed", ref: "node.save", recovery: { kind: "reacquire", subject: "The item from “Read the recipes” is gone", outcome: "failed" } }
    });
  });

  it("names no source when the source has no label", async () => {
    await inRun(() => {
      emitAutomationStudioActivityStepReacquire({ nodeId: "n", outcome: "found" });
      emitAutomationStudioActivityStepReacquire({ nodeId: "n", outcome: "gone", sourceLabel: "  " });
    });
    expect(seen.map((row) => row.detail?.recovery?.subject)).toEqual(["Found the item again", "The item is gone"]);
  });

  it("says nothing when the host could not tell or the source could not be re-run", async () => {
    await inRun(() => {
      emitAutomationStudioActivityStepReacquire({ nodeId: "n", outcome: "unmatched", sourceLabel: "Read the recipes" });
      emitAutomationStudioActivityStepReacquire({ nodeId: "n", outcome: "unavailable", sourceLabel: "Read the recipes" });
    });
    expect(seen).toEqual([]);
  });

  it("says nothing a person-facing guard faults", async () => {
    await inRun(() => {
      emitAutomationStudioActivityStepReacquire({ nodeId: "n", outcome: "found", sourceLabel: "Read the recipes" });
      emitAutomationStudioActivityStepReacquire({ nodeId: "n", outcome: "gone", sourceLabel: "Read the recipes" });
    });
    const texts = seen.flatMap((row) => [row.label, row.detail?.title ?? ""]);
    expect(texts.flatMap((text) => personFacingTextFaults(text))).toEqual([]);
  });
});
