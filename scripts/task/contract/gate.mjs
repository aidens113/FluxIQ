// The contract step of `pnpm task finish`: the short list in
// `list.mjs`, run on the task branch after it has integrated `dev`.
//
// `--skip-checks` waives `pnpm check`, not this. The tests here pin text that a
// task changes on purpose, and the only correct way past a failure is to
// re-pin it in the same task, so that the change and its pin merge together.

import path from "node:path";

import { CONTRACT_TESTS } from "./list.mjs";

const command = (group) => `pnpm --dir ${group.package} exec vitest run ${group.files.join(" ")}`;

function groupByPackage(tests) {
  const groups = [];
  for (const test of tests) {
    const group = groups.find((entry) => entry.package === test.package);
    if (group) group.files.push(test.file);
    else groups.push({ package: test.package, files: [test.file] });
  }
  return groups;
}

/**
 * Runs (or, on a dry run, only describes) the contract tests, and throws when
 * any fails, naming each file, what it guards, and how to re-pin it.
 */
export async function contractGate({ repositoryRoot, branch, dryRun = false, note, run, tests = CONTRACT_TESTS }) {
  const groups = groupByPackage(tests);
  const commands = groups.map(command);
  const files = tests.map((test) => `${test.package}/${test.file}`);

  if (dryRun) return { ran: false, commands, files, reason: "--dry-run" };

  const failures = [];
  for (const group of groups) {
    note({ step: "contracts", command: command(group), root: repositoryRoot });
    const { failed } = await run(path.join(repositoryRoot, group.package), group.files);
    for (const file of failed) failures.push({ group, test: tests.find((entry) => entry.package === group.package && entry.file === file) ?? { package: group.package, file, guards: "a contract" } });
  }

  if (failures.length > 0) {
    const named = failures.map(({ test }) => `${test.package}/${test.file} (${test.guards})`).join("; ");
    const rerun = [...new Set(failures.map(({ group, test }) => `pnpm --dir ${group.package} exec vitest run ${test.file}`))].join(" && ");
    throw new Error(`Contract test(s) failed, so task ${branch} was not merged: ${named}. Reproduce with: ${rerun}. If the prompt text or budget changed on purpose, re-pin it deliberately: update the expected text or budget in that test file in this task, commit it beside the change, and run finish again; otherwise fix the change. --skip-checks does not waive this gate. The checkout is left on ${branch}, which now carries the integration merge.`);
  }

  return { ran: true, commands, files, passed: true };
}
