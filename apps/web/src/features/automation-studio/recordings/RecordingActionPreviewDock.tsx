"use client";

import { useMemo } from "react";
import {
  createRecordingActionPreviewIndex,
  projectRecordingActionPreview,
  type RecordingActionPreviewModel
} from "./action-preview-model";
import { RecordingActionPreview } from "./RecordingActionPreview";

export type RecordingActionPreviewDockProps = {
  onSelectAction(entryId: string): void;
} & ({ model: RecordingActionPreviewModel } | {
  entries: readonly unknown[];
  selectedEntryId?: string;
});

export function RecordingActionPreviewDock(props: RecordingActionPreviewDockProps) {
  if ("model" in props) {
    return <RecordingActionPreview model={props.model} onSelectAction={props.onSelectAction} />;
  }
  return <RecordingActionPreviewDockEntries {...props} />;
}

function RecordingActionPreviewDockEntries(props: {
  entries: readonly unknown[];
  selectedEntryId?: string;
  onSelectAction(entryId: string): void;
}) {
  const index = useMemo(() => createRecordingActionPreviewIndex(props.entries), [props.entries]);
  const model = useMemo(
    () => projectRecordingActionPreview(index, props.selectedEntryId),
    [index, props.selectedEntryId]
  );
  return <RecordingActionPreview model={model} onSelectAction={props.onSelectAction} />;
}
