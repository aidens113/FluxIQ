// This subject explicitly uses layout 1 and never opens SQLite.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../../../../framework/persistence/paths/index.ts";
import { AutomationStudioProjectBuildDocuments } from "../index.ts";

it("writes the original envelope, key order and newline through the actual canonical file owner", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-record-owner-"));
  try {
    await writeFile(path.join(root, "config.json"), '{"layoutVersion":1}');
    const projects = new AutomationStudioProjectPaths(path.join(root, "programs", "automation-studio", "projects"));
    const flows = new AutomationStudioFlowPaths(projects);
    const documents = new AutomationStudioProjectBuildDocuments(projects, flows);
    const ref = { projectId: "project.file", flowId: "flow.file", buildId: "build.file" };
    const value = { z: 1, a: ["kept"] };
    await documents.update(ref, "build", () => value);
    const file = path.join(flows.flowDirectory(ref.projectId, ref.flowId), "project-builds", ref.buildId, "build.json");
    expect(await readFile(file, "utf8")).toBe('{\n  "version": 1,\n  "data": {\n    "z": 1,\n    "a": [\n      "kept"\n    ]\n  }\n}\n');
    expect(await new AutomationStudioProjectBuildDocuments(projects, flows).read(ref, "build")).toEqual(value);
  } finally {
    const resolved = path.resolve(root);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("fluxiq-record-owner-")) throw new Error("Refusing cleanup outside the isolated record fixture.");
    await rm(resolved, { recursive: true, force: true });
  }
});
