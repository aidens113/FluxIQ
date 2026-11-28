// The project switcher under a fake DOM: what the button says, the sheet's list, search and
// keys, New project, All projects, and where focus goes.

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "vitest";
import { FakeElement, fake, withFakeDocument } from "../../testing/index.ts";
import { filterProjects } from "../filter-projects.ts";
import { createProjectSwitcher, type ProjectSwitcher } from "../project-switcher.ts";
import type { ProjectSummary } from "../project-summary.ts";
import type { ProjectsPort } from "../projects-port.ts";

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const ALPHA: ProjectSummary = { id: "p1", name: "Alpha shop", updatedAt: "2026-11-01T00:00:00Z" };
const BRAVO: ProjectSummary = { id: "p2", name: "Bravo jobs" };
const CHARLIE: ProjectSummary = { id: "p3", name: "Charlie news" };

type Doc = { activeElement: unknown; addEventListener(type: string, listener: (event: unknown) => void): void; removeEventListener(type: string, listener: (event: unknown) => void): void };
const doc = () => (globalThis as unknown as { document: Doc }).document;
let realFocus: FakeElement["focus"];

beforeEach(() => {
  realFocus = FakeElement.prototype.focus;
  FakeElement.prototype.focus = function focus(this: FakeElement) {
    doc().activeElement = this;
  };
});
afterEach(() => {
  FakeElement.prototype.focus = realFocus;
});

type Calls = { selected: ProjectSummary[]; all: number; created: string[] };

async function mounted(port: Partial<ProjectsPort>, withAll: boolean, body: (switcher: ProjectSwitcher, root: ReturnType<typeof fake>, calls: Calls) => Promise<void>): Promise<void> {
  await withFakeDocument(async () => {
    const calls: Calls = { selected: [], all: 0, created: [] };
    const full: ProjectsPort = {
      list: async () => [ALPHA, BRAVO, CHARLIE],
      create: async (name) => {
        calls.created.push(name);
        return { id: "p9", name };
      },
      ...port
    };
    const switcher = createProjectSwitcher({
      port: full,
      onSelect: (project) => calls.selected.push(project),
      ...(withAll ? { onOpenAll: () => (calls.all += 1) } : {})
    });
    try {
      await body(switcher, fake(switcher.element), calls);
    } finally {
      switcher.destroy();
    }
  });
}

const key = (name: string, extra: Record<string, unknown> = {}) => ({ key: name, preventDefault: () => undefined, stopPropagation: () => undefined, ...extra });
const names = (root: ReturnType<typeof fake>) => root.byClass("project-switcher-row").map((row) => row.textContent);

test("the button names the current project and the sheet opens on it, closed by Escape with focus back on the button", async () => {
  await mounted({}, false, async (switcher, root) => {
    const button = root.byClass("project-switcher-button")[0]!;
    const sheet = root.byClass("project-switcher-sheet")[0]!;
    assert.equal(button.textContent, "Choose a project");
    switcher.setCurrent(BRAVO);
    assert.equal(button.textContent, "Bravo jobs");
    assert.equal(button.getAttribute("aria-label"), "Project Bravo jobs, change project");
    assert.equal(button.getAttribute("aria-controls"), sheet.id);
    assert.equal(sheet.hidden, true);
    button.dispatch("click");
    await settle();
    assert.equal(sheet.hidden, false);
    assert.equal(button.getAttribute("aria-expanded"), "true");
    assert.equal(sheet.getAttribute("role"), "dialog");
    assert.equal(doc().activeElement, root.byClass("project-switcher-search")[0], "focus moves into the sheet");
    assert.deepEqual(names(root), ["Alpha shop", "Bravo jobs", "Charlie news"]);
    assert.equal(root.byClass("project-switcher-row")[1]!.getAttribute("aria-current"), "true");
    sheet.dispatch("keydown", key("Escape"));
    assert.equal(sheet.hidden, true);
    assert.equal(button.getAttribute("aria-expanded"), "false");
    assert.equal(doc().activeElement, button);
  });
});

test("search keeps the projects with every word, and says so when none match", async () => {
  assert.deepEqual(filterProjects([ALPHA, BRAVO, CHARLIE], "  JOBS bra ").map((project) => project.id), ["p2"]);
  assert.deepEqual(filterProjects([ALPHA, BRAVO], "").map((project) => project.id), ["p1", "p2"]);
  await mounted({}, false, async (switcher, root) => {
    switcher.open();
    await settle();
    const search = root.byClass("project-switcher-search")[0]!;
    search.value = "news";
    search.dispatch("input");
    assert.deepEqual(names(root), ["Charlie news"]);
    search.value = "zzz";
    search.dispatch("input");
    assert.deepEqual(names(root), []);
    assert.equal(root.byClass("project-switcher-none")[0]!.textContent, "No projects match “zzz”.");
    search.dispatch("keydown", key("Escape"));
    assert.equal(search.value, "", "Escape in the box first clears the search");
    assert.equal(root.byClass("project-switcher-sheet")[0]!.hidden, false);
  });
});

