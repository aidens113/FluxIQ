import type {
  AutomationConditionExpression,
} from "./conditions.ts";
import type {
  PolicyGraph,
} from "./policies.ts";
import type {
  RecordingSession,
} from "./recordings.ts";
import type {
  SignalRegistry,
} from "./signals.ts";
import type {
  TimelineEntry
} from "./timeline.ts";
import type {
  AutomationStudioFlowArtifact,
  AutomationStudioFlowInterface,
  AutomationStudioFlowPort,
  AutomationStudioFlowValueType,
  AutomationStudioFlowVariable
} from "./flows.ts";
import { validateAutomationStudioFlowRegions } from "./regions.ts";
import type { JsonValue } from "../../../core/index.ts";

export type AutomationStudioValidationSeverity = "error" | "warning" | "info";

export type AutomationStudioValidationIssue = {
  severity: AutomationStudioValidationSeverity;
  code: string;
  message: string;
  path: string;
};

export type AutomationStudioValidationResult = {
  ok: boolean;
  issues: AutomationStudioValidationIssue[];
};

export function validateRecordingSession(recording: RecordingSession): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  const entryIds = new Set<string>();
  const noteIds = new Set(recording.notes.map((note) => note.id));
  const sourceIds = new Set(recording.sources.map((source) => source.id));

  if (!recording.recordingId) {
    addIssue(issues, "error", "recording.missing_id", "Recording must have a recordingId.", "recordingId");
  }
  if (recording.initialState.timestamp < recording.startedAt) {
    addIssue(issues, "warning", "recording.initial_state_before_start", "Initial state timestamp is before recording start.", "initialState.timestamp");
  }
  if (recording.endedAt !== undefined && recording.endedAt < recording.startedAt) {
    addIssue(issues, "error", "recording.ends_before_start", "Recording endedAt must be greater than or equal to startedAt.", "endedAt");
  }

  let previousSequence = -1;
  for (const [index, entry] of recording.timeline.entries()) {
    const path = `timeline.${index}`;
    if (entry.recordingId !== recording.recordingId) {
      addIssue(issues, "error", "timeline.recording_id_mismatch", "Timeline entry recordingId must match the parent recording.", `${path}.recordingId`);
    }
    if (entryIds.has(entry.id)) {
      addIssue(issues, "error", "timeline.duplicate_entry_id", `Duplicate timeline entry id "${entry.id}".`, `${path}.id`);
    }
    entryIds.add(entry.id);
    if (entry.sequence <= previousSequence) {
      addIssue(issues, "error", "timeline.sequence_not_increasing", "Timeline entry sequence values must be strictly increasing.", `${path}.sequence`);
    }
    previousSequence = entry.sequence;
    if (!sourceIds.has(entry.sourceId)) {
      addIssue(issues, "warning", "timeline.unknown_source", `Timeline entry references unknown source "${entry.sourceId}".`, `${path}.sourceId`);
    }
    validateTimelineEntry(entry, issues, path, noteIds);
  }

  for (const [index, note] of recording.notes.entries()) {
    const path = `notes.${index}`;
    for (const linkedEntryId of note.linkedEntryIds ?? []) {
      if (!entryIds.has(linkedEntryId)) {
        addIssue(issues, "warning", "note.missing_linked_entry", `Note links to missing timeline entry "${linkedEntryId}".`, `${path}.linkedEntryIds`);
      }
    }
  }

  return result(issues);
}

export function validateSignalRegistry(registry: SignalRegistry): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  const paths = new Set<string>();

  for (const [index, definition] of registry.definitions.entries()) {
    const path = `definitions.${index}`;
    if (!definition.path) {
      addIssue(issues, "error", "signal.missing_path", "Signal definition must have a path.", `${path}.path`);
    }
    if (paths.has(definition.path)) {
      addIssue(issues, "error", "signal.duplicate_path", `Duplicate signal path "${definition.path}".`, `${path}.path`);
    }
    paths.add(definition.path);
    if (definition.defaultWeight < 0 || definition.defaultWeight > 1) {
      addIssue(issues, "error", "signal.invalid_weight", "Signal defaultWeight must be between 0 and 1.", `${path}.defaultWeight`);
    }
    if (definition.derived && !definition.provenance) {
      addIssue(issues, "warning", "signal.derived_without_provenance", "Derived signals should retain extractor provenance.", `${path}.provenance`);
    }
  }

  return result(issues);
}

