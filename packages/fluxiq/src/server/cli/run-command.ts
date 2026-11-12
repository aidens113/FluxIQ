import { DEV_USAGE, parseDevArguments } from "./dev-arguments.ts";
import { createFluxNodeService } from "../../framework/automation-service/service/fluxnode/index.ts";
import { runDev, type DevServer } from "./run-dev.ts";

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
  const controller = new AbortController();
  let dev: DevServer | undefined;
  let stopping = false;
  const onSignal = (): void => {
    if (stopping) process.exit(130);
    stopping = true;
    controller.abort(new Error("The engine was stopped."));
    console.log("Stopping FluxIQ...");
    dev?.stop().then(
      () => process.exit(0),
      (error: unknown) => {
        console.error("[FluxIQ] FluxIQ did not stop cleanly:", error);
        process.exit(1);
      }
    );
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  process.on("SIGHUP", onSignal);
  if (process.platform === "win32") process.on("SIGBREAK", onSignal);
  if (process.connected) process.on("disconnect", onSignal);
  try {
    // Install shutdown handling before startup: the wrapper can die while a
    // browser is still launching, including on Windows where kill is abrupt.
    dev = await runDev(parsed.value, console.log, { signal: controller.signal,
      onHostFailure: () => process.exit(1),
      createFluxNodes: (fluxiq, hosts) => createFluxNodeService({ service: fluxiq.programs.automationStudio, domainId: fluxiq.activeDomainId, hosts })
    });
    if (stopping) {
      await dev.stop();
      return;
    }
    process.send?.({ type: "fluxiq.ready", apiUrl: dev.server.apiUrl, gatewayUrl: dev.server.gatewayUrl });
  } catch (error) {
    if (!stopping) throw error;
  }
}
