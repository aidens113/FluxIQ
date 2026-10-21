import type { AutomationStudioActivityEmission } from "../contracts.ts";
import { emitAutomationStudioActivity } from "../emit.ts";
import { automationStudioActivityPassWords, type AutomationStudioActivityLoopPass } from "../loop/index.ts";
import { automationStudioActivityAction, automationStudioActivityHumanLabel } from "../wording/index.ts";
import { ACTIVITY_PAGE_PREPARATION_WORDS, cutAtWord } from "../../../../../ui/index.ts";
import { automationStudioActivityPreparing } from "./preparation.ts";

/** The stream's bound on a label (`../bounded.ts`), which it cuts to by count; cut here first, where a word ends (t753). */
const LABEL_MAX = 160;

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
 *
 * A step a list loop's pass runs carries that pass's row in `step.row`, as a
 * person reads it ("Jonas Weber", `../loop/row.ts`), so its card can say
 * "Confirm · Jonas Weber" (t378, lane D); the wire contract
 * (`ClientGatewayActivity.step.row`) declares it optional. The label says
 * the pass's row number after the action ("Running step 4 of 6: Press
 * Confirm (row 3)"), so a long loop's status line moves as the loop does: it
 * sat at "Running step 9 of 10: ..." for six minutes while the cards counted
 * the passes (t753). The card's title keeps its own words.
 *
 * A step run only to get the page ready for a part of the Flow
 * (`./preparation.ts`) says "Getting the page ready: <action>" and no count:
 * it is no step of a run the person is watching, and its count jumped as it
 * went into a part's own steps (t753). The label is cut where a word ends
 * within the stream's bound, which would otherwise cut it inside one.
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
  const row = input.pass?.row;
  const step: NonNullable<AutomationStudioActivityEmission["step"]> = { index: input.index, count: input.count, nodeId: input.nodeId, ...(label ? { label } : {}), ...(row ? { row } : {}) };
  const rowNumber = input.pass?.unit === "row" ? ` (row ${input.pass.pass})` : "";
  const said = automationStudioActivityPreparing()
    ? `${ACTIVITY_PAGE_PREPARATION_WORDS}${action ? `: ${action}` : ""}`
    : `Running ${where}${action ? `: ${action}${rowNumber}` : rowNumber}`;
  emitAutomationStudioActivity({
    phase: "running",
    label: cutAtWord(said, LABEL_MAX),
    step,
    // `Node: <definition>` is the record a tool row carries (`ui/activity-action/
    // record.ts`), so a card can tell what the step is from what it runs: a
    // merge step otherwise read "Action · the page" (U-A2). A chat shows no
    // text made only of codes.
    detail: { kind: "step", title: action ?? `S${where.slice(1)}`, status: "started", ref: input.nodeId, ...(definition ? { text: `Node: ${definition}` } : {}) }
  });
}
