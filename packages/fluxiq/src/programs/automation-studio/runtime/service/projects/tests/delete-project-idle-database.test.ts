import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioService } from "../../../service.ts";

// The service's project database pool keeps a project's connection open for a
// moment after each operation (t246). Deleting the project removes its folder,
// which an open connection would hold on Windows, so the delete closes it first.
let tempRoot = "";
let service: AutomationStudioService | undefined;

describe("deleting a project the service has just used", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-delete-project-idle-"));
  });

  afterEach(async () => {
    await service?.close();
    service = undefined;
    await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  it("removes the project's folder, database included, right after an operation used it", async () => {
    service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Deleted" });
    await service.createFlow({ projectId: project.id, flowId: "flow.deleted", name: "Deleted" });
    const projectDirectory = path.join(tempRoot, "programs", "automation-studio", "projects", project.id);
    await access(path.join(projectDirectory, "project.sqlite"));

    await expect(service.deleteProject(project.id)).resolves.toEqual({ deletedProjectId: project.id });

    await expect(access(projectDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await service.listProjects()).projects.some((listed) => listed.id === project.id)).toBe(false);
  });
});
