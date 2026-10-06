// Whether the Flow brings each of its steps to the page the step acted on.
//
// Core knows nothing of pages. What it has is the host's own statement of where
// each step found the target (`replay.from`, `../dry-run.ts`), carried opaquely
// and compared here for equality only -- the same use the test makes of it when
// it puts the page back where a step found it (`../site-memory.ts`). Read with
// the order the steps ran in (their ids, `d<n>`, given as they were appended),
// it also says where each step left the target: where the very next step found
// it.
//
// Two readings, both of the draft as it stands:
//
//   unreached -- a step of the Flow whose step before it in the Flow left the
//                target somewhere other than where this one acted. When the
//                Flow runs, it runs on another page.
//   noWay     -- a step of the Flow whose page no step of the Flow moved the
//                target to, and that is not where the test starts: nothing in
//                the Flow can bring it there in any order.
//
// Anything unknown -- a step with no `from`, a step whose next step wrote none
// -- reads as reached: a page this module cannot see is never a reason to say
// a step is stranded. Live run `run-muwao5n4-44977b2a` (D2-1) is why it
// exists (`./strand-check.ts`).
import type { JsonValue } from "../../../../../core/index.ts";
import { automationStudioFlowDraftStepIsProposable, automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../step.ts";

type Step = AutomationStudioFlowDraftStep;

/** What the draft, as it stands, says about each step's way to its page. */
export type AutomationStudioFlowDraftReach = {
  /** The steps of the Flow, in the order they run. */
  flow: readonly Step[];
  /** Steps of the Flow the step before them in the Flow does not leave on the page they acted on. */
  unreached: ReadonlySet<Step>;
  /** Steps of the Flow whose page no step of the Flow moves the target to, and that the test does not start on. */
  noWay: ReadonlySet<Step>;
  /** The page a step acted on, as an opaque key, or nothing when the host wrote none. */
  page(step: Step): string | undefined;
  /** The page a step left the target on: where the step run straight after it found it. */
  leaves(step: Step): string | undefined;
  /** Whether a step moved the target to another page, as far as the record shows. */
  moves(step: Step): boolean;
};

/** Reads the draft as it stands now. */
export function automationStudioFlowDraftReach(steps: readonly Step[]): AutomationStudioFlowDraftReach {
  const pages = new Map<Step, string | undefined>(steps.map((step) => [step, pageKey(step)] as const));
  const page = (step: Step): string | undefined => pages.get(step) ?? pageKey(step);
  // The order the steps ran in, by the number in their ids; a step without one is out of it.
  const ran = steps.map((step) => ({ step, n: appendedNumber(step) })).filter((entry): entry is { step: Step; n: number } => entry.n !== undefined).sort((a, b) => a.n - b.n);
  const leftOn = new Map<Step, string | undefined>();
  ran.forEach((entry, index) => {
    const next = ran.slice(index + 1).find((later) => page(later.step) !== undefined);
    leftOn.set(entry.step, next === undefined ? undefined : page(next.step));
  });
  const leaves = (step: Step): string | undefined => leftOn.get(step);
  const moves = (step: Step): boolean => automationStudioFlowDraftStepIsProposable(step) && page(step) !== undefined && leaves(step) !== undefined && page(step) !== leaves(step);
  const flow = [...steps].sort((a, b) => a.position - b.position).filter(automationStudioFlowDraftStepIsProposed);
  const unreached = new Set<Step>();
  const noWay = new Set<Step>();
  const start = flow[0] === undefined ? undefined : page(flow[0]);
  flow.forEach((step, index) => {
    const at = page(step);
    if (index === 0 || at === undefined) return;
    const left = leaves(flow[index - 1]!);
    if (left !== undefined && left !== at) unreached.add(step);
    if (at !== start && !flow.some((other) => other !== step && moves(other) && leaves(other) === at)) noWay.add(step);
  });
  return { flow, unreached, noWay, page, leaves, moves };
}

/** A step's own number in the order the loop appended steps (`d<n>`), or nothing. */
function appendedNumber(step: Step): number | undefined {
  const match = /^d([0-9]+)$/u.exec(step.id ?? "");
  return match ? Number(match[1]) : undefined;
}

/** Where the host says the step found the target, as a key compared for equality and never read. */
function pageKey(step: Step): string | undefined {
  const from = step.replay?.from;
  return from === undefined ? undefined : canonical(from);
}

/** A JSON value written with its keys in order, so two equal values give one key. */
function canonical(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, JsonValue>)[key]!)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
