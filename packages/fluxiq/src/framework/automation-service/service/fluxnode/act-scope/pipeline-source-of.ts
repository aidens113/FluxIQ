import { automationStudioAnswerFirstTaskKey } from "../../answer-first/task-key/index.ts";
import { PipelineError } from "../../pipelines/index.ts";
import { fluxNodeCallerKey } from "../caller-key.ts";
import type { FluxNodeRun } from "../fluxnode-run.ts";
import type { FluxNodePipelineContext, PipelineSecrets, FluxNodeRegisteredPipeline } from "../pipeline/index.ts";
import { fluxNodeActScope } from "./act-scope.ts";
import { FluxNodePipelineSource } from "./pipeline-source.ts";
import { fluxNodePipelineSourceReference } from "./pipeline-source-reference.ts";
import { fluxNodePipelineSourceSecrets } from "./pipeline-source-secrets.ts";
import { fluxNodeSecretBindings } from "./secret-bindings.ts";

/** Binds the immutable source port to the execution and existing dataset/task-memory owners. */
export async function fluxNodePipelineSourceOf(context: FluxNodePipelineContext, run: FluxNodeRun, registered: FluxNodeRegisteredPipeline, secrets: PipelineSecrets): Promise<FluxNodePipelineSource> {
  // Task memory loads after the service: its note-screening dependency can refer back to the service entry.
  const { automationStudioAnswerFirstTaskMemoryOf } = await import("../../answer-first/task-memory/index.ts");
  const { service } = context;
  const taskKey = run.carried.taskKey ?? fluxNodeCallerKey({ name: registered.name, specHash: registered.specHash });
  run.carried.taskKey = taskKey;
  const bindings = await fluxNodeSecretBindings(registered, run.carried.inputs, context.flows, {
    privateDataset: async (snapshotId) => (await service.runDatasets.readImmutableSnapshotPage({ projectId: registered.projectId, snapshotId, limit: 1 })) !== null
  });
  if (bindings.problem) throw new PipelineError("pipeline.secure_source_binding_required", bindings.problem);
  secrets.meet(fluxNodePipelineSourceSecrets(run.carried.inputs, bindings.pointers));
  return new FluxNodePipelineSource({
    projectId: registered.projectId, runId: run.runId, source: registered.pipeline.source, inputs: run.carried.inputs,
    snapshots: service.runDatasets, fallbackReadDataset: context.datasets.read, secretTexts: secrets.texts,
    reference: fluxNodePipelineSourceReference({
      memory: automationStudioAnswerFirstTaskMemoryOf(service, { paths: service.projectPaths, projects: service.projects }),
      projectId: registered.projectId, flowId: registered.flowId,
      taskId: automationStudioAnswerFirstTaskKey({ instructionText: "", callerKey: taskKey }),
      scope: run.carried.actScope ?? fluxNodeActScope({ runId: run.runId })
    })
  });
}
