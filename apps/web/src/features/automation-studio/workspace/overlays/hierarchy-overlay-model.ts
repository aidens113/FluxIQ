import type {
  FlowOrigin,
  HierarchyItemKind,
  HierarchyOverlayCommand,
  HierarchyOverlayRequest
} from "./contracts";

export type HierarchyCreateRequest = Extract<HierarchyOverlayRequest, { kind: "create" }>;
export type HierarchyDeleteRequest = Extract<HierarchyOverlayRequest, { kind: "delete" }>;

export type HierarchyOverlayDraft = {
  step: "type" | "details";
  itemKind: HierarchyItemKind;
  name: string;
  parentId: string | null;
  flowOrigin: FlowOrigin;
  pin: string;
};

export function hierarchyDraftForRequest(request: HierarchyOverlayRequest): HierarchyOverlayDraft {
  return {
    step: "type",
    itemKind: request.kind === "create" ? request.allowedKinds[0] ?? "folder" : "folder",
    name: "",
    parentId: request.kind === "create" ? request.parentId : null,
    flowOrigin: "blank",
    pin: ""
  };
}

export function hierarchyCommandFromDraft(
  request: HierarchyOverlayRequest,
  draft: HierarchyOverlayDraft
): HierarchyOverlayCommand {
  if (request.kind === "delete") {
    return {
      type: "hierarchy.delete",
      requestId: request.id,
      nodeId: request.node.id,
      pin: draft.pin
    };
  }
  return {
    type: "hierarchy.create",
    requestId: request.id,
    category: request.category,
    itemKind: draft.itemKind,
    name: draft.name.trim(),
    parentId: draft.parentId,
    flowOrigin: draft.flowOrigin,
    pin: draft.pin
  };
}