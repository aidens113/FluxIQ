// The contract tests every `pnpm task finish` runs, whatever the task touched.
//
// Model-facing prompt text is composed from many source owners, and a few
// central tests pin it or hold it to a budget. A change to one owner's text
// passes the tests beside that owner and fails these, far away -- and twice in
// October 2026 (5a652d4a, aa04a943) such a change merged with only its
// neighbours run and left these failing on `dev`. Listing them here makes the
// merge gate run them every time, so the failure lands on the task that caused
// it. Keep the list short: each entry is paid on every finish.
//
// Adding a contract test is one line: the package directory, the test file
// relative to it, and what it guards (named in the refusal).

export const CONTRACT_TESTS = [
  { package: "packages/fluxiq", file: "src/programs/automation-studio/runtime/llm/deepseek/tests/system-prompt.test.ts", guards: "the pinned DeepSeek system prompt" },
  { package: "packages/fluxiq", file: "src/programs/automation-studio/runtime/flow-bootstrap/plan/tests/extraction-vocabulary.test.ts", guards: "the extraction vocabulary's prompt size budget" },
  { package: "packages/fluxiq", file: "src/programs/automation-studio/runtime/flow-bootstrap/plan/tests/issue-feedback.test.ts", guards: "the pinned plan issue feedback text" }
];
