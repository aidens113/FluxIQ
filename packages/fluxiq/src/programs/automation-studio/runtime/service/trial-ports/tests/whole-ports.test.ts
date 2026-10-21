// The whole candidate's trial ports a build's trial environment makes (trace
// plan P5, `../whole-ports.ts`): the environment, the bound domain's trial
// reads and the judge, which `project-build/whole-trials.ts` now builds its
// trial port from.
import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import { automationStudioServiceTrialEnvironment, automationStudioWholeTrialPorts } from "../index.ts";
import { BINDING, FLOW, PARENT, PROJECT, fakeCollaborators } from "./fakes.ts";

/** A judge no test here asks. */
const judge = async (): Promise<never> => {
  throw new Error("no judge is asked here");
};

describe("the whole candidate's trial ports from a build's trial environment", () => {
  it("keeps every environment member, adds the bound domain's trial reads, and the judge given", async () => {
    const { collaborators } = fakeCollaborators();
    const environment = automationStudioServiceTrialEnvironment(collaborators, { projectId: PROJECT, flowId: FLOW, sourceInstructionIds: [], registry: new AutomationStudioNodeRegistry(), resolution: { scope: PARENT.scope, runtimeCapabilities: [], permissions: [] } });
    const ports = automationStudioWholeTrialPorts({ environment, binding: BINDING, judge });
    for (const [name, value] of Object.entries(environment)) expect(ports[name as keyof typeof ports], name).toBe(value);
    expect(ports.judge).toBe(judge);
    expect(ports.deniedEvidenceKeys).toEqual(["secret.key"]);
    expect(await ports.clearedControlHandles!(["wayOut1"])).toEqual({ wayOut1: "handle.1" });
    expect(typeof ports.readEndView).toBe("function");
    expect(Object.keys(ports).sort()).toEqual([...Object.keys(environment), "readEndView", "clearedControlHandles", "deniedEvidenceKeys", "judge"].sort());
  });
});
