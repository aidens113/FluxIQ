// The subflow library screen: a tree of saved subflows by site, search that keeps the path to each match,
// one subflow in plain words, and running it. It draws from its port and holds nothing of a client's own.
//
// The Automations tab drives it through `render`, `search`, `setActive` and `onMatches`: a search with results
// here is what lets the tab show a count beside this segment. Reads happen only while active, a failed read is
// told quietly and never blanks what was on screen, and a project change starts clean.

import { createElement } from "../../dom/index.ts";
import type { LibraryHost } from "./host.ts";
import type { SubflowLibraryPort } from "./port.ts";
import { readLibrary } from "./read-library.ts";
import { buildTree, filterTree, type LibraryTreeNode } from "./tree/index.ts";
import type { SubflowCard, SubflowDetail } from "./types.ts";
import { detailView, listView, pendingView, runView, type LibraryViewContext } from "./view/index.ts";

export type LibraryScreenOptions = { port: SubflowLibraryPort; host: LibraryHost; now?: () => number };

/** The mounted screen. The last three are what the Automations tab calls. */
export type LibraryScreen = {
  readonly element: HTMLElement;
  /** The project to show. A different one clears the screen; the same one reads again only if nothing has been read. */
  render(projectId: string | undefined): void;
  /** Filters the tree, keeping the path to each match. Empty clears it. */
  search(text: string): void;
  /** Reads while active and not otherwise. Becoming active reads again, quietly. */
  setActive(active: boolean): void;
  /** Hears how many subflows match the search, or `null` when there is no search or nothing has been read yet. */
  onMatches(listener: (count: number | null) => void): void;
};

type Entry = { kind: "list"; opener?: string } | { kind: "detail"; partId: string; opener?: string } | { kind: "run"; partId: string; element?: HTMLElement; opener?: string };
type Reading = { detail?: SubflowDetail; loading: boolean; problem?: string };

