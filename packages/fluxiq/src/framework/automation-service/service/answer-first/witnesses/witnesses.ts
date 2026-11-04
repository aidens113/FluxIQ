// The witnesses an exploration reads, so the change it made can be shown.
//
// Today a trial's witnesses are read just before the trial and after its end
// view (`runtime/flow-authoring/bootstrap/trial-change/`), so an exploration,
// which has no trial, has none (study-simulation section 8: "Witnesses read
// before the first lasting act and at the end"). This reads them once at each
// of those two points, however often it is asked: `beforeFirstLastingAct`
// the first time a lasting act is about to run, `atEnd` when the exploration
// ends. A read that fails or gives nothing is noted and ends nothing: an
// unread side proves nothing either way, as an unread trial side does not.
import type { AutomationStudioAnswerFirstWitnessesInput } from "./input.ts";
import type { AutomationStudioAnswerFirstWitnessNote, AutomationStudioAnswerFirstWitnessRead, AutomationStudioAnswerFirstWitnessReadings, AutomationStudioAnswerFirstWitnessSide } from "./reading.ts";

export type AutomationStudioAnswerFirstWitnesses = {
  /** Reads the before side once; a later call, even a concurrent one, gets the same answer. */
  beforeFirstLastingAct(): Promise<AutomationStudioAnswerFirstWitnessRead>;
  /** Reads the end side once. */
  atEnd(): Promise<AutomationStudioAnswerFirstWitnessRead>;
  /** What has been read so far. */
  readings(): AutomationStudioAnswerFirstWitnessReadings;
  /** The sides whose read gave nothing, in the order they failed. */
  notes(): readonly AutomationStudioAnswerFirstWitnessNote[];
};

export function automationStudioAnswerFirstWitnesses(input: AutomationStudioAnswerFirstWitnessesInput): AutomationStudioAnswerFirstWitnesses {
  const readings: AutomationStudioAnswerFirstWitnessReadings = {};
  const notes: AutomationStudioAnswerFirstWitnessNote[] = [];
  const reads = new Map<AutomationStudioAnswerFirstWitnessSide, Promise<AutomationStudioAnswerFirstWitnessRead>>();
  const once = (side: AutomationStudioAnswerFirstWitnessSide): Promise<AutomationStudioAnswerFirstWitnessRead> => {
    const earlier = reads.get(side);
    if (earlier) return earlier;
    const unread = (error?: unknown): AutomationStudioAnswerFirstWitnessRead => {
      const note: AutomationStudioAnswerFirstWitnessNote = { side, code: "answer_first.witness_unread", ...(error instanceof Error ? { errorName: error.name } : {}) };
      notes.push(note);
      return { kind: "unread", note };
    };
    const read = (async (): Promise<AutomationStudioAnswerFirstWitnessRead> => {
      try {
        const reading = await input.read(side);
        if (reading === undefined) return unread();
        readings[side] = reading;
        return { kind: "read", reading };
      } catch (error) {
        return unread(error);
      }
    })();
    reads.set(side, read);
    return read;
  };
  return {
    beforeFirstLastingAct: () => once("before"),
    atEnd: () => once("after"),
    readings: () => ({ ...readings }),
    notes: () => [...notes]
  };
}
