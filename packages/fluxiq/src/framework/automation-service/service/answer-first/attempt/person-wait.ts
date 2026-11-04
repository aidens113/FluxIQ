// A person's question on this path has no clock on it (plan, "Keep Going"; brief, item 2).
//
// Elsewhere a permission question waits two minutes and a check five, because a build that
// gave up could be built again. Here the wait is the task's: nobody answering is not a way for
// it to end, and a Stop is what ends it. So the ask is written with no timeout and waited on
// with no deadline, and the conversation port (`../../../../../runtime/automation-parking/conversation-port.ts`)
// then waits until an answer, or the signal the gate hands it, which is the person's Stop.
//
// `waiting` lets the attempt say what it waits for while it does (`waiting_for_person`), and the
// time waited is told so a round's own clock does not count a person's thinking.

import type { AutomationStudioParkingPort } from "../../../../../runtime/automation-parking/index.ts";

export function automationStudioAnswerFirstUnboundedPort(port: AutomationStudioParkingPort, waiting: (state: "started" | "ended", waitedMs: number) => void, now: () => number = Date.now): AutomationStudioParkingPort {
  const awaitAnswer = port.awaitAnswer?.bind(port);
  return {
    open: (ask) => port.open({ ...ask, timeoutMs: null, onTimeout: null }),
    ...(awaitAnswer ? {
      awaitAnswer: async (ask, wait) => {
        const started = now();
        waiting("started", 0);
        try {
          return await awaitAnswer(ask, wait.signal ? { signal: wait.signal } : {});
        } finally {
          waiting("ended", now() - started);
        }
      }
    } : {})
  };
}
