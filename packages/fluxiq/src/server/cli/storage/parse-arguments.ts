import os from "node:os";
import path from "node:path";

/** What `fluxiq storage` does to the data directory. */
export type StorageAction = "inspect" | "setup" | "migrate" | "rollback";

/** What `fluxiq storage` was asked for. */
export type StorageArguments = { action: StorageAction; dataDir: string };

const ACTIONS: readonly StorageAction[] = ["inspect", "setup", "migrate", "rollback"];

/**
 * Reads `fluxiq storage <action> [--data-dir <dir>]` (`--data-dir=<dir>` too).
 * The data directory defaults to `FLUXIQ_ROOT` (the web panel's), else
 * `~/.fluxiq/data` (`fluxiq dev`'s). A refusal names what was wrong.
 */
export function parseStorageArguments(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
  homeDir: string = os.homedir()
): { ok: true; value: StorageArguments } | { ok: false; error: string } {
  const [action, ...rest] = argv;
  if (action === undefined) return { ok: false, error: "Name what to do: inspect, setup, migrate or rollback." };
  if (!ACTIONS.includes(action as StorageAction)) return { ok: false, error: `Unknown storage action: ${action}` };
  let dataDir: string | undefined;
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index]!;
    const equals = argument.indexOf("=");
    const flag = equals === -1 ? argument : argument.slice(0, equals);
    if (flag !== "--data-dir") return { ok: false, error: `Unknown argument: ${argument}` };
    if (dataDir !== undefined) return { ok: false, error: "--data-dir may be given once." };
    const value = equals === -1 ? rest[(index += 1)] : argument.slice(equals + 1);
    if (value === undefined || value.trim() === "" || value.startsWith("--")) return { ok: false, error: "--data-dir needs a value." };
    dataDir = value;
  }
  const root = dataDir ?? (env.FLUXIQ_ROOT?.trim() || path.join(homeDir, ".fluxiq", "data"));
  return { ok: true, value: { action: action as StorageAction, dataDir: path.resolve(root) } };
}
