import path from "node:path";
import type { FluxIQLayoutV3Paths } from "./paths-type.ts";

/** The v3 paths for one platform instance; `workspacesDir` may be moved to an operator volume. */
export function fluxiqLayoutV3Paths(dataRoot: string, options: { workspacesDir?: string } = {}): FluxIQLayoutV3Paths {
  const root = path.resolve(dataRoot);
  const workspacesDir = path.resolve(options.workspacesDir ?? path.join(root, "workspaces"));
  return {
    dataRoot: root,
    platformFluxiqDir: path.join(root, ".fluxiq"),
    workspacesDir,
    markerPath: path.join(workspacesDir, "layout.json")
  };
}
