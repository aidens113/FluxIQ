import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioService } from "../../../service.ts";
import { createRunnableCanonicalFlow } from "../../service-fixtures.ts";

// The Flow listing attaches each Flow's Subflows from the project's subflow
// index. An index that is missing holds none yet; one that is present but
// unreadable is an error. Read as empty, it listed every Flow as having no
// Subflows at all.

let tempRoot: string;
const services = new Set<AutomationStudioService>();

function createService(): AutomationStudioService {
  const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
  services.add(service);
  return service;
}

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-subflow-index-read-"));
});

afterEach(async () => {
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

describe("listing Flows with their Subflows", () => {
  it("fails when the subflow index cannot be read, instead of listing no Subflows", async () => {
    const service = createService();
    const project = await service.createProject({ name: "Subflow index" });
    const flow = await createRunnableCanonicalFlow(service, project.id, { flowId: "flow.subflow-index" });
    const listed = await service.listAutomationFlowSummaries(project.id);
    expect(listed.find((summary) => summary.flowId === flow.flowId)?.hierarchySubflows).toHaveLength(1);

    const indexFile = path.join(tempRoot, "programs", "automation-studio", "projects", project.id, "indexes", "subflows.json");
    await writeFile(indexFile, "{ this is not json", "utf8");

    await expect(service.listAutomationFlowSummaries(project.id)).rejects.toThrow(/Program state is malformed/);
  });

  it("lists a Flow with no Subflows when the project has no subflow index yet", async () => {
    const service = createService();
    const project = await service.createProject({ name: "No subflow index" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.no-subflows", name: "No Subflows" });

    const listed = await service.listAutomationFlowSummaries(project.id);
    const summary = listed.find((item) => item.flowId === flow.flowId);
    expect(summary).toBeDefined();
    expect(summary?.hierarchySubflows ?? []).toEqual([]);
  });
});
