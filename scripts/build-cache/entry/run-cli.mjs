// node scripts/build-cache/cli.mjs <step> [-- "<command>"]
// node scripts/build-cache/cli.mjs [--parallel] <step> <step>...
//
// Runs registered steps through the cache and prints one line per step:
//   {"build-cache":"reuse"|"build","step":"<step>","reason":"...","ms":<n>,"source":"stamp"|"store"|"command"}
// then resolves to the first failing step's exit code (0 when all reused or
// passed; 2 for a usage error, before anything runs). A reused step that
// replays its output (the structure audit) first prints that it passed at that
// fingerprint, then the output it printed then.
//
// With one step, the command after `--` is what a package.json script shows
// its reader; it must equal the registry's command for the step, and a
// mismatch fails before anything runs, so the script and the registry cannot
// drift apart silently. Without `--` the registry's command is run.
//
// Several steps run in the order given, or with `--parallel` side by side in
// workspace dependency order (`schedule-steps.mjs`).

import { CORE_REPOSITORY } from "../repository/index.mjs";
import { scheduleSteps } from "../schedule-steps.mjs";

const USAGE = 'Usage: node scripts/build-cache/cli.mjs <step> [-- "<command>"]\n       node scripts/build-cache/cli.mjs [--parallel] <step> <step>...';

/**
 * @param {string[]} argv the arguments after the script
 * @param {{ repository?: typeof CORE_REPOSITORY, env?: NodeJS.ProcessEnv, stdout?: { write(text: string): unknown }, stderr?: { write(text: string): unknown } }} [options]
 * @returns {Promise<number>} the exit code
 */
export async function runCli(argv, options = {}) {
  const repository = options.repository ?? CORE_REPOSITORY;
  const steps = repository.steps;
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const separator = argv.indexOf("--");
  const before = separator === -1 ? argv : argv.slice(0, separator);
  const parallel = before.includes("--parallel");
  const names = before.filter((argument) => argument !== "--parallel");
  const usage = (message) => {
    stderr.write(`${message}\n`);
    return 2;
  };
  if (names.length === 0 || names.some((name) => name.startsWith("--"))) return usage(`${USAGE}\nRegistered steps: ${Object.keys(steps).join(", ")}`);
  const unknown = names.find((name) => !Object.hasOwn(steps, name));
  if (unknown !== undefined) return usage(`build-cache: unknown step "${unknown}". Registered steps: ${Object.keys(steps).join(", ")}`);
  if (separator !== -1) {
    if (names.length !== 1) return usage("build-cache: a command after -- names the command of exactly one step.");
    const given = argv.slice(separator + 1).join(" ");
    const [name] = names;
    if (given !== steps[name].command) {
      return usage(`build-cache: the command passed for "${name}" is not the registered one.\n  passed:     ${given}\n  registered: ${steps[name].command}\nChange scripts/build-cache/steps.mjs and the package.json script together.`);
    }
  }

  const { exitCode } = await scheduleSteps(names, {
    repository,
    parallel,
    ...(options.env === undefined ? {} : { env: options.env }),
    onOutcome(outcome) {
      if (outcome.output) stdout.write(outcome.output.endsWith("\n") ? outcome.output : `${outcome.output}\n`);
      if (outcome.replay !== null) {
        stdout.write(`build-cache: ${outcome.step} passed at fingerprint ${String(outcome.fingerprint).slice(0, 12)} (${outcome.reason}); replaying the output it printed then:\n`);
        if (outcome.replay !== "") stdout.write(outcome.replay.endsWith("\n") ? outcome.replay : `${outcome.replay}\n`);
      }
      stdout.write(`${JSON.stringify({ "build-cache": outcome.result, step: outcome.step, reason: outcome.reason, ms: outcome.ms, source: outcome.source })}\n`);
    }
  });
  return exitCode;
}
