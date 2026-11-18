import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nodeCommandRunner, type CommandRunner } from "../command/index.ts";
import { CLOUD_CONFIG_SCHEMA, loadCloudConfig } from "../config/index.ts";
import { createPlatformDriver, type DriverContext } from "../drivers/index.ts";
import { buildCloudPlan, writeBundle } from "../plan/index.ts";
import { runSmoke } from "../smoke/index.ts";
import { cloudStateStore } from "../state/index.ts";
import { formatStatus } from "./format-status.ts";
import { HELP_TEXT } from "./help-text.ts";
import { parseArguments, type CloudArguments } from "./parse-arguments.ts";

/** Where the command line writes and runs. */
export type CliIo = { out(text: string): void; err(text: string): void; cwd: string; platform: NodeJS.Platform };

/** What tests replace: the command runner, the sleep, and the package version. */
export type CliDeps = { runner?: CommandRunner; sleep?: (ms: number) => Promise<void>; packageVersion?: string };

/**
 * `fluxiq-cloud <command>`: answers the exit code (0 done, 1 failed, 2 a
 * wrong command line). Progress goes to `err`, results to `out`, and every
 * failure is one message saying what failed and what to do.
 */
export async function runCli(argv: readonly string[], io: CliIo, deps: CliDeps = {}): Promise<number> {
  let args: CloudArguments;
  try { args = parseArguments(argv); }
  catch (error) {
    io.err(`${(error as Error).message}\n\n${HELP_TEXT}`);
    return 2;
  }
  if (args.command === "help") {
    io.out(HELP_TEXT);
    return 0;
  }
  if (args.command === "schema") {
    io.out(`${JSON.stringify(CLOUD_CONFIG_SCHEMA, null, 2)}\n`);
    return 0;
  }
  try {
    await run(args, io, deps);
    return 0;
  } catch (error) {
    io.err(`fluxiq-cloud ${args.command}: ${(error as Error).message}\n`);
    return 1;
  }
}

async function run(args: CloudArguments, io: CliIo, deps: CliDeps): Promise<void> {
  const config = await loadCloudConfig(path.resolve(io.cwd, args.config));
  if (args.profile !== null && args.profile !== config.profile) throw new Error(`--profile ${args.profile} does not match the config's profile "${config.profile}".`);
  const version = deps.packageVersion ?? (await readPackageVersion());
  if (args.command === "render") {
    const deployFrom = await renderSource(config.sourceRoot);
    const plan = buildCloudPlan(config, version, deployFrom);
    const out = path.resolve(io.cwd, args.out ?? "");
    const files = await writeBundle(plan, out);
    io.out(`Validated ${config.configFile} (profile ${config.profile}) and wrote ${files.length} files to ${out.replace(/\\/gu, "/")}:\n${files.map((file) => `  ${file}`).join("\n")}\ndeploy/ files copied from ${deployFrom}. Nothing was deployed.\n`);
    return;
  }
  const context: DriverContext = {
    runner: deps.runner ?? nodeCommandRunner((text) => io.err(text)),
    log: (line) => io.err(`${line}\n`),
    sleep: deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    platform: io.platform
  };
  const driver = createPlatformDriver(config.driver, context, version);
  const plan = driver.plan(config);
  const state = (await cloudStateStore.read(plan.stateFile)) ?? cloudStateStore.empty(plan);
  if (args.command === "up") {
    const done = await driver.up(plan, { build: args.build });
    io.out(`${plan.project} is up.\nPanel: ${done.publicOrigin}\n${done.mailUi === null ? "" : `Mail (Mailpit): ${done.mailUi}\n`}${done.exportedCa === null ? "" : `Local root certificate (pin it): ${done.exportedCa}\n`}`);
  } else if (args.command === "down") {
    const report = await driver.down(state, { keepData: args.keepData, keepImages: args.keepImages });
    const { containers, networks, volumes, images, files } = report.removed;
    io.out(`${plan.project} is down${args.keepData ? " (data kept)" : ""}. Removed ${containers} containers, ${networks} networks, ${volumes} volumes, ${images} images, ${files} files.\n${report.kept.map((line) => `Kept ${line}\n`).join("")}`);
  } else if (args.command === "status") {
    const status = await driver.status(state);
    io.out(args.json ? `${JSON.stringify(status, null, 2)}\n` : formatStatus(status));
  } else {
    const steps = await runSmoke(plan, driver, context);
    io.out(`smoke passed: ${steps.length} checks (${steps.map((step) => step.name).join(", ")}).\n`);
  }
}

/**
 * Where `render` copies the deploy/ files from: the config's source checkout
 * when it exists on this machine, otherwise the Core checkout this package
 * runs from (rendering a server's config on a laptop, where /opt/... does
 * not exist). The output says which.
 */
async function renderSource(sourceRoot: string): Promise<string> {
  const configured = `${sourceRoot}/deploy`;
  try {
    await access(`${configured}/compose/service.compose.yml`);
    return configured;
  } catch {
    return fileURLToPath(new URL("../../../../deploy", import.meta.url)).replace(/\\/gu, "/").replace(/\/$/u, "");
  }
}

async function readPackageVersion(): Promise<string> {
  const manifest = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8")) as { version: string };
  return manifest.version;
}
