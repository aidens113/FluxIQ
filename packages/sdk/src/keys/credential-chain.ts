// The credential chain (plan, K3, K8): the first source that names a key wins, and a
// key that was named and cannot be used is an error, never a step down the chain.
//
//   1. an explicit option: `apiKey` (the key itself), `keyFile`, or `profile`;
//   2. `FLUXIQ_KEY`, then `FLUXIQ_KEY_FILE`;
//   3. `FLUXIQ_KEY_PROFILE`;
//   4. a `profile` named in the project's `fluxiq.config.json`;
//   5. the `[default]` profile of `~/.fluxiq/credentials`, when that file has one;
//   6. nothing: open mode, which only a local engine accepts.
//
// A profile's key file must live under `~/.fluxiq/keys/`.

import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { SdkError } from "../errors/index.ts";
import { fluxiqKeysDir } from "./keys-dir.ts";
import { loadPrivateKeyFile, loadPrivateKeyText } from "./load-private-key.ts";
import type { LoadedKey } from "./loaded-key.ts";
import { readCredentialsProfile } from "./credentials-profile.ts";
import { readProjectConfig } from "./project-config.ts";

export type CredentialOptions = { apiKey?: string; keyFile?: string; profile?: string };

/**
 * - `key`: what signs;
 * - `explicit`: true when the program or its environment named this key, false for the
 *   implicit `[default]` profile (the engine's own first-start key);
 * - `endpoint`: the profile's or the project's engine address, when it names one.
 */
export type ResolvedCredential = { key: LoadedKey; explicit: boolean; endpoint?: string };

export type ChainContext = { env: NodeJS.ProcessEnv; cwd: string };

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function keyFromProfile(name: string, explicit: boolean, context: ChainContext, projectEndpoint?: string): ResolvedCredential | undefined {
  const profile = readCredentialsProfile(name, context.env);
  if (profile === undefined) {
    if (!explicit) return undefined;
    throw new SdkError("key_missing", `The credentials profile "${name}" was named, but ${path.join(path.dirname(fluxiqKeysDir(context.env)), "credentials")} has no [${name}] section.`, { hint: "Run `fluxiq init`, or name a profile that exists." });
  }
  if (profile.keyFile === undefined) {
    if (!explicit) return undefined;
    throw new SdkError("key_missing", `The profile "${name}" has no key_file.`);
  }
  const keys = fluxiqKeysDir(context.env);
  const real = existsSync(profile.keyFile) ? realpathSync(profile.keyFile) : profile.keyFile;
  const realKeys = existsSync(keys) ? realpathSync(keys) : keys;
  if (!isInside(keys, profile.keyFile) || !isInside(realKeys, real)) {
    throw new SdkError("key_unreadable", `The profile "${name}" points at ${profile.keyFile}, outside ${keys}. Private keys live only under that folder.`, { hint: "Move the key there, or use FLUXIQ_KEY_FILE for a key you keep elsewhere on purpose." });
  }
  const endpoint = profile.endpoint ?? projectEndpoint;
  const key = loadPrivateKeyFile(profile.keyFile, `profile "${name}"`);
  return endpoint === undefined ? { key, explicit } : { key, explicit, endpoint };
}

/** Walks the chain. `undefined` means no key was named anywhere: open mode. */
export function resolveCredential(options: CredentialOptions, context: ChainContext): ResolvedCredential | undefined {
  const { env } = context;
  if (options.apiKey !== undefined) return { key: loadPrivateKeyText(options.apiKey, "the apiKey option"), explicit: true };
  if (options.keyFile !== undefined) return { key: loadPrivateKeyFile(path.resolve(context.cwd, options.keyFile), "the keyFile option"), explicit: true };
  if (options.profile !== undefined) return keyFromProfile(options.profile, true, context);
  if (env.FLUXIQ_KEY !== undefined && env.FLUXIQ_KEY !== "") return { key: loadPrivateKeyText(env.FLUXIQ_KEY, "FLUXIQ_KEY"), explicit: true };
  if (env.FLUXIQ_KEY_FILE !== undefined && env.FLUXIQ_KEY_FILE !== "") return { key: loadPrivateKeyFile(path.resolve(context.cwd, env.FLUXIQ_KEY_FILE), "FLUXIQ_KEY_FILE"), explicit: true };
  if (env.FLUXIQ_KEY_PROFILE !== undefined && env.FLUXIQ_KEY_PROFILE !== "") return keyFromProfile(env.FLUXIQ_KEY_PROFILE, true, context);
  const project = readProjectConfig(context.cwd);
  if (project?.profile !== undefined) return keyFromProfile(project.profile, true, context, project.endpoint);
  return keyFromProfile("default", false, context, project?.endpoint);
}
