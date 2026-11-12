// `fluxiq dev`: the engine serves the FluxNode API itself, headless, with the panel
// optional. The SDK does not carry an engine, so this finds the engine package in the
// project and hands the command to its own `fluxiq dev`.

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CliIo } from "./cli-io.ts";

const NOT_INSTALLED = [
  "`fluxiq dev` runs the FluxIQ engine, and the engine is not installed in this project.",
  "Install it with `pnpm add -D fluxiq` (or npm or yarn), then run `fluxiq dev` again.",
  "Programs can also talk to an engine that is already running: FluxIQ.connect({ url }) or FLUXIQ_ENDPOINT."
].join("\n");

/** The engine package's manifest, found in the `node_modules` of `cwd` or a parent. */
function findEngineManifest(cwd: string): string | undefined {
  let directory = path.resolve(cwd);
  for (;;) {
    const candidate = path.join(directory, "node_modules", "fluxiq", "package.json");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

/** The engine's own `fluxiq` bin script, or `undefined` when the engine is not installed or ships no such bin. */
function findEngineBin(cwd: string): string | undefined {
  const manifestPath = findEngineManifest(cwd);
  if (manifestPath === undefined) return undefined;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { bin?: string | Record<string, string> };
  const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.fluxiq;
  if (bin === undefined) return undefined;
  const script = path.resolve(path.dirname(manifestPath), bin);
  return existsSync(script) ? script : undefined;
}

/** `fluxiq dev [engine flags]`: runs the engine's `fluxiq dev`, passing the flags on and its exit code back. */
export function devCommand(args: string[], io: CliIo): Promise<number> {
  const script = findEngineBin(io.cwd);
  if (script === undefined) {
    io.err(`${NOT_INSTALLED}\n`);
    return Promise.resolve(1);
  }
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, "dev", ...args], { cwd: io.cwd, env: io.env, stdio: ["inherit", "inherit", "inherit", "ipc"], windowsHide: true });
    child.on("error", (error) => {
      io.err(`Could not start the engine: ${error.message}\n`);
      resolve(1);
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}
