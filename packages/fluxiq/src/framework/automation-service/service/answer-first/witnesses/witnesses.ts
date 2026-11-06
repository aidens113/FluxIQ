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
//
// **Acts an earlier attempt made (`earlier`).** They are carried as already done, so this attempt's
// own before side could only be read after them. Where the earlier attempt's reading is held
// (`./before-readings.ts`), it is this attempt's before side, read by nobody again: the judge sees
// the same before reading the earlier judge saw. Where it is not, the before side the judge is
// shown says so (`./earlier-words.ts`), holding this attempt's own reading, if it took one, beside
// those words and never as a reading from before the acts. Only a reading from before every act
// is told to `keep`.
import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_EARLIER_BEFORE_WORDS as WORDS } from "./earlier-words.ts";
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
  const carriedIn = input.earlier;
  const keep = (before: JsonObject): void => {
    try {
      input.keep?.(before);
    } catch {
      /* best-effort: holding it for a later attempt is a convenience; this attempt's reading stands either way */
    }
  };
  if (carriedIn?.before) {
    readings.before = carriedIn.before;
    reads.set("before", Promise.resolve<AutomationStudioAnswerFirstWitnessRead>({ kind: "read", reading: carriedIn.before }));
    keep(carriedIn.before);
  }
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
        if (side === "before" && !carriedIn) keep(reading);
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
    readings: () => shown(readings, carriedIn),
    notes: () => [...notes]
  };
}

/** The readings as the judge is shown them: a before side an earlier attempt's acts came ahead of says so (header). */
function shown(readings: AutomationStudioAnswerFirstWitnessReadings, earlier: AutomationStudioAnswerFirstWitnessesInput["earlier"]): AutomationStudioAnswerFirstWitnessReadings {
  if (!earlier || earlier.before) return { ...readings };
  const before = readings.before ? { note: WORDS.takenAfter, reading: readings.before } : { note: WORDS.notHeld };
  return { ...readings, before };
}
