import type { AutomationStudioRecordOutput } from "@fluxiq/contracts/automation";
import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { OutputTargetPreparer } from "../../../runtime/output-dispatch/index.ts";
import type { ElementMatcher } from "../../../runtime/target-matching/index.ts";
import type { AutomationStudioNativeLogEntry } from "../../../runtime/automation-host/index.ts";
export type { AutomationStudioNativeLogEntry } from "../../../runtime/automation-host/index.ts";
import type { AppendRecordingEntryInput, AutomationStudioRecordingTargetPolicy, StateElementKind, StateValue, TimelineEntry } from "../../../flows/authoring/model/index.ts";
import type { AutomationNodeExecutionResult } from "../../../components/automation/index.ts";
import { AutomationStudioNodeRegistry } from "../../../components/automation/index.ts";
import { validateAutomationStudioNodeDefinition, type AutomationStudioNodeDefinition, type AutomationStudioNodeParameterContract } from "../../../components/automation/index.ts";

export const AUTOMATION_STUDIO_IMPORTER_SDK_VERSION = "0.1" as const;
export type AutomationStudioImporterSchema = { id: string; version: string; valueType: JsonObject };
export type AutomationStudioRecordingMapperDefinition = { id: string; version: string; description: string; outputIds?: string[] };
export type AutomationStudioRecordingMapperObservation = {
  observationId: string;
  recordingId: string;
  domainId: string | null;
  type: string;
  timestamp: number;
  payload: JsonObject;
  metadata: JsonObject;
};
export type AutomationStudioRecordingMapperCandidate = {
  outputId: string;
  parameters?: JsonObject;
  sourceObservationIds?: string[];
  sourceInputIds?: string[];
  expectedConfirmation?: { inputId: string; timeoutMs?: number; description?: string };
  /** What should hold after the action, in the condition shape the host's expectation evaluator reads. Kept only when it is a plain object. */
  expectedState?: JsonObject;
  /**
   * The records this action's output returns, to save as a dataset. `recordsPath`
   * may be left out when the domain output declares `metadata.recordsPath`. Core
   * parses it and rejects the candidate when it is invalid or asks to encrypt a
   * field; `null` proposes no record output.
   */
  recordOutput?: Omit<AutomationStudioRecordOutput, "recordsPath"> & { recordsPath?: string };
  /** How long the recorded action is given, in whole milliseconds above zero; the action's 5,000 ms default when absent. Any other value rejects the candidate. */
  timeoutMs?: number;
  confidence?: number;
  evidence?: Array<{ layer: "recording" | "normalized_timeline" | "evidence"; artifactId: string; entryId?: string; observationId?: string }>;
  label?: string;
  description?: string;
};
export type AutomationStudioRecordingMapperResult = AutomationStudioRecordingMapperCandidate | { candidates: AutomationStudioRecordingMapperCandidate[] } | null;
export type AutomationStudioTargetResolverDefinition = { id: string; version: string; description: string };
export type AutomationStudioComparatorDefinition = { id: string; version: string; description: string; valueTypes: string[] };
export type AutomationStudioStateVisualizerDefinition = {
  id: string;
  version: string;
  label: string;
  description?: string;
  supportedNamespaces?: string[];
  supportedKinds?: string[];
  supportedRendererIds?: string[];
  metadata?: JsonObject;
};

export type AutomationStudioImporterSdkManifest = {
  schemaVersion: "0.1";
  sdkVersion: typeof AUTOMATION_STUDIO_IMPORTER_SDK_VERSION;
  packageId: string;
  packageVersion: string;
  domainId: string;
  nodes: AutomationStudioNodeDefinition[];
  recordingMappers?: AutomationStudioRecordingMapperDefinition[];
  targetResolvers?: AutomationStudioTargetResolverDefinition[];
  comparators?: AutomationStudioComparatorDefinition[];
  stateVisualizers?: AutomationStudioStateVisualizerDefinition[];
  schemas?: AutomationStudioImporterSchema[];
  editor?: { displayName?: string; icon?: string; categories?: Array<{ id: string; label: string }> };
  metadata?: JsonObject;
};

