"use client";

import { useMemo, useState } from "react";
import { automationEditorPalette } from "./node-palette";
import type { AutomationEditorNodeSpec, AutomationEditorPaletteGroup } from "./node-types";
import type { FlowEditorProps } from "./flow-editor-types";

export function useFlowEditorPalette(props: FlowEditorProps) {
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [paletteFocusRevision, setPaletteFocusRevision] = useState(0);
  const dynamicDefinitions = useMemo(
    () => props.nativeNodeDefinitions.map((definition: any): AutomationEditorNodeSpec => ({
      id: definition.id,
      version: definition.version,
      label: definition.label,
      description: definition.description,
      family: definition.category ?? "custom",
      scope: definition.legacyScope ?? "both",
      nodeType: "custom",
      inputs: definition.inputs ?? [],
      outputs: definition.outputs ?? [],
      parameters: definition.parameters ?? [],
      source: definition.source,
      availability: definition.availability,
      ...(definition.icon ? { icon: definition.icon } : {}),
      privileged: definition.safety?.privileged === true,
      ...(definition.outputAction ? { actionTypes: ["action"] } : {})
    })),
    [props.nativeNodeDefinitions]
  );
  const palette = useMemo(() => {
    const frameworkGroups = automationEditorPalette
      .map((group) => ({
        ...group,
        nodes: group.nodes.filter(
          (node) => (node.scope === "policy" || node.scope === "both")
            && node.family !== "policy"
        )
      }))
      .filter((group) => group.nodes.length);
    const dynamicGroup = (
      title: string,
      predicate: (node: AutomationEditorNodeSpec) => boolean
    ): AutomationEditorPaletteGroup => ({
      title,
      nodes: dynamicDefinitions.filter(predicate)
    });
    return [
      ...frameworkGroups,
      dynamicGroup(
        "Integrations",
        (node) => node.source?.kind === "importer"
          && node.availability?.kind !== "domain"
      ),
      dynamicGroup(
        "Domain Nodes",
        (node) => node.source?.kind === "importer"
          && node.availability?.kind === "domain"
      ),
      dynamicGroup("Public Flows", (node) => node.source?.kind === "composite"),
      dynamicGroup("Project Nodes", (node) => node.source?.kind === "recording"),
      dynamicGroup("Code", (node) => node.source?.kind === "code"),
      ...automationEditorPalette.map((group) => ({
        ...group,
        nodes: group.nodes.filter(
          (node) => (node.scope === "policy" || node.scope === "both")
            && node.family === "policy"
        )
      }))
    ].filter((group) => group.nodes.length > 0);
  }, [dynamicDefinitions]);

  const openFlowNodePalette = () => {
    setPaletteCollapsed(false);
    setPaletteFocusRevision((revision) => revision + 1);
  };

  return {
    palette,
    paletteCollapsed,
    setPaletteCollapsed,
    paletteFocusRevision,
    openFlowNodePalette
  };
}

export type FlowEditorPalette = ReturnType<typeof useFlowEditorPalette>;