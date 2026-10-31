import { mkdir } from "node:fs/promises";
import { atomicWriteJson } from "../storage-layout.ts";
import { inspectFluxIQLayoutV3 } from "./inspect.ts";
import type { FluxIQLayoutV3Paths } from "./paths-type.ts";
import { FLUXIQ_LAYOUT_V3_VERSION } from "./version.ts";

/** Creates the workspaces directory and its marker. Idempotent; refuses an invalid layout. */
export async function initializeFluxIQLayoutV3(paths: FluxIQLayoutV3Paths): Promise<FluxIQLayoutV3Paths> {
  const inspection = inspectFluxIQLayoutV3(paths);
  if (inspection.layout === "invalid") throw new Error(`storage.layout_v3_invalid: ${inspection.reason}`);
  await mkdir(paths.workspacesDir, { recursive: true });
  if (inspection.layout === "fresh") {
    await atomicWriteJson(paths.markerPath, { layoutVersion: FLUXIQ_LAYOUT_V3_VERSION, createdBy: "fluxiq", createdAt: Date.now() });
  }
  return paths;
}
