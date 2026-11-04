// Whether a parameter's value is an address into a page rather than an input, by its
// shape alone: Core names no domain's field for it (`./target-keys.ts`). A sentence a
// person types has spaces and ends in words; these start with a mark or are joined by
// them. The contract's own check on person words reads the same shapes
// (`packages/contracts/src/task-attempts/person-words.ts`). An ordinary word used as an
// address is read as an input: then only an exact repeat of the call is the same act.

const ADDRESS_MARK = /^[#.][A-Za-z_-]|^\[|\s>\s?|\[[\w-]+[~|^$*]?=|^[a-z][a-z\d-]*[#.[:][^\s@]*$|^[a-z][a-z\d-]*(?:\s+[a-z][\w-]*)*\s+[#.]?[a-z][\w-]*[#.[:][\w-]/iu;
const WHOLE_ADDRESS = /^[a-z][a-z\d+.-]*:\/\//iu;
const COUNTED_PLACE = /:nth-|:first-|:last-|:only-/u;

/** Whether a value is shaped like an address into a page; a whole web address is an input, the place a step goes. */
export function automationStudioAttemptActIsAddress(value: string): boolean {
  const trimmed = value.trim();
  return !WHOLE_ADDRESS.test(trimmed) && ADDRESS_MARK.test(trimmed);
}

/** Whether an address counts its way to what it names: a position, not a control. */
export function automationStudioAttemptActCountsPlaces(value: string): boolean {
  return COUNTED_PLACE.test(value);
}
