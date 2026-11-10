import os from "node:os";
import path from "node:path";

/** What `fluxiq dev` was asked for. */
export type DevArguments = {
  /** The data directory: the instance's root, whose `.fluxiq` holds its storage. */
  dataDir: string;
  /** The program API's port. */
  apiPort: number;
  /** The client gateway's port. */
  gatewayPort: number;
};

export const DEV_USAGE = [
  "Usage: fluxiq dev [--data-dir <dir>] [--port <port>] [--gateway-port <port>]",
  "",
  "Serves FluxIQ on 127.0.0.1 without the web panel: the program API and the client gateway.",
  "  --data-dir      Where FluxIQ keeps its data. Default: ~/.fluxiq/data",
  "  --port          The program API's port. Default: 3000",
  "  --gateway-port  The client gateway's port. Default: 4777",
  "The domain host module is loaded from FLUXIQ_HOST_MODULE, as the web panel loads it."
].join("\n");

const FLAGS = new Set(["--data-dir", "--port", "--gateway-port"]);

/** Reads `fluxiq dev`'s flags, `--flag value` or `--flag=value`; a refusal names what was wrong. */
export function parseDevArguments(argv: readonly string[], homeDir: string = os.homedir()): { ok: true; value: DevArguments } | { ok: false; error: string } {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    const equals = argument.indexOf("=");
    const flag = equals === -1 ? argument : argument.slice(0, equals);
    if (!FLAGS.has(flag)) return { ok: false, error: `Unknown argument: ${argument}` };
    const value = equals === -1 ? argv[(index += 1)] : argument.slice(equals + 1);
    if (value === undefined || value === "") return { ok: false, error: `${flag} needs a value.` };
    values.set(flag, value);
  }
  const apiPort = port(values.get("--port"), 3000);
  const gatewayPort = port(values.get("--gateway-port"), 4777);
  if (apiPort === null) return { ok: false, error: "--port must be a whole number from 0 to 65535." };
  if (gatewayPort === null) return { ok: false, error: "--gateway-port must be a whole number from 0 to 65535." };
  const dataDir = path.resolve(values.get("--data-dir") ?? path.join(homeDir, ".fluxiq", "data"));
  return { ok: true, value: { dataDir, apiPort, gatewayPort } };
}

function port(value: string | undefined, fallback: number): number | null {
  if (value === undefined) return fallback;
  if (!/^\d+$/u.test(value)) return null;
  const parsed = Number(value);
  return parsed <= 65535 ? parsed : null;
}
