import type { Edge, Node } from "@xyflow/react";
import { automationGraphRevisionSignature } from "../graph/viewport-store";
export function graphSignature(nodes: Array<Node<any>>, edges: Edge[]): string {
  return JSON.stringify({
    nodes: nodes.map(({ id, type, position, data }) => ({
      id,
      type,
      position,
      data: graphNodeDataSignature(data)
    })),
    edges: edges.map(({ id, source, target, sourceHandle, targetHandle, data }) => ({ id, source, target, sourceHandle, targetHandle, data }))
  });
}

function graphNodeDataSignature(data: any) {
  return {
    nodeDefinitionId: data?.nodeDefinitionId,
    nodeDefinitionVersion: data?.nodeDefinitionVersion,
    label: data?.label,
    description: data?.description,
    customDescription: data?.customDescription,
    actionTypes: data?.actionTypes,
    recovery: data?.recovery,
    inputs: (data?.inputs ?? []).map((input: any) => input.id),
    outputs: (data?.outputs ?? []).map((output: any) => output.id),
    parameters: (data?.parameters ?? []).map((parameter: any) => parameter.id),
    parameterValues: data?.parameterValues,
    timeoutMs: data?.timeoutMs,
    regionId: data?.regionId,
    metadata: graphMetadataSignature(data?.metadata)
  };
}

function graphMetadataSignature(metadata: any) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return metadata;
  return {
    ownerKind: metadata.ownerKind,
    ownerId: metadata.ownerId,
    proposalId: metadata.proposalId,
    recordingId: metadata.recordingId,
    regionId: metadata.regionId,
    position: metadata.position
  };
}

export function automationTaskGraphSourceSignature(graph: any): string {
  return automationGraphRevisionSignature({
    flowId: graph?.flowId ?? graph?.graphId ?? graph?.ownerId,
    revision: graph?.graphRevision ?? graph?.revision ?? graph?.metadata?.graphRevision,
    updatedAt: graph?.updatedAt ?? graph?.metadata?.savedAt,
    pendingOperationCount: graph?.metadata?.pendingOperationCount ?? (graph?.nodes?.length ?? 0),
    pendingOperationBytes: graph?.metadata?.pendingOperationBytes ?? (graph?.edges?.length ?? 0),
  });
}

export function legacyPolicySourceSignature(policy: any): string {
  return automationGraphRevisionSignature({
    flowId: policy?.policyId ?? policy?.taskId,
    revision: policy?.revision ?? policy?.generatedMetadata?.revision,
    updatedAt: policy?.updatedAt ?? policy?.generatedMetadata?.generatedAt,
    pendingOperationCount: policy?.nodes?.length ?? 0,
    pendingOperationBytes: policy?.edges?.length ?? 0,
  });
}

export function automationNativeNodeDefinitionSignature(definitions: any[]): string {
  return definitions.map((definition) => [
    definition.id,
    definition.version,
    (definition.parameters ?? []).map((parameter: any) => parameter.id).join(","),
    (definition.inputs ?? []).map((input: any) => input.id).join(","),
    (definition.outputs ?? []).map((output: any) => output.id).join(",")
  ].join("|")).join(";");
}
