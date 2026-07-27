import type { JsonObject } from "../core";
import type { DomainInputDefinition, DomainManifest, DomainOutputDefinition } from "../domains";

export type IoMode = "stream" | "request" | "stream_and_request";

export type IoEnvelope<TPayload = unknown> = {
  id: string;
  domainId?: string | null;
  ioId: string;
  sequence: number;
  timestampMs: number;
  payload: TPayload;
  metadata?: JsonObject;
};

export type InputReadRequest = {
  domainId?: string | null;
  inputId: string;
  params?: JsonObject;
};

export type OutputDispatchRequest<TPayload = unknown> = {
  domainId?: string | null;
  outputId: string;
  payload: TPayload;
  metadata?: JsonObject;
};

export type OutputDispatchResult<TPayload = unknown> = {
  ok: boolean;
  outputId: string;
  domainId?: string | null;
  payload?: TPayload;
  error?: string;
  metadata?: JsonObject;
};

export type IoUnsubscribe = () => void;

export type RuntimeInputs = {
  read<TPayload = unknown>(inputId: string, params?: JsonObject): Promise<IoEnvelope<TPayload>>;
  subscribe<TPayload = unknown>(inputId: string, handler: (event: IoEnvelope<TPayload>) => void): IoUnsubscribe;
};

export type RuntimeOutputs = {
  dispatch<TPayload = unknown, TResult = unknown>(
    outputId: string,
    payload: TPayload,
    metadata?: JsonObject
  ): Promise<OutputDispatchResult<TResult>>;
  subscribe<TResult = unknown>(outputId: string, handler: (event: IoEnvelope<TResult>) => void): IoUnsubscribe;
};

export type InputAdapter<TPayload = unknown> = {
  definition: DomainInputDefinition;
  mode: IoMode;
  read?: (request: InputReadRequest) => Promise<IoEnvelope<TPayload>> | IoEnvelope<TPayload>;
  subscribe?: (handler: (event: IoEnvelope<TPayload>) => void) => IoUnsubscribe;
};

export type OutputAdapter<TPayload = unknown, TResult = unknown> = {
  definition: DomainOutputDefinition;
  mode: IoMode;
  dispatch: (request: OutputDispatchRequest<TPayload>) => Promise<OutputDispatchResult<TResult>> | OutputDispatchResult<TResult>;
  subscribe?: (handler: (event: IoEnvelope<TResult>) => void) => IoUnsubscribe;
};

export type IoRegistration = {
  domainId?: string | null;
  inputs?: InputAdapter[];
  outputs?: OutputAdapter[];
};

export type IoValidationIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  domainId?: string | null;
  ioId?: string;
  source?: string;
};

export type IoAdapterSummary = {
  domainId: string | null;
  ioId: string;
  title: string;
  description?: string;
  mode: IoMode;
};

export type IoSnapshot = {
  inputs: IoAdapterSummary[];
  outputs: IoAdapterSummary[];
};

export class IoRegistry {
  private readonly inputs = new Map<string, InputAdapter>();
  private readonly outputs = new Map<string, OutputAdapter>();

  register(registration: IoRegistration): void {
    for (const input of registration.inputs ?? []) {
      this.registerInput(registration.domainId, input);
    }
    for (const output of registration.outputs ?? []) {
      this.registerOutput(registration.domainId, output);
    }
  }

  registerInput(domainId: string | null | undefined, adapter: InputAdapter): void {
    const key = ioKey(domainId, adapter.definition.id);
    if (this.inputs.has(key)) {
      throw new Error(`Duplicate input adapter: ${key}`);
    }
    this.inputs.set(key, adapter);
  }

  registerOutput(domainId: string | null | undefined, adapter: OutputAdapter): void {
    const key = ioKey(domainId, adapter.definition.id);
    if (this.outputs.has(key)) {
      throw new Error(`Duplicate output adapter: ${key}`);
    }
    this.outputs.set(key, adapter);
  }

  async readInput<TPayload = unknown>(request: InputReadRequest): Promise<IoEnvelope<TPayload>> {
    const adapter = this.inputs.get(ioKey(request.domainId, request.inputId));
    if (!adapter?.read) {
      throw new Error(`Input is not readable on demand: ${ioKey(request.domainId, request.inputId)}`);
    }
    return adapter.read(request) as Promise<IoEnvelope<TPayload>>;
  }

  subscribeInput<TPayload = unknown>(
    domainId: string | null | undefined,
    inputId: string,
    handler: (event: IoEnvelope<TPayload>) => void
  ): IoUnsubscribe {
    const adapter = this.inputs.get(ioKey(domainId, inputId));
    if (!adapter?.subscribe) {
      throw new Error(`Input is not streamable: ${ioKey(domainId, inputId)}`);
    }
    return adapter.subscribe(handler as (event: IoEnvelope) => void);
  }

  async dispatchOutput<TPayload = unknown, TResult = unknown>(
    request: OutputDispatchRequest<TPayload>
  ): Promise<OutputDispatchResult<TResult>> {
    const adapter = this.outputs.get(ioKey(request.domainId, request.outputId));
    if (!adapter) {
      throw new Error(`Output adapter not found: ${ioKey(request.domainId, request.outputId)}`);
    }
    return adapter.dispatch(request) as Promise<OutputDispatchResult<TResult>>;
  }

