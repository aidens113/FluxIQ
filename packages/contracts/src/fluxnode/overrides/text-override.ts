// One prompt or tool entry: append to the default, replace it, or (per run only) undo a
// declared entry and return to the default.

export type FluxNodeTextOverride = { mode: "append"; text: string } | { mode: "replace"; text: string } | { mode: "default" };
