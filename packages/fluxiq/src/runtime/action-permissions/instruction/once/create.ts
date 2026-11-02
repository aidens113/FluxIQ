import type { AutomationStudioInstructedRead, AutomationStudioInstructionReading, AutomationStudioInstructionRouteAccessor, AutomationStudioInstructionRouteReading } from "../../../../flows/executable/permissions/index.ts";
import type { ActionInstructionReader } from "./reader.ts";

type Outcome = { answer: AutomationStudioInstructionReading } | { failed: unknown };
const TRANSPORT: AutomationStudioInstructionRouteReading = Object.freeze({ state: "unavailable", reason: "transport" });

/** One actual read, shared through success, rejection, synchronous throw and reentrant calls. */
export function createActionInstructionAuthority(reader: ActionInstructionReader): { derive(): Promise<AutomationStudioInstructedRead>; route: AutomationStudioInstructionRouteAccessor } {
  let reading: Promise<Outcome> | undefined;
  let known: AutomationStudioInstructionRouteReading = { state: "unread" };
  const read = (): Promise<Outcome> => {
    if (reading) return reading;
    let complete!: (outcome: Outcome) => void;
    reading = new Promise<Outcome>(resolve => { complete = resolve; });
    const failed = (reason: unknown) => {
      known = TRANSPORT;
      complete({ failed: reason });
    };
    try {
      void Promise.resolve(reader.read()).then(answer => {
        try {
          known = answer.route;
          complete({ answer });
        } catch (error) {
          failed(error);
        }
      }, failed);
    } catch (error) {
      failed(error);
    }
    return reading;
  };
  return {
    derive: async () => {
      const outcome = await read();
      if ("failed" in outcome) throw outcome.failed;
      return outcome.answer.instructed;
    },
    route: {
      read: async () => {
        const outcome = await read();
        return "failed" in outcome ? TRANSPORT : outcome.answer.route;
      },
      peek: () => known
    }
  };
}
