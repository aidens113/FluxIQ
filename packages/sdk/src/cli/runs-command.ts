// `fluxiq runs`: lists runs, newest first.

import { FLUXNODE_RUN_STATES, type FluxNodeListRunsQuery } from "@fluxiq/contracts/fluxnode";
import { SdkError } from "../errors/index.ts";
import type { CliIo } from "./cli-io.ts";
import { connectFromFlags } from "./connect-from-flags.ts";
import { ENGINE_FLAGS, parseFlags } from "./parse-flags.ts";

/** `fluxiq runs [--name <fluxnode>] [--state <state>] [--limit <n>] [--json]`. */
export async function runsCommand(args: string[], io: CliIo): Promise<number> {
  const flags = parseFlags(args, { ...ENGINE_FLAGS, name: { type: "string" }, state: { type: "string" }, limit: { type: "string" }, cursor: { type: "string" } });
  const query: Partial<FluxNodeListRunsQuery> = {};
  if (typeof flags.values.name === "string") query.name = flags.values.name;
  if (typeof flags.values.state === "string") {
    if (!(FLUXNODE_RUN_STATES as readonly string[]).includes(flags.values.state)) throw new SdkError("cli", `--state is one of ${FLUXNODE_RUN_STATES.join(", ")}.`);
    query.state = flags.values.state as FluxNodeListRunsQuery["state"];
  }
  if (typeof flags.values.limit === "string") query.limit = Number(flags.values.limit);
  if (typeof flags.values.cursor === "string") query.cursor = flags.values.cursor;
  const page = await (await connectFromFlags(flags, io)).listRuns(query);
  if (flags.values.json === true) {
    io.out(`${JSON.stringify(page, null, 2)}\n`);
    return 0;
  }
  if (page.runs.length === 0) io.out("No runs.\n");
  for (const run of page.runs) {
    io.out(`${run.runId}  ${run.state.padEnd(18)} ${(run.path ?? "-").padEnd(9)} $${run.cost.usd.toFixed(4)}  ${run.name}  ${new Date(run.startedAt).toISOString()}\n`);
  }
  if (page.nextCursor !== undefined) io.out(`More runs: add --cursor ${page.nextCursor}\n`);
  return 0;
}