export function validatePolicyGraph(policy: PolicyGraph): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();

  for (const [index, node] of policy.nodes.entries()) {
    const path = `nodes.${index}`;
    if (nodeIds.has(node.id)) {
      addIssue(issues, "error", "policy.duplicate_node_id", `Duplicate policy node id "${node.id}".`, `${path}.id`);
    }
    nodeIds.add(node.id);
    if (node.actions.length === 0) {
      addIssue(issues, "warning", "policy.node_without_actions", `Policy node "${node.id}" has no actions.`, `${path}.actions`);
    }
    if (node.timeout.timeoutMs <= 0) {
      addIssue(issues, "error", "policy.invalid_timeout", "Node timeoutMs must be greater than zero.", `${path}.timeout.timeoutMs`);
    }
    if (node.retry.maxAttempts < 0) {
      addIssue(issues, "error", "policy.invalid_retry", "Node retry maxAttempts must be zero or greater.", `${path}.retry.maxAttempts`);
    }
    validateConditionExpression(node.eligibility, issues, `${path}.eligibility`);
    validateConditionExpression(node.successConditions, issues, `${path}.successConditions`);
    if (node.readinessConditions) validateConditionExpression(node.readinessConditions, issues, `${path}.readinessConditions`);
    if (node.failureConditions) validateConditionExpression(node.failureConditions, issues, `${path}.failureConditions`);
    if (node.invariants) validateConditionExpression(node.invariants, issues, `${path}.invariants`);
  }

  for (const [index, edge] of policy.edges.entries()) {
    const path = `edges.${index}`;
    if (edgeIds.has(edge.id)) {
      addIssue(issues, "error", "policy.duplicate_edge_id", `Duplicate policy edge id "${edge.id}".`, `${path}.id`);
    }
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.fromNodeId)) {
      addIssue(issues, "error", "policy.edge_missing_from_node", `Policy edge references missing fromNodeId "${edge.fromNodeId}".`, `${path}.fromNodeId`);
    }
    if (!nodeIds.has(edge.toNodeId)) {
      addIssue(issues, "error", "policy.edge_missing_to_node", `Policy edge references missing toNodeId "${edge.toNodeId}".`, `${path}.toNodeId`);
    }
    if (edge.probability !== undefined && (edge.probability < 0 || edge.probability > 1)) {
      addIssue(issues, "error", "policy.invalid_edge_probability", "Policy edge probability must be between 0 and 1.", `${path}.probability`);
    }
    if (edge.condition) validateConditionExpression(edge.condition, issues, `${path}.condition`);
  }

  for (const [nodeIndex, node] of policy.nodes.entries()) {
    for (const [edgeIndex, edge] of node.outgoingEdges.entries()) {
      const path = `nodes.${nodeIndex}.outgoingEdges.${edgeIndex}`;
      if (edge.fromNodeId !== node.id) {
        addIssue(issues, "error", "policy.node_edge_from_mismatch", "Node outgoing edge fromNodeId must match the owning node.", `${path}.fromNodeId`);
      }
      if (!nodeIds.has(edge.toNodeId)) {
        addIssue(issues, "error", "policy.node_edge_missing_to_node", `Node outgoing edge references missing toNodeId "${edge.toNodeId}".`, `${path}.toNodeId`);
      }
    }
  }

  return result(issues);
}

/**
 * Validates the owner-independent Flow contract used by new authoring paths.
 * Node-definition/port resolution is intentionally deferred until the node
 * registry contract exists; this validator only proves local graph structure.
 */
