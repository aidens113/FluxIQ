/**
 * What Core last read of one page the build acted on, as that page's own lines (t791): the lines it now shows that it
 * did not show when the build began (`added`) and the ones it no longer shows (`gone`). Page words, said to the person
 * whose page it is; never kept in code.
 */
export type AutomationStudioProjectBuildReading = { added: readonly string[]; gone: readonly string[] };
