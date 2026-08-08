import type { JsonObject } from "../core/index.ts";
import type { DomainInputDefinition, DomainManifest, DomainOutputDefinition } from "../domains/index.ts";

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
  /**
   * Optional, importer-owned translation from a recorded action input to a
   * policy output invocation. This function must be deterministic and must
   * not perform the output itself.
   */
  outputBinding?: InputOutputBinding<TPayload>;
};

export type IoInputRole = NonNullable<DomainInputDefinition["role"]>;

export type InputOutputBinding<TPayload = unknown> = {
  outputId: string;
  toPayload: (event: IoEnvelope<TPayload>) => JsonObject;
  /**
   * By default, the bound input is also awaited as runtime confirmation after
   * its output dispatches. Set false only for intentionally fire-and-forget
   * outputs, or configure the confirmation timeout.
   */
  confirmation?: false | { timeoutMs?: number };
  metadata?: JsonObject;
};

export type OutputAdapter<TPayload = unknown, TResult = unknown> = {
  definition: DomainOutputDefinition;
  mode: IoMode;
  dispatch: (request: OutputDispatchRequest<TPayload>) => Promise<OutputDispatchResult<TResult>> | OutputDispatchResult<TResult>;
  subscribe?: (handler: (event: IoEnvelope<TResult>) => void) => IoUnsubscribe;
};

export type IoRegistration = {
  domainId?: string | null;
  inputs?: InputAdapter<any>[];
  outputs?: OutputAdapter<any, any>[];
};

/** A cohesive importer-owned domain IO package. */
export type DomainIoRegistration = IoRegistration & {
  domainId: string;
};

export type DefinedInput<TPayload = unknown> = InputAdapter<TPayload>;
export type DefinedOutput<TPayload = unknown, TResult = unknown> = OutputAdapter<TPayload, TResult>;

export function defineInput<TPayload = unknown>(input: InputAdapter<TPayload>): DefinedInput<TPayload> {
  validateInputDefinition(input);
  return input;
}

export function defineOutput<TPayload = unknown, TResult = unknown>(output: OutputAdapter<TPayload, TResult>): DefinedOutput<TPayload, TResult> {
  validateOutputDefinition(output);
  return output;
}

export function defineDomainIo(registration: DomainIoRegistration): DomainIoRegistration {
  if (!registration.domainId.trim()) throw new Error("Domain IO registration requires a domainId.");
  for (const input of registration.inputs ?? []) validateInputDefinition(input);
  for (const output of registration.outputs ?? []) validateOutputDefinition(output);
  return registration;
}

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
  role?: IoInputRole;
  outputId?: string;
  capabilities?: string[];
  safety?: DomainOutputDefinition["safety"];
};

export type IoSnapshot = {
  inputs: IoAdapterSummary[];
  outputs: IoAdapterSummary[];
};

export class IoRegistry {
  private readonly inputs = new Map<string, InputAdapter<any>>();
  private readonly outputs = new Map<string, OutputAdapter<any, any>>();

  register(registration: IoRegistration): void {
    for (const input of registration.inputs ?? []) {
      this.registerInput(registration.domainId, input);
    }
    for (const output of registration.outputs ?? []) {
      this.registerOutput(registration.domainId, output);
    }
  }

  registerInput(domainId: string | null | undefined, adapter: InputAdapter): void {
    validateInputDefinition(adapter);
    const key = ioKey(domainId, adapter.definition.id);
    if (this.inputs.has(key)) {
      throw new Error(`Duplicate input adapter: ${key}`);
    }
    this.inputs.set(key, adapter);
  }