/** Builds the library screen over `port`. */
export function createLibraryScreen(options: LibraryScreenOptions): LibraryScreen {
  const { port, host } = options;
  const now = options.now ?? Date.now;
  const element = createElement("div", { className: "library-screen", attrs: { role: "region", "aria-label": "Subflow library" } });
  const focusables = new Map<string, HTMLElement>();
  const listeners: Array<(count: number | null) => void> = [];
  const readings = new Map<string, Reading>();
  let projectId: string | undefined;
  let active = false;
  let cards: SubflowCard[] = [];
  let loaded = false;
  let loading = false;
  let problem: string | undefined;
  let text = "";
  let seq = 0;
  let told: number | null | undefined;
  let stack: Entry[] = [{ kind: "list" }];
  const context: LibraryViewContext = { now, register: (key, item) => void focusables.set(key, item) };

  const top = (): Entry => stack[stack.length - 1] ?? { kind: "list" };
  const names = (): Map<string, string> => new Map(cards.map((card) => [card.partId, card.name]));
  const cardOf = (partId: string): SubflowCard | undefined => cards.find((card) => card.partId === partId) ?? readings.get(partId)?.detail?.card;
  const filtered = () => filterTree(buildTree(cards), text);

  const tell = (): void => {
    const count = text.trim() === "" || !loaded ? null : filtered().matches;
    if (count === told) return;
    told = count;
    listeners.forEach((listener) => listener(count));
  };

  const focusOn = (key: string): void => focusables.get(key)?.focus();

  /** The key of the element that has focus now, so a redraw can hand focus back to its new twin. */
  const focusedKey = (): string | undefined => {
    const active = (globalThis as { document?: { activeElement?: unknown } }).document?.activeElement;
    return [...focusables].find(([, item]) => item === active)?.[0];
  };

  const draw = (focus?: string): void => {
    const kept = focus ?? focusedKey();
    focusables.clear();
    const entry = top();
    let view: HTMLElement;
    if (entry.kind === "list") {
      const { sites } = filtered();
      view = listView({ sites, text, total: cards.length, loaded, loading, problem }, { open: openNode, retry: () => void refresh() }, context);
    } else {
      const card = cardOf(entry.partId);
      const reading = readings.get(entry.partId);
      if (card === undefined) view = pendingView(reading?.problem, { back, retry: () => void readDetail(entry.partId) }, context);
      else if (entry.kind === "detail") {
        view = detailView(
          { card, detail: reading?.detail, loading: reading?.loading ?? false, problem: reading?.problem, names: names() },
          { back, run: () => go({ kind: "run", partId: entry.partId }, "run"), ask: () => host.askAbout(`About my “${card.name}” subflow: `), retry: () => void readDetail(entry.partId), open: (partId, key) => openPart(partId, key) },
          context
        );
      } else {
        entry.element ??= runView(card, { back, ask: (words) => host.askAbout(words), run: (query) => port.run({ projectId: projectId ?? "", partId: card.partId, version: card.version, ...query }) }, context);
        view = entry.element;
        const first = entry.element.querySelectorAll("button")[0];
        if (first !== undefined) focusables.set("back", first);
      }
    }
    element.replaceChildren(view);
    if (kept !== undefined) focusOn(kept);
  };

  function go(entry: Entry, opener: string): void {
    top().opener = opener;
    stack = [...stack, entry];
    draw("back");
  }

  function back(): void {
    if (stack.length <= 1) return;
    stack = stack.slice(0, -1);
    draw(top().opener);
  }

  function openNode(node: LibraryTreeNode): void {
    if (node.card === undefined) return;
    void readDetail(node.partId);
    go({ kind: "detail", partId: node.partId }, node.key);
  }

  function openPart(partId: string, key: string): void {
    void readDetail(partId);
    go({ kind: "detail", partId }, key);
  }

  async function readDetail(partId: string): Promise<void> {
    if (!active || projectId === undefined) return;
    const asked = projectId;
    const card = cardOf(partId);
    readings.set(partId, { ...readings.get(partId), loading: true });
    const answer = await port.read({ projectId: asked, partId, ...(card === undefined ? {} : { version: card.version }) });
    if (asked !== projectId) return;
    const had = readings.get(partId)?.detail;
    if (!answer.ok) readings.set(partId, { ...(had === undefined ? {} : { detail: had }), loading: false, problem: `Could not read the steps. ${answer.sentence}` });
    else if (answer.value.refused) readings.set(partId, { ...(had === undefined ? {} : { detail: had }), loading: false, problem: answer.value.code === "part.not_found" ? "That subflow is no longer saved." : "Its steps cannot be read right now." });
    else readings.set(partId, { detail: answer.value.detail, loading: false });
    const entry = top();
    if (entry.kind === "detail" && entry.partId === partId) draw();
  }

  async function refresh(): Promise<void> {
    if (!active || projectId === undefined) return;
    const asked = projectId;
    const mine = (seq += 1);
    loading = true;
    if (top().kind === "list") draw();
    const read = await readLibrary(port, asked, () => mine === seq && asked === projectId && active);
    if (read === undefined) return;
    loading = false;
    if ("cards" in read) {
      cards = read.cards;
      loaded = true;
      problem = undefined;
    } else problem = read.problem;
    tell();
    if (top().kind === "list") draw();
  }

  element.addEventListener("keydown", (event) => {
    const key = (event as KeyboardEvent).key;
    if (key !== "Escape" || stack.length <= 1) return;
    (event as KeyboardEvent).preventDefault?.();
    (event as KeyboardEvent).stopPropagation?.();
    back();
  });

  draw();
  return {
    element,
    render(next) {
      if (next !== projectId) {
        seq += 1;
        projectId = next;
        cards = [];
        loaded = false;
        loading = false;
        problem = undefined;
        readings.clear();
        stack = [{ kind: "list" }];
        told = undefined;
        tell();
        draw();
      }
      if (!loaded && active) void refresh();
    },
    search(next) {
      text = next;
      tell();
      if (top().kind === "list") draw();
    },
    setActive(next) {
      active = next;
      if (!next) {
        seq += 1;
        loading = false;
        return;
      }
      void refresh();
    },
    onMatches(listener) {
      listeners.push(listener);
      listener(text.trim() === "" || !loaded ? null : filtered().matches);
    }
  };
}
