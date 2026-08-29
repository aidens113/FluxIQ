"use client";

import { useCallback } from "react";
import type { JsonObject } from "../../programs/program-api";
import type { AutomationSelection } from "../shared/selection-contracts";
import type { AutomationLiveDomainCommands } from "./domain-commands";
import { deleteRecordingCollectionItems } from "../model/local-mutations";
import { removeDeletedRecordingArtifacts, removeDeletedRecordingSnapshotData, selectionReferencesDeletedRecording } from "../model/deletion";
import { mergeRecordingDetail, removeFlowObjectReferencesFromProjectFlows } from "../model/project-change-reconciliation";

type RecordingCommandsOptions = {
  liveCommands: AutomationLiveDomainCommands;
  selection: AutomationSelection | null;
  setActionStatus: (status: string) => void;
  setProjectRecordings: (next: any) => void;
  setProjectTimelines: (next: any) => void;
  setProjectFlows: (next: any) => void;
  setPipelineArtifacts: (next: any) => void;
  setSnapshot: (next: any) => void;
  setIndexedStateSources: (next: any) => void;
  setRecordingProcessing: (next: any) => void;
  setRecordingPrimaryKind: (next: "recording" | null) => void;
  setSelection: (next: AutomationSelection | null) => void;
  notifyChanged: (scopes: readonly any[], resourceIds: string[]) => void;
};

export function useAutomationRecordingCommands(options: RecordingCommandsOptions) {
  const removeLocal = useCallback((recordingIds: readonly string[], proposalIds: readonly string[] = []) => {
    const recordings = new Set(recordingIds);
    const proposals = new Set(proposalIds);
    options.setProjectRecordings((current: any[]) => deleteRecordingCollectionItems(current, [...recordings]).next);
    options.setProjectTimelines((current: any[]) => current.filter((timeline) => !recordings.has(String(timeline.recordingId ?? ""))));
    options.setProjectFlows((current: any[]) => removeFlowObjectReferencesFromProjectFlows(current, null, "recording", [...recordings]));
    options.setPipelineArtifacts((current: any) => removeDeletedRecordingArtifacts(current, recordings, proposals));
    options.setSnapshot((current: any) => removeDeletedRecordingSnapshotData(current, recordings, proposals));
    options.setIndexedStateSources((current: any) => Object.fromEntries(Object.entries(current).filter(([, value]: any) => {
      const source = value.source ?? {};
      return !recordings.has(String(source.recordingId ?? "")) && !proposals.has(String(source.proposalId ?? ""));
    })));
    options.setRecordingProcessing((current: any) => current && recordings.has(current.recordingId) ? null : current);
    if (selectionReferencesDeletedRecording(options.selection, recordings, proposals)) {
      options.setRecordingPrimaryKind(null);
      options.setSelection(null);
    }
  }, [options]);
  const deleteMany = useCallback(async (recordingIds: string[], authorizationPin: string) => {
    const ids = [...new Set(recordingIds.filter(Boolean))];
    if (!ids.length) return true;
    options.setActionStatus("Deleting " + ids.length + " recording" + (ids.length === 1 ? "" : "s") + "...");
    const outcome = await options.liveCommands.deleteRecordings(ids, authorizationPin, {
      commit(cleanup) {
        removeLocal(cleanup.recordingIds, cleanup.proposalIds);
        options.notifyChanged(cleanup.invalidationScopes, [...cleanup.invalidationEntityIds]);
      }
    });
    if (outcome.status !== "success") {
      if (outcome.status === "failure") options.setActionStatus(outcome.error);
      return false;
    }
    options.setActionStatus(outcome.value.recordingIds.length + " recording" + (outcome.value.recordingIds.length === 1 ? "" : "s") + " deleted.");
    return true;
  }, [options, removeLocal]);
  const deleteOne = useCallback(async (recordingId: string) => {
    const pin = window.prompt("Enter PIN to delete this recording") ?? "";
    if (pin.length >= 4) await deleteMany([recordingId], pin);
  }, [deleteMany]);
  const finalize = useCallback(async (recordingId: string) => {
    const pin = window.prompt("Enter PIN to finalize this recording") ?? "";
    if (pin.length < 4) return;
    const outcome = await options.liveCommands.finalizeRecording<any>(recordingId, pin);
    if (outcome.status === "success") {
      options.setProjectRecordings((current: any[]) => mergeRecordingDetail(current, outcome.value.recording));
      options.notifyChanged(["recording", "timeline", "summary"], [recordingId]);
      options.setActionStatus("Recording finalized.");
    } else if (outcome.status === "failure") options.setActionStatus(outcome.error);
  }, [options]);
  const update = useCallback(async (recordingId: string, changes: JsonObject) => {
    const pin = window.prompt("Enter PIN to update this recording") ?? "";
    if (pin.length < 4) return;
    const outcome = await options.liveCommands.updateRecording<any>(recordingId, changes, pin);
    if (outcome.status === "success" && outcome.value.recording) {
      options.setProjectRecordings((current: any[]) => mergeRecordingDetail(current, outcome.value.recording));
      options.notifyChanged(["recording", "summary"], [recordingId]);
    } else if (outcome.status === "failure") options.setActionStatus(outcome.error);
  }, [options]);
  const appendNote = useCallback(async (recordingId: string, linkedEntryId?: string) => {
    const text = window.prompt("Recording note") ?? "";
    if (!text.trim()) return;
    const pin = window.prompt("Enter PIN to add this note") ?? "";
    if (pin.length < 4) return;
    const outcome = await options.liveCommands.addRecordingNote<any>(recordingId, text, pin, linkedEntryId);
    if (outcome.status === "success") options.notifyChanged(["recording", "timeline"], [recordingId]);
    else if (outcome.status === "failure") options.setActionStatus(outcome.error);
  }, [options]);
  const appendMarker = useCallback(async (recordingId: string, linkedEntryId?: string, monotonicOffsetMs?: number) => {
    const label = window.prompt("Marker label") ?? "";
    if (!label.trim()) return;
    const pin = window.prompt("Enter PIN to add this marker") ?? "";
    if (pin.length < 4) return;
    const outcome = await options.liveCommands.addRecordingMarker<any>(recordingId, label, pin, linkedEntryId, monotonicOffsetMs);
    if (outcome.status === "success") options.notifyChanged(["recording", "timeline"], [recordingId]);
    else if (outcome.status === "failure") options.setActionStatus(outcome.error);
  }, [options]);
  return { appendMarker, appendNote, deleteMany, deleteOne, finalize, update };
}