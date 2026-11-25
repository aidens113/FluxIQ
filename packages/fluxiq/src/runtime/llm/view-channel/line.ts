// One line of a page view as the domain hands it to Core (D1, P-b).
//
// `key` is stable for the run while the line is the same thing on the page --
// an element line's handle, a header line's label, a marker keyed to the line
// it stands before -- and unique within one view. `text` is the line exactly
// as the model reads it. Core compares keys and texts for equality only and
// never parses a text. `extra` marks a line only a full capture shows (hidden
// elements, attributes: D5, D15): shown in that one delivery, never part of
// the state a later delivery is compared with.

/** One keyed line of a page view. */
export type AutomationStudioLlmPageLine = { key: string; text: string; extra?: true };