export type AutomationStudioNativeNodeContext = {
  inputs: Readonly<Record<string, JsonValue>>;
  parameters: Readonly<Record<string, JsonValue>>;
  signal: AbortSignal;
  grants: Readonly<{ permissions: string[]; runtimeCapabilities: string[]; networkDestinations: string[]; secretHandles: string[]; filesystemRoots: string[]; process: boolean; childProcess: boolean }>;
  host?: Readonly<{
    /** The enclosing execution's fixed reference for relative task dates. */
    referenceNow?: number;
    capabilityIds: string[];
    currentStateRef?: JsonObject;
    previousStateRef?: JsonObject;
    sideEffectClass: "none" | "internal" | "external" | "destructive";
    target?: JsonValue;
  }>;
  elementMatcher: ElementMatcher;
  resolveTarget(resolverId: string, target: JsonObject): Promise<JsonObject | null>;
  log(entry: AutomationStudioNativeLogEntry): void;
};
export type AutomationStudioNativeNodeImplementation = (context: AutomationStudioNativeNodeContext) => AutomationNodeExecutionResult | Promise<AutomationNodeExecutionResult>;
export type AutomationStudioRecordingMapperContext = {
  signal: AbortSignal;
  elementMatcher: ElementMatcher;
  /** The mapper-visible entries after this observation, in timeline order, at most 32: where a mapper reads what an action led to. */
  following: readonly AutomationStudioRecordingMapperObservation[];
};
export type AutomationStudioRecordingMapperImplementation = (observation: AutomationStudioRecordingMapperObservation, context: AutomationStudioRecordingMapperContext) => AutomationStudioRecordingMapperResult | Promise<AutomationStudioRecordingMapperResult>;
export type AutomationStudioTargetResolverImplementation = (target: JsonObject, context: { signal: AbortSignal; elementMatcher: ElementMatcher }) => JsonObject | null | Promise<JsonObject | null>;
export type AutomationStudioComparatorImplementation = (left: JsonValue, right: JsonValue) => { equal: boolean; score?: number };
/** Trusted domain code, supplied by an implementation bundle: a mapper candidate's parameters as the domain reads them. */
export type AutomationStudioRecordingCandidateParameterNormalizer = (domainId: string, parameters: JsonObject, context: { outputId: string; sourceEntryId: string; source: "mapper" }) => JsonObject;
type RecordingActionEntryInput = Extract<AppendRecordingEntryInput, { type: "action" }>;
/** A domain may project an action entry's target data; the entry's identity and all else about it stay Core's. Null keeps the entry as it came. */
export type AutomationStudioRecordingEntryTargetPreparer = (domainId: string, entry: Readonly<RecordingActionEntryInput>) => Pick<RecordingActionEntryInput, "parameters" | "target"> | null;
/** What a domain reads out of a tool's evidence for the step log's `page.txt`. Never reaches a model. */
export type AutomationStudioLlmEvidenceSummary = { pageText(evidence: unknown): string | undefined };
/**
 * A recorded step as a domain reads it, for the build model's account of a
 * recording (`service/instruction-led/recording-steps.ts`). Core decides what
 * is said; the domain says only what its own entry means.
 */
export type AutomationStudioRecordedStepReading = {
  /** The domain knows this control holds a secret, whatever it is called. The step is left out and only counted. */
  secret: boolean;
  /** Every word the control is identified by. Core screens them for a secret or payment detail, so no domain can forget to. */
  identity: readonly string[];
  /** The control's own name: never the value it holds. Core drops a name that reads as an address, an email or a long number. */
  label?: string | undefined;
  /** What kind of control it is, in the plain widget words Core's undo reading uses ("checkbox", "option", "button"). */
  role?: string | undefined;
  /** The act puts a value into the control. */
  entersValue: boolean;
  /** The act takes back the step before it. */
  undoes: boolean;
};
/** `kind` is the entry's act, as Core normalized it. Null: the entry describes the page rather than something the person did, and is left out uncounted. */
export type AutomationStudioRecordedStepReader = (step: { kind: string; entry: Readonly<TimelineEntry> }) => AutomationStudioRecordedStepReading | null;
/** What a state path the domain never declared is, when its own words say; undefined leaves the path to Core's neutral words. */
export type AutomationStudioStateElementKindReader = (path: string, type: StateValue["type"]) => StateElementKind | undefined;
/** The control a step acts on, as the activity stream says it: its names in order of preference, and the plain widget words for what it is. */
export type AutomationStudioActivityControl = { names: readonly unknown[]; kinds: readonly unknown[] };
/** Undefined: the node's parameters carry no control. Words for the chat only, never for a model. */
export type AutomationStudioActivityControlReader = (parameters: unknown) => AutomationStudioActivityControl | undefined;
/**
 * A control's own words in a node's parameters, for what a model is told about
 * it. Core collapses and screens them, and never reads them for anything but
 * words. `readsItsWords` says the words are the value the step reads rather than
 * a name for its control.
 */
