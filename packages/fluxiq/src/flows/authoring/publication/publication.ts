import type { AutomationStudioFlowInterface } from "../../executable/interface/index.ts";
import type { AutomationStudioPublishedFlowSnapshot } from "./index.ts";

export type AutomationStudioFlowPublication =
  | { status: "draft" }
  | { status: "publishable" }
  | {
    status: "published" | "deprecated";
    version: string;
    publishedAt: number;
    interface: AutomationStudioFlowInterface;
    flowDigest: string;
    /** Immutable graph/interface snapshot used by pinned composite callers. */
    snapshot?: AutomationStudioPublishedFlowSnapshot;
  };
