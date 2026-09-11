import { rm } from "node:fs/promises";
import path from "node:path";
import type { JsonObject } from "../../../../core/index.ts";
import { ProgramJsonStore, safeSegment } from "../../../_shared/storage.ts";
import { normalizeAutomationStudioElementTarget, type AppendRecordingEntryInput, type AutomationStudioProjectArtifactKind, type RecordingSession, type StateSnapshot } from "../../model/index.ts";
import {
  AUTOMATION_STUDIO_OBJECT_THRESHOLD_BYTES,
  automationStudioObjectApiPath,
  isAutomationStudioObjectReference,
  parseAutomationStudioObjectContentRef,
  type AutomationStudioObjectAsset,
  type AutomationStudioObjectStore
} from "../../storage/index.ts";
import type { PipelineArtifactKind } from "../pipeline-model.ts";
import { compactJsonObject } from "./compact-json.ts";
import { errorMessage } from "./error-message.ts";
import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths, AutomationStudioRecordingPaths } from "./paths/index.ts";
import type { AutomationStudioProjectStore } from "./projects/index.ts";

export type AutomationStudioWriteProjectObjectAssetInput = {
  projectId: string;
  recordingId?: string;
  content: Buffer | Uint8Array;
  mediaType: string;
  expectedSha256?: string;
};

export type AutomationStudioWriteProjectObjectAssetResult = {
  sha256: string;
  size: number;
  mediaType: string;
  contentRef: string;
  apiPath: string;
};

// Everything that reads or writes through the content-addressed object store:
// artifact documents above the inline threshold, renderable project assets, the
// pipeline artifact documents, and the state snapshots a recording entry points
// at. Without an object store every one of these falls back to the inline
// document exactly as before, which is why the store is optional here.
export class AutomationStudioObjectDocuments {
  constructor(
    private readonly paths: AutomationStudioProjectPaths,
    private readonly recordingPaths: AutomationStudioRecordingPaths,
    private readonly projects: AutomationStudioProjectStore,
    private readonly objectStore?: AutomationStudioObjectStore
  ) {}

  async readProjectObjectAsset(projectId: string, sha256: string): Promise<AutomationStudioObjectAsset> {
    await this.projects.findProject(projectId);
    if (!this.objectStore) throw new Error("Automation Studio object storage is not enabled.");
    const asset = await this.objectStore.readProjectObject(projectId, sha256);
    if (!asset.mediaType.startsWith("image/") && asset.mediaType !== "application/octet-stream") {
      throw new Error("Automation Studio object is not a renderable state asset.");
    }
    return asset;
  }

  async writeProjectObjectAsset(input: AutomationStudioWriteProjectObjectAssetInput): Promise<AutomationStudioWriteProjectObjectAssetResult> {
    await this.projects.findProject(input.projectId);
    if (!this.objectStore) throw new Error("Automation Studio object storage is not enabled.");
    if (!isAutomationStudioRenderableAssetMediaType(input.mediaType)) {
      throw new Error("Automation Studio state assets must be PNG, JPEG, WebP, or GIF images.");
    }
    const reference = await this.objectStore.putBytes(input.projectId, input.content, input.mediaType, input.recordingId ? { recordingId: input.recordingId } : {});
    const sha256 = reference.$fluxiqObject.sha256;
    if (input.expectedSha256 && sha256 !== input.expectedSha256.toLowerCase()) {
      throw new Error("Automation Studio state asset digest does not match the requested object digest.");
    }
    return {
      sha256,
      size: reference.$fluxiqObject.size,
      mediaType: reference.$fluxiqObject.mediaType,
      contentRef: this.objectStore.contentRef(input.projectId, reference),
      apiPath: automationStudioObjectApiPath(input.projectId, sha256)
    };
  }

  async prepareArtifactDocument(projectId: string, artifact: JsonObject): Promise<JsonObject> {
    const size = Buffer.byteLength(JSON.stringify(artifact), "utf8");
    return this.objectStore && size >= AUTOMATION_STUDIO_OBJECT_THRESHOLD_BYTES
      ? await this.objectStore.putJson(projectId, artifact) as unknown as JsonObject
      : artifact;
  }