test("arrow keys move through the rows, a press chooses one, and the host hears it", async () => {
  await mounted({}, false, async (switcher, root, calls) => {
    switcher.open();
    await settle();
    const search = root.byClass("project-switcher-search")[0]!;
    const rows = root.byClass("project-switcher-row");
    search.dispatch("keydown", key("ArrowDown"));
    assert.equal(doc().activeElement, rows[0]);
    rows[0]!.dispatch("keydown", key("ArrowDown"));
    assert.equal(doc().activeElement, rows[1]);
    rows[1]!.dispatch("keydown", key("End"));
    assert.equal(doc().activeElement, rows[2]);
    rows[2]!.dispatch("keydown", key("Home"));
    assert.equal(doc().activeElement, rows[0]);
    rows[0]!.dispatch("keydown", key("ArrowUp"));
    assert.equal(doc().activeElement, search, "ArrowUp from the first row goes back to the search box");
    rows[2]!.dispatch("click");
    assert.deepEqual(calls.selected, [CHARLIE]);
    assert.equal(root.byClass("project-switcher-sheet")[0]!.hidden, true);
    assert.equal(root.byClass("project-switcher-button")[0]!.textContent, "Choose a project", "the host owns which project is current");
  });
});

test("Tab wraps inside the sheet in both directions", async () => {
  await mounted({}, true, async (switcher, root) => {
    switcher.open();
    await settle();
    const sheet = root.byClass("project-switcher-sheet")[0]!;
    const search = root.byClass("project-switcher-search")[0]!;
    const all = root.byClass("project-switcher-all")[0]!;
    doc().activeElement = all;
    let prevented = 0;
    sheet.dispatch("keydown", key("Tab", { preventDefault: () => (prevented += 1) }));
    assert.equal(doc().activeElement, search);
    sheet.dispatch("keydown", key("Tab", { shiftKey: true, preventDefault: () => (prevented += 1) }));
    assert.equal(doc().activeElement, all);
    assert.equal(prevented, 2);
    doc().activeElement = root.byClass("project-switcher-row")[0];
    sheet.dispatch("keydown", key("Tab", { preventDefault: () => (prevented += 1) }));
    assert.equal(prevented, 2, "Tab inside the sheet moves as the browser does");
  });
});

test("New project asks for a name inline, makes it through the port and selects it", async () => {
  await mounted({}, false, async (switcher, root, calls) => {
    switcher.open();
    await settle();
    const add = root.byClass("project-switcher-new")[0]!;
    const naming = root.byClass("project-switcher-naming")[0]!;
    const input = root.byClass("project-switcher-name-input")[0]!;
    assert.equal(naming.hidden, true);
    add.dispatch("click");
    assert.equal(naming.hidden, false);
    assert.equal(add.hidden, true);
    assert.equal(doc().activeElement, input);
    input.dispatch("keydown", key("Enter"));
    await settle();
    assert.equal(root.byClass("project-switcher-notice")[0]!.textContent, "Give the project a name.");
    assert.deepEqual(calls.created, []);
    input.value = "  Delta site  ";
    input.dispatch("keydown", key("Enter"));
    await settle();
    assert.deepEqual(calls.created, ["Delta site"]);
    assert.deepEqual(calls.selected, [{ id: "p9", name: "Delta site" }]);
    assert.equal(root.byClass("project-switcher-sheet")[0]!.hidden, true);
    switcher.open();
    await settle();
    assert.equal(root.byClass("project-switcher-naming")[0]!.hidden, true, "the field is closed again on the next open");
  });
});

async function refused(): Promise<ProjectSummary> {
  throw new Error("A project with that name exists.");
}

