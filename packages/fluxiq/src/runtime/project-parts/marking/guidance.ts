// What the model is told makes a good part, as it writes a draft. Generic on
// purpose: it names no site, product or task, and neither may an edit of it.

/** One line of the script format: when a run of steps deserves to be a part. */
export const AUTOMATION_STUDIO_PART_MARKING_GUIDANCE = "When some steps do one self-contained job that a later task could want on its own, write them as a part: its first line says what it does in general words, what could differ next time is an `input:` rather than a value typed into a step, and what it finds is an `output:`. A part starts from a page anyone could reach and leaves the page in a state it can name with `done when:`. A single step, or steps that only make sense for this one request, stay plain steps; a part that holds the particular item the person asked for cannot be used again.";
