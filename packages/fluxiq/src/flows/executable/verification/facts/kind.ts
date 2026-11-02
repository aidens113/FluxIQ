/** The facts Core computes, one kind per module of `../computed-facts/`. */

export type ResultComputedFactKind =
  | "count"
  | "columns"
  | "repeated"
  | "verbatim"
  | "kept_bounds"
  | "left_out_accounted"
  | "order"
  | "act_passes";
