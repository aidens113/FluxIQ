import type { InspectorReferenceOptions } from "./types";

export function automationInspectorReferenceOptions(props: {
  flow: any;
  nodeDefinitions: any[];
  policies: any[];
  pipelineArtifacts: any;
}): InspectorReferenceOptions {
  const pipeline = props.pipelineArtifacts ?? {};
  const option = (id: unknown, label: unknown, detail?: unknown) => ({
    id: String(id ?? ""),
    label: String(label ?? id ?? "Unnamed"),
    ...(detail ? { detail: String(detail) } : {})
  });
  const actions = props.nodeDefinitions
    .filter((definition) => definition?.outputAction || definition?.safety?.privileged || definition?.category === "policy")
    .map((definition) => option(definition.id, definition.label, definition.description));
  const tasks = [...(pipeline.tasks ?? []), ...(pipeline.learnedTaskModels ?? [])]
    .map((task: any) => option(task.taskId ?? task.id, task.name ?? task.label ?? task.taskId, task.description));
  const policies = [...(props.policies ?? []), ...(pipeline.policyGraphs ?? [])]
    .map((policy: any) => option(policy.policyId ?? policy.id, policy.name ?? policy.label ?? policy.policyId, policy.version));
  const routines = (pipeline.routines ?? [])
    .map((routine: any) => option(routine.routineId ?? routine.id, routine.name ?? routine.label ?? routine.routineId, routine.description));
  const collections = [...(pipeline.databaseCollections ?? []), ...(pipeline.collections ?? [])]
    .map((collection: any) => option(collection.collectionId ?? collection.id ?? collection.name, collection.label ?? collection.name ?? collection.id, collection.description));
  const variables = (props.flow?.variables ?? [])
    .map((variable: any) => typeof variable === "string" ? option(variable, variable) : option(variable.id ?? variable.name, variable.label ?? variable.name ?? variable.id, variable.description));
  return {
    action: uniqueReferenceOptions(actions),
    task: uniqueReferenceOptions(tasks),
    policy: uniqueReferenceOptions(policies),
    routine: uniqueReferenceOptions(routines),
    "database-collection": uniqueReferenceOptions(collections),
    variable: uniqueReferenceOptions(variables)
  };
}

function uniqueReferenceOptions(options: Array<{ id: string; label: string; detail?: string }>) {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (!option.id || seen.has(option.id)) return false;
    seen.add(option.id);
    return true;
  });
}