import type { JsonObject } from "../../core.js";

export type ActionChannelDescriptor = {
  id: string;
  label: string;
  actionTypes: string[];
  capabilities?: string[];
  metadata?: JsonObject;
};
