/**
 * The page text a step's evidence carries, as the domain that produced the
 * evidence reads it. Core knows no page: what evidence means belongs to the
 * domain, and Core only writes the answer to `page.txt`. Supplied by whoever
 * builds a loop's options (`stepLogPageText`) and handed down to the tool step,
 * never held process-wide. None supplied, or none that answers, means no `page.txt`.
 */
export type AutomationStudioLlmStepLogPageReader = (evidence: unknown) => string | undefined;
