/**
 * Which pass of a repeat a test's call is (t195 w43): its number, the pass
 * count where the walker knows it before the pass (a list's rows; a repeat
 * while a check holds does not), and the label of the pass's row where the
 * list read named its rows, already screened as the judge's are. Never a row's
 * values. Live run `run-musp474o-e0ed7432` ran a repeated Confirm once per row
 * and no pass folder said which row it was on.
 */
export type AutomationStudioLlmStepLogPass = { pass: number; of?: number; row?: string };
