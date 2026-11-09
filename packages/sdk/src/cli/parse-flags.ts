// Reads a command's flags with node's own parser, turning its complaints into the CLI's error.

import { parseArgs, type ParseArgsConfig } from "node:util";
import { SdkError } from "../errors/index.ts";

type FlagSpec = NonNullable<ParseArgsConfig["options"]>;

/** The flags every command that talks to the engine takes. */
export const ENGINE_FLAGS = { url: { type: "string" }, profile: { type: "string" }, json: { type: "boolean" } } as const satisfies FlagSpec;

export type ParsedFlags = { values: Record<string, string | boolean | undefined>; positionals: string[] };

/** Parses `args` against `options`. An unknown flag or a missing value is an `SdkError` of code `cli`. */
export function parseFlags(args: string[], options: FlagSpec): ParsedFlags {
  try {
    const { values, positionals } = parseArgs({ args, options, allowPositionals: true, strict: true });
    return { values: values as ParsedFlags["values"], positionals };
  } catch (error) {
    throw new SdkError("cli", error instanceof Error ? error.message : "The command line could not be read.", { hint: "Run `fluxiq help` for the commands and their flags." });
  }
}