  registerOutput(domainId: string | null | undefined, adapter: OutputAdapter): void {
    validateOutputDefinition(adapter);
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

  waitForInput<TPayload = unknown>(params: {
    domainId?: string | null;
    inputId: string;
    timeoutMs?: number;
    predicate?: (event: IoEnvelope<TPayload>) => boolean;
    signal?: AbortSignal;
  }): Promise<IoEnvelope<TPayload>> {
    const timeoutMs = Math.max(1, params.timeoutMs ?? 5_000);
    return new Promise<IoEnvelope<TPayload>>((resolve, reject) => {
      let settled = false;
      let unsubscribe: IoUnsubscribe | undefined;
      const settle = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        unsubscribe?.();
        params.signal?.removeEventListener("abort", abort);
        callback();
      };
      const abort = () => settle(() => reject(new Error("Input confirmation cancelled.")));
      const timeout = setTimeout(() => settle(() => reject(new Error(`Timed out waiting for input confirmation: ${ioKey(params.domainId, params.inputId)}`))), timeoutMs);
      try {
        if (params.signal?.aborted) { abort(); return; }
        params.signal?.addEventListener("abort", abort, { once: true });
        unsubscribe = this.subscribeInput<TPayload>(params.domainId, params.inputId, (event) => {
          if (params.predicate && !params.predicate(event)) return;
          settle(() => resolve(event));
        });
        if (settled) unsubscribe();
      } catch (error) {
        settle(() => reject(error));
      }
    });
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

  getInput(domainId: string | null | undefined, inputId: string): InputAdapter<any> | undefined {
    return this.inputs.get(ioKey(domainId, inputId));
  }

  getOutput(domainId: string | null | undefined, outputId: string): OutputAdapter<any, any> | undefined {
    return this.outputs.get(ioKey(domainId, outputId));
  }

  resolveInputOutputBinding<TPayload = unknown>(
    domainId: string | null | undefined,
    inputId: string,
    event: IoEnvelope<TPayload>
  ): { outputId: string; payload: JsonObject; confirmationInputId?: string; confirmationTimeoutMs?: number; metadata?: JsonObject } | null {
    const input = this.getInput(domainId, inputId) as InputAdapter<TPayload> | undefined;
    if (!input) throw new Error(`Input adapter not found: ${ioKey(domainId, inputId)}`);
    if ((input.definition.role ?? "state") !== "action") return null;
    const binding = input.outputBinding;
    const outputId = binding?.outputId ?? input.definition.outputId;
    if (!binding || !outputId) return null;
    if (!this.hasOutput(domainId, outputId)) {
      throw new Error(`Input '${input.definition.id}' maps to an unregistered output: ${ioKey(domainId, outputId)}`);
    }
    const confirmation = binding.confirmation;
    return {
      outputId: normalizeIoId(outputId),
      payload: binding.toPayload(event),
      ...(confirmation !== false ? { confirmationInputId: normalizeIoId(input.definition.id), confirmationTimeoutMs: confirmation?.timeoutMs ?? 5_000 } : {}),
      ...(binding.metadata ? { metadata: binding.metadata } : {})
    };
  }

  snapshot(domainId?: string | null): IoSnapshot {
    return {
      inputs: adapterSummaries(this.inputs, domainId, "input"),
      outputs: adapterSummaries(this.outputs, domainId, "output")
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
    const adapter = registry.getInput(domainId, input.id);
    if (adapter && !sameInputDefinition(input, adapter.definition)) {
      issues.push({ severity: "error", code: "domain.input.definition_mismatch", message: `Domain input '${input.id}' does not match its registered adapter definition`, domainId, ioId: input.id });
    }
    const role = input.role ?? "state";
    if (role === "action" && input.outputId && !registry.hasOutput(domainId, input.outputId)) {
      issues.push({ severity: "error", code: "domain.input.output_missing", message: `Action input '${input.id}' maps to an unregistered output '${input.outputId}'`, domainId, ioId: input.id });
    }
    if (role === "action" && input.outputId && !adapter?.outputBinding) {
      issues.push({ severity: "error", code: "domain.input.output_mapper_missing", message: `Action input '${input.id}' declares output '${input.outputId}' without a payload mapper`, domainId, ioId: input.id });
    }
    if (role !== "action" && input.outputId) {
      issues.push({ severity: "error", code: "domain.input.output_binding_invalid", message: `Only action inputs may declare an output binding: '${input.id}'`, domainId, ioId: input.id });
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
    const adapter = registry.getOutput(domainId, output.id);
    if (adapter && !sameOutputDefinition(output, adapter.definition)) {
      issues.push({ severity: "error", code: "domain.output.definition_mismatch", message: `Domain output '${output.id}' does not match its registered adapter definition`, domainId, ioId: output.id });
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
  adapters: Map<string, InputAdapter<any> | OutputAdapter<any, any>>,
  domainId: string | null | undefined,
  kind: "input" | "output"
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
      if (kind === "input") {
        const input = adapter as InputAdapter;
        summary.role = input.definition.role ?? "state";
        const outputId = input.outputBinding?.outputId ?? input.definition.outputId;
        if (outputId) summary.outputId = normalizeIoId(outputId);
      } else {
        const output = adapter as OutputAdapter;
        if (output.definition.capabilities) summary.capabilities = output.definition.capabilities;
        if (output.definition.safety) summary.safety = output.definition.safety;
      }
      if (adapter.definition.description) {
        summary.description = adapter.definition.description;
      }
      return summary;
    })
    .sort((left, right) => `${left.domainId ?? "global"}:${left.ioId}`.localeCompare(`${right.domainId ?? "global"}:${right.ioId}`));
}

function validateInputDefinition<TPayload>(adapter: InputAdapter<TPayload>): void {
  const role = adapter.definition.role ?? "state";
  if (!adapter.definition.id.trim()) throw new Error("Input definition id is required.");
  if (!adapter.definition.title.trim()) throw new Error(`Input '${adapter.definition.id}' requires a title.`);
  if (role !== "action" && (adapter.definition.outputId || adapter.outputBinding)) {
    throw new Error(`Only action inputs may bind to outputs: ${adapter.definition.id}`);
  }
  if (adapter.outputBinding && !adapter.definition.outputId) {
    throw new Error(`Action input '${adapter.definition.id}' must declare the bound outputId in its definition.`);
  }
  const outputId = adapter.outputBinding?.outputId ?? adapter.definition.outputId;
  if (role === "action" && adapter.definition.outputId && adapter.outputBinding && normalizeIoId(adapter.definition.outputId) !== normalizeIoId(adapter.outputBinding.outputId)) {
    throw new Error(`Action input '${adapter.definition.id}' has conflicting output binding IDs.`);
  }
  if (adapter.outputBinding && !adapter.outputBinding.toPayload) throw new Error(`Action input '${adapter.definition.id}' requires an output payload mapper.`);
  if (role === "action" && outputId && !normalizeIoId(outputId)) throw new Error(`Action input '${adapter.definition.id}' has an invalid output binding ID.`);
}

function validateOutputDefinition<TPayload, TResult>(adapter: OutputAdapter<TPayload, TResult>): void {
  if (!adapter.definition.id.trim()) throw new Error("Output definition id is required.");
  if (!adapter.definition.title.trim()) throw new Error(`Output '${adapter.definition.id}' requires a title.`);
  if (!adapter.dispatch) throw new Error(`Output '${adapter.definition.id}' requires a dispatch implementation.`);
}

function sameInputDefinition(left: DomainInputDefinition, right: DomainInputDefinition): boolean {
  return normalizeIoId(left.id) === normalizeIoId(right.id)
    && left.title === right.title
    && (left.role ?? "state") === (right.role ?? "state")
    && normalizeOptionalIoId(left.outputId) === normalizeOptionalIoId(right.outputId)
    && JSON.stringify(left.schema ?? {}) === JSON.stringify(right.schema ?? {});
}

function sameOutputDefinition(left: DomainOutputDefinition, right: DomainOutputDefinition): boolean {
  return normalizeIoId(left.id) === normalizeIoId(right.id)
    && left.title === right.title
    && JSON.stringify(left.schema ?? {}) === JSON.stringify(right.schema ?? {})
    && JSON.stringify(left.safety ?? {}) === JSON.stringify(right.safety ?? {});
}

function normalizeOptionalIoId(value: string | undefined): string | undefined {
  return value ? normalizeIoId(value) : undefined;
}
