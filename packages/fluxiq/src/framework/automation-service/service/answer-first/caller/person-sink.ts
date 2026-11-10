// A program's person-ask sink as the parking port every question of an attempt is put through
// (`AutomationStudioParkingPort`): `raised` is where a question is opened, and `answer`, when the
// program gave one, is the wait in place. With no `answer` the port has no wait, which is exactly a
// port that parks: the attempt waits for a person, `waiting_for_person`, as it does with nobody to ask.

import type { AutomationStudioParkingPort } from "../../../../../runtime/automation-parking/index.ts";
import type { AutomationStudioAnswerFirstPersonAskSink } from "../../flow-bootstrap-commands/index.ts";

export function automationStudioAnswerFirstPersonSinkPort(sink: AutomationStudioAnswerFirstPersonAskSink): AutomationStudioParkingPort {
  const answer = sink.answer?.bind(sink);
  return {
    open: (ask) => sink.raised(ask),
    ...(answer ? { awaitAnswer: (ask, wait) => answer(ask, wait) } : {})
  };
}
