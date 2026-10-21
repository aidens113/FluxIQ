// What every trial of a build is run with, made from the service's own
// collaborators (trace plan P5, `../environment.ts`): the construction the
// build ran inline in `service.ts`, member by member, now the one function the
// build and the public trial-ports seam both call.
import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import { automationStudioServiceTrialEnvironment } from "../index.ts";
import { FLOW, PARENT, PROJECT, fakeCollaborators } from "./fakes.ts";

const RESOLUTION = { scope: PARENT.scope, runtimeCapabilities: [], permissions: [] };
const hook = async () => ({ fixture: "reset" });

function environmentOf(options: { observedStateKeys?: readonly string[]; prepareStart?: typeof hook } = {}) {
  const fake = fakeCollaborators();
  const registry = new AutomationStudioNodeRegistry();
  const environment = automationStudioServiceTrialEnvironment(fake.collaborators, { projectId: PROJECT, flowId: FLOW, sourceInstructionIds: ["instruction.1"], startLocation: "https://start.test/", registry, resolution: RESOLUTION, ...options });
  return { ...fake, environment, registry };
}

describe("a build's trial environment from the service's collaborators", () => {
  it("carries the build's identity, start, registry and resolution as given", () => {
    const { environment, registry } = environmentOf();
    expect(environment).toMatchObject({ projectId: PROJECT, flowId: FLOW, sourceInstructionIds: ["instruction.1"], startLocation: "https://start.test/", resolution: RESOLUTION });
    expect(environment.registry).toBe(registry);
  });

  it("reads the parent Flow, its base digest and the catalogue's publications through the service", async () => {
    const { environment, calls } = environmentOf();
    expect(await environment.parentFlow()).toBe(PARENT);
    expect(await environment.currentBaseDigest()).toBe("digest.base");
    expect(await environment.snapshots()).toEqual([]);
    expect(await environment.deprecatedPublicationIds()).toEqual(["flow.old@2"]);
    expect(calls.map((call) => call.name)).toEqual(["getFlow", "dependencyDigest"]);
    expect(calls[0]!.args).toEqual([PROJECT, FLOW]);
  });

  it("opens and writes the trial's session under the build's project and Flow", async () => {
    const { environment, calls, session } = environmentOf();
    expect(await environment.openSession({ runId: "run.1", metadata: { trial: true } })).toBe(session);
    await environment.writeSession(session);
    expect(calls).toEqual([
      { name: "startRuntimeSession", args: [{ projectId: PROJECT, flowId: FLOW, runId: "run.1", metadata: { trial: true } }] },
      { name: "writeRuntimeSession", args: [PROJECT, session] }
    ]);
  });

  it("gives each trial's run the executor options a run gets, with its datasets' batch handler and its parking", () => {
    const { environment, calls, batch, parking } = environmentOf();
    const signal = new AbortController().signal;
    const options = environment.graphOptions({ runId: "run.7", signal });
    expect(options.signal).toBe(signal);
    expect(options.onRecordBatch).toBe(batch);
    expect(options.parking).toBe(parking);
    expect(calls).toEqual([
      { name: "recordBatchHandler", args: [PROJECT, "run.7"] },
      { name: "parkingPort", args: [{ projectId: PROJECT, subject: { kind: "run", id: "run.7" } }] }
    ]);
  });

  it("processes and reads the run's datasets, and reads its action attempts off the session", async () => {
    const { environment, calls } = environmentOf();
    await environment.processDatasets("run.3");
    expect(await environment.recordSets("run.3")).toEqual([]);
    expect(calls).toEqual([{ name: "processEndedRunDatasets", args: [{ projectId: PROJECT, runId: "run.3" }] }]);
    expect(typeof environment.actionAttempts).toBe("function");
  });

  it("carries the view keys and the start hook it is given, and neither when given none", () => {
    expect(environmentOf({ observedStateKeys: ["read.view"], prepareStart: hook }).environment).toMatchObject({ observedStateKeys: ["read.view"], prepareStart: hook });
    const bare = environmentOf().environment;
    expect(bare.observedStateKeys).toBeUndefined();
    expect(bare.prepareStart).toBeUndefined();
  });
});
