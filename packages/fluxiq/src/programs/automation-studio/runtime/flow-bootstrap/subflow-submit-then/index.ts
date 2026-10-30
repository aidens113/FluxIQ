// Barrel for a subflow submission's `then` (t811): what Core does with the
// revision a `core.submit_subflow` call makes, in the same call, and the
// builder's completion once a yes stands. Its one consumer is the subflow
// builder (`../subflow-candidate/builder-loop.ts`), and
// `../subflow-candidate/index.ts` re-exports it.
//
// It sits beside `../subflow-candidate/` rather than inside it because a
// directory there would put its files past the structure audit's
// nine-segment path depth. Like `../subflow-candidate/`, it drives values out
// of `runtime/llm/` and `runtime/activity/`, so `../index.ts` must never
// re-export it (that barrel's header says why).
export * from "./submit-then-words.ts";
export * from "./submit-then.ts";
export * from "./builder-test-call.ts";
export * from "./builder-auto-complete.ts";
