import { stat } from "node:fs/promises";
import type { FluxIQ } from "../../../framework/index.ts";
import { claimFluxIQDataRoot, FluxIQDataRootHeldError, type ClaimFluxIQDataRootOptions } from "../../data-root-owner/index.ts";
import { loadFluxIQHostRegistration, resolveFluxIQHostModulePath } from "../../host-module/index.ts";
import { openHostInstance } from "../open-host-instance.ts";
import { parseStorageArguments, type StorageAction } from "./parse-arguments.ts";
import { STORAGE_USAGE } from "./usage.ts";

/** Where `fluxiq storage` writes; injected so it is testable without the process's own streams. */
export type StorageCommandIo = { stdout(text: string): void; stderr(text: string): void };

/** Tests only: claim options passed through (a shorter lease, another identity). */
export type StorageCommandOptions = { claim?: Omit<ClaimFluxIQDataRootOptions, "role" | "onWaiting"> };

/**
 * `fluxiq storage <inspect|setup|migrate|rollback> [--data-dir <dir>]`: the
 * operator's storage step, which the web panel's framework setup route used
 * to be (that route is operator-only, and refused outright on the hosted
 * service, where the root holds every tenant's workspace). It first claims
 * the data directory (`claimFluxIQDataRoot`) and holds it until the instance
 * it opened is closed, so it never changes storage that a running server
 * keeps its own live view of: while the web panel or `fluxiq dev` serves the
 * directory it is refused, naming that server, and changes nothing. The
 * instance is opened as the panel opens its own (`FLUXIQ_HOST_MODULE`), so a
 * domain's own legacy storage is found and migrated too.
 *
 * Prints the result as JSON on stdout. Returns the exit code: 0 done, 1
 * refused or failed (the reason on stderr), 2 usage.
 */
export async function runStorageCommand(argv: readonly string[], io: StorageCommandIo, options: StorageCommandOptions = {}): Promise<number> {
  const head = argv[0];
  if (head === "help" || head === "--help" || head === "-h") {
    io.stdout(`${STORAGE_USAGE}\n`);
    return 0;
  }
  const parsed = parseStorageArguments(argv);
  if (!parsed.ok) {
    io.stderr(`${parsed.error}\n\n${STORAGE_USAGE}\n`);
    return 2;
  }
  const { action, dataDir } = parsed.value;
  if (action !== "setup" && !await isDirectory(dataDir)) {
    io.stderr(`There is no FluxIQ data directory at ${dataDir}. Pass --data-dir, or run \`fluxiq storage setup\` to create one.\n`);
    return 1;
  }
  let claim;
  try {
    claim = await claimFluxIQDataRoot(dataDir, {
      ...options.claim,
      role: "fluxiq storage",
      onWaiting: (owner, waitMs) => io.stderr(`Checking whether ${owner ? `${owner.role} (process ${owner.pid} on ${owner.hostname})` : "the server recorded for this data directory"} is still running (up to ${Math.round(waitMs / 1000)} seconds)...\n`)
    });
  } catch (error) {
    if (!(error instanceof FluxIQDataRootHeldError)) throw error;
    io.stderr(`${error.message}\nfluxiq storage changes the data files directly, so it runs only while no server serves them.\n`);
    return 1;
  }
  let fluxiq: FluxIQ | undefined;
  let code: number;
  try {
    const hostPath = resolveFluxIQHostModulePath();
    fluxiq = await openHostInstance(dataDir, hostPath ? { path: hostPath, register: await loadFluxIQHostRegistration(hostPath) } : null);
    const result = await perform(fluxiq, action);
    io.stdout(`${JSON.stringify(result, null, 2)}\n`);
    code = 0;
  } catch (error) {
    io.stderr(`fluxiq storage ${action} failed: ${error instanceof Error ? error.message : String(error)}\n`);
    code = 1;
  }
  const [closing] = fluxiq ? await Promise.allSettled([fluxiq.close()]) : [];
  if (closing?.status === "rejected") {
    // The claim stays held until this process exits, so no server opens the data while it may still be written.
    io.stderr(`fluxiq storage could not close the data cleanly: ${closing.reason instanceof Error ? closing.reason.message : String(closing.reason)}\n`);
    return 1;
  }
  // Given up only once the instance is closed, so a server that starts next never opens it while this command still writes.
  await claim.release();
  return code;
}

async function perform(fluxiq: FluxIQ, action: StorageAction): Promise<unknown> {
  switch (action) {
    case "inspect":
      return fluxiq.inspectStorage();
    case "setup":
      return await fluxiq.setup();
    case "migrate":
      return await fluxiq.migrateStorage();
    case "rollback":
      return await fluxiq.rollbackStorageMigration();
  }
}

async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
