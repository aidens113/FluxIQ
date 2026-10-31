/** Where a multi-tenant (`service`) deployment keeps its platform state and workspaces. All paths are absolute. */
export type FluxIQLayoutV3Paths = {
  /** The platform instance's host root: the directory that holds the platform's `.fluxiq`. */
  dataRoot: string;
  /** The platform's own state root, `<dataRoot>/.fluxiq`. */
  platformFluxiqDir: string;
  /** The directory whose direct children are the tenant workspace roots. */
  workspacesDir: string;
  /** `<workspacesDir>/layout.json`. */
  markerPath: string;
};
