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
});
