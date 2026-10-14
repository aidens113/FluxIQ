// The bounds on an event's agent and on a note row's project card
// (`../bounded.ts`, `../project-card-bounds.ts`).
import type { ClientGatewayActivityProjectCard } from "@fluxiq/contracts/client-gateway";
import { describe, expect, it } from "vitest";
import { boundedAutomationStudioActivity } from "../bounded.ts";
import type { AutomationStudioActivityInput } from "../contracts.ts";

const base: AutomationStudioActivityInput = {
  activityId: "build:b1",
  subject: { kind: "build", id: "b1", projectId: "p1" },
  phase: "building",
  label: "Building the Flow"
};

const withAgent = (agent: unknown) => boundedAutomationStudioActivity({ ...base, agent } as AutomationStudioActivityInput);
const note = (project: unknown, kind: "note" | "step" = "note") =>
  boundedAutomationStudioActivity({ ...base, detail: { kind, title: "A card", project } } as AutomationStudioActivityInput).detail;

const brief: ClientGatewayActivityProjectCard = { kind: "brief", briefId: "b1", brief: "build", subflowKey: "save_recipe", subflowName: "Save recipe", purpose: "save the first one", caseId: "observed-current", allowanceUsd: 0.05 };

describe("the bounds on an event's agent", () => {
  it("keeps every role the contract names, unchanged", () => {
    for (const role of ["supervisor", "builder", "repair", "validator"] as const) {
      expect(withAgent({ role, briefId: "b-1", subflowName: "Save recipe" }).agent).toEqual({ role, briefId: "b-1", subflowName: "Save recipe" });
    }
  });

  it("drops an agent whose role is unknown, or which is not an object", () => {
    expect(withAgent({ role: "planner", briefId: "b-1" })).not.toHaveProperty("agent");
    expect(withAgent("builder")).not.toHaveProperty("agent");
    expect(withAgent(null)).not.toHaveProperty("agent");
    expect(withAgent({ role: "toString" })).not.toHaveProperty("agent");
  });

  it("drops a malformed or digest-shaped brief id, and keeps the role", () => {
    expect(withAgent({ role: "builder", briefId: "b 1" }).agent).toEqual({ role: "builder" });
    expect(withAgent({ role: "builder", briefId: "x".repeat(201) }).agent).toEqual({ role: "builder" });
    expect(withAgent({ role: "builder", briefId: "a".repeat(64) }).agent).toEqual({ role: "builder" });
    expect(withAgent({ role: "builder", briefId: 7 }).agent).toEqual({ role: "builder" });
  });

  it("cuts the subflow name to 160 characters, drops an empty one, and never copies an unknown field", () => {
    expect(withAgent({ role: "builder", subflowName: "n".repeat(400) }).agent?.subflowName).toHaveLength(160);
    expect(withAgent({ role: "builder", subflowName: "   " }).agent).toEqual({ role: "builder" });
    expect(withAgent({ role: "builder", token: "secret" }).agent).toEqual({ role: "builder" });
  });
});

describe("the bounds on a project card", () => {
  it("keeps a card only on a note row", () => {
    expect(note(brief)?.project).toEqual(brief);
    expect(note(brief, "step")).not.toHaveProperty("project");
  });

  it("drops a card of an unknown kind, or with a closed field outside the contract", () => {
    expect(note({ ...brief, kind: "memo" })).not.toHaveProperty("project");
    expect(note({ ...brief, brief: "explore" })).not.toHaveProperty("project");
    expect(note({ ...brief, briefId: "f".repeat(64) })).not.toHaveProperty("project");
    expect(note({ ...brief, allowanceUsd: -1 })).not.toHaveProperty("project");
    expect(note({ kind: "return", briefId: "b1", subflowKey: "s", outcome: "maybe", reason: "r", spentUsd: 0, calls: 1, trials: 0 })).not.toHaveProperty("project");
    expect(note({ kind: "receipt", receipt: "subflow_trial", receiptId: "r1", verdict: "yes" })).not.toHaveProperty("project");
  });

  it("rebuilds the card without unknown fields and cuts strings and lists to their bounds", () => {
    const long = "w".repeat(400);
    const plan = note({
      kind: "plan",
      parts: Array.from({ length: 30 }, (_, index) => ({ id: `p${index}`, words: long, quote: "extra" })),
      subflows: [{ key: "s1", name: long, purpose: long, parts: Array.from({ length: 30 }, (_, index) => `p${index}`), digest: "a".repeat(64) }],
      reserveUsd: 0.1,
      secret: "never"
    })?.project;
    expect(plan).toMatchObject({ kind: "plan", reserveUsd: 0.1 });
    expect(plan).not.toHaveProperty("secret");
    if (plan?.kind !== "plan") throw new Error("expected a plan card");
    expect(plan.parts).toHaveLength(20);
    expect(plan.parts[0]).toEqual({ id: "p0", words: `${"w".repeat(159)}…` });
    expect(plan.subflows[0]).not.toHaveProperty("digest");
    expect(plan.subflows[0]!.parts).toHaveLength(20);
    expect(plan.subflows[0]!.purpose).toHaveLength(160);
    const returned = note({ kind: "return", briefId: "b1", subflowKey: "s1", outcome: "partial", reason: long, spentUsd: 0.01, calls: 3, trials: 1 })?.project;
    expect(returned).toMatchObject({ kind: "return", outcome: "partial" });
    expect(returned?.kind === "return" ? returned.reason : "").toHaveLength(240);
  });
});
