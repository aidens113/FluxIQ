// The Flow outline (FluxNode plan P9): a stored Flow graph as a plain numbered
// list of steps, and the graph patch each edit of that list makes.
export * from "./types/index.ts";
export { outlineFlow } from "./outline-flow.ts";
export { outlineEdit } from "./outline-edit.ts";
export { outlineFlatSteps } from "./walk/index.ts";
