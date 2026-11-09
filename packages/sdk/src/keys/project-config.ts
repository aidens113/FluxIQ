// A project's `fluxiq.config.json`, found from a directory upward. It may name a
// `profile` and an `endpoint`; it never holds a key, and one found in it is refused.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { SdkError } from "../errors/index.ts";

export type ProjectConfig = { file: string; profile?: string; endpoint?: string };

const KEY_FIELDS = ["key", "apiKey", "privateKey", "private_key", "keyFile", "key_file", "secret"];

/** The nearest `fluxiq.config.json` at or above `from`, or `undefined`. */
export function readProjectConfig(from: string): ProjectConfig | undefined {
  let directory = path.resolve(from);
  for (;;) {
    const file = path.join(directory, "fluxiq.config.json");
    if (existsSync(file)) return parseProjectConfig(file);
    const parent = path.dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

function parseProjectConfig(file: string): ProjectConfig {
  let body: unknown;
  try {
    body = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new SdkError("key_unreadable", `${file} could not be read as JSON: ${error instanceof Error ? error.message : "unreadable"}.`, { cause: error });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new SdkError("key_unreadable", `${file} is not a JSON object.`);
  const record = body as Record<string, unknown>;
  const held = KEY_FIELDS.find((field) => field in record);
  if (held !== undefined) {
    throw new SdkError("key_insecure", `${file} has a "${held}" field. A project never holds a key.`, { hint: "Remove it; keep keys under ~/.fluxiq/keys/ and name a profile here instead." });
  }
  const config: ProjectConfig = { file };
  if (typeof record.profile === "string") config.profile = record.profile;
  if (typeof record.endpoint === "string") config.endpoint = record.endpoint;
  return config;
}
