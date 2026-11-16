import { describe, expect, it } from "vitest";
import type { ProgramCommandTransport } from "../../../../automation-studio/data/program-transport";
import { projectsSource, projectsTransport } from "../source";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the shared projects source", () => {
  it("asks `projects` once for two subscribers, then keeps the list when a refresh fails", async () => {
    let asks = 0;
    let ok = true;
    projectsTransport.current = {
      get: async (endpoint: string) => {
        expect(endpoint).toBe("projects");
        asks += 1;
        return ok ? { ok: true, payload: { projects: [{ id: "p1", name: "Shop" }, { id: "p2" }, { name: "no id" }] } } : { ok: false };
      }
    } as unknown as ProgramCommandTransport;
    const switcher = projectsSource.subscribe(() => undefined);
    const dock = projectsSource.subscribe(() => undefined);
    await settle();
    expect(asks).toBe(1);
    expect(projectsSource.getSnapshot()).toEqual({ projects: [{ id: "p1", name: "Shop" }, { id: "p2", name: "p2" }], failed: false, loaded: true });
    ok = false;
    projectsSource.refresh();
    await settle();
    expect(asks).toBe(2);
    expect(projectsSource.getSnapshot()).toMatchObject({ failed: true, loaded: true, projects: [{ id: "p1" }, { id: "p2" }] });
    switcher();
    dock();
  });
});
