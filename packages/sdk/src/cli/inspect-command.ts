// `fluxiq inspect <runId>`: one run's state and result, and with --events its events.

import { SdkError } from "../errors/index.ts";
import type { CliIo } from "./cli-io.ts";
import { connectFromFlags } from "./connect-from-flags.ts";
import { ENGINE_FLAGS, parseFlags } from "./parse-flags.ts";

/** `fluxiq inspect <runId> [--events] [--json]`. */
export async function inspectCommand(args: string[], io: CliIo): Promise<number> {
  const flags = parseFlags(args, { ...ENGINE_FLAGS, events: { type: "boolean" } });
  const runId = flags.positionals[0];
  if (runId === undefined) throw new SdkError("cli", "Name the run: fluxiq inspect <runId>.");
  const fluxiq = await connectFromFlags(flags, io);
  const state = await fluxiq.getRun(runId);
  const events = [];
  if (flags.values.events === true) for await (const event of fluxiq.follow(runId)) events.push(event);
  if (flags.values.json === true) {
    io.out(`${JSON.stringify(flags.values.events === true ? { run: state, events } : state, null, 2)}\n`);
    return 0;
  }
  io.out(`${state.name}  ${state.state}  $${state.cost.usd.toFixed(4)} spent\n`);
  const result = state.result;
  if (result !== undefined) {
    io.out(`  path ${result.path}, verdict ${result.verdict.label}${result.verdict.by === undefined ? "" : ` by ${result.verdict.by}`}, ${result.cost.calls} model calls, ${result.timings.durationMs} ms\n`);
    if (result.waitingFor !== undefined) io.out(`  waiting for a person: ${result.waitingFor}\n`);
    if (result.resumeHandle !== undefined) io.out(`  resume handle: ${result.resumeHandle}\n`);
    if (result.outputs !== undefined) io.out(`  outputs: ${JSON.stringify(result.outputs)}\n`);
  }
  for (const event of events) io.out(`  #${event.seq} ${event.type}${event.type === "step" ? ` ${event.state} ${event.label}` : ""}\n`);
  return 0;
}
