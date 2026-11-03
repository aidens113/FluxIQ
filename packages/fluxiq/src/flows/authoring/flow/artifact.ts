import type { AutomationStudioSchemaVersion } from "@fluxiq/contracts/recording";
import type { AutomationStudioFlowScope } from "../../executable/index.ts";
import type { AutomationStudioFlowVisibility } from "./index.ts";
import type { AutomationStudioFlowOrigin } from "./index.ts";
import type { AutomationStudioFlowSource } from "./index.ts";
import type { AutomationStudioFlowInterface } from "../../executable/interface/index.ts";
import type { AutomationStudioFlowErrorDefinition } from "../../executable/interface/index.ts";
import type { AutomationStudioFlowVariable } from "../../executable/interface/index.ts";
import type { AutomationStudioFlowRegion } from "../../executable/regions/index.ts";
import type { AutomationStudioFlowRegionHandoff } from "../../executable/regions/index.ts";
import type { AutomationStudioFlowNode } from "../../executable/graph/index.ts";
import type { AutomationStudioFlowEdge } from "../../executable/graph/index.ts";
import type { AutomationStudioFlowExecutionDefaults } from "../../executable/interface/index.ts";
import type { AutomationStudioFlowPublication } from "../publication/index.ts";
import type { AutomationStudioPublishedFlowSnapshot } from "../publication/index.ts";
import type { EvidenceReference } from "@fluxiq/contracts/recording";
import type { AutomationStudioFlowExpansionReferences } from "./index.ts";
import type { AutomationStudioFlowLegacyProvenance } from "./index.ts";
import type { JsonObject } from "../../../core/index.ts";

/**
 * Canonical, owner-independent Flow artifact for new authoring surfaces.
 *
 * It deliberately coexists with AutomationStudioFlowDocument while legacy
 * task/routine compatibility is implemented in the next migration slice.
 */
export type AutomationStudioFlowArtifact = {
  schemaVersion: AutomationStudioSchemaVersion;
  flowId: string;
  projectId: string;
  name: string;
  description?: string;
  scope: AutomationStudioFlowScope;
  visibility: AutomationStudioFlowVisibility;
  origin: AutomationStudioFlowOrigin;
  source: AutomationStudioFlowSource;
  interface: AutomationStudioFlowInterface;
  errors: AutomationStudioFlowErrorDefinition[];
  variables: AutomationStudioFlowVariable[];
  regions?: AutomationStudioFlowRegion[];
  regionHandoffs?: AutomationStudioFlowRegionHandoff[];
  nodes: AutomationStudioFlowNode[];
  edges: AutomationStudioFlowEdge[];
  executionDefaults?: AutomationStudioFlowExecutionDefaults;
  publication: AutomationStudioFlowPublication;
  /** Append-only snapshots. `publication` remains the current compatibility view. */
  publicationHistory?: AutomationStudioPublishedFlowSnapshot[];
  evidenceReferences?: EvidenceReference[];
  expansion?: AutomationStudioFlowExpansionReferences;
  legacyProvenance?: AutomationStudioFlowLegacyProvenance;
  createdAt: number;
  updatedAt: number;
  metadata?: JsonObject;
};
