import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FluxIQ } from "fluxiq";

// Test support for the local owner claim: a real FluxIQ instance in a
// temporary root, started as the web panel starts a local one (unclaimed) or
// as an install made before that (the default admin on its temporary
// password). Every password here is synthetic.

export type LocalInstance = { root: string; fluxiq: FluxIQ; close(): Promise<void> };

const PREFIX = "fluxiq-local-claim-";

export async function createLocalInstance(start: "new-install" | "existing-install"): Promise<LocalInstance> {
  const root = await mkdtemp(path.join(os.tmpdir(), PREFIX));
  const open = async () => {
    const fluxiq = FluxIQ.create({ rootDir: root, loadEnv: false, modelProvidersEnabled: false });
    await fluxiq.setup();
    return fluxiq;
  };
  let fluxiq = await open();
  if (start === "new-install") {
    fluxiq.programs.identityAccess.firstRun.startUnclaimed();
  } else {
    // An install from before: the store was first opened with the temporary admin, then the panel restarted.
    await fluxiq.programs.identityAccess.snapshot();
    await fluxiq.close();
    fluxiq = await open();
    fluxiq.programs.identityAccess.firstRun.startUnclaimed();
  }
  return {
    root,
    fluxiq,
    async close() {
      await fluxiq.close();
      if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith(PREFIX)) throw new Error("Invalid synthetic local-claim cleanup target.");
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  };
}