export function validateAutomationStudioFlow(flow: AutomationStudioFlowArtifact): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  if (!flow.flowId.trim()) addIssue(issues, "error", "flow.missing_id", "Flow must have a flowId.", "flowId");
  if (!flow.projectId.trim()) addIssue(issues, "error", "flow.missing_project_id", "Flow must have a projectId.", "projectId");
  if (!flow.name.trim()) addIssue(issues, "error", "flow.missing_name", "Flow must have a name.", "name");
  if (flow.updatedAt < flow.createdAt) addIssue(issues, "error", "flow.updated_before_created", "Flow updatedAt must be greater than or equal to createdAt.", "updatedAt");

  if (flow.scope.kind === "domain" && !flow.scope.domainId.trim()) {
    addIssue(issues, "error", "flow.missing_domain_id", "Domain-scoped Flow must have a domainId.", "scope.domainId");
  }
  if (flow.source.mode === "code" && !flow.source.moduleId.trim()) {
    addIssue(issues, "error", "flow.missing_code_module", "Code-owned Flow must have a moduleId.", "source.moduleId");
  }
  if (flow.source.mode === "code" && (!flow.source.sourceDigest?.trim() || !flow.source.compiledDigest?.trim() || !flow.source.compilerVersion?.trim())) {
    addIssue(issues, "error", "flow.incomplete_code_compilation", "Code-owned Flow must retain source, compiler, and compiled-plan digests.", "source");
  }

  validateFlowInterface(flow.interface, issues, "interface");
  validateFlowVariables(flow.variables, issues);
  validateFlowErrors(flow.errors, issues);
  validateFlowGraph(flow, issues);
  issues.push(...validateAutomationStudioFlowRegions({
    ...(flow.regions ? { regions: flow.regions } : {}),
    ...(flow.regionHandoffs ? { handoffs: flow.regionHandoffs } : {}),
    nodeIds: flow.nodes.map((node) => node.id),
    scope: flow.scope
  }).issues);
  validateFlowExecutionDefaults(flow, issues);
  validateFlowPublication(flow, issues);
  return result(issues);
}

function validateFlowInterface(
  value: AutomationStudioFlowInterface,
  issues: AutomationStudioValidationIssue[],
  path: string
): void {
  validateFlowPorts(value.inputs, issues, `${path}.inputs`);
  validateFlowPorts(value.outputs, issues, `${path}.outputs`);
}

function validateFlowPorts(ports: AutomationStudioFlowPort[], issues: AutomationStudioValidationIssue[], path: string): void {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const [index, port] of ports.entries()) {
    const portPath = `${path}.${index}`;
    if (!port.id.trim()) addIssue(issues, "error", "flow.port_missing_id", "Flow port must have an id.", `${portPath}.id`);
    if (!port.name.trim()) addIssue(issues, "error", "flow.port_missing_name", "Flow port must have a name.", `${portPath}.name`);
    if (ids.has(port.id)) addIssue(issues, "error", "flow.duplicate_port_id", `Duplicate Flow port id "${port.id}".`, `${portPath}.id`);
    if (names.has(port.name)) addIssue(issues, "error", "flow.duplicate_port_name", `Duplicate Flow port name "${port.name}".`, `${portPath}.name`);
    ids.add(port.id);
    names.add(port.name);
    validateFlowValueType(port.valueType, issues, `${portPath}.valueType`);
    if (port.defaultValue !== undefined && !valueMatchesFlowType(port.defaultValue, port.valueType)) {
      addIssue(issues, "error", "flow.port_default_type_mismatch", `Default value for port "${port.id}" does not match its declared type.`, `${portPath}.defaultValue`);
    }
  }
}

