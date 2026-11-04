import type { JsonObject } from "../../../../../core/index.ts";

/** Which side of the exploration a witness read is: before its first lasting act, or at its end. */
export type AutomationStudioAnswerFirstWitnessSide = "before" | "after";

/** The witnesses' readings as the Flow-less judge's summary carries them (`witnesses: { before?, after? }`). */
export type AutomationStudioAnswerFirstWitnessReadings = { before?: JsonObject; after?: JsonObject };

/** What one side's read came to: its reading, or the note saying it gave nothing. */
export type AutomationStudioAnswerFirstWitnessRead = { kind: "read"; reading: JsonObject } | { kind: "unread"; note: AutomationStudioAnswerFirstWitnessNote };

/** A side whose read gave nothing: a code and an error name, never the error's words. */
export type AutomationStudioAnswerFirstWitnessNote = { side: AutomationStudioAnswerFirstWitnessSide; code: "answer_first.witness_unread"; errorName?: string };