export type AutomationStudioControlWords = { words: readonly string[]; readsItsWords: boolean };
/** Every word-bearing field, most preferred first. Undefined: the parameters carry no control. */
export type AutomationStudioControlWordsReader = (parameters: JsonObject | undefined) => AutomationStudioControlWords | undefined;

export type AutomationStudioImporterImplementationBundle = {
  packageId: string;
  packageVersion: string;
  implementations: Record<string, AutomationStudioNativeNodeImplementation>;
  /** Explicit matcher for this manifest domain. Missing adapters cannot score targets. */
  elementMatcher?: ElementMatcher;
  /** The domain's reading of an output's target parameters before dispatch; absent, parameters pass through unread. */
  outputTargetPreparer?: OutputTargetPreparer;
  /** Projects a recording action entry's target data as it is stored. */
  recordingEntryTargetPreparer?: AutomationStudioRecordingEntryTargetPreparer;
  /** The domain's checks of the target data a recording carries, for `validateRecordingSession`. */
  recordingTargetPolicy?: AutomationStudioRecordingTargetPolicy;
  recordingCandidateParameterNormalizer?: AutomationStudioRecordingCandidateParameterNormalizer;
  /** Evidence reading for the step log only: never a way to change what a model is sent. */
  llmEvidenceSummary?: AutomationStudioLlmEvidenceSummary;
  /** Reads a recorded step for the build model's account of a recording. Absent, every recorded step is withheld and only counted. */
  recordedStepReader?: AutomationStudioRecordedStepReader;
  /** The domain's own words for a state path it never declared. */
  stateElementKindReader?: AutomationStudioStateElementKindReader;
  /** Names the control a node's parameters carry, for the activity stream. Absent, a step's card says its verb alone. */
  activityControlReader?: AutomationStudioActivityControlReader;
  /** Reads a control's own words out of a node's parameters. Absent, a model is told no name for a control, and a step that may do a lasting act is read as doing one. */
  controlWordsReader?: AutomationStudioControlWordsReader;
  /** The parameter keys that name the control a step acts on. Absent, a checked rerun treats every parameter as naming it. */
  controlParameterKeys?: ReadonlySet<string>;
  recordingMappers?: Record<string, AutomationStudioRecordingMapperImplementation>;
  targetResolvers?: Record<string, AutomationStudioTargetResolverImplementation>;
  comparators?: Record<string, AutomationStudioComparatorImplementation>;
  /**
   * Checks of a node's parameter values, keyed by the id of a node the manifest
   * declares. Registration binds each onto the node registry, where validation
   * of a generated plan calls it (`AutomationStudioNodeParameterContract`).
   */
  parameterContracts?: Record<string, AutomationStudioNodeParameterContract>;
};

/** Explicit manifest registry. FluxIQ never scans or imports host modules from display metadata. */
export class AutomationStudioImporterSdkRegistry {
  private readonly manifests = new Map<string, AutomationStudioImporterSdkManifest>();
  readonly nodes = new AutomationStudioNodeRegistry();

  register(manifest: AutomationStudioImporterSdkManifest): this {
    const issues = validateAutomationStudioImporterSdkManifest(manifest);
    if (issues.length) throw new Error(`Invalid Automation Studio importer SDK manifest: ${issues.join(", ")}`);
    const existing = this.manifests.get(manifest.packageId);
    if (existing && existing.domainId !== manifest.domainId) throw new Error(`Importer package ${manifest.packageId} cannot change domains.`);
    if (existing) throw new Error(`Importer package ${manifest.packageId} is already registered; create a new host runtime to activate version ${manifest.packageVersion}.`);
    for (const node of manifest.nodes) this.nodes.register(node);
    this.manifests.set(manifest.packageId, structuredClone(manifest));
    return this;
  }
  get(packageId: string): AutomationStudioImporterSdkManifest | undefined { const value = this.manifests.get(packageId); return value ? structuredClone(value) : undefined; }
  list(): AutomationStudioImporterSdkManifest[] { return [...this.manifests.values()].map((value) => structuredClone(value)); }
}

