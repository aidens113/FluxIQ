// The columns an extraction declares when its author declared none: the ones
// the instruction names, matched to the fields the extraction reads.
//
// **Why the build declares them.** Live run 12 built a list extraction with six
// fields -- name, price, rating and url, which the instruction named, and
// `plus` and `ad`, which the model read only to filter by -- and no record
// output, so the domain stored every field it read and each row carried two
// columns nobody asked for. The domain already narrows a read and its store to
// a declared schema whose every id is one of the read's field keys (downstream
// `output-nodes/extract-list/declared-columns.ts`), and does nothing without
// one. So the build declares one, from the person's own words, and every
// extraction Flow stores exactly what was asked.
//
// **How a name meets a field.** Exactly first, then with case and separators
// ignored (`./keys.ts`), so "Product name" meets `product_name`. Each field is
// declared at most once, in the order the instruction named them, under the id
// the read already uses and with the person's own spelling as its label.
//
// **A name no field matches is not a refusal.** The columns that matched are
// declared, and the rest are handed back so the build can say so: information
// for the model and the judge, never a gate. When none matched, nothing is
// declared and the extraction keeps every column it reads, as before.
//
// **The same fact, said where it is read.** The warning above lands on the
// plan, which the model and the judge never read. So the one sentence for it
// lives here, beside the matcher, and is said twice: beside the build's draft
// when no read of it gives a named column (`llm/harness-options/draft-acts.ts`),
// and to the judge for a stored answer whose columns miss one
// (`result-verification/read-account/unread-columns.ts`). Names come only from
// the instruction, never from the page.
//
// **A read that gives every column, but only before the last act (run
// `run-murwcaj0-40e56557`, R4).** The instruction asked the build to confirm
// requests, then give a table of every request the list *now* shows as
// accepted, with columns name and mutualFriends. The draft's only read of both
// columns was step 7, before the confirm at step 10, so the unread-column note
// above had nothing to say; the build completed, the judge refuted the table as
// the page before the confirms, and a whole repair round was spent. So the
// same door says a second thing, never with the first: when every read that
// gives all the named columns runs before the draft's last step that does an
// instructed act, it says so and names that act step -- never the read, for
// the reason above. Information only, like the first.
import { automationStudioFlowBootstrapInstructionColumns } from "../answerability/index.ts";
import { authoringFieldId, authoringKey } from "./keys.ts";

/** One declared column: the field key the read uses, and the name the instruction gave it. */
export type AuthoringInstructionRecordColumn = { id: string; label: string };

/** The instruction's named columns, matched to an extraction's field keys. */
export function authoringInstructionRecordColumns(input: {
  /** The columns the instruction names, as written (`../answerability/instruction-columns.ts`). */
  named: readonly string[];
  /** The field keys the extraction reads. */
  fieldKeys: readonly string[];
}): { columns: AuthoringInstructionRecordColumn[]; unmatched: string[] } {
  const usable = input.fieldKeys.filter((key) => authoringFieldId(key) === key);
  const taken = new Set<string>();
  const columns: AuthoringInstructionRecordColumn[] = [];
  const unmatched: string[] = [];
  for (const name of input.named) {
    const exact = usable.find((key) => key === name && !taken.has(key));
    const loose = exact ?? usable.find((key) => !taken.has(key) && authoringKey(key) !== "" && authoringKey(key) === authoringKey(name));
    if (loose === undefined) {
      unmatched.push(name);
      continue;
    }
    taken.add(loose);
    columns.push({ id: loose, label: name });
  }
  return { columns, unmatched };
}

/**
 * "The instruction asks for a column "rating" that no field reads.", or nothing
 * when the instruction names no column, there are no field keys to hold it to,
 * or every named column is read. Said to the judge about one stored answer's
 * columns. Information, never a refusal.
 */
export function automationStudioFlowBootstrapUnreadColumnsSentence(input: {
  instructionText: string | undefined;
  fieldKeys: readonly string[];
}): string | undefined {
  if (!input.fieldKeys.length) return undefined;
  const unmatched = unreadNamedColumns(input.instructionText, input.fieldKeys);
  return unmatched.length ? unreadColumnsSentence(unmatched, "no field reads") : undefined;
}

