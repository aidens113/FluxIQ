import { createElement } from "../../../dom/index.ts";
import type { SubflowCard, SubflowDetail } from "../types.ts";
import { failureWords, historyWords, lastingWords, siteHost, trustWords } from "../words/index.ts";
import { detailSection } from "./detail-section.ts";
import { lines } from "./lines.ts";
import { stepsPart } from "./steps-part.ts";
import { usersPart } from "./users-part.ts";
import type { LibraryViewContext } from "./view-context.ts";
import { viewHeader } from "./view-header.ts";

/** What the details show. The card is on screen at once; the steps, calls and users come with the read. */
export type LibraryDetailModel = {
  card: SubflowCard;
  detail: SubflowDetail | undefined;
  loading: boolean;
  /** A failed read of the steps, in words. What is already shown stays. */
  problem: string | undefined;
  /** Names of the saved subflows, by id, for who uses it. */
  names: ReadonlyMap<string, string>;
};

export type LibraryDetailHooks = {
  back(): void;
  run(): void;
  ask(): void;
  retry(): void;
  /** Open a subflow this one calls or is used by. */
  open(partId: string, key: string): void;
  /** Open the automation that uses this subflow. Absent: its name is plain text. */
  openFlow?(flow: { flowId: string; name: string }): void;
};

const capital = (words: string): string => `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
const ports = (items: SubflowCard["inputs"], mark: boolean): string[] => items.map((item) => (mark ? `${item.name} (${item.required ? "required" : "optional"})` : item.name));

/** One subflow in plain words: what it does, what it needs and hands back, what it can do, and how it has gone. */
export function detailView(model: LibraryDetailModel, hooks: LibraryDetailHooks, context: LibraryViewContext): HTMLElement {
  const { card } = model;
  const standing = [trustWords(card), failureWords(card, context.now())].filter((item): item is string => item !== undefined).join(" · ");
  const root = createElement("div", { className: "library-detail" }, [viewHeader(card.name, hooks.back, context, standing)]);
  const run = createElement("button", { className: "library-primary", text: "Run", attrs: { type: "button" } });
  run.addEventListener("click", hooks.run);
  context.register("run", run);
  const ask = createElement("button", { className: "library-secondary", text: "Ask about it", attrs: { type: "button" } });
  ask.addEventListener("click", hooks.ask);
  root.append(createElement("div", { className: "library-actions" }, [run, ask]));
  root.append(detailSection("What it does", [createElement("p", { text: card.purpose })]));
  root.append(detailSection("Works on", [lines(card.sites.map(siteHost))]));
  root.append(detailSection("What it needs", [card.inputs.length > 0 ? lines(ports(card.inputs, true)) : createElement("p", { text: "Nothing from you." })]));
  root.append(detailSection("What it hands back", [card.outputs.length > 0 ? lines(ports(card.outputs, false)) : createElement("p", { text: "Nothing." })]));
  root.append(detailSection("What it can do on the site", [card.lastingClasses.length > 0 ? lines(card.lastingClasses.map((item) => capital(lastingWords(item)))) : createElement("p", { text: "It only looks. It changes nothing." })]));
  if (card.fixedValues.length > 0) root.append(detailSection("Always the same", [lines(card.fixedValues.map((value) => `Always uses: ${value}`))]));
  if (card.startCheck !== undefined) root.append(detailSection("What must be true to start", [createElement("p", { text: card.startCheck.says ?? "It has to start from the right page." })]));
  root.append(stepsPart(model, hooks, context));
  const users = usersPart(model.detail, model.names, hooks.open, context, hooks.openFlow);
  if (users !== undefined) root.append(users);
  const gone = historyWords(card, context.now());
  root.append(detailSection("How it has gone", [gone.length > 0 ? lines(gone) : createElement("p", { text: "It has not run yet." })]));
  return root;
}
