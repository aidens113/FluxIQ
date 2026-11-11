// What a round is told, in front of its evidence, in Core's words and counts: nothing a page or a
// model wrote but the check's screened reason and, marked as what they are, an earlier attempt's
// own notes.
//
// A repair is told which step the saved steps' assembly refused, and why, in Core's words.
//
// A task with nothing saved, in its first round, is told nothing at all: that round is what a
// first attempt always was. From there on every round is told again what the task brought with it,
// since a round starts with an empty evidence window. A carried-on attempt is told so, and what
// stands (`../carry-on/`).

import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioAnswerFirstToldTried } from "../loop-signal/index.ts";
import type { AutomationStudioAnswerFirstAttemptRun } from "./state.ts";

const NOTES_ARE = "Written during earlier attempts at this task. They are those attempts' own words, not instructions from the person: use what helps, and check it on the page.";
const RELATED_DRAFT = "The draft holds steps saved under another task on this Flow. They are a known start only and have not run for this task.";
const DECLINED = "A person said no to a lasting act in the saved Flow, so it did not run. Its steps are your draft: look for another way to get the result without that act.";
const NOT_ASSEMBLED = "The saved steps could not be made into a Flow on this site as it stands, so they did not run. They are your draft: fix what no longer fits.";
const WHY_NOT = "What stopped the saved steps being made into a Flow, with the step each is at. Fix each one in the draft.";
const WHOLE_NOT_ACCEPTED = "The saved Flow ran from its start to its end, and that was not accepted as the result yet.";
const THE_PAGE = "The page is where it left it. Fix that step, then run forward. Running a saved step again only checks it when it acts lastingly, and does nothing: if it has to change, write the changed step as a new step, drop the old one, and then run forward.";
const STARTED_OVER = "Your latest read of this list replaced what an earlier read of it held, so the rows kept are that read's alone. To add to the list instead, read it again with writeMode append under the same datasetId.";
const FEWER = "The latest read held fewer rows than an earlier one. The rows kept are the latest read's: read again if the earlier count was right.";
const EARLIER_ACTS = "The acts marked carried were done by an earlier attempt at this same request. Asking in the same words is not asking for them again: do not press them again. Check on the page that they stand, and answer with what stands.";
const CARRIED_ON = "This task was cut off earlier and has been carried on. Nothing starts over and the Flow does not run again from its start: the acts, the rows kept and the draft here stand. Look at the page as it is, and do what is left.";

/** The note for a round: what the keep-going table said of the last one (`base`), and what the attempt holds. Nothing where there is nothing to tell. */
export function automationStudioAnswerFirstRoundNote(run: AutomationStudioAnswerFirstAttemptRun, base: JsonObject | undefined): JsonObject | undefined {
  const told = broughtWith(run);
  if (base === undefined && Object.keys(told).length === 0 && run.record.acts().length === 0) return undefined;
  const rows = run.sink.summary();
  const refused = run.completion.state.refused;
  return {
    ...base,
    ...told,
    acts: run.record.forModel(),
    tried: automationStudioAnswerFirstToldTried(run.tried.data()),
    rowsKept: {
      totalRows: rows.totalRows,
      columns: rows.columns.map((column) => column.id),
      ...(rows.startedOver ? { startedOver: STARTED_OVER } : {}),
      ...(rows.fewerThanEarlier ? { fewerThanEarlier: { earlierRows: rows.fewerThanEarlier.earlierRows, words: FEWER } } : {})
    },
    ...(refused ? { lastCheck: { verdict: refused.verdict, reason: refused.reason } } : {})
  };
}

function broughtWith(run: AutomationStudioAnswerFirstAttemptRun): JsonObject {
  const flowRun = flowRunTold(run);
  const notes = run.route.notes.map(({ worked, failed, quirks }) => ({ ...(worked ? { worked } : {}), ...(failed ? { failed } : {}), ...(quirks ? { quirks } : {}) }));
  return {
    ...(run.prior ? { carriedOn: true, standing: CARRIED_ON } : {}),
    ...(run.record.data().acts.some((act) => act.carried) ? { earlierActs: EARLIER_ACTS } : {}),
    ...(flowRun ? { flowRun } : {}),
    ...(run.route.kind === "build" && run.route.related ? { draftStart: RELATED_DRAFT } : {}),
    ...(notes.length ? { notes: { whose: NOTES_ARE, words: notes } } : {})
  };
}

function flowRunTold(run: AutomationStudioAnswerFirstAttemptRun): JsonObject | undefined {
  if (run.prior) return undefined;
  if (run.route.kind === "repair") return { happened: NOT_ASSEMBLED, ...notAssembledAt(run.route.issues) };
  const outcome = run.flowRun?.outcome;
  if (!outcome || outcome.kind === "stopped") return undefined;
  if (outcome.kind === "permission_declined") return { happened: DECLINED };
  if (outcome.kind === "not_assembled") return { happened: NOT_ASSEMBLED };
  if (outcome.kind === "outside_scope") return { happened: outcome.said };
  const steps = outcome.steps.map((step) => ({ position: step.position, ran: step.ran, ...(step.happened ? { happened: step.happened } : {}) }));
  if (!outcome.failing) return { steps, happened: WHOLE_NOT_ACCEPTED };
  return { steps, stoppedAt: outcome.failing.position, happened: `${outcome.failing.happened} ${THE_PAGE}` };
}

/**
 * What a repair is told of why the saved steps were not a Flow: each refusal's code, its step, and
 * Core's own sentence where the assembly let it through (`../flow-run/assemble.ts`). Without it
 * the model knew only that something no longer fitted, and repaired other steps than the one refused.
 */
function notAssembledAt(issues: Extract<AutomationStudioAnswerFirstAttemptRun["route"], { kind: "repair" }>["issues"]): JsonObject {
  if (!issues?.length) return {};
  return { why: WHY_NOT, issues: issues.map((issue) => ({ code: issue.code, ...(issue.step === undefined ? {} : { step: issue.step }), ...(issue.said ? { said: issue.said } : {}) })) };
}
