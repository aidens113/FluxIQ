// The project switcher: a button showing the project a person is in, and the
// sheet it opens under itself:
//
//   search        keeps the projects whose name has every word typed
//   rows          one button per project, the current one marked
//                 (`aria-current`); ArrowDown from the search box enters
//                 them, ArrowUp and ArrowDown move, Home and End jump
//   New project   shows an inline name field; Enter or Create makes the
//                 project through `port.create` and selects it, Escape
//                 cancels the field
//   All projects  "All projects in FluxIQ", only when the host gives
//                 `onOpenAll`
//
// Focus stays in the sheet while it is open (Tab wraps), Escape closes it and
// gives focus back to the button, and so does a press outside. Reads and writes
// that fail say so in words in the sheet and leave it open. The host owns which
// project is current: choosing one only tells `onSelect`; the button changes
// when the host calls `setCurrent`. Built once and updated in place, so focus
// survives every read.

import { createElement } from "../dom/index.ts";
import { lucideIcon } from "../icons/index.ts";
import { placeChildren } from "../chat/view/index.ts";
import { filterProjects } from "./filter-projects.ts";
import { problemWords } from "./problem-words.ts";
import type { ProjectSummary } from "./project-summary.ts";
import type { ProjectsPort } from "./projects-port.ts";

/** What the host gives the switcher. */
export type ProjectSwitcherOptions = {
  port: ProjectsPort;
  /** The person chose `project` (an existing one, or the one they just made). */
  onSelect(project: ProjectSummary): void;
  /** Shows "All projects in FluxIQ"; the host opens FluxIQ's project list. Absent, the sheet offers none. */
  onOpenAll?: () => void;
};

/** The mounted switcher. */
export type ProjectSwitcher = {
  readonly element: HTMLElement;
  /** The project the button names; `null` shows "Choose a project". */
  setCurrent(project: ProjectSummary | null): void;
  open(): void;
  close(): void;
  /** Reads the list again. Never rejects. */
  refresh(): Promise<void>;
  /** Removes what the switcher listens to outside itself. */
  destroy(): void;
};

type KeyLike = { key: string; shiftKey?: boolean; preventDefault(): void; stopPropagation?(): void };
type Pointer = { target: unknown };

let mounted = 0;

