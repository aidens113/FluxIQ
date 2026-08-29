"use client";

import type { AutomationStudioStores } from "../stores/studio-stores";
import {
  useAutomationProjectEntityCollection, useAutomationProjectEntityCollectionSetter,
  useAutomationProjectResource, useAutomationProjectResourceSetter
} from "../stores/use-project-data-resource";

const EMPTY_LIST = Object.freeze([]) as unknown as any[];
const recordingId = (value: any, index: number) => String(value?.recordingId ?? value?.id ?? `index:${index}`);
const timelineId = (value: any, index: number) => String(value?.normalizedTimelineId ?? value?.id ?? `index:${index}`);

export function useAutomationRecordingProjectState(stores: AutomationStudioStores) {
  const projectRecordings = useAutomationProjectEntityCollection<any>(stores, "recordings");
  const projectTimelines = useAutomationProjectEntityCollection<any>(stores, "timelines");
  const recordingDomains = useAutomationProjectResource<any[]>(stores, "recordingDomains", EMPTY_LIST);
  return {
    projectRecordings, setProjectRecordings: useAutomationProjectEntityCollectionSetter(stores, "recordings", recordingId),
    projectTimelines, setProjectTimelines: useAutomationProjectEntityCollectionSetter(stores, "timelines", timelineId),
    recordingDomains, setRecordingDomains: useAutomationProjectResourceSetter<any[]>(stores, "recordingDomains")
  };
}