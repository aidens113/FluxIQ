// `fluxiq pin <name>`: pins a FluxNode's learned Flow and writes it to a reviewable
// file in the developer's repository (plan, N8). A pinned FluxNode replays exactly
// that Flow; repairs wait as proposals until the next pin.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SdkError } from "../errors/index.ts";
import type { CliIo } from "./cli-io.ts";
import { connectFromFlags } from "./connect-from-flags.ts";
import { ENGINE_FLAGS, parseFlags } from "./parse-flags.ts";

/** `fluxiq pin <name> [--spec-hash <hash>] [--out <file>]`. The default file is `fluxiq/pinned/<name>.flow.json`. */
export async function pinCommand(args: string[], io: CliIo): Promise<number> {
  const flags = parseFlags(args, { ...ENGINE_FLAGS, "spec-hash": { type: "string" }, out: { type: "string" } });
  const name = flags.positionals[0];
  if (name === undefined) throw new SdkError("cli", "Name the FluxNode: fluxiq pin <name>.");
  const fluxiq = await connectFromFlags(flags, io);
  const options: { specHash?: string; pin: boolean } = { pin: true };
  if (typeof flags.values["spec-hash"] === "string") options.specHash = flags.values["spec-hash"];
  const exported = await fluxiq.exportFlow(name, options);
  const file = path.resolve(io.cwd, typeof flags.values.out === "string" ? flags.values.out : path.join("fluxiq", "pinned", `${name}.flow.json`));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(exported, null, 2)}\n`);
  io.out(`Pinned ${exported.name} (spec ${exported.specHash.slice(0, 12)}, Flow v${exported.flowVersion}). Wrote ${path.relative(io.cwd, file)}. Review it and commit it.\n`);
  return 0;
}
