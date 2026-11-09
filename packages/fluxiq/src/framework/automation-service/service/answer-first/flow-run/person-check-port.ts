// The one question a saved Flow's run may put to a person part way through: a check only a person
// can clear, a robot screen in the web domain's words (`runtime/parking/person-needed-ask.ts`).
//
// **Why this one and no other.** A permission or PIN question never reaches a person in the middle
// of a Flow (the person's rule: "NO PIN FOR ANY NORMAL ACTIONS ... NEVER IN THE MIDDLE OF A FLOW"),
// and permission is asked once, before the run (`./permission.ts`). A robot check is neither: the
// page itself asks the person, and nobody else can answer it. Without a port the engine ends the run
// on one (`engine/automation/person-needed.ts`, "Only with a port"), and the attempt had to explore
// again from a page still behind the check.
//
// **Only `person_check` asks go through**, read from the ask's marker, never its words. Any other
// ask a step raises is refused as it is opened, so the engine ends the run there and nobody hears of
// it: what a run with no port did, except that the engine says "could not be delivered" where it
// used to say "waiting", which is why `refused` is told (`./steps-ran.ts` keeps the same words). An
// ask that does not park waits for nothing and is told to nobody, as before.
//
// **No clock on the wait** (`../person-waits/person-wait.ts`): only an answer, or the person's Stop
// through the run's signal, ends it. Continue resumes the run down the step's success route, from
// that step.
//
// **The person's Stop on the check halts the run where it stands.** The engine would take the step's
// `failed` route for it (`engine/automation/person-needed.ts`), and a saved Flow's failed route may
// press something after the person said stop. So the run's own signal is aborted before the answer
// goes back: the engine checks it before it runs another step (`engine/automation/graph-run.ts`, the
// top of its step loop) and ends the run cancelled, and nothing on the failed route runs. It is also
// told to `stopped`, so the attempt ends as stopped by the person and never goes back to its rounds.

import { AUTOMATION_STUDIO_PERSON_NEEDED_CONTROL_KIND, AUTOMATION_STUDIO_PERSON_NEEDED_STOP_OPTION, type AutomationStudioAsk, type AutomationStudioParkingPort } from "../../../../../runtime/automation-parking/index.ts";
import { automationStudioAnswerFirstUnboundedPort } from "../person-waits/index.ts";
import type { AutomationStudioAnswerFirstFlowRunPorts } from "./ports.ts";

/** What the engine is told when it opens a question this run may not ask. Nothing of the ask: its words may quote the page. */
const REFUSED = "answer_first.flow_run_asks_nobody: a saved Flow's run asks a person only to clear a check on the page";

/** The run's parking port, or nothing where nobody can be asked and waited on in place. `halt` aborts the run's own signal. */
export function automationStudioAnswerFirstFlowRunPersonCheckPort(person: AutomationStudioAnswerFirstFlowRunPorts["personCheck"], refused: () => void, halt: () => void): AutomationStudioParkingPort | undefined {
  // A port that cannot wait in place would leave the run parked durably on a question the attempt walked away from.
  if (!person?.port.awaitAnswer) return undefined;
  const unbounded = automationStudioAnswerFirstUnboundedPort(person.port, person.waiting);
  const awaitAnswer = unbounded.awaitAnswer!;
  return {
    open: async (ask) => {
      if (isPersonCheck(ask)) return await unbounded.open(ask);
      if (!ask.parks) return;
      refused();
      throw new Error(REFUSED);
    },
    // Reached only by an ask `open` let through; anything else is refused again rather than waited on.
    awaitAnswer: async (ask, wait) => {
      if (!isPersonCheck(ask)) throw new Error(REFUSED);
      const answer = await awaitAnswer(ask, wait);
      // The step's own route for Stop is `failed`; the person meant the whole attempt, which the owner ends (`../attempt/flow-stage.ts`),
      // and the run halts before the engine can take that route.
      if (answer?.kind === "choice" && answer.value === AUTOMATION_STUDIO_PERSON_NEEDED_STOP_OPTION) {
        person.stopped?.();
        halt();
      }
      return answer;
    }
  };
}

function isPersonCheck(ask: Pick<AutomationStudioAsk, "control">): boolean {
  return ask.control?.kind === AUTOMATION_STUDIO_PERSON_NEEDED_CONTROL_KIND;
}
