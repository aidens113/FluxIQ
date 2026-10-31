import { readFileSync } from "node:fs";
import { programStateRoot } from "../../programs/_shared/state-root.ts";
import type { FluxIQLayoutV3Paths } from "./paths-type.ts";
import { FLUXIQ_LAYOUT_V3_VERSION } from "./version.ts";

export type FluxIQLayoutV3Inspection = { layout: "fresh" | "v3" | "invalid"; reason?: string };

/** Whether the workspaces directory is unused, a valid v3 layout, or unusable (reason given). Reads only. */
export function inspectFluxIQLayoutV3(paths: FluxIQLayoutV3Paths): FluxIQLayoutV3Inspection {
  let owner: { dir: string } | null;
  try {
    owner = programStateRoot(paths.workspacesDir);
  } catch (error) {
    return { layout: "invalid", reason: `a storage config above the workspaces directory is unreadable: ${(error as Error).message}` };
  }
  if (owner) return { layout: "invalid", reason: `the workspaces directory lies inside the storage root ${owner.dir}` };
  let text: string;
  try {
    text = readFileSync(paths.markerPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { layout: "fresh" };
    return { layout: "invalid", reason: `the layout marker is unreadable: ${(error as Error).message}` };
  }
  try {
    const marker = JSON.parse(text) as { layoutVersion?: unknown };
    if (marker.layoutVersion === FLUXIQ_LAYOUT_V3_VERSION) return { layout: "v3" };
    return { layout: "invalid", reason: `the layout marker has version ${JSON.stringify(marker.layoutVersion)}, not ${FLUXIQ_LAYOUT_V3_VERSION}` };
  } catch {
    return { layout: "invalid", reason: "the layout marker is not valid JSON" };
  }
}
