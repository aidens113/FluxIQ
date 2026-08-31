import { describe, expect, it } from "vitest";
import {
  resolveAutomationStoreSelectorSnapshot,
  type AutomationStoreSelectorSnapshotCache
} from "./use-store-selector";

type State = { loaded: boolean; projects: readonly string[] };
type Selection = { loaded: boolean; projects: readonly string[] };

const sameSelection = (left: Selection, right: Selection) => (
  left.loaded === right.loaded && left.projects === right.projects
);

describe("Automation Studio store selector snapshots", () => {
  it("retains snapshot identity when an inline selector is recreated", () => {
    const state: State = { loaded: true, projects: ["project.one"] };
    let cache: AutomationStoreSelectorSnapshotCache<State, Selection> | null = null;
    const first = resolveAutomationStoreSelectorSnapshot(
      state,
      (current) => ({ loaded: current.loaded, projects: current.projects }),
      sameSelection,
      cache
    );
    cache = first.cache;
    const second = resolveAutomationStoreSelectorSnapshot(
      state,
      (current) => ({ loaded: current.loaded, projects: current.projects }),
      sameSelection,
      cache
    );

    expect(second.snapshot).toBe(first.snapshot);
  });

  it("publishes a new snapshot when selected values change", () => {
    const projects = ["project.one"];
    const first = resolveAutomationStoreSelectorSnapshot(
      { loaded: false, projects },
      (current) => ({ loaded: current.loaded, projects: current.projects }),
      sameSelection,
      null
    );
    const second = resolveAutomationStoreSelectorSnapshot(
      { loaded: true, projects },
      (current) => ({ loaded: current.loaded, projects: current.projects }),
      sameSelection,
      first.cache
    );

    expect(second.snapshot).not.toBe(first.snapshot);
    expect(second.snapshot.loaded).toBe(true);
  });
});
