// Reads a profile from `<config dir>/credentials`. The file holds no secret: a profile
// names an endpoint and the key file under `<config dir>/keys/`.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { SdkError } from "../errors/index.ts";
import { fluxiqConfigDir } from "./config-dir.ts";
import { parseIni } from "./ini.ts";

export type CredentialsProfile = { name: string; endpoint?: string; keyFile?: string; workspace?: string };

function expandHome(value: string): string {
  return value === "~" || value.startsWith("~/") || value.startsWith("~\\") ? path.join(homedir(), value.slice(1)) : value;
}

/**
 * The profile `name`, or `undefined` when the credentials file or the profile is
 * absent. A file that exists and cannot be read is an error.
 */
export function readCredentialsProfile(name: string, env: NodeJS.ProcessEnv = process.env): CredentialsProfile | undefined {
  const file = path.join(fluxiqConfigDir(env), "credentials");
  if (!existsSync(file)) return undefined;
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    throw new SdkError("key_unreadable", `The credentials file ${file} could not be read: ${error instanceof Error ? error.message : "unreadable"}.`, { cause: error });
  }
  const section = parseIni(text)[name];
  if (section === undefined) return undefined;
  const profile: CredentialsProfile = { name };
  if (section.endpoint !== undefined) profile.endpoint = section.endpoint;
  if (section.key_file !== undefined) profile.keyFile = path.resolve(expandHome(section.key_file));
  if (section.workspace !== undefined) profile.workspace = section.workspace;
  return profile;
}
