// `fluxiq learn <module>`: runs a FluxNode over sample inputs before deployment, so
// the first real run replays a learned Flow instead of exploring (plan, N7). The module
// is plain JavaScript (.mjs or .js) that exports FluxNodes made with `defineFluxNode`.

import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isFluxNode, type AnyFluxNode } from "../define/index.ts";
import { SdkError } from "../errors/index.ts";
import type { CliIo } from "./cli-io.ts";
import { connectFromFlags } from "./connect-from-flags.ts";
import { ENGINE_FLAGS, parseFlags } from "./parse-flags.ts";

function readSamples(flags: { values: Record<string, string | boolean | undefined> }, cwd: string): Array<Record<string, unknown>> {
  const file = flags.values.samples;
  const inline = flags.values.inputs;
  if (typeof file !== "string" && typeof inline !== "string") return [{}];
  let body: unknown;
  try {
    body = JSON.parse(typeof file === "string" ? readFileSync(path.resolve(cwd, file), "utf8") : (inline as string));
  } catch (error) {
    throw new SdkError("cli", `The sample inputs are not readable JSON: ${error instanceof Error ? error.message : "unreadable"}.`, { cause: error });
  }
  const list = Array.isArray(body) ? body : [body];
  if (!list.every((sample) => typeof sample === "object" && sample !== null && !Array.isArray(sample))) throw new SdkError("cli", "Each sample is a JSON object of inputs; give an object or a list of objects.");
  return list as Array<Record<string, unknown>>;
}

async function findNode(module: string, wanted: string | undefined, cwd: string): Promise<AnyFluxNode> {
  const namespace = (await import(pathToFileURL(path.resolve(cwd, module)).href)) as Record<string, unknown>;
  const nodes = Object.values(namespace).filter(isFluxNode);
  const chosen = wanted === undefined ? nodes : nodes.filter((node) => node.name === wanted);
  if (chosen.length === 1) return chosen[0] as AnyFluxNode;
  if (chosen.length === 0) throw new SdkError("cli", `${module} exports no FluxNode${wanted === undefined ? "" : ` named "${wanted}"`}.`, { hint: "Export the result of defineFluxNode(...), in a .js or .mjs module." });
  throw new SdkError("cli", `${module} exports ${chosen.length} FluxNodes (${chosen.map((node) => node.name).join(", ")}).`, { hint: "Pick one with --node <name>." });
}

/** `fluxiq learn <module> [--node <name>] [--samples <file.json> | --inputs <json>]`. Exit 0 only when every sample was achieved. */
export async function learnCommand(args: string[], io: CliIo): Promise<number> {
  const flags = parseFlags(args, { ...ENGINE_FLAGS, node: { type: "string" }, samples: { type: "string" }, inputs: { type: "string" } });
  const module = flags.positionals[0];
  if (module === undefined) throw new SdkError("cli", "Name the module: fluxiq learn <module> --samples <file.json>.");
  const node = await findNode(module, typeof flags.values.node === "string" ? flags.values.node : undefined, io.cwd);
  const samples = readSamples(flags, io.cwd);
  const fluxiq = await connectFromFlags(flags, io);
  let achieved = 0;
  for (const [index, sample] of samples.entries()) {
    const outcome = await fluxiq.run(node, sample, {});
    if (outcome.status === "achieved") achieved += 1;
    io.out(`sample ${index + 1}/${samples.length}: ${outcome.status}, path ${outcome.path}, $${outcome.cost.usd.toFixed(4)}${outcome.resumeHandle === undefined ? "" : `, resume ${outcome.resumeHandle}`}\n`);
  }
  io.out(`${achieved} of ${samples.length} samples achieved for ${node.name}.\n`);
  return achieved === samples.length ? 0 : 1;
}
