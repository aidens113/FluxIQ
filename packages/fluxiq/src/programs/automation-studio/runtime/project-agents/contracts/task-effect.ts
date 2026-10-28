/**
 * The change a plan part asks for, as typed data and never parsed from words (t775). A `change` is judged by the
 * difference between the state before a run and the state after it: it adds or removes `count` of `what`
 * (`"each_match"` where the request names a condition, not a number). An `end_state` is judged by the state after the
 * run alone: `state` is what must hold then.
 */
export type AutomationStudioProjectTaskEffect =
  | { kind: "change"; direction: "adds" | "removes"; count: number | "each_match"; what: string }
  | { kind: "end_state"; state: string };
