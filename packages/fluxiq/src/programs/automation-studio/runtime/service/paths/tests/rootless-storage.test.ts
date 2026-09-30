import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioService } from "../../../service.ts";
import { AutomationStudioProjectPaths } from "../project.ts";

// A service constructed with no storage root -- `new AutomationStudioService()`,
// the public default -- is an in-memory service. It must remember what it was
// told for its own lifetime, and it must never write into the process's working
// directory, which is where a relative path lands.
describe("an Automation Studio service with no storage root", () => {
  const originalCwd = process.cwd();
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(os.tmpdir(), "fluxiq-rootless-"));
    process.chdir(cwd);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(cwd, { recursive: true, force: true });
  });

  it("remembers a project it created and writes nothing into the working directory", async () => {
    const service = new AutomationStudioService({ seedFixture: false });
    const project = await service.createProject({ name: "Rootless" });
    const listed = await service.listProjects();
    expect(listed.projects.map((item) => item.id)).toContain(project.id);
    // A recording outside any project lives in the in-memory repository.
    const recording = await service.createRecording({ recordingId: "recording.rootless", startedAt: 1, initialState: { timestamp: 1, namespaces: {} } });
    await service.appendRecordingEvent({ recordingId: recording.recordingId, entry: { type: "observation", observationType: "input.state", payload: { value: 1 }, sourceId: "input.state" } as never });
    expect((await service.finalizeRecording({ recordingId: recording.recordingId })).recordingId).toBe("recording.rootless");
    // A project's recording is kept in memory too: the service writes no project
    // files without a root, rather than writing them into the working directory.
    const projectRecording = await service.createRecording({ projectId: project.id, recordingId: "recording.project", startedAt: 1, initialState: { timestamp: 1, namespaces: {} } });
    await service.appendRecordingEvent({ projectId: project.id, recordingId: projectRecording.recordingId, entry: { type: "observation", observationType: "input.state", payload: { value: 2 }, sourceId: "input.state" } as never });
    await service.finalizeRecording({ projectId: project.id, recordingId: projectRecording.recordingId });
    expect(await readdir(cwd)).toEqual([]);
  });

  it("names no file path at all, rather than one relative to the working directory", () => {
    const paths = new AutomationStudioProjectPaths(undefined);
    expect(paths.projectDirectory("project-1")).toBe("");
    expect(() => paths.projectFile("project-1", "indexes", "runs.json")).toThrow(/no storage root/);
    expect(() => paths.flowRunIndexFile("project-1")).toThrow(/no storage root/);
  });
});