function validateFlowVariables(variables: AutomationStudioFlowVariable[], issues: AutomationStudioValidationIssue[]): void {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const [index, variable] of variables.entries()) {
    const path = `variables.${index}`;
    if (!variable.id.trim()) addIssue(issues, "error", "flow.variable_missing_id", "Flow variable must have an id.", `${path}.id`);
    if (!variable.name.trim()) addIssue(issues, "error", "flow.variable_missing_name", "Flow variable must have a name.", `${path}.name`);
    if (ids.has(variable.id)) addIssue(issues, "error", "flow.duplicate_variable_id", `Duplicate Flow variable id "${variable.id}".`, `${path}.id`);
    if (names.has(variable.name)) addIssue(issues, "error", "flow.duplicate_variable_name", `Duplicate Flow variable name "${variable.name}".`, `${path}.name`);
    ids.add(variable.id);
    names.add(variable.name);
    validateFlowValueType(variable.valueType, issues, `${path}.valueType`);
    if (variable.initialValue !== undefined && !valueMatchesFlowType(variable.initialValue, variable.valueType)) {
      addIssue(issues, "error", "flow.variable_initial_type_mismatch", `Initial value for variable "${variable.id}" does not match its declared type.`, `${path}.initialValue`);
    }
  }
}

function validateFlowErrors(errors: AutomationStudioFlowArtifact["errors"], issues: AutomationStudioValidationIssue[]): void {
  const ids = new Set<string>();
  for (const [index, error] of errors.entries()) {
    const path = `errors.${index}.id`;
    if (!error.id.trim()) addIssue(issues, "error", "flow.error_missing_id", "Flow error must have an id.", path);
    if (ids.has(error.id)) addIssue(issues, "error", "flow.duplicate_error_id", `Duplicate Flow error id "${error.id}".`, path);
    ids.add(error.id);
  }
}

function validateFlowGraph(flow: AutomationStudioFlowArtifact, issues: AutomationStudioValidationIssue[]): void {
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  for (const [index, node] of flow.nodes.entries()) {
    const path = `nodes.${index}`;
    if (!node.id.trim()) addIssue(issues, "error", "flow.node_missing_id", "Flow node must have an id.", `${path}.id`);
    if (!node.definitionId.trim()) addIssue(issues, "error", "flow.node_missing_definition", "Flow node must have a definitionId.", `${path}.definitionId`);
    if (node.definitionVersion !== undefined && !isSemanticVersion(node.definitionVersion)) addIssue(issues, "error", "flow.node_invalid_definition_version", "Flow node definitionVersion must use major.minor.patch semantic versioning.", `${path}.definitionVersion`);
    if (nodeIds.has(node.id)) addIssue(issues, "error", "flow.duplicate_node_id", `Duplicate Flow node id "${node.id}".`, `${path}.id`);
    nodeIds.add(node.id);
  }
  for (const [index, edge] of flow.edges.entries()) {
    const path = `edges.${index}`;
    if (!edge.id.trim()) addIssue(issues, "error", "flow.edge_missing_id", "Flow edge must have an id.", `${path}.id`);
    if (edgeIds.has(edge.id)) addIssue(issues, "error", "flow.duplicate_edge_id", `Duplicate Flow edge id "${edge.id}".`, `${path}.id`);
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.sourceNodeId)) addIssue(issues, "error", "flow.edge_missing_source_node", `Flow edge references missing source node "${edge.sourceNodeId}".`, `${path}.sourceNodeId`);
    if (!nodeIds.has(edge.targetNodeId)) addIssue(issues, "error", "flow.edge_missing_target_node", `Flow edge references missing target node "${edge.targetNodeId}".`, `${path}.targetNodeId`);
    if ((edge.sourcePortId === undefined) !== (edge.targetPortId === undefined)) {
      addIssue(issues, "error", "flow.edge_incomplete_port_binding", "Flow edge must declare both sourcePortId and targetPortId or neither.", path);
    }
  }
}