test("Escape in the name field cancels only the field, and a refused create says why and keeps the sheet", async () => {
  await mounted({ create: refused }, false, async (switcher, root, calls) => {
    switcher.open();
    await settle();
    const add = root.byClass("project-switcher-new")[0]!;
    const input = root.byClass("project-switcher-name-input")[0]!;
    add.dispatch("click");
    input.dispatch("keydown", key("Escape"));
    assert.equal(root.byClass("project-switcher-naming")[0]!.hidden, true);
    assert.equal(doc().activeElement, add);
    add.dispatch("click");
    input.value = "Alpha shop";
    root.byClass("project-switcher-create")[0]!.dispatch("click");
    await settle();
    assert.equal(root.byClass("project-switcher-notice")[0]!.textContent, "A project with that name exists.");
    assert.equal(root.byClass("project-switcher-notice")[0]!.hidden, false);
    assert.equal(root.byClass("project-switcher-sheet")[0]!.hidden, false);
    assert.deepEqual(calls.selected, []);
  });
});

test("All projects in FluxIQ shows only when the host gave onOpenAll, and closes the sheet", async () => {
  await mounted({}, false, async (_switcher, root) => {
    assert.equal(root.byClass("project-switcher-all")[0]!.hidden, true);
  });
  await mounted({}, true, async (switcher, root, calls) => {
    switcher.open();
    await settle();
    const all = root.byClass("project-switcher-all")[0]!;
    assert.equal(all.hidden, false);
    assert.equal(all.textContent, "All projects in FluxIQ");
    all.dispatch("click");
    assert.equal(calls.all, 1);
    assert.equal(root.byClass("project-switcher-sheet")[0]!.hidden, true);
  });
});

test("a list that fails says so with Try again, and a retry reads it again", async () => {
  let reads = 0;
  const list = async (): Promise<ProjectSummary[]> => {
    reads += 1;
    if (reads === 1) throw new Error("FluxIQ is not reachable.");
    return [ALPHA];
  };
  await mounted({ list }, false, async (switcher, root) => {
    switcher.open();
    await settle();
    assert.equal(root.byClass("project-switcher-none")[0]!.textContent, "FluxIQ is not reachable.");
    assert.equal(root.byClass("project-switcher-retry")[0]!.hidden, false);
    root.byClass("project-switcher-retry")[0]!.dispatch("click");
    await settle();
    assert.deepEqual(names(root), ["Alpha shop"]);
    assert.equal(root.byClass("project-switcher-retry")[0]!.hidden, true);
    assert.equal(reads, 2);
    await switcher.refresh();
    assert.equal(reads, 3);
  });
});

test("a press outside closes the sheet and a press inside does not", async () => {
  await withFakeDocument(async () => {
    const listeners: Array<(event: { target: unknown }) => void> = [];
    doc().addEventListener = (type, listener) => {
      if (type === "pointerdown") listeners.push(listener as (event: { target: unknown }) => void);
    };
    doc().removeEventListener = (_type, listener) => {
      const at = listeners.findIndex((candidate) => (candidate as unknown) === listener);
      if (at >= 0) listeners.splice(at, 1);
    };
    const switcher = createProjectSwitcher({ port: { list: async () => [ALPHA], create: async () => ALPHA }, onSelect: () => undefined });
    const root = fake(switcher.element);
    switcher.open();
    await settle();
    assert.equal(listeners.length, 1);
    listeners[0]!({ target: root.byClass("project-switcher-search")[0] });
    assert.equal(root.byClass("project-switcher-sheet")[0]!.hidden, false);
    listeners[0]!({ target: {} });
    assert.equal(root.byClass("project-switcher-sheet")[0]!.hidden, true);
    assert.equal(listeners.length, 0, "the listener goes with the sheet");
    switcher.destroy();
  });
});

test("without a create port there is no New project control, the all-projects action points to the FluxIQ panel, and the button says No project yet", async () => {
  await withFakeDocument(async () => {
    let all = 0;
    const switcher = createProjectSwitcher({ port: { list: async () => [] }, onSelect: () => undefined, onOpenAll: () => (all += 1) });
    try {
      const root = fake(switcher.element);
      assert.equal(root.byClass("project-switcher-name")[0]!.textContent, "No project yet");
      switcher.open();
      await settle();
      assert.equal(root.byClass("project-switcher-new")[0]!.hidden, true, "no New project");
      assert.equal(root.byClass("project-switcher-naming")[0]!.hidden, true, "no name field");
      assert.equal(root.byClass("project-switcher-none")[0]!.textContent, "FluxIQ makes one when you send your first message.");
      const allButton = root.byClass("project-switcher-all")[0]!;
      assert.equal(allButton.textContent, "Add or manage projects in the FluxIQ panel");
      allButton.dispatch("click");
      assert.equal(all, 1);
      switcher.setCurrent(ALPHA);
      assert.equal(root.byClass("project-switcher-name")[0]!.textContent, "Alpha shop");
    } finally {
      switcher.destroy();
    }
  });
});
