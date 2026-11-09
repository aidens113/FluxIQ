// Connects the way every API command does: the credential chain, with `--url` and `--profile` as explicit options.

import { FluxIQ, type ConnectOptions } from "../client/index.ts";
import type { CliIo } from "./cli-io.ts";
import type { ParsedFlags } from "./parse-flags.ts";

/** A connection for a command run with `flags`. */
export function connectFromFlags(flags: ParsedFlags, io: CliIo): Promise<FluxIQ> {
  const options: ConnectOptions = { env: io.env, cwd: io.cwd };
  if (typeof flags.values.url === "string") options.url = flags.values.url;
  if (typeof flags.values.profile === "string") options.profile = flags.values.profile;
  if (io.fetch !== undefined) options.fetch = io.fetch;
  return FluxIQ.connect(options);
}
