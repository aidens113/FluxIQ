import type { ReusableModelContextPacket } from "./packet.ts";

export type ReusableModelContextPackingResult = {
  packet: ReusableModelContextPacket | null;
  selectedRecordIds: string[];
  selectedDigests: string[];
  selectedSourceRunIds: string[];
  selectedSourceAdaptationIds: string[];
  consideredCount: number;
  deduplicatedCount: number;
  excludedDispositionCount: number;
  packedBytes: number;
  estimatedTokens: number;
};
