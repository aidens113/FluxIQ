import type { ResultRequestedOutput } from "./output.ts";

/**
 * Core's finding that a run owed records and stored none, with nothing in the
 * run's own record showing a list read to its end where nothing matched
 * (`../requested-output/`, t757): the parts and columns owed, and Core's
 * sentence for it. Set on the verification of a yes it holds.
 */

export type ResultRequestedOutputMissing = ResultRequestedOutput & { said: string };
