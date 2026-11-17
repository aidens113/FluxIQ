import { describe, expect, it } from "vitest";
import { createSharedSource } from "../../../shared";
import { createProjectsPort } from "../port";
import { PROJECTS_NOT_READ, type ProjectsReading } from "../reading";

function sourceAnswering(answers: ProjectsReading[]) {
  let asked = 0;
  const source = createSharedSource<ProjectsReading>({
    initial: PROJECTS_NOT_READ,
    failed: (previous) => ({ projects: previous.projects, failed: true, loaded: true }),
    read: async () => answers[Math.min(asked++, answers.length - 1)]!
  });
  return { source, asked: () => asked };
}

describe("the shared switcher's projects port", () => {
  it("lists what the one shared source ends on, reading it again each time", async () => {
    const { source, asked } = sourceAnswering([
      { projects: [{ id: "a", name: "Shop" }], failed: false, loaded: true },
      { projects: [{ id: "a", name: "Shop" }, { id: "b", name: "Jobs" }], failed: false, loaded: true }
    ]);
    const port = createProjectsPort(source, async () => ({ id: "x", name: "x" }), () => undefined);
    expect(await port.list()).toEqual([{ id: "a", name: "Shop" }]);
    expect((await port.list()).map((project) => project.id)).toEqual(["a", "b"]);
    expect(asked()).toBe(2);
  });

  it("rejects in words when the read failed and nothing was ever listed", async () => {
    const { source } = sourceAnswering([{ projects: [], failed: true, loaded: true }]);
    const port = createProjectsPort(source, async () => ({ id: "x", name: "x" }), () => undefined);
    await expect(port.list()).rejects.toThrow("Couldn't load your projects.");
  });

  it("creates through the panel's own command, then tells the shell the list changed", async () => {
    const { source } = sourceAnswering([PROJECTS_NOT_READ]);
    let changes = 0;
    const port = createProjectsPort(source, async (name) => ({ id: "new", name }), () => (changes += 1));
    expect(await port.create("Careers")).toEqual({ id: "new", name: "Careers" });
    expect(changes).toBe(1);
  });

  it("does not tell the shell anything when creating fails", async () => {
    const { source } = sourceAnswering([PROJECTS_NOT_READ]);
    let changes = 0;
    const port = createProjectsPort(source, async () => { throw new Error("A project with that name exists."); }, () => (changes += 1));
    await expect(port.create("Careers")).rejects.toThrow("A project with that name exists.");
    expect(changes).toBe(0);
  });
});
