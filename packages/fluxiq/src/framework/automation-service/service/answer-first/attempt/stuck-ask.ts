// Loop detection's last rung (plan, D14, step 4): fresh approaches looped too, so the attempt
// stops spending and asks. It is the one place a task pauses short of its budget, and it is
// not an ending: the person keeps it going, or stops it. With nobody to ask it keeps going,
// since the only endings are a result, a budget and a person's Stop, and the budget bounds it.

import { randomUUID } from "node:crypto";
import type { AutomationStudioAsk, AutomationStudioParkingPort } from "../../../../../runtime/automation-parking/index.ts";

const KEEP_GOING = "stuck_keep_going";
const STOP = "stuck_stop";
const TEXT = "I keep getting stuck on this, so I have stopped spending to ask. Do you want me to keep going, or stop here with what I have?";

/** How the person answered, or `keep_going` where nobody can be asked. */
export async function automationStudioAnswerFirstAskStuck(port: AutomationStudioParkingPort | undefined, signal: AbortSignal | undefined): Promise<"keep_going" | "stop"> {
  if (!port?.awaitAnswer) return "keep_going";
  const ask: AutomationStudioAsk = {
    askId: `stuck.${randomUUID()}`,
    kind: "choice",
    parks: true,
    timeoutMs: null,
    onTimeout: null,
    options: [{ id: KEEP_GOING, label: "Keep going", route: null }, { id: STOP, label: "Stop", route: null }],
    routes: null,
    consequences: [],
    control: { name: null, kind: "stuck_in_a_loop" },
    status: "pending",
    text: TEXT,
    raisedBy: { stage: "authoring" }
  };
  await port.open(ask);
  const answer = await port.awaitAnswer(ask, signal ? { signal } : {});
  return answer?.kind === "choice" && answer.value === STOP ? "stop" : "keep_going";
}
