// Covers removals.ts: a removal is announced once it succeeded, a failed one is not, and a stopped listener hears nothing.
import { describe, expect, it } from "vitest";
import { AutomationStudioProjectRemovals } from "../removals.ts";

describe("project removals", () => {
  it("announces a project once its removal succeeded, and answers the removal's own result", async () => {
    const removals = new AutomationStudioProjectRemovals();
    const heard: string[] = [];
    removals.subscribe((projectId) => heard.push(projectId));

    expect(await removals.run("project-1", async () => ({ deletedProjectId: "project-1" }))).toEqual({ deletedProjectId: "project-1" });

    expect(heard).toEqual(["project-1"]);
  });

  it("announces nothing for a removal that failed, or to a listener that stopped", async () => {
    const removals = new AutomationStudioProjectRemovals();
    const heard: string[] = [];
    const stop = removals.subscribe((projectId) => heard.push(projectId));

    await expect(removals.run("project-1", async () => {
      throw new Error("removal failed");
    })).rejects.toThrow("removal failed");
    stop();
    await removals.run("project-2", async () => undefined);

    expect(heard).toEqual([]);
  });
});
