// A finished run is held to the answers its Flow's build declared (t764): the
// run's check reads them through the `requestedOutput` port, which the service
// backs with the declaration saved on the promoted Flow. A Flow saved without
// one is judged exactly as before. No model is called: the provider is scripted.
import { describe, expect, it } from "vitest";
import { instruction, harness, verify } from "../../run-outcome-harness.ts";

const OWED = { parts: [{ part: "p1", columns: ["day", "opens"] }] };
const REQUEST = instruction("List the reading room's weekday hours with columns day and opens.");

describe("a finished run's check and the answers its Flow declared", () => {
  it("holds a yes to the declared answer when the run stored no record, asking the port for the run's own Flow", async () => {
    const asked: Array<{ projectId: string; flowId: string }> = [];
    const context = harness({ answer: "yes", instructions: [REQUEST], datasets: [], rows: [] });
    context.ports.requestedOutput = async (scope) => {
      asked.push(scope);
      return OWED;
    };
    const result = await verify(context);
    expect(asked).toEqual([{ projectId: "project-1", flowId: "flow-1" }]);
    expect(result.status).toBe("failed");
    expect(JSON.stringify(result.metadata)).toContain("core.result.requested_output_missing");
  });

  it("judges a Flow saved without a declaration exactly as before: the port names none, or there is no port", async () => {
    for (const port of [undefined, async () => undefined]) {
      const context = harness({ answer: "yes", instructions: [REQUEST], datasets: [], rows: [] });
      if (port) context.ports.requestedOutput = port;
      const result = await verify(context);
      expect(JSON.stringify(result.metadata)).not.toContain("requested_output_missing");
      expect(result.status).not.toBe("failed");
    }
  });
});
