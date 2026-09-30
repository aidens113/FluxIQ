#!/usr/bin/env node
// node scripts/build-cache/cli.mjs <step> [-- "<command>"]
// node scripts/build-cache/cli.mjs [--parallel] <step> <step>...
//
// Runs registered steps through the cache and prints one line per step:
//   {"build-cache":"reuse"|"build","step":"<step>","reason":"...","ms":<n>,"source":"stamp"|"store"|"command"}
// then exits with the first failing step's exit code (0 when all reused or
// passed). A reused step that replays its output (the structure audit) first
// prints that it passed at that fingerprint, then the output it printed then.
//
// With one step, the command after `--` is what a package.json script shows
// its reader; it must equal the registry's command for the step, and a
// mismatch fails before anything runs, so the script and the registry cannot
// drift apart silently. Without `--` the registry's command is run.
//
// Several steps run in the order given, or with `--parallel` side by side in
// workspace dependency order (`schedule-steps.mjs`).

import { scheduleSteps } from "./schedule-steps.mjs";
import { STEPS } from "./steps.mjs";

const USAGE = 'Usage: node scripts/build-cache/cli.mjs <step> [-- "<command>"]\n       node scripts/build-cache/cli.mjs [--parallel] <step> <step>...';

const argv = process.argv.slice(2);
const separator = argv.indexOf("--");
const before = separator === -1 ? argv : argv.slice(0, separator);
const parallel = before.includes("--parallel");
const names = before.filter((argument) => argument !== "--parallel");
const fail = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(2);
};
if (names.length === 0 || names.some((name) => name.startsWith("--"))) fail(`${USAGE}\nRegistered steps: ${Object.keys(STEPS).join(", ")}`);
for (const name of names) {
  if (!Object.hasOwn(STEPS, name)) fail(`build-cache: unknown step "${name}". Registered steps: ${Object.keys(STEPS).join(", ")}`);
}
if (separator !== -1) {
  if (names.length !== 1) fail("build-cache: a command after -- names the command of exactly one step.");
  const given = argv.slice(separator + 1).join(" ");
  const [name] = names;
  if (given !== STEPS[name].command) {
    fail(`build-cache: the command passed for "${name}" is not the registered one.\n  passed:     ${given}\n  registered: ${STEPS[name].command}\nChange scripts/build-cache/steps.mjs and the package.json script together.`);
  }
}

const { exitCode } = await scheduleSteps(names, {
  parallel,
  onOutcome(outcome) {
    if (outcome.output) process.stdout.write(outcome.output.endsWith("\n") ? outcome.output : `${outcome.output}\n`);
    if (outcome.replay !== null) {
      process.stdout.write(`build-cache: ${outcome.step} passed at fingerprint ${String(outcome.fingerprint).slice(0, 12)} (${outcome.reason}); replaying the output it printed then:\n`);
      if (outcome.replay !== "") process.stdout.write(outcome.replay.endsWith("\n") ? outcome.replay : `${outcome.replay}\n`);
    }
    process.stdout.write(`${JSON.stringify({ "build-cache": outcome.result, step: outcome.step, reason: outcome.reason, ms: outcome.ms, source: outcome.source })}\n`);
  }
});
process.exit(exitCode);
