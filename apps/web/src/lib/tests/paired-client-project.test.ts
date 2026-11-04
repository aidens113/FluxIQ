import { describe, expect, it } from "vitest";
import { projectForPairedClient } from "../paired-client-project";

function studio(projects: { id: string; updatedAt: number }[]) {
  const made: { name: string; domainId: string }[] = [];
  return {
    made,
    listProjects: async () => ({ projects }),
    createProject: async (input: { name: string; domainId: string }) => {
      made.push(input);
      await new Promise((resolve) => setImmediate(resolve));
      return { id: "project.first", updatedAt: 1 };
    }
  };
}

describe("the project a paired browser works in when none is open in the panel", () => {
  it("is the one last worked in", async () => {
    const projects = studio([{ id: "older", updatedAt: 1 }, { id: "newer", updatedAt: 9 }]);
    await expect(projectForPairedClient(projects, "web-automation")).resolves.toBe("newer");
    expect(projects.made).toEqual([]);
  });

  it("is a first one, when there are none, and only one however many ask at once", async () => {
    const projects = studio([]);
    const answers = await Promise.all([projectForPairedClient(projects, "web-automation"), projectForPairedClient(projects, "web-automation")]);
    expect(answers).toEqual(["project.first", "project.first"]);
    expect(projects.made).toEqual([{ name: "My automations", domainId: "web-automation" }]);
  });

  it("is none for a client that declared no domain", async () => {
    const projects = studio([]);
    await expect(projectForPairedClient(projects, null)).resolves.toBeNull();
    expect(projects.made).toEqual([]);
  });
});