/**
 * The one note beside the build's draft about the instruction's named columns,
 * or nothing. It is one of two sentences, and never both: the unread-column
 * sentence when some named column no read of the draft gives, and otherwise
 * the before-the-last-act sentence (`readsBeforeLastActSentence`). Said beside
 * the build's draft (`llm/harness-options/draft-acts.ts`).
 *
 * **About the draft, never about one read (run `run-murdouox-c5294247`, R4).**
 * The unread-column sentence used to be said per read and to name the read's
 * step. A draft whose only read was the filter listing a repeat runs over was
 * told "no field of step 12 reads mutualFriends", and the model spent its last
 * four decisions reworking that listing instead of adding the read after the
 * confirms the table needed. A column is missing only when no read of the
 * draft gives it, and saying so names no step: it is true whichever read the
 * table should come from, and it points the model at no read to rework.
 */
export function automationStudioFlowBootstrapDraftUnreadColumnsSentence(input: {
  instructionText: string | undefined;
  /** Each read the draft holds: its field keys, and its step when the caller knows it. */
  reads: readonly { step?: number; fieldKeys: readonly string[] }[];
  /** The draft's last kept step that does an instructed act, when it has one. */
  lastActStep?: number | undefined;
  /** Whether that step is in a span that repeats over a listing, so the note says the listing stays before it. */
  lastActRepeats?: boolean | undefined;
}): string | undefined {
  const fieldKeys = [...new Set(input.reads.flatMap((read) => read.fieldKeys))];
  if (!fieldKeys.length) return undefined;
  const unmatched = unreadNamedColumns(input.instructionText, fieldKeys);
  if (unmatched.length) return unreadColumnsSentence(unmatched, "no read in the draft gives");
  return readsBeforeLastActSentence(input.instructionText, input.reads, input.lastActStep, input.lastActRepeats === true);
}

/**
 * "Every read in the draft that gives "name", "mutualFriends" runs before step
 * 10, ...", or nothing when the instruction names no column, there is no act
 * step, no read with a known step gives every named column, or one of those
 * reads runs at or after the last act step (run `run-murwcaj0-40e56557`, R4).
 * It names the act step, never a read.
 *
 * **It asks for a new read, never a move (R18).** "The draft needs a read after
 * step N" was read as "move the read after step N": in run
 * `run-musr9pv3-f4bf6256` (decisions 0037, 0044, 0056) the model moved the
 * loop's own listing after the act that walks it, which no repeat can walk. So
 * the sentence says to run a new read after the act and leave the reads before
 * it where they are, and of a repeated act, that its listing stays before it.
 */
function readsBeforeLastActSentence(
  instructionText: string | undefined,
  reads: readonly { step?: number; fieldKeys: readonly string[] }[],
  lastActStep: number | undefined,
  lastActRepeats: boolean
): string | undefined {
  if (lastActStep === undefined) return undefined;
  const named = automationStudioFlowBootstrapInstructionColumns(instructionText ?? "");
  if (!named.length) return undefined;
  const full = reads.filter((read) => read.step !== undefined && !authoringInstructionRecordColumns({ named, fieldKeys: read.fieldKeys }).unmatched.length);
  if (!full.length || full.some((read) => read.step! >= lastActStep)) return undefined;
  const names = named.map((name) => `"${name}"`).join(", ");
  return `Every read in the draft that gives ${names} runs before step ${lastActStep}, the last step that does what the instruction asks, so it shows the page as it was before that act. If the instruction asks for what the page shows after it, run a new read after step ${lastActStep} and add it; ${lastActRepeats ? `the listing step ${lastActStep} repeats over stays where it is, before step ${lastActStep}` : `leave every read before step ${lastActStep} where it is`}.`;
}

/** The columns the instruction names that none of `fieldKeys` reads. */
function unreadNamedColumns(instructionText: string | undefined, fieldKeys: readonly string[]): string[] {
  const named = automationStudioFlowBootstrapInstructionColumns(instructionText ?? "");
  return named.length ? authoringInstructionRecordColumns({ named, fieldKeys }).unmatched : [];
}

function unreadColumnsSentence(unmatched: readonly string[], missing: string): string {
  const names = unmatched.map((name) => `"${name}"`).join(", ");
  return `The instruction asks for ${unmatched.length === 1 ? "a column" : "columns"} ${names} that ${missing}.`;
}
