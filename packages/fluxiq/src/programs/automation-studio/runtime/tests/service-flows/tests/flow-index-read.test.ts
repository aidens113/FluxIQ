import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioServiceIndexes } from "../../../service/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { createRunnableCanonicalFlow } from "../../service-fixtures.ts";

// The Flow listing reads the project's flow index. A read that fails is the
// listing's failure. Taken as an empty index, it listed the project as having
// no Flows at all. (A malformed file already failed the listing, through the
// metadata repair's write; a failed read of a well-formed index did not.)

type WithIndexes = { indexes: AutomationStudioServiceIndexes };

let tempRoot: string;
const services = new Set<AutomationStudioService>();

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-flow-index-read-"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

describe("listing a project's Flows", () => {
  it("fails when the flow index cannot be read, instead of listing no Flows", async () => {
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
    services.add(service);
    const project = await service.createProject({ name: "Flow index" });
    const flow = await createRunnableCanonicalFlow(service, project.id, { flowId: "flow.flow-index" });
    const listed = expect.arrayContaining([expect.objectContaining({ flowId: flow.flowId })]);
    await expect(service.listAutomationFlowSummaries(project.id)).resolves.toEqual(listed);
    const indexes = (service as unknown as WithIndexes).indexes;
    vi.spyOn(indexes, "readFlowIndex").mockRejectedValueOnce(new Error("flow index unreadable"));
    const write = vi.spyOn(indexes, "writeFlowIndex");

    await expect(service.listAutomationFlowSummaries(project.id)).rejects.toThrow("flow index unreadable");

    expect(write).not.toHaveBeenCalled();
    await expect(service.listAutomationFlowSummaries(project.id)).resolves.toEqual(listed);
  });
});