function validateFlowExecutionDefaults(flow: AutomationStudioFlowArtifact, issues: AutomationStudioValidationIssue[]): void {
  const defaults = flow.executionDefaults;
  if (!defaults) return;
  if (defaults.timeoutMs !== undefined && defaults.timeoutMs <= 0) addIssue(issues, "error", "flow.invalid_timeout", "Flow timeoutMs must be greater than zero.", "executionDefaults.timeoutMs");
  if (defaults.maxConcurrency !== undefined && (!Number.isInteger(defaults.maxConcurrency) || defaults.maxConcurrency <= 0)) {
    addIssue(issues, "error", "flow.invalid_max_concurrency", "Flow maxConcurrency must be a positive integer.", "executionDefaults.maxConcurrency");
  }
  if (defaults.authorizedDomainIds?.some((domainId) => !domainId.trim())) addIssue(issues, "error", "flow.invalid_authorized_domain", "authorizedDomainIds cannot contain empty domain IDs.", "executionDefaults.authorizedDomainIds");
  if (flow.scope.kind !== "global" && defaults.authorizedDomainIds?.length) addIssue(issues, "error", "flow.domain_scope_cross_grant", "Only global Flows may declare authorizedDomainIds.", "executionDefaults.authorizedDomainIds");
}

function validateFlowPublication(flow: AutomationStudioFlowArtifact, issues: AutomationStudioValidationIssue[]): void {
  const publication = flow.publication;
  if (flow.visibility === "public" && publication.status !== "published" && publication.status !== "deprecated") {
    addIssue(issues, "error", "flow.public_requires_published_version", "Public Flow must have a published version.", "publication.status");
  }
  if (publication.status === "published" || publication.status === "deprecated") {
    if (!isSemanticVersion(publication.version)) addIssue(issues, "error", "flow.invalid_published_version", "Published Flow version must use major.minor.patch semantic versioning.", "publication.version");
    if (publication.publishedAt < flow.createdAt) addIssue(issues, "error", "flow.published_before_created", "Flow publishedAt cannot precede createdAt.", "publication.publishedAt");
    if (!publication.flowDigest.trim()) addIssue(issues, "error", "flow.missing_published_digest", "Published Flow must have an immutable flowDigest.", "publication.flowDigest");
    validateFlowInterface(publication.interface, issues, "publication.interface");
    if (!publication.snapshot) addIssue(issues, "error", "flow.published_snapshot_missing", "Published Flow must retain its immutable execution snapshot.", "publication.snapshot");
    else if (publication.snapshot.flowDigest !== publication.flowDigest || publication.snapshot.version !== publication.version || publication.snapshot.flowId !== flow.flowId) {
      addIssue(issues, "error", "flow.published_snapshot_mismatch", "Published Flow snapshot identity and digest must match the current publication.", "publication.snapshot");
    }
  }
  const historyKeys = new Set<string>();
  for (const [index, snapshot] of (flow.publicationHistory ?? []).entries()) {
    const key = `${snapshot.flowId}@${snapshot.version}`;
    if (snapshot.flowId !== flow.flowId) addIssue(issues, "error", "flow.publication_history_flow_mismatch", "Publication history snapshot must belong to this Flow.", `publicationHistory.${index}.flowId`);
    if (!isSemanticVersion(snapshot.version)) addIssue(issues, "error", "flow.publication_history_invalid_version", "Publication history version must use semantic versioning.", `publicationHistory.${index}.version`);
    if (!snapshot.flowDigest.trim()) addIssue(issues, "error", "flow.publication_history_missing_digest", "Publication history snapshot must retain a digest.", `publicationHistory.${index}.flowDigest`);
    if (historyKeys.has(key)) addIssue(issues, "error", "flow.publication_history_duplicate_version", `Publication history contains duplicate version ${snapshot.version}.`, `publicationHistory.${index}.version`);
    historyKeys.add(key);
  }
}