  subscribeOutput<TResult = unknown>(
    domainId: string | null | undefined,
    outputId: string,
    handler: (event: IoEnvelope<TResult>) => void
  ): IoUnsubscribe {
    const adapter = this.outputs.get(ioKey(domainId, outputId));
    if (!adapter?.subscribe) {
      throw new Error(`Output does not publish events: ${ioKey(domainId, outputId)}`);
    }
    return adapter.subscribe(handler as (event: IoEnvelope) => void);
  }

  inputIds(domainId?: string | null): string[] {
    return idsForDomain(this.inputs.keys(), domainId);
  }

  outputIds(domainId?: string | null): string[] {
    return idsForDomain(this.outputs.keys(), domainId);
  }

  hasInput(domainId: string | null | undefined, inputId: string): boolean {
    return this.inputs.has(ioKey(domainId, inputId));
  }

  hasOutput(domainId: string | null | undefined, outputId: string): boolean {
    return this.outputs.has(ioKey(domainId, outputId));
  }

  snapshot(domainId?: string | null): IoSnapshot {
    return {
      inputs: adapterSummaries(this.inputs, domainId),
      outputs: adapterSummaries(this.outputs, domainId)
    };
  }
}

export function validateDomainIo(manifest: DomainManifest, registry: IoRegistry): IoValidationIssue[] {
  const issues: IoValidationIssue[] = [];
  const domainId = manifest.id;
  const registeredInputs = new Set(registry.inputIds(domainId));
  const registeredOutputs = new Set(registry.outputIds(domainId));

  for (const input of manifest.inputs ?? []) {
    if (!registeredInputs.has(input.id)) {
      issues.push({
        severity: "error",
        code: "domain.input.adapter_missing",
        message: `Domain input '${input.id}' has no registered adapter`,
        domainId,
        ioId: input.id
      });
    }
  }

  for (const output of manifest.outputs ?? []) {
    if (!registeredOutputs.has(output.id)) {
      issues.push({
        severity: "error",
        code: "domain.output.adapter_missing",
        message: `Domain output '${output.id}' has no registered adapter`,
        domainId,
        ioId: output.id
      });
    }
  }

  return issues;
}

export function validateIoRequirements(params: {
  registry: IoRegistry;
  domainId?: string | null;
  requiredInputs?: string[];
  requiredOutputs?: string[];
  source?: string;
}): IoValidationIssue[] {
  const issues: IoValidationIssue[] = [];
  for (const inputId of params.requiredInputs ?? []) {
    if (!params.registry.hasInput(params.domainId, inputId)) {
      const issue: IoValidationIssue = {
        severity: "error",
        code: "runtime.input.required_missing",
        message: `Required input '${inputId}' is not registered`,
        domainId: params.domainId ?? null,
        ioId: inputId
      };
      if (params.source) {
        issue.source = params.source;
      }
      issues.push(issue);
    }
  }
  for (const outputId of params.requiredOutputs ?? []) {
    if (!params.registry.hasOutput(params.domainId, outputId)) {
      const issue: IoValidationIssue = {
        severity: "error",
        code: "runtime.output.required_missing",
        message: `Required output '${outputId}' is not registered`,
        domainId: params.domainId ?? null,
        ioId: outputId
      };
      if (params.source) {
        issue.source = params.source;
      }
      issues.push(issue);
    }
  }
  return issues;
}

export function createEnvelope<TPayload>(params: {
  ioId: string;
  payload: TPayload;
  domainId?: string | null;
  sequence?: number;
  timestampMs?: number;
  metadata?: JsonObject;
}): IoEnvelope<TPayload> {
  const envelope: IoEnvelope<TPayload> = {
    id: `${normalizeDomainId(params.domainId)}:${normalizeIoId(params.ioId)}:${params.sequence ?? 1}`,
    domainId: params.domainId ?? null,
    ioId: normalizeIoId(params.ioId),
    sequence: params.sequence ?? 1,
    timestampMs: params.timestampMs ?? Date.now(),
    payload: params.payload
  };
  if (params.metadata) {
    envelope.metadata = params.metadata;
  }
  return envelope;
}

function ioKey(domainId: string | null | undefined, ioId: string): string {
  return `${normalizeDomainId(domainId)}:${normalizeIoId(ioId)}`;
}

function normalizeDomainId(value: string | null | undefined): string {
  return value?.trim().toLowerCase() || "global";
}

function normalizeIoId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "_");
}

function idsForDomain(keys: IterableIterator<string>, domainId: string | null | undefined): string[] {
  const prefix = `${normalizeDomainId(domainId)}:`;
  return [...keys]
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length))
    .sort();
}

function adapterSummaries(
  adapters: Map<string, InputAdapter | OutputAdapter>,
  domainId: string | null | undefined
): IoAdapterSummary[] {
  const prefix = domainId === undefined ? "" : `${normalizeDomainId(domainId)}:`;
  return [...adapters.entries()]
    .filter(([key]) => !prefix || key.startsWith(prefix))
    .map(([key, adapter]) => {
      const [domain = "global", ioId = ""] = key.split(":", 2);
      const summary: IoAdapterSummary = {
        domainId: domain === "global" ? null : domain,
        ioId,
        title: adapter.definition.title,
        mode: adapter.mode
      };
      if (adapter.definition.description) {
        summary.description = adapter.definition.description;
      }
      return summary;
    })
    .sort((left, right) => `${left.domainId ?? "global"}:${left.ioId}`.localeCompare(`${right.domainId ?? "global"}:${right.ioId}`));
}
