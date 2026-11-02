import type { ExecutableGraph, ExecutableFlow } from "../../graph/index.ts";
import type { AutomationStudioFlowRegion, AutomationStudioFlowRegionHandoff } from "../index.ts";
export type RegionExecutionPlan = { regions: Array<AutomationStudioFlowRegion & { nodeIds: string[] }>; handoffs: AutomationStudioFlowRegionHandoff[]; nodeRegionIds: Record<string, string> };

export type RegionCompilationGraph = Pick<ExecutableGraph, "nodes" | "edges"> & Partial<Pick<ExecutableFlow, "regions" | "regionHandoffs" | "scope">>;
