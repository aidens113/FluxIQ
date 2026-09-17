// Reading the command line. Every flag is explicit, and a flag is refused both
// when nothing knows it and when this command does not: `--skip-checks` handed
// to `start` would otherwise be dropped in silence, and the person who typed it
// would believe a check had been waived that was never going to run. The same
// goes for a typo -- a dropped `--dry-run` is the difference between a report
// and a branch.

const GLOBAL_FLAGS = ["dry-run"];

// What each command accepts beyond the global flags. `values` take the next
// token; `flags` stand alone.
const COMMANDS = {
  start: { flags: [], values: ["id", "from"], usage: "pnpm task start <slug> [--id t<NNN>] [--from BRANCH]" },
  finish: { flags: ["skip-checks"], values: [], usage: "pnpm task finish <id> [title words...] [--skip-checks]" },
  abandon: { flags: ["force"], values: [], usage: "pnpm task abandon <id> [--force]" },
  list: { flags: [], values: [], usage: "pnpm task list" }
};

export function parseTaskArguments(argv) {
  const [command, ...rest] = argv;
  if (!command) throw new Error(`Name a command: ${names()}.`);
  if (!Object.hasOwn(COMMANDS, command)) throw new Error(`Unknown command "${command}". Use ${names()}.`);

  const accepted = COMMANDS[command];
  const flags = new Set([...accepted.flags, ...GLOBAL_FLAGS]);
  const values = new Set(accepted.values);
  const options = { command, positional: [], flags: {}, values: {}, usage: accepted.usage };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      options.positional.push(token);
      continue;
    }

    const name = token.slice(2);
    if (flags.has(name)) {
      options.flags[name] = true;
    } else if (values.has(name)) {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`${token} needs a value.`);
      options.values[name] = value;
      index += 1;
    } else {
      throw new Error(`${token} is not a flag of "${command}"${elsewhere(name, command)}. ${accepted.usage}, and every command takes --dry-run.`);
    }
  }

  return options;
}

const names = () => Object.keys(COMMANDS).join(", ");

// Naming the command a flag does belong to turns "unknown flag" into an
// instruction, which is the difference between the two ways this goes wrong: a
// typo, and a flag aimed at the wrong step of the lifecycle.
function elsewhere(name, command) {
  const owners = Object.entries(COMMANDS)
    .filter(([other, accepted]) => other !== command && (accepted.flags.includes(name) || accepted.values.includes(name)))
    .map(([other]) => other);
  return owners.length === 0 ? "" : `; it belongs to ${owners.join(" and ")}`;
}
