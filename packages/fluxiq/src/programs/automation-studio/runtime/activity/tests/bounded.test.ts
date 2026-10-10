import { CLIENT_GATEWAY_ACTIVITY_RESOLUTIONS } from "@fluxiq/contracts/client-gateway";
import { describe, expect, it } from "vitest";
import { boundedAutomationStudioActivity } from "../bounded.ts";
import type { AutomationStudioActivityInput } from "../contracts.ts";

const base: AutomationStudioActivityInput = {
  activityId: "build:b1",
  subject: { kind: "build", id: "b1", projectId: "p1" },
  phase: "building",
  label: "You pressed Continue."
};

function askRow(resolution: string, kind: "ask" | "tool" = "ask"): AutomationStudioActivityInput {
  return { ...base, detail: { kind, title: "Asked the person to complete a check", status: "succeeded", ref: "person-needed.1", resolution } as NonNullable<AutomationStudioActivityInput["detail"]> };
}

describe("the bounds on one activity event", () => {
  it("keeps every resolution the contract names on an ask row", () => {
    for (const resolution of CLIENT_GATEWAY_ACTIVITY_RESOLUTIONS) {
      expect(boundedAutomationStudioActivity(askRow(resolution)).detail).toMatchObject({ kind: "ask", ref: "person-needed.1", resolution });
    }
  });

  it("keeps a recovery only on a step row, and only in the contract's closed shape", () => {
    const recovery = { kind: "handler", subject: "Dismiss the popup", outcome: "succeeded", event: "before" };
    const row = (kind: "step" | "tool", value: object) => ({ ...base, detail: { kind, title: "Dismiss the popup", ref: "node.1", recovery: value } } as AutomationStudioActivityInput);
    expect(boundedAutomationStudioActivity(row("step", recovery)).detail?.recovery).toEqual(recovery);
    expect(boundedAutomationStudioActivity(row("tool", recovery)).detail).not.toHaveProperty("recovery");
    expect(boundedAutomationStudioActivity(row("step", { ...recovery, outcome: "maybe" })).detail).not.toHaveProperty("recovery");
    expect(boundedAutomationStudioActivity(row("step", { ...recovery, kind: "route" })).detail?.recovery).toEqual({ kind: "route", subject: "Dismiss the popup", outcome: "succeeded" });
  });

  it("drops a resolution the contract does not name, and one on a row that is not an ask", () => {
    expect(boundedAutomationStudioActivity(askRow("guessed")).detail).not.toHaveProperty("resolution");
    expect(boundedAutomationStudioActivity(askRow("answered", "tool")).detail).not.toHaveProperty("resolution");
  });

  it("still cuts the title and text to their bounds, and leaves a row with no resolution without one", () => {
    const long = "x".repeat(2_000);
    const bounded = boundedAutomationStudioActivity({ ...base, detail: { kind: "ask", title: long, text: long, status: "started", ref: "a1" } });
    expect(bounded.detail!.title).toHaveLength(160);
    expect(bounded.detail!.text).toHaveLength(1_000);
    expect(bounded.detail).not.toHaveProperty("resolution");
  });

  it("cuts a step's row to the title's bound and leaves a step without one without it", () => {
    const step = { index: 2, count: 4, nodeId: "confirm" };
    const long = boundedAutomationStudioActivity({ ...base, step: { ...step, row: "y".repeat(500) } });
    expect(long.step!.row).toHaveLength(160);
    expect(boundedAutomationStudioActivity({ ...base, step: { ...step, row: "Jonas Weber" } }).step).toEqual({ ...step, row: "Jonas Weber" });
    expect(boundedAutomationStudioActivity({ ...base, step }).step).not.toHaveProperty("row");
  });
});