  async readArtifactDocument(filePath: string): Promise<JsonObject> {
    const stored = await new ProgramJsonStore<JsonObject>(filePath, () => ({})).read();
    if (!this.objectStore || !isAutomationStudioObjectReference(stored)) return stored;
    try {
      return await this.objectStore.readJson(stored);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }

  async writeArtifactDocument(projectId: string, filePath: string, artifact: JsonObject): Promise<void> {
    const stored = await this.prepareArtifactDocument(projectId, artifact);
    await new ProgramJsonStore<JsonObject>(filePath, () => ({})).write(stored);
  }

  async deleteProjectArtifactFile(projectId: string, kind: AutomationStudioProjectArtifactKind, artifactId: string): Promise<void> {
    if (!this.paths.root) return;
    const artifactRoot = path.dirname(this.paths.projectArtifactFile(projectId, kind, artifactId));
    if (this.objectStore) await ProgramJsonStore.deletePath(artifactRoot);
    else await rm(artifactRoot, { recursive: true, force: true });
  }

  async deletePipelineArtifactDocuments(projectId: string, recordingId: string, kind: PipelineArtifactKind, id: string): Promise<void> {
    const paths = [
      this.recordingPaths.recordingPipelineArtifactFile(projectId, recordingId, kind, id),
      this.paths.projectFile(projectId, "pipeline", "shared", this.recordingPaths.pipelineFolder(kind), `${safeSegment(id)}.json`)
    ];
    const legacyPath = this.recordingPaths.legacyRecordingPipelineArtifactFile(projectId, recordingId, kind, id);
    if (legacyPath) paths.push(legacyPath);
    for (const filePath of paths) {
      if (this.objectStore) await ProgramJsonStore.deletePath(filePath);
      await rm(filePath, { recursive: true, force: true });
    }
    if (kind === "policyProposals" || kind === "recordingFlowProposals") {
      const proposalDirectory = path.dirname(this.recordingPaths.recordingPipelineArtifactFile(projectId, recordingId, kind, id));
      if (this.objectStore) await ProgramJsonStore.deletePath(proposalDirectory);
      await rm(proposalDirectory, { recursive: true, force: true });
    }
  }

  async prepareRecordingEntriesForStorage(projectId: string | null | undefined, recordingId: string, entries: AppendRecordingEntryInput[]): Promise<AppendRecordingEntryInput[]> {
    const normalized = entries.map((entry) => prepareRecordingEntryElementTarget(entry));
    if (!projectId || !this.objectStore) return normalized;
    return await Promise.all(normalized.map((entry) => this.dehydrateRecordingEntryStateSnapshot(entry, projectId, recordingId)));
  }

  async dehydrateRecordingStateSnapshotRefs(recording: RecordingSession, projectId: string | null | undefined): Promise<RecordingSession> {
    if (!projectId || !this.objectStore) return recording;
    const timeline = await Promise.all(recording.timeline.map((entry) => this.dehydrateRecordingEntryStateSnapshot(entry, projectId, recording.recordingId)));
    return { ...recording, timeline: timeline as RecordingSession["timeline"] };
  }

  async dehydrateRecordingEntryStateSnapshot<TEntry extends AppendRecordingEntryInput | RecordingSession["timeline"][number]>(entry: TEntry, projectId: string, recordingId: string): Promise<TEntry> {
    if (!this.objectStore || entry.type !== "observation" || entry.observationType !== "client.state_snapshot") return entry;
    const payload = entry.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return entry;
    const state = payload.state;
    if (!isStateSnapshotObject(state) || typeof payload.stateRef === "string") return entry;
    const content = Buffer.from(JSON.stringify(state), "utf8");
    const reference = await this.objectStore.putBytes(projectId, content, "application/vnd.fluxiq.state-snapshot+json", { recordingId, extension: "json" });
    const stateRef = this.objectStore.contentRef(projectId, reference);
    const snapshotId = typeof state.id === "string" && state.id.trim() ? state.id.trim() : undefined;
    const visualSummary = stateSnapshotVisualSummary(state);
    const nextPayload = compactJsonObject({
      stateRef,
      ...(snapshotId ? { snapshotId } : {}),
      metadata: compactJsonObject({
        ...(typeof payload.metadata === "object" && payload.metadata && !Array.isArray(payload.metadata) ? payload.metadata as JsonObject : {}),
        stateSnapshotTimestamp: state.timestamp,
        stateSnapshotSha256: reference.$fluxiqObject.sha256,
        stateSnapshotSize: reference.$fluxiqObject.size,
        ...visualSummary
      })
    });
    return { ...entry, correlationId: entry.correlationId ?? snapshotId ?? reference.$fluxiqObject.sha256, payload: nextPayload } as TEntry;
  }

  async hydrateRecordingStateSnapshotRefs(recording: RecordingSession, projectId: string | null | undefined): Promise<RecordingSession> {
    if (!projectId || !this.objectStore) return recording;
    const timeline = await Promise.all(recording.timeline.map((entry) => this.hydrateRecordingEntryStateSnapshot(entry, projectId)));
    return { ...recording, timeline };
  }

  async hydrateRecordingEntryStateSnapshot(entry: RecordingSession["timeline"][number], projectId: string): Promise<RecordingSession["timeline"][number]> {
    if (!this.objectStore || entry.type !== "observation" || entry.observationType !== "client.state_snapshot") return entry;
    const payload = entry.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || isStateSnapshotObject(payload.state)) return entry;
    const stateRef = typeof payload.stateRef === "string" ? payload.stateRef : undefined;
    if (!stateRef) return entry;
    const parsed = parseAutomationStudioObjectContentRef(stateRef);
    if (!parsed) return entry;
    if (parsed.projectId !== projectId) {
      return {
        ...entry,
        payload: {
          ...payload,
          metadata: compactJsonObject({
            ...(typeof payload.metadata === "object" && payload.metadata && !Array.isArray(payload.metadata) ? payload.metadata as JsonObject : {}),
            stateRefProjectMismatch: { expectedProjectId: projectId, actualProjectId: parsed.projectId },
            missingStateRef: stateRef
          })
        }
      };
    }
    let asset;
    try {
      asset = await this.objectStore.readProjectObject(projectId, parsed.sha256);
    } catch (error) {
      return {
        ...entry,
        payload: {
          ...payload,
          metadata: compactJsonObject({
            ...(typeof payload.metadata === "object" && payload.metadata && !Array.isArray(payload.metadata) ? payload.metadata as JsonObject : {}),
            stateRefHydrationError: errorMessage(error, "State snapshot object could not be read."),
            missingStateRef: stateRef
          })
        }
      };
    }
    const state = JSON.parse(asset.content.toString("utf8")) as unknown;
    if (!isStateSnapshotObject(state)) return entry;
    return { ...entry, payload: { ...payload, state: state as unknown as JsonObject } };
  }

