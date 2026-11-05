import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioSiteResetProjectLedger } from "../../../../../flow-authoring/bootstrap/site-reset/index.ts";
import type { AutomationStudioProjectSupervisorContext } from "../../../context.ts";
import type { AutomationStudioProjectSupervisorPorts } from "../../../ports.ts";
import { automationStudioProjectSupervisorReadTask } from "../../../read-task.ts";

// The free first look of a project build shows the saved parts that may fit, and only when there are some:
// a project with none reads byte for byte what it always read, and the library's read never rejects, so the look never waits on a failure.
function contextOf(more: Partial<AutomationStudioProjectSupervisorPorts> = {}): AutomationStudioProjectSupervisorContext {
  const ports = {
    build: { projectId: "project.one", flowId: "flow.one", buildId: "build.one" },
    record: { summary: async () => undefined },
    sources: [{ sourceId: "instruction.1", text: "Do the thing." }],
    projectLedger: new AutomationStudioSiteResetProjectLedger(),
    ...more
  } as unknown as AutomationStudioProjectSupervisorPorts;
  return { ports } as unknown as AutomationStudioProjectSupervisorContext;
}

const evidenceOf = async (context: AutomationStudioProjectSupervisorContext): Promise<JsonObject> => {
  const answer = await automationStudioProjectSupervisorReadTask(context);
  return answer.evidence as JsonObject;
};

const KNOWN: JsonObject = { note: "These may fit.", parts: [{ partId: "part.one", version: 1, name: "Look an item up", purpose: "Look an item up", sites: ["https://shop.example"], inputs: [], outputs: [], fixedValues: [], lastingClasses: [], trust: "unproven" }] };

describe("project.read_task and the known parts", () => {
  it("carries the shortlist as knownParts, and the rest of the look as it was", async () => {
    const without = await evidenceOf(contextOf());
    const shown = await evidenceOf(contextOf({ knownParts: async () => KNOWN }));
    expect(shown.knownParts).toEqual(KNOWN);
    const { knownParts: _known, ...rest } = shown;
    expect(rest).toEqual(without);
  });

  it("is byte-identical for a project with no part to offer", async () => {
    const plain = JSON.stringify(await evidenceOf(contextOf()));
    expect(JSON.stringify(await evidenceOf(contextOf({ knownParts: async () => undefined })))).toBe(plain);
    expect(plain).not.toContain("knownParts");
  });
});
