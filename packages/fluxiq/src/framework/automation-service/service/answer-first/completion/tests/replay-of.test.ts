// The replay a completion closes (task speed S9, `../replay-of.ts`): only a saved Flow's own run, while
// the attempt is still on it; every other completion is judged as before.
import { describe, expect, it } from "vitest";
import { automationStudioAnswerFirstReplayOf } from "../index.ts";

const saved = { label: "confirmed" as const, provenWhole: true, shape: { columns: ["title"], empty: false } };
const ran = { kind: "ran" as const, reachedEnd: true, steps: [{ position: 1, ran: "passed" as const }, { position: 2, ran: "skipped" as const, skipped: "absent" as const }] };

describe("the replay a completion closes", () => {
  it("is the saved Flow's run, with its label, proof and read shape", () => {
    expect(automationStudioAnswerFirstReplayOf({ route: { kind: "use", saved }, path: "run_flow", flowRun: { outcome: ran } })).toEqual({ saved, reachedEnd: true, steps: ran.steps, repaired: false });
  });

  it("leaves the shape out where the saved Flow kept none", () => {
    const read = automationStudioAnswerFirstReplayOf({ route: { kind: "use", saved: { label: "confirmed", provenWhole: true } }, path: "run_flow", flowRun: { outcome: ran } });
    expect(read?.saved).toEqual({ label: "confirmed", provenWhole: true });
  });

  it("is none for anything that is not the saved Flow's own run", () => {
    const cases: Array<[string, Parameters<typeof automationStudioAnswerFirstReplayOf>[0]]> = [
      ["an exploration", { route: { kind: "build" }, path: "explore" }],
      ["a Flow seeded for repair", { route: { kind: "repair", saved }, path: "explore", flowRun: { outcome: ran } }],
      ["a carried-on attempt", { route: { kind: "use", saved }, prior: {}, path: "run_flow", flowRun: { outcome: ran } }],
      ["a round after the run", { route: { kind: "use", saved }, path: "run_flow_then_repair", flowRun: { outcome: ran } }],
      ["no run yet", { route: { kind: "use", saved }, path: "run_flow" }],
      ["a run that did not run", { route: { kind: "use", saved }, path: "run_flow", flowRun: { outcome: { kind: "permission_declined", consequences: [] } } }]
    ];
    for (const [why, run] of cases) expect(automationStudioAnswerFirstReplayOf(run), why).toBeUndefined();
  });
});
