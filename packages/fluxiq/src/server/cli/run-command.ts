import { DEV_USAGE, parseDevArguments } from "./dev-arguments.ts";
import { runDev } from "./run-dev.ts";

const USAGE = ["Usage: fluxiq <command>", "", "Commands:", "  dev   Serve FluxIQ on 127.0.0.1 without the web panel", "", DEV_USAGE].join("\n");

/**
 * The `fluxiq` command. `dev` serves until Ctrl+C (or SIGTERM), then closes
 * its listeners and instance and exits; a second Ctrl+C exits at once.
 */
export async function runFluxIQCommand(argv: readonly string[]): Promise<void> {
  const [command, ...rest] = argv;
  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    console.log(USAGE);
    return;
  }
  if (command !== "dev") {
    console.error(`Unknown command: ${command}\n\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  const parsed = parseDevArguments(rest);
  if (!parsed.ok) {
    console.error(`${parsed.error}\n\n${DEV_USAGE}`);
    process.exitCode = 2;
    return;
  }
  const dev = await runDev(parsed.value);
  let stopping = false;
  const onSignal = (): void => {
    if (stopping) process.exit(130);
    stopping = true;
    console.log("Stopping FluxIQ...");
    dev.stop().then(
      () => process.exit(0),
      (error: unknown) => {
        console.error("[FluxIQ] FluxIQ did not stop cleanly:", error);
        process.exit(1);
      }
    );
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
}