export function validateAutomationStudioImporterSdkManifest(manifest: AutomationStudioImporterSdkManifest): string[] {
  const issues: string[] = [];
  if (manifest.sdkVersion !== AUTOMATION_STUDIO_IMPORTER_SDK_VERSION) issues.push("importer_sdk.version_mismatch");
  if (!manifest.packageId.trim() || !manifest.packageVersion.trim() || !manifest.domainId.trim()) issues.push("importer_sdk.missing_identity");
  if (!isSemanticVersion(manifest.packageVersion)) issues.push("importer_sdk.invalid_package_version");
  const ids = new Set<string>();
  for (const node of manifest.nodes) {
    if (ids.has(node.id)) issues.push("importer_sdk.duplicate_node"); ids.add(node.id);
    const validation = validateAutomationStudioNodeDefinition(node); if (!validation.ok) issues.push(...validation.issues.map((item) => item.code));
    if (node.source.kind !== "importer" && node.source.kind !== "code") issues.push("importer_sdk.invalid_node_source");
    if (node.source.kind === "importer" && (node.source.domainId !== manifest.domainId || node.source.packageId !== manifest.packageId)) issues.push("importer_sdk.node_identity_mismatch");
    if (node.source.kind === "code" && (node.availability.kind !== "domain" || node.availability.domainId !== manifest.domainId)) issues.push("importer_sdk.code_scope_mismatch");
  }
  for (const collection of [manifest.recordingMappers ?? [], manifest.targetResolvers ?? [], manifest.comparators ?? [], manifest.schemas ?? []]) { const seen = new Set<string>(); for (const item of collection) { if (!item.id.trim()) issues.push("importer_sdk.missing_extension_id"); if (!isSemanticVersion(item.version)) issues.push("importer_sdk.invalid_extension_version"); if (seen.has(item.id)) issues.push("importer_sdk.duplicate_extension_id"); seen.add(item.id); } }
  for (const mapper of manifest.recordingMappers ?? []) { if (!mapper.description.trim()) issues.push("importer_sdk.missing_extension_description"); if (mapper.outputIds?.some((id) => !id.trim()) || new Set(mapper.outputIds ?? []).size !== (mapper.outputIds ?? []).length) issues.push("importer_sdk.invalid_mapper_output_ids"); }
  for (const resolver of manifest.targetResolvers ?? []) if (!resolver.description.trim()) issues.push("importer_sdk.missing_extension_description");
  for (const comparator of manifest.comparators ?? []) { if (!comparator.description.trim()) issues.push("importer_sdk.missing_extension_description"); if (!comparator.valueTypes.length || comparator.valueTypes.some((value) => !value.trim())) issues.push("importer_sdk.invalid_comparator_types"); }
  validateStateVisualizers(manifest, issues);
  return [...new Set(issues)];
}

function isSemanticVersion(value: string): boolean { return /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value); }

function validateStateVisualizers(manifest: AutomationStudioImporterSdkManifest, issues: string[]): void {
  const seen = new Set<string>();
  for (const visualizer of manifest.stateVisualizers ?? []) {
    if (!visualizer.id.trim()) issues.push("importer_sdk.missing_state_visualizer_id");
    if (seen.has(visualizer.id)) issues.push("importer_sdk.duplicate_state_visualizer_id");
    seen.add(visualizer.id);
    if (!isSemanticVersion(visualizer.version)) issues.push("importer_sdk.invalid_state_visualizer_version");
    if (!visualizer.label.trim()) issues.push("importer_sdk.missing_state_visualizer_label");
    if (visualizer.supportedNamespaces?.some((value) => !value.trim()) || hasDuplicates(visualizer.supportedNamespaces)) issues.push("importer_sdk.invalid_state_visualizer_namespaces");
    if (visualizer.supportedKinds?.some((value) => !value.trim()) || hasDuplicates(visualizer.supportedKinds)) issues.push("importer_sdk.invalid_state_visualizer_kinds");
    if (visualizer.supportedRendererIds?.some((value) => !value.trim()) || hasDuplicates(visualizer.supportedRendererIds)) issues.push("importer_sdk.invalid_state_visualizer_renderer_ids");
    const metadata = visualizer.metadata ?? {};
    if (typeof metadata.domainId === "string" && metadata.domainId !== manifest.domainId) issues.push("importer_sdk.state_visualizer_identity_mismatch");
    if (typeof metadata.packageId === "string" && metadata.packageId !== manifest.packageId) issues.push("importer_sdk.state_visualizer_identity_mismatch");
    if (claimsExecutableCapability(metadata)) issues.push("importer_sdk.state_visualizer_claims_capability");
  }
}

function hasDuplicates(values: string[] | undefined): boolean {
  return Boolean(values && new Set(values).size !== values.length);
}

function claimsExecutableCapability(metadata: JsonObject): boolean {
  const blocked = new Set(["implementationKey", "runtimeCapabilities", "permissions", "grants", "storageAccess", "filesystemRoots", "networkDestinations", "execute", "module", "import"]);
  return Object.keys(metadata).some((key) => blocked.has(key));
}