  async readIndexedStateSnapshot(projectId: string, stateRef: string): Promise<StateSnapshot> {
    if (!this.objectStore) throw new Error("Automation Studio object storage is not enabled.");
    const parsed = parseAutomationStudioObjectContentRef(stateRef);
    if (!parsed || parsed.projectId !== projectId) throw new Error("State snapshot ref does not belong to this project.");
    const asset = await this.objectStore.readProjectObject(projectId, parsed.sha256);
    const state = JSON.parse(asset.content.toString("utf8")) as unknown;
    if (!isStateSnapshotObject(state)) throw new Error("Indexed state snapshot object is invalid.");
    return state;
  }
}

export function isStateSnapshotObject(value: unknown): value is StateSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.timestamp === "number"
    && Boolean(record.namespaces)
    && typeof record.namespaces === "object"
    && !Array.isArray(record.namespaces);
}

function isAutomationStudioRenderableAssetMediaType(mediaType: string): boolean {
  const normalized = mediaType.trim().toLowerCase();
  return normalized === "image/png" || normalized === "image/jpeg" || normalized === "image/webp" || normalized === "image/gif";
}

function prepareRecordingEntryElementTarget(entry: AppendRecordingEntryInput): AppendRecordingEntryInput {
  if (entry.type !== "action") return entry;
  const parameters = entry.parameters && typeof entry.parameters === "object" && !Array.isArray(entry.parameters) ? entry.parameters as Record<string, unknown> : {};
  const target = entry.target && typeof entry.target === "object" && !Array.isArray(entry.target) ? entry.target as Record<string, unknown> : undefined;
  const targetForNormalization = target || entry.visualTarget ? { ...(target ?? {}), ...(entry.visualTarget ? { visualTarget: entry.visualTarget } : {}) } : undefined;
  const elementTarget = normalizeAutomationStudioElementTarget(target && "elementTarget" in target ? target.elementTarget : undefined, { source: "recording" })
    ?? normalizeAutomationStudioElementTarget(parameters.target, { source: "recording" })
    ?? normalizeAutomationStudioElementTarget(targetForNormalization, { source: "recording" });
  if (!elementTarget) return entry;
  return {
    ...entry,
    parameters: compactJsonObject({ ...parameters, target: elementTarget }),
    target: compactJsonObject({
      type: typeof entry.target?.type === "string" && entry.target.type.trim() ? entry.target.type : "ui_element",
      ...(entry.target?.id ? { id: entry.target.id } : {}),
      ...(entry.target?.label ? { label: entry.target.label } : {}),
      ...(entry.target?.selector ? { selector: entry.target.selector } : {}),
      ...(entry.target?.bounds ? { bounds: entry.target.bounds } : {}),
      ...(entry.target?.relativePosition ? { relativePosition: entry.target.relativePosition } : {}),
      ...(entry.target?.visualTarget ? { visualTarget: entry.target.visualTarget } : {}),
      elementTarget,
      ...(entry.target?.metadata ? { metadata: entry.target.metadata } : {})
    }) as NonNullable<Extract<AppendRecordingEntryInput, { type: "action" }>["target"]>
  };
}

function stateSnapshotVisualSummary(state: StateSnapshot): JsonObject {
  const frames = state.presentation?.visualFrames ?? [];
  const defaultFrame = frames.find((frame) => frame.id === state.presentation?.defaultFrameId) ?? frames[0];
  const imageLayer = defaultFrame?.layers.find((layer) => layer.kind === "image");
  return compactJsonObject({
    ...(defaultFrame?.id ? { visualFrameId: defaultFrame.id } : {}),
    ...(defaultFrame?.coordinateSpace ? { coordinateSpace: defaultFrame.coordinateSpace as unknown as JsonObject } : {}),
    ...(imageLayer?.kind === "image" ? { screenshotRef: imageLayer.contentRef } : {})
  });
}
