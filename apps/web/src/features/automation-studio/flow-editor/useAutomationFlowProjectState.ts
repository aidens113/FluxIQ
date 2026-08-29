"use client";

import type { AutomationStudioStores } from "../stores/studio-stores";
import {
  useAutomationProjectEntityCollection, useAutomationProjectEntityCollectionSetter,
  useAutomationProjectResource, useAutomationProjectResourceSetter
} from "../stores/use-project-data-resource";

const EMPTY_LIST = Object.freeze([]) as unknown as any[];
const EMPTY_RECORD = Object.freeze({}) as Record<string, any>;
const EMPTY_PROJECT_ARTIFACTS = Object.freeze({ tasks: [], routines: [], configs: [], flows: [] });
const EMPTY_FLOW_DEPENDENCIES = Object.freeze({ dependencies: [], usedBy: [], availableUpgrades: [] });
const flowEntryId = (value: any, index: number) => String(value?.flow?.flowId ?? value?.flowId ?? value?.id ?? `index:${index}`);

export function useAutomationFlowProjectState(stores: AutomationStudioStores) {
  const projectArtifacts = useAutomationProjectResource(stores, "projectArtifacts", EMPTY_PROJECT_ARTIFACTS);
  const projectFlows = useAutomationProjectEntityCollection<any>(stores, "flows");
  const nativeNodeDefinitions = useAutomationProjectResource<any[]>(stores, "nativeNodeDefinitions", EMPTY_LIST);
  const publishedFlowDefinitions = useAutomationProjectResource<any[]>(stores, "publishedFlowDefinitions", EMPTY_LIST);
  const flowPublications = useAutomationProjectResource<any[]>(stores, "flowPublications", EMPTY_LIST);
  const flowDependencyInfo = useAutomationProjectResource(stores, "flowDependencyInfo", EMPTY_FLOW_DEPENDENCIES);
  const hasDirtyTaskGraph = useAutomationProjectResource(stores, "hasDirtyTaskGraph", false);
  const taskGraphDrafts = useAutomationProjectResource<Record<string, { nodes: any[]; edges: any[] }>>(stores, "taskGraphDrafts", EMPTY_RECORD);
  return {
    projectArtifacts, setProjectArtifacts: useAutomationProjectResourceSetter<any>(stores, "projectArtifacts"),
    projectFlows, setProjectFlows: useAutomationProjectEntityCollectionSetter(stores, "flows", flowEntryId),
    nativeNodeDefinitions, setNativeNodeDefinitions: useAutomationProjectResourceSetter<any[]>(stores, "nativeNodeDefinitions"),
    publishedFlowDefinitions, setPublishedFlowDefinitions: useAutomationProjectResourceSetter<any[]>(stores, "publishedFlowDefinitions"),
    flowPublications, setFlowPublications: useAutomationProjectResourceSetter<any[]>(stores, "flowPublications"),
    flowDependencyInfo, setFlowDependencyInfo: useAutomationProjectResourceSetter<any>(stores, "flowDependencyInfo"),
    hasDirtyTaskGraph, setHasDirtyTaskGraph: useAutomationProjectResourceSetter<boolean>(stores, "hasDirtyTaskGraph"),
    taskGraphDrafts, setTaskGraphDrafts: useAutomationProjectResourceSetter<Record<string, { nodes: any[]; edges: any[] }>>(stores, "taskGraphDrafts")
  };
}