// A reset brief's completion refusal (`../reset-loop.ts`, rerun round 3, office
// `run-mvgo5xft-25460ba2`): it lists each open act with its settle and the refs
// already issued, so a look can name one under resetDestination without a
// fresh read. Generic acts and refs only; the model is a script.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioProjectResetPorts } from "../index.ts";
import { gardenBrief, gardenBuild } from "./dispatch-fixture.ts";

const SETTLE = "Nothing read shows where its effect would be: read the list where it would show completely and name that list's ref as resetDestination on a look that names this act under undoes.";

async function refusalWith(issuedRefs?: () => Array<{ ref: string; count: number }>): Promise<JsonObject> {
  const seen: unknown[] = [];
  const ports: AutomationStudioProjectResetPorts & { issuedRefs?: () => Array<{ ref: string; count: number }> } = {
    loop: {
      tools: [{ toolId: "site.undo", description: "Undo one act", effect: "mutate", inputSchema: { type: "object" } }],
      unusableDecisions: { maxConsecutive: 2, maxInARow: 2, stalled: () => new Error("the reset stalled") },
      executeTool: async () => ({ ok: true }),
      decide: async ({ evidence }) => {
        seen.push(...evidence.map((entry) => entry.value));
        return { kind: "complete", result: { summary: "done" } };
      }
    },
    remainingActs: async () => [{ act: "act-1", did: "press \"Rate\" button", settle: SETTLE }, { act: "act-2", did: "press \"Rate\" button", settle: SETTLE }],
    ...(issuedRefs ? { issuedRefs } : {})
  };
  const brief = gardenBrief("b-reset", "list_seeds", [], (value) => Object.assign(value, { kind: "reset", parts: [], maxIterations: 3 }));
  const build = await gardenBuild({ capacity: 1, briefs: [brief], ports: { reset: () => ports } });
  await build.run();
  return seen.find((value): value is JsonObject => typeof value === "object" && value !== null && (value as JsonObject).code === "project.reset_acts_in_place")!;
}

describe("a reset's completion refusal", () => {
  it("lists each open act with its settle, and the refs already issued with how to use them", async () => {
    const refusal = await refusalWith(() => [{ ref: "destination-1", count: 4 }, { ref: "destination-2", count: 0 }]);
    expect(refusal.actsToUndo).toEqual([{ act: "act-1", did: "press \"Rate\" button", settle: SETTLE }, { act: "act-2", did: "press \"Rate\" button", settle: SETTLE }]);
    expect(refusal.issuedRefs).toEqual([{ ref: "destination-1", count: 4 }, { ref: "destination-2", count: 0 }]);
    const instruction = String(refusal.instruction);
    expect(instruction).toContain("issuedRefs lists the refs of lists already read complete");
    expect(instruction).toContain("\"undoes\": \"<act>\", \"resetDestination\": \"<ref>\"");
    expect(instruction).toContain("Each listed act says under settle what settles it");
  });

  it("says nothing of refs when none was issued", async () => {
    const refusal = await refusalWith(() => []);
    expect(refusal.issuedRefs).toBeUndefined();
    expect(String(refusal.instruction)).not.toContain("issuedRefs");
    const without = await refusalWith();
    expect(without.issuedRefs).toBeUndefined();
  });
});
