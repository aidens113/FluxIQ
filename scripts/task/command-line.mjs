// Dispatching one task command. Output is one JSON object on stdout so a
// calling agent can read the result without parsing prose; anything a person
// needs to read -- progress, and whatever `pnpm check` prints -- goes to
// stderr.
//
// An extra positional is refused for the same reason an unknown flag is: an
// ignored argument is a typed intention that silently did not happen. `finish`
// is the exception, because everything after the id is the merge subject.

import { abandonTask } from "./abandon.mjs";
import { parseTaskArguments } from "./arguments.mjs";
import { finishTask } from "./finish.mjs";
import { listTasks } from "./list.mjs";
import { startTask } from "./start.mjs";

export async function runTaskCommandLine({ argv, repositoryRoot }) {
  const { command, positional, flags, values, usage } = parseTaskArguments(argv);
  const shared = { repositoryRoot, dryRun: Boolean(flags["dry-run"]) };

  if (command !== "finish" && positional.length > expected(command)) {
    throw new Error(`"${command}" takes ${expected(command)} argument(s), but was given ${positional.length} (${positional.join(", ")}). ${usage}.`);
  }

  if (command === "list") return { command, tasks: await listTasks(repositoryRoot) };

  if (command === "start") {
    return { command, ...await startTask({ ...shared, slug: positional[0], id: values.id, from: values.from ?? "dev" }) };
  }

  const id = positional[0];
  if (!id) throw new Error(`pnpm task ${command} needs a task id, for example "t042". Open tasks are listed by "pnpm task list".`);

  if (command === "finish") {
    return { command, ...await finishTask({ ...shared, id, skipChecks: Boolean(flags["skip-checks"]), title: positional.slice(1).join(" ") || undefined }) };
  }

  return { command, ...await abandonTask({ ...shared, id, force: Boolean(flags.force) }) };
}

const expected = (command) => (command === "list" ? 0 : 1);
