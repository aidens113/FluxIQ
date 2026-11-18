// The chat window's model, choosing the sender's key and so its provider per call (t924). The host
// (`programs/_shared/runtime.ts`) imports it from here; it is not re-exported from `llm/index.ts`,
// whose own import loops would otherwise take this folder in.
export * from "./model.ts";
