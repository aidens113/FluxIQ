import { emitAutomationStudioActivity } from "../emit.ts";
import { automationStudioActivityPassWords, type AutomationStudioActivityLoopPass } from "../loop/index.ts";
import { automationStudioActivityAction, automationStudioActivityHumanLabel } from "../wording/index.ts";

/**
 * Says the executor is about to run one node: "Running step N of M: action".
 * `index` is the step's place in the Flow and `count` how many steps it has,
 * both from `./numbers.ts`, so a retry of a step says its number again;
 * an `index` past `count` says "step N" plainly rather than a count it passed.
 *
 * The action is the node's authored label, which the panel already shows, or
 * else what its definition id names with the element name its parameters
 * already carry ("Clicking “Get a free quote”"). A label that is an id is not
 * an authored label and is dropped. With neither, the sentence is "Running
 * step N of M" and nothing more: the node id goes to `detail.ref`, and the
 * definition id to `detail.text` as `Node: <id>`, the record a tool row
 * carries, so a card reads what kind of step it is.
 *
 * The Flow's first step opens where it starts, so a page it opens is "the
 * start page"; a later step's page served from this machine is named by its
 * path (`../wording/page-name.ts`).
 *
 * A step that runs as a pass of a do-while loop (`pass`, from
 * `../loop/words.ts`) says which: "Reading page 3", "Clicking “Next” on
 * page 3" (`../loop/pass-words.ts`).
 */
export function emitAutomationStudioActivityStep(input: { index: number; count: number; nodeId: string; label?: string | undefined; definitionId?: string | undefined; parameters?: unknown; pass?: AutomationStudioActivityLoopPass | undefined }): void {
  const label = automationStudioActivityHumanLabel(input.label, 160);
  const start = input.index === 1 ? (input.parameters as { url?: unknown } | undefined)?.url : undefined;
  const own = automationStudioActivityAction({ id: input.definitionId, parameters: input.parameters, label, start: typeof start === "string" ? start : undefined });
  const definition = typeof input.definitionId === "string" && /^[A-Za-z][\w.-]*$/u.test(input.definitionId) ? input.definitionId : undefined;
  const counted = input.index <= input.count ? `step ${input.index} of ${input.count}` : `step ${input.index}`;
  const passed = input.pass ? automationStudioActivityPassWords({ action: own, definitionId: input.definitionId, pass: input.pass }) : { action: own, after: "" };
  const action = passed.action;
  const where = `${counted}${passed.after}`;
  emitAutomationStudioActivity({
    phase: "running",
    label: `Running ${where}${action ? `: ${action}` : ""}`,
    step: { index: input.index, count: input.count, nodeId: input.nodeId, ...(label ? { label } : {}) },
    // `Node: <definition>` is the record a tool row carries (`ui/activity-action/
    // record.ts`), so a card can tell what the step is from what it runs: a
    // merge step otherwise read "Action · the page" (U-A2). A chat shows no
    // text made only of codes.
    detail: { kind: "step", title: action ?? `S${where.slice(1)}`, status: "started", ref: input.nodeId, ...(definition ? { text: `Node: ${definition}` } : {}) }
  });
}