function validateFlowValueType(valueType: AutomationStudioFlowValueType, issues: AutomationStudioValidationIssue[], path: string): void {
  if (valueType.kind === "array") {
    validateFlowValueType(valueType.item, issues, `${path}.item`);
  } else if (valueType.kind === "record" && valueType.properties) {
    for (const [key, property] of Object.entries(valueType.properties)) {
      if (!key.trim()) addIssue(issues, "error", "flow.record_property_missing_name", "Record type property must have a name.", `${path}.properties.${key}`);
      validateFlowValueType(property, issues, `${path}.properties.${key}`);
    }
  } else if (valueType.kind === "schema" && !valueType.schemaId.trim()) {
    addIssue(issues, "error", "flow.schema_type_missing_id", "Schema value type must have a schemaId.", `${path}.schemaId`);
  }
}

function valueMatchesFlowType(value: JsonValue, valueType: AutomationStudioFlowValueType): boolean {
  switch (valueType.kind) {
    case "unknown":
    case "json": return true;
    case "string": return typeof value === "string";
    case "number": return typeof value === "number";
    case "boolean": return typeof value === "boolean";
    case "null": return value === null;
    case "schema": return value !== null && typeof value === "object" && !Array.isArray(value);
    case "array": return Array.isArray(value) && value.every((item) => valueMatchesFlowType(item, valueType.item));
    case "record": {
      if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
      const record = value as Record<string, JsonValue>;
      const properties = valueType.properties ?? {};
      if (Object.entries(properties).some(([key, type]) => key in record && !valueMatchesFlowType(record[key]!, type))) return false;
      return valueType.additionalProperties !== false || Object.keys(record).every((key) => key in properties);
    }
  }
}

function isSemanticVersion(value: string): boolean {
  return /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value);
}

function validateTimelineEntry(
  entry: TimelineEntry,
  issues: AutomationStudioValidationIssue[],
  path: string,
  noteIds: Set<string>
): void {
  if (entry.confidence !== undefined && (entry.confidence < 0 || entry.confidence > 1)) {
    addIssue(issues, "error", "timeline.invalid_confidence", "Timeline entry confidence must be between 0 and 1.", `${path}.confidence`);
  }
  if (entry.type === "note" && !noteIds.has(entry.noteId)) {
    addIssue(issues, "warning", "timeline.missing_note", `Note entry references missing note "${entry.noteId}".`, `${path}.noteId`);
  }
  if (entry.type === "state_delta" && entry.deltas.length === 0) {
    addIssue(issues, "warning", "timeline.empty_state_delta", "State delta entries should contain at least one delta.", `${path}.deltas`);
  }
}

function validateConditionExpression(
  expression: AutomationConditionExpression,
  issues: AutomationStudioValidationIssue[],
  path: string
): void {
  if ("conditions" in expression) {
    if (expression.conditions.length === 0) {
      addIssue(issues, "warning", "condition.empty_group", "Condition groups should contain at least one condition.", `${path}.conditions`);
    }
    if (expression.type === "weighted" && (expression.threshold < 0 || expression.threshold > 1)) {
      addIssue(issues, "error", "condition.invalid_threshold", "Weighted condition threshold must be between 0 and 1.", `${path}.threshold`);
    }
    for (const [index, child] of expression.conditions.entries()) {
      validateConditionExpression(child, issues, `${path}.conditions.${index}`);
    }
    return;
  }

  if (!expression.signalPath) {
    addIssue(issues, "error", "condition.missing_signal_path", "Condition must reference a signalPath.", `${path}.signalPath`);
  }
  if (expression.weight !== undefined && (expression.weight < 0 || expression.weight > 1)) {
    addIssue(issues, "error", "condition.invalid_weight", "Condition weight must be between 0 and 1.", `${path}.weight`);
  }
}

function addIssue(
  issues: AutomationStudioValidationIssue[],
  severity: AutomationStudioValidationSeverity,
  code: string,
  message: string,
  path: string
): void {
  issues.push({ severity, code, message, path });
}

function result(issues: AutomationStudioValidationIssue[]): AutomationStudioValidationResult {
  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    issues
  };
}
