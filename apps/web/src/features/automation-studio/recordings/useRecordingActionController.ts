"use client";

import { useState } from "react";
import type { RecordingJsonObject, RecordingViewDataPort } from "./recording-api-types";
import { appendRecordingMarker } from "./recording-markers";
import { appendRecordingNote } from "./recording-notes";
import type { RecordingActionKind } from "./recording-model";

export function useRecordingActionController(input: {
  projectId: string | null;
  dataPort: Pick<RecordingViewDataPort, "repairStateIndex">;
  selectedEntry: any;
  selectedRecording: any;
  onAppendRecordingMarker(recordingId: string, linkedEntryId?: string, monotonicOffsetMs?: number, label?: string, authorizationPin?: string): Promise<void>;
  onAppendRecordingNote(recordingId: string, linkedEntryId?: string, text?: string, authorizationPin?: string): Promise<void>;
  onDeleteRecording(recordingId: string, authorizationPin?: string): Promise<void>;
  onFinalizeRecording(recordingId: string, authorizationPin?: string): Promise<void>;
  onRefreshRecordings(): Promise<void>;
  onUpdateRecording(recordingId: string, changes: RecordingJsonObject, authorizationPin?: string): Promise<void>;
}) {
  const [kind, setKind] = useState<RecordingActionKind | null>(null);
  const [value, setValue] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const open = (nextKind: RecordingActionKind) => {
    setKind(nextKind);
    setValue(nextKind === "rename" ? input.selectedRecording?.metadata?.name ?? input.selectedRecording?.recordingId ?? "" : "");
    setPin("");
    setError("");
  };

  const close = () => {
    if (!busy) setKind(null);
  };

  const submit = async () => {
    if (!kind || !input.selectedRecording) return;
    if (pin.length < 4) {
      setError("Enter your security PIN.");
      return;
    }
    if (["rename", "note", "marker"].includes(kind) && !value.trim()) {
      setError(kind === "rename" ? "Enter a recording name." : kind === "note" ? "Enter note text." : "Enter a marker label.");
      return;
    }
    setBusy(true);
    setError("");
    const recordingId = input.selectedRecording.recordingId;
    try {
      if (kind === "rename") await input.onUpdateRecording(recordingId, { name: value.trim() }, pin);
      if (kind === "note") await appendRecordingNote(input.onAppendRecordingNote, {
        recordingId,
        ...(input.selectedEntry?.id ? { linkedEntryId: input.selectedEntry.id } : {}),
        text: value,
        authorizationPin: pin
      });
      if (kind === "marker") await appendRecordingMarker(input.onAppendRecordingMarker, {
        recordingId,
        ...(input.selectedEntry?.id ? { linkedEntryId: input.selectedEntry.id } : {}),
        ...(input.selectedEntry?.monotonicOffsetMs !== undefined ? { monotonicOffsetMs: input.selectedEntry.monotonicOffsetMs } : {}),
        label: value,
        authorizationPin: pin
      });
      if (kind === "finalize") await input.onFinalizeRecording(recordingId, pin);
      if (kind === "delete") await input.onDeleteRecording(recordingId, pin);
      if (kind === "repair") {
        if (!input.projectId) {
          setError("Open a project before repairing recording state.");
          return;
        }
        const result = await input.dataPort.repairStateIndex({
          projectId: input.projectId,
          recordingId,
          authorizationPin: pin
        });
        if (!result.ok) {
          setError(result.error ?? "Recording state index could not be repaired.");
          return;
        }
        await input.onRefreshRecordings();
      }
      setKind(null);
    } finally {
      setBusy(false);
    }
  };

  return {
    kind,
    value,
    pin,
    busy,
    error,
    open,
    close,
    submit,
    setValue,
    setPin
  };
}