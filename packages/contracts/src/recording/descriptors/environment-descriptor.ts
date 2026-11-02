import type { JsonObject } from "../../core.js";

export type EnvironmentDescriptor = {
  id: string;
  label: string;
  kind: string;
  domainId?: string | null;
  capabilities?: string[];
  metadata?: JsonObject;
};
