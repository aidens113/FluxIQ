/**
 * What a step of the outline is. `jump` is a step the graph does not nest
 * ("Go back to step 3"); `handlers` and `section` hold other steps under a
 * heading; `empty` stands for a Flow with nothing in it yet.
 */
export type OutlineStepKind =
  | "act"
  | "data"
  | "call"
  | "branch"
  | "switch"
  | "loop"
  | "router"
  | "give-back"
  | "end"
  | "jump"
  | "handlers"
  | "handler"
  | "handler-end"
  | "section"
  | "step"
  | "empty";
