// Barrel for the step log: every model exchange and every tool call of a run
// written as its own folder, when `FLUXIQ_LLM_STEP_LOG_DIR` names an absolute
// directory, so a person can see exactly what the model was sent, what it
// answered and what Core made of it.
//
// The folder contract, which the Lab reads (`packages/test-runner` in the web
// extension repository):
//
// - One folder per step, `NNNN-<kind>`, numbered when the step starts and
//   continuing from the highest number already in the directory.
// - Model kinds: `decide`, `judge`, `diagnose`, `repair`, `bootstrap`, `chat`,
//   else the task kind in kebab case. A model folder holds `request.json` (the
//   exact body sent), `request.txt`, `response.json` (the exact reply, absent
//   when none arrived), `response.txt`, `decision.json` and `meta.json`.
// - Tool folders `NNNN-tool-<toolId>`, and `NNNN-test-<toolId>` for a Flow
//   test's replay, hold `call.json`, `result.json`, `page.txt` when the result
//   carries a page view, and `meta.json`. A replay's row (`item` in the call) and
//   output values (`outputs` in `meta.json`) are written as field names only.
// - Answer folders `NNNN-answer-amend_draft`, `NNNN-answer-unusable` for a
//   decision Core refused (no decision shape, a refused completion, a call not
//   offered), and `NNNN-answer-<toolId>` for a call refused unrun as a repeat
//   or answered from memory, hold `result.json` -- Core's answer: `applied`,
//   `partly_applied`, `refused` or `ignored`, with each reason, the steps a
//   refusal listed (`steps`) and the entries Core showed the model about it
//   (`feedback`) -- and `meta.json` (kind `answer`). They carry no provider and
//   cost nothing.
// - `meta.json` is written last: a folder with it is complete.
// - `index.md` in the directory lists every completed step.
//
// No header is ever written and the resolved credential is never handed to the
// step log; every text is still screened for credential shapes. Every write is
// best-effort: a step log that cannot write never changes or fails a call.
export * from "./answer-step.ts";
export * from "./directory.ts";
export * from "./model-step.ts";
export * from "./scope.ts";
export * from "./screen.ts";
export * from "./tool-step.ts";
