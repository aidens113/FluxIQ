import type { JsonObject } from "../../../core/index.ts";

export type GeneratedMetadata = {
  generatedBy: "user" | "assistant" | "signal_miner" | "runtime_trainer" | "import" | "migration";
  generatedAt: number;
  model?: string;
  promptId?: string;
  confidence?: number;
  metadata?: JsonObject;
};
