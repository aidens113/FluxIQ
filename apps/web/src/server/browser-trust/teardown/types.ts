import type { FluxIQ } from "fluxiq";
import type { FluxIQWorkspaceManager } from "../../../lib/workspaces";

export type CredentialTeardownRuntime = {
  primary: FluxIQ;
  manager: FluxIQWorkspaceManager;
  current(): boolean;
  release(): void;
};