/** Creates the switcher. */
export function createProjectSwitcher(options: ProjectSwitcherOptions): ProjectSwitcher {
  mounted += 1;
  const sheetId = `project-switcher-sheet-${mounted}`;
  const name = createElement("span", { className: "project-switcher-name" });
  const button = createElement("button", {
    className: "project-switcher-button",
    attrs: { type: "button", "aria-haspopup": "dialog", "aria-expanded": "false", "aria-controls": sheetId }
  }, [name, lucideIcon("chevron-down", 14)]);
  const search = createElement("input", {
    className: "project-switcher-search",
    attrs: { type: "search", placeholder: "Search projects", "aria-label": "Search projects", autocomplete: "off" }
  });
  const notice = createElement("p", { className: "project-switcher-notice", hidden: true, attrs: { role: "alert" } });
  const rows = createElement("ul", { className: "project-switcher-rows", attrs: { role: "list", "aria-label": "Projects" } });
  const none = createElement("p", { className: "project-switcher-none", hidden: true, attrs: { role: "status" } });
  const retry = createElement("button", { className: "project-switcher-retry", text: "Try again", hidden: true, attrs: { type: "button" } });
  const newButton = createElement("button", { className: "project-switcher-new", attrs: { type: "button", "aria-expanded": "false" } }, [lucideIcon("plus", 14), "New project"]);
  const nameInput = createElement("input", {
    className: "project-switcher-name-input",
    attrs: { type: "text", placeholder: "Project name", "aria-label": "Project name", autocomplete: "off", maxlength: "120" }
  });
  const createButton = createElement("button", { className: "project-switcher-create", text: "Create", attrs: { type: "button" } });
  const cancelButton = createElement("button", { className: "project-switcher-cancel", text: "Cancel", attrs: { type: "button" } });
  const naming = createElement("div", { className: "project-switcher-naming", hidden: true, attrs: { role: "group", "aria-label": "New project" } }, [nameInput, createButton, cancelButton]);
  const allButton = createElement("button", { className: "project-switcher-all", hidden: options.onOpenAll === undefined, attrs: { type: "button" } }, [lucideIcon("globe", 14), "All projects in FluxIQ"]);
  const sheet = createElement("div", { id: sheetId, className: "project-switcher-sheet", hidden: true, attrs: { role: "dialog", "aria-modal": "true", "aria-label": "Projects" } }, [
    createElement("div", { className: "project-switcher-tools" }, [search]),
    notice,
    rows,
    none,
    retry,
    createElement("div", { className: "project-switcher-actions" }, [newButton, naming, allButton])
  ]);
  const element = createElement("div", { className: "project-switcher" }, [button, sheet]);

  let current: ProjectSummary | null = null;
  let projects: readonly ProjectSummary[] = [];
  let loaded = false;
  let failed: string | undefined;
  let problem: string | undefined;
  let isOpen = false;
  let busy = false;
  let generation = 0;
  let destroyed = false;
  let visible: ProjectSummary[] = [];
  const rowButtons = new Map<string, HTMLButtonElement>();
  const rowItems = new Map<string, HTMLLIElement>();

  function rowFor(project: ProjectSummary): HTMLLIElement {
    let item = rowItems.get(project.id);
    if (item === undefined) {
      const choose = createElement("button", { className: "project-switcher-row", attrs: { type: "button" } });
      choose.addEventListener("click", () => choosing(project.id));
      choose.addEventListener("keydown", (event: KeyLike) => moveFrom(project.id, event));
      item = createElement("li", { className: "project-switcher-item" }, [choose]);
      rowButtons.set(project.id, choose);
      rowItems.set(project.id, item);
    }
    return item;
  }

  function choosing(id: string): void {
    const project = projects.find((candidate) => candidate.id === id);
    if (project === undefined || busy) return;
    close(true);
    options.onSelect(project);
  }

  function focusRow(index: number): void {
    const row = visible[index];
    if (row !== undefined) rowButtons.get(row.id)?.focus();
  }

  function moveFrom(id: string, event: KeyLike): void {
    const index = visible.findIndex((project) => project.id === id);
    const last = visible.length - 1;
    const next = event.key === "ArrowDown" ? Math.min(index + 1, last)
      : event.key === "ArrowUp" ? index - 1
        : event.key === "Home" ? 0
          : event.key === "End" ? last
            : undefined;
    if (next === undefined) return;
    event.preventDefault();
    if (next < 0) search.focus();
    else focusRow(next);
  }

  function draw(): void {
    const label = current?.name ?? "Choose a project";
    if (name.textContent !== label) name.textContent = label;
    button.setAttribute("aria-label", current === null ? "Choose a project" : `Project ${current.name}, change project`);
    button.setAttribute("aria-expanded", String(isOpen));
    sheet.hidden = !isOpen;
    const query = search.value.trim();
    visible = failed === undefined ? filterProjects(projects, query) : [];
    const listed = new Set(projects.map((project) => project.id));
    for (const id of [...rowItems.keys()]) {
      if (listed.has(id)) continue;
      rowItems.delete(id);
      rowButtons.delete(id);
    }
    placeChildren(rows, visible.map((project) => {
      const item = rowFor(project);
      const choose = rowButtons.get(project.id)!;
      if (choose.textContent !== project.name) choose.textContent = project.name;
      if (project.id === current?.id) choose.setAttribute("aria-current", "true");
      else choose.removeAttribute("aria-current");
      choose.disabled = busy;
      return item;
    }));
    const words = failed ?? (!loaded ? "Loading projects…" : projects.length === 0 ? "No projects yet." : visible.length === 0 ? `No projects match “${query}”.` : "");
    if (none.textContent !== words) none.textContent = words;
    none.hidden = words === "";
    retry.hidden = failed === undefined;
    const sentence = problem ?? "";
    if (notice.textContent !== sentence) notice.textContent = sentence;
    notice.hidden = sentence === "";
    createButton.disabled = busy;
    nameInput.disabled = busy;
    newButton.disabled = busy;
  }

  async function refresh(): Promise<void> {
    const mine = ++generation;
    let next: readonly ProjectSummary[] | undefined;
    let sentence: string | undefined;
    try {
      next = await options.port.list();
    } catch (error) {
      sentence = problemWords(error, "Couldn't load your projects.");
    }
    if (mine !== generation || destroyed) return;
    loaded = true;
    if (next === undefined) failed = sentence ?? "Couldn't load your projects.";
    else {
      failed = undefined;
      projects = next;
    }
    draw();
  }

  function setNaming(on: boolean): void {
    naming.hidden = !on;
    newButton.hidden = on;
    newButton.setAttribute("aria-expanded", String(on));
    if (on) nameInput.focus();
    else {
      nameInput.value = "";
      newButton.focus();
    }
  }

  async function create(): Promise<void> {
    const wanted = nameInput.value.trim();
    if (busy) return;
    if (wanted === "") {
      problem = "Give the project a name.";
      draw();
      nameInput.focus();
      return;
    }
    busy = true;
    problem = undefined;
    draw();
    let made: ProjectSummary | undefined;
    try {
      made = await options.port.create(wanted);
    } catch (error) {
      problem = problemWords(error, "Couldn't create the project. Try again.");
    }
    busy = false;
    if (destroyed) return;
    if (made === undefined) {
      draw();
      nameInput.focus();
      return;
    }
    const added = made;
    projects = [added, ...projects.filter((project) => project.id !== added.id)];
    close(true);
    options.onSelect(added);
  }

  /** The controls Tab can reach in the sheet, in order. */
  function reachable(): HTMLElement[] {
    const rowsNow = visible.map((project) => rowButtons.get(project.id)).filter((row): row is HTMLButtonElement => row !== undefined && !row.disabled);
    const all: HTMLElement[] = [search, ...rowsNow, retry, newButton, nameInput, createButton, cancelButton, allButton];
    return all.filter((control) => !control.hidden && !(control as HTMLButtonElement).disabled && (control !== nameInput && control !== createButton && control !== cancelButton ? true : !naming.hidden));
  }

  function inside(target: unknown): boolean {
    for (let node = target as Node | null; node !== null && node !== undefined; node = node.parentNode) if (node === element) return true;
    return false;
  }

  const onPointer = (event: Pointer): void => {
    if (isOpen && !inside(event.target)) close(false);
  };

  function open(): void {
    if (isOpen || destroyed) return;
    isOpen = true;
    problem = undefined;
    document.addEventListener("pointerdown", onPointer);
    draw();
    search.focus();
    void refresh();
  }

  function close(focusButton: boolean): void {
    if (!isOpen) return;
    isOpen = false;
    document.removeEventListener("pointerdown", onPointer);
    naming.hidden = true;
    newButton.hidden = false;
    newButton.setAttribute("aria-expanded", "false");
    nameInput.value = "";
    problem = undefined;
    draw();
    if (focusButton) button.focus();
  }

  button.addEventListener("click", () => (isOpen ? close(true) : open()));
  search.addEventListener("input", draw);
  search.addEventListener("keydown", (event: KeyLike) => {
    if (event.key === "ArrowDown" && visible.length > 0) {
      event.preventDefault();
      focusRow(0);
    } else if (event.key === "Escape" && search.value !== "") {
      event.preventDefault();
      event.stopPropagation?.();
      search.value = "";
      draw();
    }
  });
  retry.addEventListener("click", () => void refresh());
  newButton.addEventListener("click", () => setNaming(true));
  cancelButton.addEventListener("click", () => setNaming(false));
  createButton.addEventListener("click", () => void create());
  nameInput.addEventListener("keydown", (event: KeyLike) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void create();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation?.();
      setNaming(false);
    }
  });
  allButton.addEventListener("click", () => {
    close(false);
    options.onOpenAll?.();
  });
  sheet.addEventListener("keydown", (event: KeyLike) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      const controls = reachable();
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (first === undefined || last === undefined) return;
      const here = document.activeElement as HTMLElement | null;
      const known = here !== null && controls.includes(here);
      if (event.shiftKey === true && (!known || here === first)) {
        event.preventDefault();
        last.focus();
      } else if (event.shiftKey !== true && (!known || here === last)) {
        event.preventDefault();
        first.focus();
      }
    }
  });
  draw();

  return {
    element,
    setCurrent(project) {
      current = project;
      draw();
    },
    open,
    close: () => close(true),
    refresh,
    destroy() {
      destroyed = true;
      generation += 1;
      document.removeEventListener("pointerdown", onPointer);
    }
  };
}
