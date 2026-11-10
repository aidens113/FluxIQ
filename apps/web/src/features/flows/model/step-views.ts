import type { FlowOutline, OutlineStep } from "../wire";
import { flowHref } from "./flow-href";
import { lastingBadges } from "./lasting-badges";
import type { StepView } from "./types";
import { wordPieces } from "./word-pieces";

/** Steps that hold others under a heading, or stand for no node a person could change. */
const NOT_EDITABLE = new Set(["jump", "handlers", "section", "empty", "give-back", "end", "router"]);

const RUN_FLOW = "Run Flow ▸ ";

export type StepViewOptions = {
  projectId: string;
  /** Step numbers someone else changed since the person last read the Flow. */
  changedSteps?: readonly string[];
};

/**
 * The outline as drawn: words split into `{input}` chips, lasting badges, a link for a
 * "Run Flow ▸ Name" step that opens a Flow of the project, and which steps a person can change.
 */
export function stepViews(outline: FlowOutline, options: StepViewOptions): StepView[] {
  const inputs = outline.interface.needs.map((port) => port.id);
  const changed = new Set(options.changedSteps ?? []);
  const view = (step: OutlineStep, place: string): StepView => {
    const key = step.nodeIds[0] ?? `${place}:${step.kind}`;
    const called = step.kind === "call" && step.words.startsWith(RUN_FLOW) ? step.words.slice(RUN_FLOW.length) : undefined;
    const shown: StepView = {
      key,
      number: step.number,
      words: wordPieces(called === undefined ? step.words : RUN_FLOW.trimEnd(), inputs),
      plainWords: step.words,
      kind: step.kind,
      badges: lastingBadges(step.lasting),
      jump: step.kind === "jump",
      editable: Boolean(step.number) && step.nodeIds.length > 0 && !NOT_EDITABLE.has(step.kind),
      changed: Boolean(step.number) && changed.has(step.number),
      nodeIds: step.nodeIds,
      children: step.children.map((child, index) => view(child, `${place}.c${index}`)),
      arms: step.arms.map((arm, armIndex) => ({ words: arm.words, steps: arm.steps.map((child, index) => view(child, `${place}.a${armIndex}.${index}`)) }))
    };
    if (called !== undefined) {
      shown.link = step.link?.kind === "flow" ? { name: called, href: flowHref(step.link.id, options.projectId) } : { name: called };
    }
    return shown;
  };
  return outline.steps.map((step, index) => view(step, String(index)));
}
