import type { JsonObject } from "../../../core/index.ts";

export type EnvironmentDescriptor = {
  id: string;
  label: string;
  kind: string;
  domainId?: string | null;
  capabilities?: string[];
  metadata?: JsonObject;
};

export type SourceDescriptor = {
  id: string;
  label: string;
  kind: "state" | "action" | "event" | "note" | "observation" | "derived";
  schemaId?: string;
  schemaVersion?: string;
  metadata?: JsonObject;
};

export type ActionChannelDescriptor = {
  id: string;
  label: string;
  actionTypes: string[];
  capabilities?: string[];
  metadata?: JsonObject;
};
