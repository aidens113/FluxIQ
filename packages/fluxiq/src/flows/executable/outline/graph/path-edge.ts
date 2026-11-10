import type { AutomationStudioFlowEdge } from "../../graph/index.ts";

/** One edge of the path, with the route it leaves by (`success` for a portless edge). */
export type OutlinePathEdge = { edge: AutomationStudioFlowEdge; port: string; target: string };
