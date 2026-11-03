// @fluxiq-test-group real-sql
// The whole candidate's trial ports a host makes from an Automation Studio
// service outside a build (trace plan P5, `../service-ports.ts`): the build's
// own composition -- its trial environment from the service's collaborators,
// then the whole ports (`../environment.ts`, `../whole-ports.ts`) -- with the
// judge the caller supplies and no start hook. A real service adopts its
// collaborators as it is built; one with no bound domain refuses.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AutomationStudioService } from "../../../service.ts";
import { AutomationStudioServiceTrialCollaboratorRegistry, automationStudioServiceRegistryResolution, automationStudioServiceTrialEnvironment, automationStudioServiceWholeTrialPorts, automationStudioWholeTrialPorts } from "../index.ts";
import { BINDING, FLOW, PARENT, PROJECT, fakeCollaborators } from "./fakes.ts";

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** A judge no test here asks. */
const judge = async (): Promise<never> => {
  throw new Error("no judge is asked here");
};

const INPUT = { projectId: PROJECT, flowId: FLOW, sourceInstructionIds: ["instruction.1"], startLocation: "https://start.test/", judge };

describe("a service's whole-candidate trial ports, outside a build", () => {
  it("equal the build's composition member for member, with the judge given, the binding's view keys once each and no start hook", async () => {
    const owner = {};
    const { collaborators } = fakeCollaborators({ binding: BINDING });
    AutomationStudioServiceTrialCollaboratorRegistry.adopt(owner, collaborators);

    const ports = await automationStudioServiceWholeTrialPorts(owner as AutomationStudioService, INPUT);

    const { registry, resolution } = automationStudioServiceRegistryResolution(undefined, PARENT.scope);
    const environment = automationStudioServiceTrialEnvironment(collaborators, { projectId: PROJECT, flowId: FLOW, sourceInstructionIds: ["instruction.1"], startLocation: "https://start.test/", registry, resolution, observedStateKeys: ["read.view", "read.other"] });
    const built = automationStudioWholeTrialPorts({ environment, binding: BINDING, judge });
    expect(Object.keys(ports).sort()).toEqual(Object.keys(built).sort());
    expect(ports.judge).toBe(judge);
    expect(ports.prepareStart).toBeUndefined();
    expect(ports.observedStateKeys).toEqual(["read.view", "read.other"]);
    expect(ports.deniedEvidenceKeys).toEqual(built.deniedEvidenceKeys);
    expect(ports.resolution).toEqual(resolution);
    expect(ports.registry?.list(resolution)).toEqual(registry.list(resolution));
    expect(await ports.parentFlow()).toBe(await built.parentFlow());
    expect(await ports.deprecatedPublicationIds()).toEqual(await built.deprecatedPublicationIds());
    expect(await ports.clearedControlHandles!(["wayOut1"])).toEqual(await built.clearedControlHandles!(["wayOut1"]));
  });

  it("refuses an owner that adopted no collaborators", async () => {
    await expect(automationStudioServiceWholeTrialPorts({} as AutomationStudioService, INPUT)).rejects.toThrow("adopted no trial collaborators");
  });

  it("are adopted by a real service as it is built, which refuses while no domain is bound", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-trial-ports-"));
    const service = new AutomationStudioService({ dataDir, seedFixture: false });
    cleanups.push(() => rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 }));
    cleanups.push(() => service.close());

    const adopted = AutomationStudioServiceTrialCollaboratorRegistry.of(service);
    expect(adopted).toBeDefined();
    expect(adopted!.binding()).toBeUndefined();
    expect(adopted!.runDatasets()).toBe(service.runDatasets);
    expect(adopted!.conversations()).toBe(service.conversations);
    await expect(automationStudioServiceWholeTrialPorts(service, INPUT)).rejects.toThrow("no evidence runtime is bound");
  });
});
