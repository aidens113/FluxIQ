// How a Flow behaves: its settings, its parts, and where it branches.
//
// None of this asks a person for permission. Changing a setting is the panel
// doing the job it was asked to do, and a gate on it would be the product
// declining to be operated. Only deleting a part or a branch re-authorizes.

import { deleteFlowMapRoute, saveFlowMapFallback, saveFlowMapRoute } from "../../../router";
import { changeSubflowLifecycle, saveFlowSettings, updateSubflowSettings } from "../../../settings";
import { applySubflowDirectoryAction } from "../../../subflows";
import { automationStudioViewId } from "../../../views";
import { definePanelCapability, panelCapabilityResult, type PanelCapability } from "../contract";
import { PROJECT, FLOW, SUBFLOW, PIN } from "./argument";
import { str, json } from "./value";

export const SETTINGS_CAPABILITIES: readonly PanelCapability[] = [
  definePanelCapability({
    id: "flow.settings",
    title: "Change a Flow's settings",
    summary: "Changes how the Flow behaves when it runs -- its retries, waits, limits and the rest.",
    group: "Settings",
    phrases: ["change a setting", "settings", "configure the flow", "set the retries", "change the timeout"],
    control: { view: automationStudioViewId.settings, label: "Settings" },
    endpoints: ["update-flow-settings"],
    arguments: [PROJECT, FLOW, { name: "settings", kind: "json", describe: "The settings to change, as names and values.", required: true }],
    consequences: ["modify_existing"],
    invoke: async (context, args) => panelCapabilityResult(
      await saveFlowSettings(context.transport, { projectId: str(args, "projectId"), flowId: str(args, "flowId"), ...json(args, "settings") }),
      "Changed the Flow's settings.",
      "The settings could not be changed."
    )
  }),
  definePanelCapability({
    id: "subflow.settings",
    title: "Change one part of a Flow's settings",
    summary: "Changes how one part of the Flow behaves without touching the rest.",
    group: "Settings",
    phrases: ["subflow settings", "configure the subflow", "change the subflow"],
    control: { view: automationStudioViewId.subflows, label: "Subflow settings" },
    endpoints: ["update-flow-subflow"],
    arguments: [PROJECT, FLOW, SUBFLOW, { name: "settings", kind: "json", describe: "The settings to change.", required: true }],
    consequences: ["modify_existing"],
    invoke: async (context, args) => panelCapabilityResult(
      await updateSubflowSettings(context.transport, {
        projectId: str(args, "projectId"),
        flowId: str(args, "flowId"),
        subflowId: str(args, "subflowId"),
        ...json(args, "settings")
      }),
      "Changed that part's settings.",
      "That part's settings could not be changed."
    )
  }),
  definePanelCapability({
    id: "subflow.turnOn",
    title: "Turn part of a Flow on or off",
    summary: "Enables, disables or archives one part of the Flow.",
    group: "Settings",
    phrases: ["turn it off", "disable the subflow", "enable the subflow", "switch that part off", "archive the subflow"],
    control: { view: automationStudioViewId.subflows, label: "Enable / Disable" },
    endpoints: ["enable-flow-subflow", "disable-flow-subflow", "archive-flow-subflow"],
    arguments: [PROJECT, FLOW, SUBFLOW, { name: "state", kind: "text", describe: "One of enable, disable or archive.", required: true }],
    consequences: ["modify_existing"],
    invoke: async (context, args) => {
      const state = str(args, "state");
      const endpoint = state === "disable" ? "disable-flow-subflow" : state === "archive" ? "archive-flow-subflow" : "enable-flow-subflow";
      return panelCapabilityResult(
        await changeSubflowLifecycle(context.transport, endpoint, {
          projectId: str(args, "projectId"),
          flowId: str(args, "flowId"),
          subflowId: str(args, "subflowId")
        }),
        `That part of the Flow is now ${state}d.`,
        "That part of the Flow could not be changed."
      );
    }
  }),
  definePanelCapability({
    id: "subflow.rename",
    title: "Rename or copy part of a Flow",
    summary: "Renames a part of the Flow, or copies it so a variant can be tried.",
    group: "Settings",
    phrases: ["rename the subflow", "copy the subflow", "duplicate that part", "call it something else"],
    control: { view: automationStudioViewId.subflows, label: "Rename" },
    endpoints: ["rename-flow-subflow", "duplicate-flow-subflow"],
    arguments: [
      PROJECT,
      FLOW,
      SUBFLOW,
      { name: "action", kind: "text", describe: "Either rename or duplicate.", required: true },
      { name: "name", kind: "text", describe: "The new name.", required: false }
    ],
    consequences: ["modify_existing"],
    invoke: async (context, args) => panelCapabilityResult(
      await applySubflowDirectoryAction(context.transport, str(args, "action") === "duplicate" ? "duplicate" : "rename", {
        projectId: str(args, "projectId"),
        flowId: str(args, "flowId"),
        subflowId: str(args, "subflowId"),
        ...(args.name ? { name: str(args, "name") } : {})
      }),
      "Done.",
      "That part of the Flow could not be changed."
    )
  }),
  definePanelCapability({
    id: "subflow.create",
    title: "Add a part to a Flow",
    summary: "Creates a new part of the Flow that other parts can hand work to.",
    group: "Settings",
    phrases: ["add a subflow", "new part of the flow", "create a subflow", "split this out"],
    control: { view: automationStudioViewId.subflows, label: "New subflow" },
    endpoints: ["create-flow-subflow"],
    arguments: [PROJECT, FLOW, { name: "name", kind: "text", describe: "What to call it.", required: true }],
    consequences: ["create_new"],
    invoke: async (context, args) => panelCapabilityResult(
      await context.transport.post("create-flow-subflow", { projectId: str(args, "projectId"), flowId: str(args, "flowId"), name: str(args, "name") }),
      "Added the new part.",
      "The new part could not be added."
    )
  }),
  definePanelCapability({
    id: "subflow.delete",
    title: "Delete part of a Flow",
    summary: "Removes one part of the Flow for good. Asks for your PIN first.",
    group: "Settings",
    phrases: ["delete the subflow", "remove that part", "get rid of the subflow"],
    control: { view: automationStudioViewId.subflows, label: "Delete" },
    endpoints: ["delete-flow-subflow"],
    arguments: [PROJECT, FLOW, SUBFLOW, PIN],
    consequences: ["delete"],
    invoke: async (context, args) => panelCapabilityResult(
      await applySubflowDirectoryAction(context.transport, "delete", {
        projectId: str(args, "projectId"),
        flowId: str(args, "flowId"),
        subflowId: str(args, "subflowId"),
        authorizationPin: str(args, "authorizationPin")
      }),
      "Deleted that part of the Flow.",
      "That part of the Flow could not be deleted."
    )
  }),
  definePanelCapability({
    id: "route.save",
    title: "Change where the Flow branches",
    summary: "Sets which part of the Flow runs when a condition holds.",
    group: "Settings",
    phrases: ["change the routing", "add a branch", "when this happens do that", "set the route", "add a condition"],
    control: { view: automationStudioViewId.router, label: "Routes" },
    endpoints: ["save-flow-map-route"],
    arguments: [PROJECT, FLOW, { name: "route", kind: "json", describe: "The route: its condition and where it goes.", required: true }],
    consequences: ["modify_existing"],
    invoke: async (context, args) => panelCapabilityResult(
      await saveFlowMapRoute(context.transport, { projectId: str(args, "projectId"), flowId: str(args, "flowId"), ...json(args, "route") }),
      "Changed the routing.",
      "The routing could not be changed."
    )
  }),
  definePanelCapability({
    id: "route.fallback",
    title: "Set what happens when nothing matches",
    summary: "Chooses where the Flow goes when none of its branches apply.",
    group: "Settings",
    phrases: ["fallback", "when nothing matches", "otherwise do this", "default branch"],
    control: { view: automationStudioViewId.router, label: "Fallback" },
    endpoints: ["save-flow-map-fallback"],
    arguments: [PROJECT, FLOW, { name: "fallback", kind: "json", describe: "Where to go when nothing matched.", required: true }],
    consequences: ["modify_existing"],
    invoke: async (context, args) => panelCapabilityResult(
      await saveFlowMapFallback(context.transport, { projectId: str(args, "projectId"), flowId: str(args, "flowId"), ...json(args, "fallback") }),
      "Set the fallback.",
      "The fallback could not be set."
    )
  }),
  definePanelCapability({
    id: "route.delete",
    title: "Remove a branch",
    summary: "Takes one of the Flow's branches out. Asks for your PIN first.",
    group: "Settings",
    phrases: ["remove the branch", "delete the route", "drop that condition"],
    control: { view: automationStudioViewId.router, label: "Delete route" },
    endpoints: ["delete-flow-map-route"],
    arguments: [PROJECT, FLOW, { name: "routeId", kind: "id", describe: "The branch to remove.", required: true }, PIN],
    consequences: ["delete"],
    invoke: async (context, args) => panelCapabilityResult(
      await deleteFlowMapRoute(context.transport, {
        projectId: str(args, "projectId"),
        flowId: str(args, "flowId"),
        routeId: str(args, "routeId"),
        authorizationPin: str(args, "authorizationPin")
      }),
      "Removed the branch.",
      "The branch could not be removed."
    )
  })
];
