// Projects, and the data a run collected inside them.

import { deleteRunDatasets } from "../../../datasets";
import { automationStudioViewId } from "../../../views";
import { definePanelCapability, panelCapabilityResult, type PanelCapability } from "../contract";
import { PROJECT, RUN, PIN } from "./argument";
import { str } from "./value";

export const PROJECT_CAPABILITIES: readonly PanelCapability[] = [
  definePanelCapability({
    id: "project.create",
    title: "Create a project",
    summary: "Makes a new project to keep Flows in.",
    group: "Projects",
    phrases: ["new project", "create a project", "start a project"],
    control: { view: null, label: "New project" },
    endpoints: ["create-project"],
    arguments: [
      { name: "name", kind: "text", describe: "What to call it.", required: true },
      { name: "description", kind: "text", describe: "What it is for.", required: false },
      PIN
    ],
    consequences: ["create_new"],
    invoke: async (context, args) => panelCapabilityResult(
      await context.transport.post("create-project", {
        name: str(args, "name"),
        description: str(args, "description"),
        categoryId: null,
        authorizationPin: str(args, "authorizationPin")
      }),
      "Created the project.",
      "The project could not be created."
    )
  }),
  definePanelCapability({
    id: "project.rename",
    title: "Rename a project",
    summary: "Changes a project's name or what it says it is for.",
    group: "Projects",
    phrases: ["rename the project", "change the project name", "call the project"],
    control: { view: null, label: "Rename project" },
    endpoints: ["update-project"],
    arguments: [
      PROJECT,
      { name: "name", kind: "text", describe: "The new name.", required: true },
      { name: "description", kind: "text", describe: "What it is for.", required: false },
      PIN
    ],
    consequences: ["modify_existing"],
    invoke: async (context, args) => panelCapabilityResult(
      await context.transport.post("update-project", {
        projectId: str(args, "projectId"),
        name: str(args, "name"),
        description: str(args, "description"),
        authorizationPin: str(args, "authorizationPin")
      }),
      "Renamed the project.",
      "The project could not be renamed."
    )
  }),
  definePanelCapability({
    id: "project.delete",
    title: "Delete a project",
    summary: "Removes a project and every Flow in it. Asks for your PIN first.",
    group: "Projects",
    phrases: ["delete the project", "remove the project", "get rid of this project"],
    control: { view: null, label: "Delete project" },
    endpoints: ["delete-project"],
    arguments: [PROJECT, PIN],
    consequences: ["delete"],
    invoke: async (context, args) => panelCapabilityResult(
      await context.transport.post("delete-project", { projectId: str(args, "projectId"), authorizationPin: str(args, "authorizationPin") }),
      "Deleted the project.",
      "The project could not be deleted."
    )
  }),
  definePanelCapability({
    id: "data.delete",
    title: "Delete what a run collected",
    summary: "Removes the data a run gathered. Asks for your PIN first.",
    group: "Collected data",
    phrases: ["delete the data", "clear the results", "remove what it collected", "throw the data away"],
    control: { view: automationStudioViewId.runtime, label: "Delete data" },
    endpoints: ["delete-run-datasets"],
    arguments: [PROJECT, RUN, { name: "datasetId", kind: "id", describe: "One dataset, or leave it out for all of them.", required: false }, PIN],
    consequences: ["delete"],
    invoke: async (context, args) => panelCapabilityResult(
      await deleteRunDatasets(context.transport, {
        projectId: str(args, "projectId"),
        runId: str(args, "runId"),
        authorizationPin: str(args, "authorizationPin"),
        ...(args.datasetId ? { datasetId: str(args, "datasetId") } : {})
      }),
      "Deleted the collected data.",
      "The data could not be deleted."
    )
  })
];
