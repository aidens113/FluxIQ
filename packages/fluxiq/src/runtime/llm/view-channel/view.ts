// A page view: the page key the domain names (P-a) and its keyed lines in page order (P-b).
//
// The lines' texts joined by "\n" are exactly the page text the model would
// read whole. Core never reads the page key; it compares it for equality to
// tell which deliveries are of the same page.

import type { AutomationStudioLlmPageLine } from "./line.ts";

/** One page as the domain saw it: its key and its lines in page order. */
export type AutomationStudioLlmPageView = { key: string; lines: AutomationStudioLlmPageLine[] };
